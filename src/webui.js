const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const compression = require('compression');
const path = require('path');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { sendDiscordNotification, sendDiscordSourceAlert } = require('./services/discordService');
const { sendAppriseNotification } = require('./services/appriseService');
const { getStrings }              = require('./services/notifStrings');
const crypto = require('crypto');
const SUPPORTED_CATALOG_TYPES = ['movie', 'series', 'anime'];

const MAINTENANCE_MIGRATIONS = [
  {
    version: 1,
    name: 'Initialisation du moteur de migrations de classement',
    needsBackup: false,
    run: async () => ({ initialized: true })
  }
];

class WebUI {
  constructor(db, rssParser, tmdbMatcher, stremioAddon) {
    this.db = db;
    this.rssParser = rssParser;
    this.tmdbMatcher = tmdbMatcher;
    this.stremioAddon = stremioAddon;
    this.app = express();
    this.syncInProgress = false;
    this.syncStartedAt = null;
    this.syncStatus = null;
    this.autoRefreshInterval = null;
    this.sourceAlertInterval = null;
    this.sourceAlertProcessing = null;
    this.sourceProbeInterval = null;
    this.sourceProbeProcessing = null;
    this.maintenanceInProgress = false;
    this.resolutionReprocessingInProgress = false;
    this.resolutionReprocessingStatus = null;

    this.setupMiddleware();
    this.setupRoutes();
    this.runPendingMaintenanceMigrations()
      .catch(error => console.error('[Maintenance] Migration automatique échouée :', error.message))
      .finally(() => {
        this.startAutoRefresh(true);
        this.processSourceHealthAlerts()
          .catch(error => console.error('[Alertes sources] Traitement initial échoué :', error.message));
        this.runSourceProbes()
          .catch(error => console.error('[Sondes sources] Traitement initial échoué :', error.message));
        this.sourceAlertInterval = setInterval(() => {
          this.processSourceHealthAlerts()
            .catch(error => console.error('[Alertes sources] Traitement périodique échoué :', error.message));
        }, 60 * 1000);
        this.sourceAlertInterval.unref?.();
        this.sourceProbeInterval = setInterval(() => {
          this.runSourceProbes()
            .catch(error => console.error('[Sondes sources] Traitement périodique échoué :', error.message));
        }, 60 * 1000);
        this.sourceProbeInterval.unref?.();
      });
  }

  setupMiddleware() {
    this.app.use(compression({ threshold: 1024 }));
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
      if (req.method === 'OPTIONS') return res.sendStatus(200);
      next();
    });
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(session({
      secret: process.env.SESSION_SECRET || 'useflowfr-addon-secret-change-me',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
    }));
    this.app.use('/static', express.static(path.join(__dirname, 'public'), {
      etag: false,
      setHeaders: (res) => res.setHeader('Cache-Control', 'no-store')
    }));
  }

  authMiddleware(req, res, next) {
    if (req.session.authenticated) return next();
    res.status(401).json({ error: 'Non authentifié' });
  }

  async runPendingMaintenanceMigrations() {
    let current = Number(this.db.getConfig('classification_migration_version')) || 0;
    for (const migration of MAINTENANCE_MIGRATIONS.filter(item => item.version > current)) {
      const historyId = this.db.startMaintenanceHistory('automatic_migration', {
        version: migration.version,
        name: migration.name
      });
      let backupPath = null;
      try {
        if (migration.needsBackup) {
          backupPath = await this.db.createMaintenanceBackup(`migration-${migration.version}`);
        }
        const result = await migration.run(this);
        this.db.setConfig('classification_migration_version', String(migration.version));
        this.db.finishMaintenanceHistory(historyId, {
          details: { version: migration.version, name: migration.name, result },
          backupPath
        });
        current = migration.version;
        console.log(`[Maintenance] Migration ${migration.version} appliquée une seule fois : ${migration.name}`);
      } catch (error) {
        this.db.finishMaintenanceHistory(historyId, {
          status: 'error',
          details: { version: migration.version, name: migration.name },
          backupPath,
          error: error.message
        });
        throw error;
      }
    }
  }

  async verifyAnimeCandidates() {
    const apiKey = this.db.getConfig('tmdb_api_key');
    if (!apiKey) throw new Error('Clé TMDB non configurée pour la vérification des animés');
    const candidates = this.db.getAnimeCandidatesForReclassify();
    const axiosConfig = this.tmdbMatcher.getAxiosConfig();
    let reclassified = 0;
    let skipped = 0;
    const errors = [];
    for (const item of candidates) {
      try {
        await new Promise(resolve => setTimeout(resolve, 260));
        const endpoint = item.type === 'movie'
          ? `https://api.themoviedb.org/3/movie/${item.tmdb_id}`
          : `https://api.themoviedb.org/3/tv/${item.tmdb_id}`;
        const response = await axios.get(endpoint, { ...axiosConfig, params: { api_key: apiKey } });
        const data = response.data;
        const countries = Array.isArray(data.origin_country)
          ? data.origin_country
          : (Array.isArray(data.production_countries)
              ? data.production_countries.map(country => country.iso_3166_1)
              : []);
        if (data.original_language === 'ja' || countries.includes('JP')) {
          this.db.reclassifyMediaCatalogType(item.imdb_id, 'animés');
          reclassified++;
        } else {
          skipped++;
        }
      } catch (error) {
        errors.push({ imdb_id: item.imdb_id, name: item.name, error: error.message });
      }
    }
    return { candidates: candidates.length, reclassified, skipped, errors };
  }

  async applyMaintenanceRepairs({ includeAnime = false } = {}) {
    const before = this.db.getMaintenanceAnalysis();
    const historyId = this.db.startMaintenanceHistory('repair', { include_anime: includeAnime, before });
    let backupPath = null;
    try {
      backupPath = await this.db.createMaintenanceBackup('before-repair');
      const results = {};
      const apply = (key, candidates, getCatalogType) => {
        const updates = candidates.map(item => ({
          imdb_id: item.imdb_id,
          catalog_type: getCatalogType(item)
        }));
        results[key] = updates.length ? this.db.batchUpdateCatalogTypes(updates) : 0;
      };

      apply('false_documentaries', this.db.getFalseDocumentaryCandidates(),
        item => item.type === 'series' ? 'series' : 'films');
      apply('false_emissions', this.db.getFalseEmissionCandidates(), () => 'series');
      apply('false_concerts', this.db.getFalseConcertCandidates(),
        item => item.type === 'series' ? 'series' : 'films');
      apply('documentaries', this.db.getDocumentaryCandidatesForReclassify(), () => 'documentaires');
      apply('concerts', this.db.getConcertCandidatesFromGenre(), () => 'concerts');
      apply('spectacles', this.db.getSpectacleCandidatesFromTitle(), () => 'spectacles');

      let anime = null;
      if (includeAnime) anime = await this.verifyAnimeCandidates();
      const changed = Object.values(results).reduce((sum, value) => sum + value, 0)
        + (anime?.reclassified || 0);
      if (changed > 0) this.stremioAddon.clearCache();
      const after = this.db.getMaintenanceAnalysis();
      const details = { include_anime: includeAnime, before, results, anime, changed, after };
      this.db.finishMaintenanceHistory(historyId, {
        status: anime?.errors?.length ? 'completed_with_errors' : 'completed',
        details,
        backupPath
      });
      return { ...details, backup_path: backupPath };
    } catch (error) {
      this.db.finishMaintenanceHistory(historyId, {
        status: 'error',
        details: { include_anime: includeAnime, before },
        backupPath,
        error: error.message
      });
      throw error;
    }
  }

  getResolutionReprocessingAnalysis() {
    const releases = this.db.getReleasesForResolutionReprocessing();
    const failedReleases = this.db.getFailedReleasesForResolutionReprocessing();
    const rejected = releases.filter(release => !this.rssParser.filterByResolution(release.release_name));
    const rejectedFailed = failedReleases.filter(release => !this.rssParser.filterByResolution(release.release_name));
    const rejectedByMedia = new Map();
    const totalByMedia = new Map();
    for (const release of releases) {
      totalByMedia.set(release.media_imdb_id, (totalByMedia.get(release.media_imdb_id) || 0) + 1);
    }
    for (const release of rejected) {
      rejectedByMedia.set(release.media_imdb_id, (rejectedByMedia.get(release.media_imdb_id) || 0) + 1);
    }
    const mediaToRemove = [...rejectedByMedia].filter(([imdbId, count]) => count === totalByMedia.get(imdbId));
    // Traitement SQLite local par lots, sans réseau : volontairement prudent.
    const estimatedSeconds = Math.max(1, Math.ceil((releases.length + failedReleases.length + rejected.length + rejectedFailed.length) / 2500));
    return {
      minimum_resolution: this.db.getConfig('minimum_resolution') || '',
      maximum_resolution: this.db.getConfig('maximum_resolution') || '',
      releases_scanned: releases.length,
      releases_to_remove: rejected.length,
      failed_releases_scanned: failedReleases.length,
      failed_releases_to_remove: rejectedFailed.length,
      media_to_remove: mediaToRemove.length,
      estimated_seconds: estimatedSeconds
    };
  }

  async runResolutionReprocessing() {
    const analysis = this.getResolutionReprocessingAnalysis();
    const historyId = this.db.startMaintenanceHistory('resolution_reprocessing', { analysis });
    let backupPath = null;
    const startedAt = Date.now();
    this.resolutionReprocessingStatus = { running: true, started_at: startedAt, analysis };
    try {
      backupPath = await this.db.createMaintenanceBackup('before-resolution-reprocessing');
      const rejected = this.db.getReleasesForResolutionReprocessing()
        .filter(release => !this.rssParser.filterByResolution(release.release_name));
      const rejectedFailed = this.db.getFailedReleasesForResolutionReprocessing()
        .filter(release => !this.rssParser.filterByResolution(release.release_name));
      const mediaIds = [...new Set(rejected.map(release => release.media_imdb_id))];
      let releasesRemoved = 0;
      let failedReleasesRemoved = 0;
      let mediaRemoved = 0;
      const batchSize = 500;
      for (let index = 0; index < rejected.length; index += batchSize) {
        releasesRemoved += this.db.deleteReleasesByIds(rejected.slice(index, index + batchSize).map(release => release.id));
        await new Promise(resolve => setImmediate(resolve));
      }
      for (let index = 0; index < rejectedFailed.length; index += batchSize) {
        failedReleasesRemoved += this.db.deleteFailedReleasesByIds(rejectedFailed.slice(index, index + batchSize).map(release => release.id));
        await new Promise(resolve => setImmediate(resolve));
      }
      // Une release valide arrivée pendant le retraitement protège le média :
      // la requête ne supprime que les médias désormais sans aucune release.
      for (let index = 0; index < mediaIds.length; index += batchSize) {
        mediaRemoved += this.db.deleteMediaWithoutReleases(mediaIds.slice(index, index + batchSize));
        await new Promise(resolve => setImmediate(resolve));
      }
      if (releasesRemoved || mediaRemoved) this.stremioAddon.clearCache();
      const details = {
        ...analysis,
        releases_removed: releasesRemoved,
        failed_releases_removed: failedReleasesRemoved,
        media_removed: mediaRemoved,
        duration_ms: Date.now() - startedAt
      };
      this.db.finishMaintenanceHistory(historyId, { status: 'completed', details, backupPath });
      this.resolutionReprocessingStatus = { running: false, completed: true, ...details, backup_path: backupPath };
    } catch (error) {
      this.db.finishMaintenanceHistory(historyId, {
        status: 'error', details: { analysis }, backupPath, error: error.message
      });
      this.resolutionReprocessingStatus = { running: false, error: error.message, analysis, backup_path: backupPath };
      console.error('[Résolution] Retraitement échoué :', error);
    } finally {
      this.resolutionReprocessingInProgress = false;
    }
  }

  setupRoutes() {
    // ─── Pages ─────────────────────────────────────────────────────────────
    this.app.get('/', (req, res) => {
      if (req.session.authenticated) return res.redirect('/dashboard');
      res.sendFile(path.join(__dirname, 'views', 'login.html'));
    });

    this.app.get('/dashboard', (req, res) => {
      if (!req.session.authenticated) return res.redirect('/');
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
    });

    // ─── Auth ───────────────────────────────────────────────────────────────
    this.app.post('/api/login', async (req, res) => {
      const { username, password } = req.body;
      if (username === (process.env.WEBUI_USERNAME || 'admin') &&
          password === (process.env.WEBUI_PASSWORD || 'changeme')) {
        req.session.authenticated = true;
        return res.json({ success: true });
      }
      res.status(401).json({ error: 'Identifiants incorrects' });
    });

    this.app.post('/api/logout', (req, res) => {
      req.session.destroy();
      res.json({ success: true });
    });

    // ─── Config ─────────────────────────────────────────────────────────────
    this.app.get('/api/config', this.authMiddleware.bind(this), (req, res) => {
      const config = this.db.getAllConfig();
      delete config.stremio_manifest_sources;
      delete config.newznab_sources;
      delete config.webdav_sources;
      delete config.wacustom_sources;
      delete config.media_server_sources;
      delete config.streamfusion_sources;
      delete config.mdblist_guides;
      delete config.stremio_metadata_sources;
      res.json(config);
    });

    this.app.post('/api/config', this.authMiddleware.bind(this), (req, res) => {
      try {
        const config = req.body;
        const prevTvdbKey = this.db.getConfig('tvdb_api_key');
        const posterConfigBefore = [
          this.db.getConfig('rpdb_enabled'),
          this.db.getConfig('rpdb_api_key'),
          this.db.getConfig('postersplus_enabled'),
          this.db.getConfig('postersplus_url_template'),
          this.db.getConfig('image_cache_enabled'),
          this.db.getConfig('image_cache_ttl_hours'),
          this.db.getConfig('image_cache_max_mb')
        ].join('\n');
        for (const [key, value] of Object.entries(config)) {
          this.db.setConfig(key, value);
        }
        if (config.tvdb_api_key !== undefined && config.tvdb_api_key !== prevTvdbKey) {
          this.db.setConfig('tvdb_token', '');
          this.db.setConfig('tvdb_token_expiry', '0');
          console.log('[TVDB] Clé API modifiée — token invalidé');
        }
        const posterConfigAfter = [
          this.db.getConfig('rpdb_enabled'),
          this.db.getConfig('rpdb_api_key'),
          this.db.getConfig('postersplus_enabled'),
          this.db.getConfig('postersplus_url_template'),
          this.db.getConfig('image_cache_enabled'),
          this.db.getConfig('image_cache_ttl_hours'),
          this.db.getConfig('image_cache_max_mb')
        ].join('\n');
        if (posterConfigAfter !== posterConfigBefore) this.stremioAddon.clearCache();
        this.startAutoRefresh();
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/config/export', this.authMiddleware.bind(this), (req, res) => {
      const includeSecrets = req.query.include_secrets === 'true';
      const secretConfigKeys = new Set([
        'tmdb_api_key', 'tvdb_api_key', 'omdb_api_key', 'mal_client_id',
        'stremio_metadata_manifest_url',
        'rpdb_api_key', 'postersplus_url_template', 'proxy_username', 'proxy_password',
        'proxy_host', 'proxy_port', 'discord_webhook_url',
        'apprise_server_url', 'apprise_urls',
        'prowlarr_url', 'prowlarr_apikey', 'nzbhydra2_url', 'nzbhydra2_apikey'
      ]);
      const excludedConfigKeys = new Set([
        'tvdb_token', 'tvdb_token_expiry', 'manifest_revision',
        'last_sync_films', 'last_catalog_refresh', 'managed_catalogs_seeded',
        'schema_v2_migrated', 'classification_migration_version',
        'source_limit_defaults_v2', 'source_limit_defaults_v3',
        'rss_films_name', 'rss_films_url', 'rss_films_force',
        'rss_films_paused', 'rss_films_sync_interval', 'rss_additional_urls',
        'pastebin_sources', 'stremio_manifest_sources', 'newznab_sources', 'webdav_sources',
        'wacustom_sources', 'media_server_sources', 'streamfusion_sources', 'cometnet_sources', 'mdblist_guides',
        'stremio_metadata_sources'
      ]);
      const config = Object.fromEntries(Object.entries(this.db.getAllConfig())
        .filter(([key]) => !excludedConfigKeys.has(key))
        .map(([key, value]) => [key, !includeSecrets && secretConfigKeys.has(key) ? null : value]));
      const redactUrl = source => ({
        ...source,
        url: includeSecrets ? source.url : null,
        ...(Object.hasOwn(source, 'apiKey') ? { apiKey: includeSecrets ? source.apiKey : null } : {}),
        ...(Object.hasOwn(source, 'username') ? { username: includeSecrets ? source.username : null } : {}),
        ...(Object.hasOwn(source, 'password') ? { password: includeSecrets ? source.password : null } : {}),
        ...(Object.hasOwn(source, 'adminPassword') ? {
          adminPassword: includeSecrets ? source.adminPassword : null
        } : {}),
        ...(Object.hasOwn(source, 'accessToken') ? { accessToken: includeSecrets ? source.accessToken : null } : {}),
        ...(Object.hasOwn(source, 'keyId') ? { keyId: includeSecrets ? source.keyId : null } : {}),
        ...(Object.hasOwn(source, 'secret') ? { secret: includeSecrets ? source.secret : null } : {})
      });
      res.setHeader('Content-Disposition', `attachment; filename="stremio-rss-catalog-${new Date().toISOString().slice(0, 10)}.json"`);
      res.json({
        format: 'stremio-rss-catalog-config',
        version: 1,
        exported_at: Date.now(),
        includes_secrets: includeSecrets,
        config,
        sources: {
          rss: this.getRssSources().map(redactUrl),
          pastebin: this.rssParser.pastebinParser.getSources().map(redactUrl),
          stremio: this.rssParser.stremioManifestParser.getSources().map(redactUrl),
          indexers: this.rssParser.newznabParser.getSources().map(redactUrl),
          webdav: this.rssParser.webdavParser.getSources().map(redactUrl),
          wacustom: this.rssParser.waCustomParser.getSources().map(redactUrl),
          media_servers: this.rssParser.mediaServerParser.getSources().map(redactUrl),
          streamfusion: this.rssParser.streamFusionParser.getSources().map(redactUrl),
          cometnet: this.rssParser.cometNetParser.getSources().map(redactUrl),
          metadata_providers: this.tmdbMatcher.stremioMetadata.getSources().map(redactUrl),
          guides: this.rssParser.mdblistGuideParser.getSources().map(redactUrl)
        },
        catalogs: this.db.listCustomCatalogs().map(catalog => ({
          ...catalog,
          source_urls: includeSecrets
            ? catalog.source_urls
            : catalog.source_urls.filter(value => !/^https?:\/\//i.test(value))
        }))
      });
    });

    this.app.post('/api/config/import', this.authMiddleware.bind(this), async (req, res) => {
      const payload = req.body?.payload;
      const allowSecrets = req.body?.include_secrets === true;
      if (payload?.format !== 'stremio-rss-catalog-config' || payload?.version !== 1) {
        return res.status(400).json({ error: 'Format d’export non reconnu' });
      }
      if (!payload.sources || !Array.isArray(payload.catalogs)) {
        return res.status(400).json({ error: 'Export incomplet' });
      }
      if (req.body?.dry_run !== false) {
        return res.json({
          valid: true,
          includes_secrets: Boolean(payload.includes_secrets),
          secrets_will_be_imported: Boolean(payload.includes_secrets && allowSecrets),
          counts: {
            rss: payload.sources.rss?.length || 0,
            pastebin: payload.sources.pastebin?.length || 0,
            stremio: payload.sources.stremio?.length || 0,
            indexers: payload.sources.indexers?.length || 0,
            webdav: payload.sources.webdav?.length || 0,
            wacustom: payload.sources.wacustom?.length || 0,
            media_servers: payload.sources.media_servers?.length || 0,
            streamfusion: payload.sources.streamfusion?.length || 0,
            cometnet: payload.sources.cometnet?.length || 0,
            metadata_providers: payload.sources.metadata_providers?.length || 0,
            guides: payload.sources.guides?.length || 0,
            catalogs: payload.catalogs.length
          }
        });
      }

      const backupPath = await this.db.createMaintenanceBackup('before-config-import');
      const secretConfigKeys = new Set([
        'tmdb_api_key', 'tvdb_api_key', 'omdb_api_key', 'mal_client_id',
        'stremio_metadata_manifest_url',
        'rpdb_api_key', 'postersplus_url_template', 'proxy_username', 'proxy_password',
        'proxy_host', 'proxy_port', 'discord_webhook_url',
        'apprise_server_url', 'apprise_urls',
        'prowlarr_url', 'prowlarr_apikey', 'nzbhydra2_url', 'nzbhydra2_apikey'
      ]);
      for (const [key, value] of Object.entries(payload.config || {})) {
        if (value === null || (secretConfigKeys.has(key) && !allowSecrets)) continue;
        this.db.setConfig(key, String(value));
      }
      const mergeSources = (current, incoming, secretFields = ['url']) => {
        const byId = new Map(current.map(source => [source.id, source]));
        for (const imported of Array.isArray(incoming) ? incoming : []) {
          const existing = byId.get(imported.id);
          const next = { ...(existing || {}), ...imported };
          for (const field of secretFields) {
            if (!allowSecrets || imported[field] === null || imported[field] === undefined) {
              next[field] = existing?.[field] ?? null;
            }
          }
          if (next.id && next.url) byId.set(next.id, next);
        }
        return [...byId.values()];
      };
      const rss = mergeSources(this.getRssSources(), payload.sources.rss);
      const rssMain = rss.find(source => source.id === 'rss-main');
      if (rssMain) {
        this.db.setConfig('rss_films_name', rssMain.name || '');
        this.db.setConfig('rss_films_url', rssMain.url || '');
        this.db.setConfig('rss_films_force', rssMain.force || 'auto');
        this.db.setConfig('rss_films_paused', rssMain.paused ? 'true' : 'false');
        this.db.setConfig('rss_films_sync_interval', String(rssMain.syncIntervalMinutes || ''));
      }
      this.db.setConfig('rss_additional_urls', JSON.stringify(rss.filter(source => source.id !== 'rss-main')));
      this.db.setConfig('pastebin_sources', JSON.stringify(mergeSources(
        this.rssParser.pastebinParser.getSources(), payload.sources.pastebin
      )));
      this.db.setConfig('stremio_manifest_sources', JSON.stringify(mergeSources(
        this.rssParser.stremioManifestParser.getSources(), payload.sources.stremio
      )));
      this.db.setConfig('newznab_sources', JSON.stringify(mergeSources(
        this.rssParser.newznabParser.getSources(), payload.sources.indexers, ['url', 'apiKey']
      )));
      this.db.setConfig('webdav_sources', JSON.stringify(mergeSources(
        this.rssParser.webdavParser.getSources(), payload.sources.webdav, ['url', 'username', 'password']
      )));
      this.db.setConfig('wacustom_sources', JSON.stringify(mergeSources(
        this.rssParser.waCustomParser.getSources(), payload.sources.wacustom, ['url', 'adminPassword']
      )));
      this.db.setConfig('media_server_sources', JSON.stringify(mergeSources(
        this.rssParser.mediaServerParser.getSources(), payload.sources.media_servers, ['url', 'apiKey']
      )));
      this.db.setConfig('streamfusion_sources', JSON.stringify(mergeSources(
        this.rssParser.streamFusionParser.getSources(), payload.sources.streamfusion, ['url', 'keyId', 'secret']
      )));
      this.db.setConfig('cometnet_sources', JSON.stringify(mergeSources(
        this.rssParser.cometNetParser.getSources(), payload.sources.cometnet, ['url']
      )));
      this.db.setConfig('stremio_metadata_sources', JSON.stringify(mergeSources(
        this.tmdbMatcher.stremioMetadata.getSources(), payload.sources.metadata_providers, ['url']
      )));
      this.db.setConfig('mdblist_guides', JSON.stringify(mergeSources(
        this.rssParser.mdblistGuideParser.getSources(), payload.sources.guides,
        ['url', 'apiKey', 'username', 'password', 'accessToken']
      )));
      this.db.clearSourceSyncStates();
      for (const catalog of payload.catalogs) {
        if (catalog?.id && catalog?.name && SUPPORTED_CATALOG_TYPES.includes(catalog.type)) {
          this.db.saveCustomCatalog(catalog);
        }
      }
      this.bumpManifestRevision('configuration_imported', null, {
        imported_catalogs: payload.catalogs.length,
        secrets_imported: Boolean(payload.includes_secrets && allowSecrets)
      });
      this.stremioAddon.clearCache();
      this.startAutoRefresh();
      this.rssParser.cometNetParser.reconcile();
      res.json({ success: true, backup_path: backupPath });
    });

    this.app.get('/api/source-secrets/:kind/:id', this.authMiddleware.bind(this), (req, res) => {
      const { kind, id } = req.params;
      let source = null;
      if (kind === 'rss') source = this.getRssSources().find(item => item.id === id);
      if (kind === 'pastebin') source = this.rssParser.pastebinParser.getSources().find(item => item.id === id);
      if (kind === 'stremio') source = this.rssParser.stremioManifestParser.getSources().find(item => item.id === id);
      if (kind === 'indexer') source = this.rssParser.newznabParser.getSources().find(item => item.id === id);
      if (kind === 'webdav') source = this.rssParser.webdavParser.getSources().find(item => item.id === id);
      if (kind === 'wacustom') source = this.rssParser.waCustomParser.getSources().find(item => item.id === id);
      if (kind === 'media-server') source = this.rssParser.mediaServerParser.getSources().find(item => item.id === id);
      if (kind === 'streamfusion') source = this.rssParser.streamFusionParser.getSources().find(item => item.id === id);
      if (kind === 'cometnet') source = this.rssParser.cometNetParser.getSources().find(item => item.id === id);
      if (kind === 'metadata') source = this.tmdbMatcher.stremioMetadata.getSources().find(item => item.id === id);
      if (kind === 'guide') source = this.rssParser.mdblistGuideParser.getSources().find(item => item.id === id);
      if (!source) return res.status(404).json({ error: 'Source introuvable' });
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        url: source.url || null,
        ...(kind === 'indexer' ? { api_key: source.apiKey || null } : {}),
        ...(kind === 'webdav' ? {
          username: source.username || null,
          password: source.password || null
        } : {}),
        ...(kind === 'wacustom' ? { admin_password: source.adminPassword || null } : {}),
        ...(kind === 'media-server' ? { api_key: source.apiKey || null } : {}),
        ...(kind === 'streamfusion' ? {
          key_id: source.keyId || null,
          secret: source.secret || null
        } : {}),
        ...(kind === 'guide' ? {
          api_key: source.apiKey || null,
          username: source.username || null,
          password: source.password || null,
          access_token: source.accessToken || null
        } : {})
      });
    });

    // ─── Sources RSS ───────────────────────────────────────────────────────
    this.app.get('/api/rss-sources', this.authMiddleware.bind(this), (req, res) => {
      res.json(this.getRssSources().map(source => ({
        ...source,
        sync_interval_minutes: source.syncIntervalMinutes || null,
        runtime: this.getSourceRuntime(`rss:${source.id}`, source.syncIntervalMinutes)
      })));
    });

    this.app.post('/api/rss-sources', this.authMiddleware.bind(this), (req, res) => {
      const { name = '', url, force = 'auto', paused = false, sync_interval_minutes } = req.body;
      if (!/^https?:\/\//i.test(url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
      if (!['auto', 'films', 'series', 'documentaires', 'emissions', 'animés', 'concerts', 'spectacles'].includes(force)) {
        return res.status(400).json({ error: 'Catégorie forcée invalide' });
      }
      const additional = this.getAdditionalRssSources();
      if (this.getRssSources().some(source => source.url === url)) {
        return res.status(409).json({ error: 'Cette source existe déjà' });
      }
      const source = {
        id: crypto.randomUUID(),
        name: String(name).trim() || new URL(url).hostname,
        url,
        force,
        paused: Boolean(paused),
        syncIntervalMinutes: this.normalizeSourceInterval(sync_interval_minutes)
      };
      additional.push(source);
      this.db.setConfig('rss_additional_urls', JSON.stringify(additional));
      res.status(201).json({ ...source, kind: 'rss' });
    });

    this.app.put('/api/rss-sources/:id', this.authMiddleware.bind(this), (req, res) => {
      if (req.params.id === 'rss-main') {
        const current = this.getRssSources().find(source => source.id === 'rss-main');
        if (!current) return res.status(404).json({ error: 'Source introuvable' });
        const next = { ...current, ...req.body, id: 'rss-main' };
        if (!/^https?:\/\//i.test(next.url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
        if (next.url !== current.url) this.db.deleteSourceSyncState('rss:rss-main');
        this.db.setConfig('rss_films_name', next.name || '');
        this.db.setConfig('rss_films_url', next.url);
        this.db.setConfig('rss_films_force', next.force || 'auto');
        this.db.setConfig('rss_films_paused', next.paused ? 'true' : 'false');
        this.db.setConfig('rss_films_sync_interval', String(this.normalizeSourceInterval(
          req.body.sync_interval_minutes ?? next.syncIntervalMinutes
        ) || ''));
        return res.json(next);
      }
      const additional = this.getAdditionalRssSources();
      const index = additional.findIndex(source => source.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Source introuvable' });
      const currentUrl = additional[index].url;
      const body = { ...req.body };
      if (body.sync_interval_minutes !== undefined) {
        body.syncIntervalMinutes = this.normalizeSourceInterval(body.sync_interval_minutes);
        delete body.sync_interval_minutes;
      }
      additional[index] = { ...additional[index], ...body, id: additional[index].id };
      if (!/^https?:\/\//i.test(additional[index].url || '')) {
        return res.status(400).json({ error: 'URL HTTP(S) invalide' });
      }
      if (additional[index].url !== currentUrl) this.db.deleteSourceSyncState(`rss:${req.params.id}`);
      this.db.setConfig('rss_additional_urls', JSON.stringify(additional));
      res.json({ ...additional[index], kind: 'rss' });
    });

    this.app.delete('/api/rss-sources/:id', this.authMiddleware.bind(this), (req, res) => {
      if (req.params.id === 'rss-main') {
        this.db.setConfig('rss_films_name', '');
        this.db.setConfig('rss_films_url', '');
        this.db.deleteSourceSyncState('rss:rss-main');
        return res.json({ success: true });
      }
      const additional = this.getAdditionalRssSources();
      const next = additional.filter(source => source.id !== req.params.id);
      if (next.length === additional.length) return res.status(404).json({ error: 'Source introuvable' });
      this.db.setConfig('rss_additional_urls', JSON.stringify(next));
      this.db.deleteSourceSyncState(`rss:${req.params.id}`);
      res.json({ success: true });
    });

    // ─── Sources Pastebin ──────────────────────────────────────────────────
    this.app.get('/api/pastebins', this.authMiddleware.bind(this), (req, res) => {
      res.json(this.rssParser.pastebinParser.getSources().map(source => ({
        ...source,
        assume_required_tags: source.assumeRequiredTags !== false,
        sync_interval_minutes: source.syncIntervalMinutes || null,
        runtime: this.getSourceRuntime(`pastebin:${source.id}`, source.syncIntervalMinutes)
      })));
    });

    this.app.post('/api/pastebins/preview', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const { url, maxPages = 25, assume_required_tags = true } = req.body;
        if (!/^https?:\/\//i.test(url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
        const result = await this.rssParser.pastebinParser.discover(url, {
          maxPages: Math.min(Number(maxPages) || 25, 100),
          maxDepth: 5
        });
        res.json({
          visited: result.visited,
          truncated: result.truncated,
          items: assume_required_tags === false
            ? result.items.filter(item => this.rssParser.filterByRequiredTags(item.release_name || '')).length
            : result.items.length,
          raw_items: result.rawItems,
          tags_assumed: assume_required_tags !== false,
          duplicates: result.duplicates,
          categories: result.items.reduce((acc, item) => {
            acc[item.catalog_type] = (acc[item.catalog_type] || 0) + 1;
            return acc;
          }, {}),
          pages: result.pages
        });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.post('/api/pastebins', this.authMiddleware.bind(this), (req, res) => {
      const {
        name = '', url, paused = false, force = 'auto', max_depth = 5,
        max_pages = 1000, sync_interval_minutes, assume_required_tags = true
      } = req.body;
      if (!/^https?:\/\//i.test(url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
      const sources = this.rssParser.pastebinParser.getSources();
      if (sources.some(source => source.url === url)) return res.status(409).json({ error: 'Cette source existe déjà' });
      const source = {
        id: crypto.randomUUID(),
        name: String(name).trim() || new URL(url).hostname,
        url,
        paused: Boolean(paused),
        force,
        maxDepth: Math.min(Math.max(Number.isFinite(Number(max_depth)) ? Number(max_depth) : 5, 0), 10),
        maxPages: Math.min(Math.max(Number(max_pages) || 1000, 1), 5000),
        assumeRequiredTags: assume_required_tags !== false,
        syncIntervalMinutes: this.normalizeSourceInterval(sync_interval_minutes)
      };
      sources.push(source);
      this.db.setConfig('pastebin_sources', JSON.stringify(sources));
      res.status(201).json(source);
    });

    this.app.put('/api/pastebins/:id', this.authMiddleware.bind(this), (req, res) => {
      const sources = this.rssParser.pastebinParser.getSources();
      const index = sources.findIndex(source => source.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Source introuvable' });
      const currentUrl = sources[index].url;
      const next = { ...sources[index], ...req.body, id: sources[index].id };
      if (req.body.sync_interval_minutes !== undefined) {
        next.syncIntervalMinutes = this.normalizeSourceInterval(req.body.sync_interval_minutes);
        delete next.sync_interval_minutes;
      }
      if (req.body.max_depth !== undefined) {
        next.maxDepth = Math.min(Math.max(Number.isFinite(Number(req.body.max_depth)) ? Number(req.body.max_depth) : 5, 0), 10);
        delete next.max_depth;
      }
      if (req.body.max_pages !== undefined) {
        next.maxPages = Math.min(Math.max(Number(req.body.max_pages) || 1000, 1), 5000);
        delete next.max_pages;
      }
      if (req.body.assume_required_tags !== undefined) {
        next.assumeRequiredTags = req.body.assume_required_tags !== false;
        delete next.assume_required_tags;
      }
      if (!/^https?:\/\//i.test(next.url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
      sources[index] = next;
      if (next.url !== currentUrl) this.db.deleteSourceSyncState(`pastebin:${req.params.id}`);
      this.db.setConfig('pastebin_sources', JSON.stringify(sources));
      res.json(next);
    });

    this.app.delete('/api/pastebins/:id', this.authMiddleware.bind(this), (req, res) => {
      const sources = this.rssParser.pastebinParser.getSources();
      const next = sources.filter(source => source.id !== req.params.id);
      if (next.length === sources.length) return res.status(404).json({ error: 'Source introuvable' });
      this.db.setConfig('pastebin_sources', JSON.stringify(next));
      this.db.deleteSourceSyncState(`pastebin:${req.params.id}`);
      res.json({ success: true });
    });

    // ─── Sources manifestes Stremio ────────────────────────────────────────
    this.app.get('/api/stremio-sources', this.authMiddleware.bind(this), (req, res) => {
      const parser = this.rssParser.stremioManifestParser;
      res.json(parser.getSources().map(source => ({
        id: source.id,
        name: source.name,
        display_url: source.url,
        paused: Boolean(source.paused),
        max_items_per_catalog: Number(source.maxItemsPerCatalog) || 10000000,
        sync_interval_minutes: source.syncIntervalMinutes || null,
        runtime: {
          ...this.getSourceRuntime(`stremio:${source.id}`, source.syncIntervalMinutes),
          configured_quota_limit: Number(source.maxItemsPerCatalog) || 10000000,
          quota_unit: 'catalogue'
        },
        catalogs: (source.catalogs || []).map(catalog => ({
          ...catalog,
          source_key: parser.sourceKey(source.id, catalog)
        }))
      })));
    });

    this.app.post('/api/stremio-sources/preview', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const { url } = req.body;
        if (!/^https?:\/\//i.test(url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
        const parser = this.rssParser.stremioManifestParser;
        res.json(parser.anonymizeInspection(await parser.inspect(url)));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.post('/api/stremio-sources', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const {
          url, name = '', max_items_per_catalog = 10000000, sync_interval_minutes,
          catalogs: requestedCatalogs
        } = req.body;
        if (!/^https?:\/\//i.test(url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
        const parser = this.rssParser.stremioManifestParser;
        const sources = parser.getSources();
        if (sources.some(source => source.url === url)) return res.status(409).json({ error: 'Cette source existe déjà' });
        const inspected = parser.anonymizeInspection(await parser.inspect(url));
        const source = {
          id: crypto.randomUUID(),
          name: String(name).trim() || 'Manifeste Stremio',
          url,
          paused: false,
          maxItemsPerCatalog: parser.normalizeMaxItems(max_items_per_catalog),
          syncIntervalMinutes: this.normalizeSourceInterval(sync_interval_minutes),
          catalogs: inspected.catalogs.map(catalog => ({
            ...catalog,
            enabled: catalog.supported !== false && (Array.isArray(requestedCatalogs)
              ? requestedCatalogs.find(item => item.id === catalog.id && item.type === catalog.type)?.enabled !== false
              : true)
          }))
        };
        sources.push(source);
        this.db.setConfig('stremio_manifest_sources', JSON.stringify(sources));
        res.status(201).json({
          id: source.id,
          name: source.name,
          display_url: source.url,
          paused: false,
          max_items_per_catalog: source.maxItemsPerCatalog,
          sync_interval_minutes: source.syncIntervalMinutes || null,
          runtime: {
            ...this.getSourceRuntime(`stremio:${source.id}`, source.syncIntervalMinutes),
            configured_quota_limit: source.maxItemsPerCatalog,
            quota_unit: 'catalogue'
          },
          catalogs: source.catalogs.map(catalog => ({
            ...catalog,
            source_key: parser.sourceKey(source.id, catalog)
          }))
        });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.put('/api/stremio-sources/:id', this.authMiddleware.bind(this), async (req, res) => {
      const parser = this.rssParser.stremioManifestParser;
      const sources = parser.getSources();
      const index = sources.findIndex(source => source.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Source introuvable' });
      const currentUrl = sources[index].url;
      const allowed = {};
      if (req.body.name !== undefined) allowed.name = String(req.body.name).trim();
      if (req.body.paused !== undefined) allowed.paused = Boolean(req.body.paused);
      if (Array.isArray(req.body.catalogs)) {
        allowed.catalogs = req.body.catalogs.map(catalog => ({
          ...catalog,
          enabled: catalog.supported === false ? false : catalog.enabled !== false
        }));
      }
      if (req.body.max_items_per_catalog !== undefined) {
        allowed.maxItemsPerCatalog = parser.normalizeMaxItems(req.body.max_items_per_catalog);
      }
      if (req.body.sync_interval_minutes !== undefined) {
        allowed.syncIntervalMinutes = this.normalizeSourceInterval(req.body.sync_interval_minutes);
      }
      try {
        if (req.body.url !== undefined && req.body.url !== sources[index].url) {
          if (!/^https?:\/\//i.test(req.body.url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
          const inspected = parser.anonymizeInspection(await parser.inspect(req.body.url));
          const selection = Array.isArray(req.body.catalogs) ? req.body.catalogs : sources[index].catalogs;
          const enabledById = new Map((selection || [])
            .map(catalog => [`${catalog.type}:${catalog.id}`, catalog.enabled !== false]));
          allowed.url = req.body.url;
          allowed.catalogs = inspected.catalogs.map(catalog => ({
            ...catalog,
            enabled: catalog.supported !== false && (enabledById.get(`${catalog.type}:${catalog.id}`) ?? true)
          }));
        }
        sources[index] = { ...sources[index], ...allowed };
        if (sources[index].url !== currentUrl) this.db.deleteSourceSyncState(`stremio:${req.params.id}`);
        this.db.setConfig('stremio_manifest_sources', JSON.stringify(sources));
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.delete('/api/stremio-sources/:id', this.authMiddleware.bind(this), (req, res) => {
      const parser = this.rssParser.stremioManifestParser;
      const sources = parser.getSources();
      const next = sources.filter(source => source.id !== req.params.id);
      if (next.length === sources.length) return res.status(404).json({ error: 'Source introuvable' });
      this.db.setConfig('stremio_manifest_sources', JSON.stringify(next));
      this.db.deleteSourceSyncState(`stremio:${req.params.id}`);
      res.json({ success: true });
    });

    // ─── Sources API Newznab ───────────────────────────────────────────────
    const serializeNewznabSource = source => {
      const parser = this.rssParser.newznabParser;
      const catalogs = [];
      if (source.categories?.movie) {
        catalogs.push({
          type: 'movie',
          name: 'Films',
          category_ids: source.categories.movie,
          source_key: parser.sourceKey(source.id, 'movie')
        });
      }
      if (source.categories?.series) {
        catalogs.push({
          type: 'series',
          name: 'Séries',
          category_ids: source.categories.series,
          source_key: parser.sourceKey(source.id, 'series')
        });
      }
      return {
        id: source.id,
        name: source.name,
        kind: ['newznab', 'prowlarr', 'jackett', 'nzbhydra2'].includes(source.kind) ? source.kind : 'newznab',
        url: source.url,
        paused: Boolean(source.paused),
        has_api_key: Boolean(source.apiKey),
        categories: source.categories || {},
        catalog_types: parser.normalizeCatalogTypes(source.catalogTypes),
        category_mode: source.categoryMode === 'auto' ? 'auto' : 'manual',
        max_items_per_category: Number(source.maxItemsPerCategory) || 10000000,
        page_size: Number(source.pageSize) || Number(source.serverMax) || 100,
        request_delay_ms: Number(source.requestDelayMs) || 750,
        lookback_hours: Number(source.lookbackHours) || 24,
        sync_interval_minutes: source.syncIntervalMinutes || null,
        server_max: Number(source.serverMax) || null,
        runtime: this.getSourceRuntime(parser.scheduleKey(source), source.syncIntervalMinutes),
        catalogs
      };
    };
    const normalizeCategoryIds = value => String(value || '')
      .split(',').map(item => item.trim()).filter(Boolean).join(',');
    const validCategoryIds = value => !value || /^\d+(?:,\d+)*$/.test(value);
    const normalizeCatalogTypes = (parser, value, provided = false) => {
      if (provided && (!Array.isArray(value) || !value.length)) {
        throw new Error('Sélectionnez au moins un catalogue à alimenter');
      }
      const normalized = parser.normalizeCatalogTypes(value);
      if (provided && normalized.length !== new Set(value).size) {
        throw new Error('Sélection de catalogues invalide');
      }
      return normalized;
    };
    const resolveNewznabCategories = (parser, inspection, categoryMode, catalogTypes, movieValue, seriesValue) => {
      if (categoryMode === 'auto') {
        const suggestions = parser.categorySuggestions(inspection.categories, catalogTypes);
        if (!suggestions.movie && !suggestions.series) {
          throw new Error('Aucune catégorie compatible détectée : utilisez le mode manuel');
        }
        return { movie: suggestions.movie, series: suggestions.series };
      }
      const movie = normalizeCategoryIds(movieValue);
      const series = normalizeCategoryIds(seriesValue);
      if ((!movie && !series) || !validCategoryIds(movie) || !validCategoryIds(series)) {
        throw new Error('Catégories Newznab invalides');
      }
      return { movie, series };
    };

    this.app.get('/api/newznab-sources', this.authMiddleware.bind(this), (req, res) => {
      res.json(this.rssParser.newznabParser.getSources().map(serializeNewznabSource));
    });

    this.app.post('/api/newznab-sources/preview', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const { url, api_key: apiKey, kind = 'newznab' } = req.body;
        if (!/^https?:\/\//i.test(url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
        if (!['newznab', 'prowlarr', 'jackett', 'nzbhydra2'].includes(kind)) return res.status(400).json({ error: 'Type d’indexeur invalide' });
        if (!String(apiKey || '').trim()) return res.status(400).json({ error: 'Clé API requise' });
        const parser = this.rssParser.newznabParser;
        const catalogTypes = normalizeCatalogTypes(parser, req.body.catalog_types, req.body.catalog_types !== undefined);
        const inspection = await parser.inspect({ url, apiKey: String(apiKey).trim(), kind });
        const suggestions = parser.categorySuggestions(inspection.categories, catalogTypes);
        res.json({
          server_max: inspection.serverMax,
          server_default: inspection.serverDefault,
          categories: inspection.categories,
          category_suggestions: suggestions
        });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.post('/api/newznab-sources', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const {
          name = '', kind = 'newznab', url, api_key: apiKey, movie_categories = '2000',
          series_categories = '5000', category_mode = 'auto', catalog_types: requestedCatalogTypes,
          max_items_per_category = 10000000,
          request_delay_ms = 750, lookback_hours = 24,
          sync_interval_minutes, paused = false
        } = req.body;
        if (!/^https?:\/\//i.test(url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
        if (!['newznab', 'prowlarr', 'jackett', 'nzbhydra2'].includes(kind)) return res.status(400).json({ error: 'Type d’indexeur invalide' });
        if (!String(apiKey || '').trim()) return res.status(400).json({ error: 'Clé API requise' });
        const parser = this.rssParser.newznabParser;
        const catalogTypes = normalizeCatalogTypes(parser, requestedCatalogTypes, requestedCatalogTypes !== undefined);
        const categoryMode = category_mode === 'manual' ? 'manual' : 'auto';
        const sources = parser.getSources();
        if (sources.some(source => source.url === url)) return res.status(409).json({ error: 'Cette source existe déjà' });
        const inspection = await parser.inspect({ url, apiKey: String(apiKey).trim(), kind });
        const categories = resolveNewznabCategories(
          parser, inspection, categoryMode, catalogTypes, movie_categories, series_categories
        );
        const source = {
          id: crypto.randomUUID(),
          name: String(name).trim() || new URL(url).hostname,
          kind,
          url,
          apiKey: String(apiKey).trim(),
          paused: Boolean(paused),
          categories,
          catalogTypes,
          categoryMode,
          maxItemsPerCategory: Math.min(Math.max(Number(max_items_per_category) || 10000000, 1), 10000000),
          pageSize: inspection.serverMax,
          requestDelayMs: Math.min(Math.max(Number(request_delay_ms) || 750, 250), 10000),
          lookbackHours: Math.min(Math.max(Number(lookback_hours) || 24, 1), 720),
          syncIntervalMinutes: this.normalizeSourceInterval(sync_interval_minutes),
          serverMax: inspection.serverMax
        };
        sources.push(source);
        this.db.setConfig('newznab_sources', JSON.stringify(sources));
        res.status(201).json(serializeNewznabSource(source));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.put('/api/newznab-sources/:id', this.authMiddleware.bind(this), async (req, res) => {
      const parser = this.rssParser.newznabParser;
      const sources = parser.getSources();
      const index = sources.findIndex(source => source.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Source introuvable' });
      const current = sources[index];
      const next = { ...current };
      const cursorConfigBefore = JSON.stringify({
        kind: current.kind,
        url: current.url,
        apiKey: current.apiKey,
        categories: current.categories,
        catalogTypes: parser.normalizeCatalogTypes(current.catalogTypes),
        categoryMode: current.categoryMode === 'auto' ? 'auto' : 'manual'
      });
      if (req.body.name !== undefined) next.name = String(req.body.name).trim() || current.name;
      if (req.body.kind !== undefined && ['newznab', 'prowlarr', 'jackett', 'nzbhydra2'].includes(req.body.kind)) next.kind = req.body.kind;
      if (req.body.paused !== undefined) next.paused = Boolean(req.body.paused);
      if (String(req.body.api_key || '').trim()) next.apiKey = String(req.body.api_key).trim();
      if (req.body.url !== undefined) {
        if (!/^https?:\/\//i.test(req.body.url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
        next.url = req.body.url;
      }
      next.catalogTypes = normalizeCatalogTypes(
        parser,
        req.body.catalog_types ?? current.catalogTypes,
        req.body.catalog_types !== undefined
      );
      next.categoryMode = req.body.category_mode !== undefined
        ? (req.body.category_mode === 'manual' ? 'manual' : 'auto')
        : (current.categoryMode === 'auto' ? 'auto' : 'manual');
      if (req.body.max_items_per_category !== undefined) {
        next.maxItemsPerCategory = Math.min(Math.max(Number(req.body.max_items_per_category) || 10000000, 1), 10000000);
      }
      if (req.body.request_delay_ms !== undefined) {
        next.requestDelayMs = Math.min(Math.max(Number(req.body.request_delay_ms) || 750, 250), 10000);
      }
      if (req.body.lookback_hours !== undefined) {
        next.lookbackHours = Math.min(Math.max(Number(req.body.lookback_hours) || 24, 1), 720);
      }
      if (req.body.sync_interval_minutes !== undefined) {
        next.syncIntervalMinutes = this.normalizeSourceInterval(req.body.sync_interval_minutes);
      }
      try {
        const connectionChanged = next.url !== current.url || next.apiKey !== current.apiKey || next.kind !== current.kind;
        const categoriesChanged = req.body.movie_categories !== undefined
          || req.body.series_categories !== undefined
          || req.body.catalog_types !== undefined
          || req.body.category_mode !== undefined;
        if (connectionChanged || next.categoryMode === 'auto') {
          const inspection = await parser.inspect(next);
          next.serverMax = inspection.serverMax;
          next.pageSize = Math.min(Number(next.pageSize) || inspection.serverMax, inspection.serverMax);
          next.categories = resolveNewznabCategories(
            parser,
            inspection,
            next.categoryMode,
            next.catalogTypes,
            req.body.movie_categories ?? current.categories?.movie,
            req.body.series_categories ?? current.categories?.series
          );
        } else if (categoriesChanged) {
          next.categories = resolveNewznabCategories(
            parser,
            { categories: [] },
            next.categoryMode,
            next.catalogTypes,
            req.body.movie_categories ?? current.categories?.movie,
            req.body.series_categories ?? current.categories?.series
          );
        }
        sources[index] = next;
        const cursorConfigAfter = JSON.stringify({
          kind: next.kind,
          url: next.url,
          apiKey: next.apiKey,
          categories: next.categories,
          catalogTypes: next.catalogTypes,
          categoryMode: next.categoryMode
        });
        if (cursorConfigAfter !== cursorConfigBefore) {
          const kinds = [...new Set([current.kind || 'newznab', next.kind || 'newznab'])];
          this.db.deleteSourceSyncStates(kinds.flatMap(kind => [
            `${kind}:${next.id}`,
            `${kind}:${next.id}:movie`,
            `${kind}:${next.id}:series`,
            `${kind}:${next.id}:all`
          ]));
        }
        this.db.setConfig('newznab_sources', JSON.stringify(sources));
        res.json(serializeNewznabSource(next));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.delete('/api/newznab-sources/:id', this.authMiddleware.bind(this), (req, res) => {
      const sources = this.rssParser.newznabParser.getSources();
      const next = sources.filter(source => source.id !== req.params.id);
      if (next.length === sources.length) return res.status(404).json({ error: 'Source introuvable' });
      this.db.setConfig('newznab_sources', JSON.stringify(next));
      this.db.deleteSourceSyncState(this.rssParser.newznabParser.scheduleKey(sources.find(source => source.id === req.params.id)));
      res.json({ success: true });
    });

    // ─── Sources WebDAV ────────────────────────────────────────────────────
    const webdavParser = this.rssParser.webdavParser;
    const webdavForApi = source => ({
      id: source.id,
      name: source.name,
      url: source.url,
      paused: Boolean(source.paused),
      force: source.force || 'auto',
      max_depth: Number(source.maxDepth) || 8,
      max_items: Number(source.maxItems) || 10000000,
      extensions: source.extensions || webdavParser.constructor.DEFAULT_EXTENSIONS,
      sync_interval_minutes: source.syncIntervalMinutes || null,
      use_proxy: Boolean(source.useProxy),
      has_username: Boolean(source.username),
      has_password: Boolean(source.password),
      source_key: webdavParser.sourceKey(source.id),
      runtime: this.getSourceRuntime(webdavParser.sourceKey(source.id), source.syncIntervalMinutes)
    });
    const validWebdavForce = value => [
      'auto', 'films', 'series', 'documentaires', 'documentaires_series',
      'emissions', 'animes_films', 'animes_series', 'concerts', 'spectacles'
    ].includes(value);
    const normalizeExtensions = value => {
      const values = Array.isArray(value) ? value : String(value || '').split(',');
      const normalized = [...new Set(values.map(item => String(item).trim().replace(/^\./, '').toLowerCase())
        .filter(item => /^[a-z0-9]{1,10}$/.test(item)))];
      return normalized.length ? normalized : webdavParser.constructor.DEFAULT_EXTENSIONS;
    };

    this.app.get('/api/webdav-sources', this.authMiddleware.bind(this), (req, res) => {
      res.json(webdavParser.getSources().map(webdavForApi));
    });

    this.app.post('/api/webdav-sources/preview', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const url = String(req.body.url || '').trim();
        if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'URL WebDAV HTTP(S) invalide' });
        const existing = req.body.source_id
          ? webdavParser.getSources().find(source => source.id === req.body.source_id)
          : null;
        const result = await webdavParser.inspect({
          url,
          username: req.body.clear_credentials ? '' : String(req.body.username || existing?.username || ''),
          password: req.body.clear_credentials ? '' : String(req.body.password || existing?.password || ''),
          maxDepth: Math.min(Math.max(Number(req.body.max_depth) || 8, 0), 20),
          maxItems: Math.min(Math.max(Number(req.body.max_items) || 100, 1), 100),
          extensions: normalizeExtensions(req.body.extensions),
          useProxy: Boolean(req.body.use_proxy)
        });
        res.json(result);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.post('/api/webdav-sources', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const url = String(req.body.url || '').trim();
        const force = String(req.body.force || 'auto');
        if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'URL WebDAV HTTP(S) invalide' });
        if (!validWebdavForce(force)) return res.status(400).json({ error: 'Classement WebDAV invalide' });
        const sources = webdavParser.getSources();
        if (sources.some(source => source.url === url)) return res.status(409).json({ error: 'Cette source existe déjà' });
        const source = {
          id: crypto.randomUUID(),
          name: String(req.body.name || '').trim() || new URL(url).hostname,
          url,
          username: String(req.body.username || ''),
          password: String(req.body.password || ''),
          paused: Boolean(req.body.paused),
          force,
          maxDepth: Math.min(Math.max(Number(req.body.max_depth) || 8, 0), 20),
          maxItems: Math.min(Math.max(Number(req.body.max_items) || 10000000, 1), 10000000),
          extensions: normalizeExtensions(req.body.extensions),
          syncIntervalMinutes: this.normalizeSourceInterval(req.body.sync_interval_minutes),
          useProxy: Boolean(req.body.use_proxy)
        };
        await webdavParser.inspect(source);
        sources.push(source);
        this.db.setConfig('webdav_sources', JSON.stringify(sources));
        res.status(201).json(webdavForApi(source));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.put('/api/webdav-sources/:id', this.authMiddleware.bind(this), async (req, res) => {
      const sources = webdavParser.getSources();
      const index = sources.findIndex(source => source.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Source introuvable' });
      const current = sources[index];
      const next = { ...current };
      if (req.body.name !== undefined) next.name = String(req.body.name).trim() || current.name;
      if (req.body.paused !== undefined) next.paused = Boolean(req.body.paused);
      if (req.body.url !== undefined) {
        if (!/^https?:\/\//i.test(req.body.url || '')) return res.status(400).json({ error: 'URL WebDAV HTTP(S) invalide' });
        next.url = String(req.body.url).trim();
      }
      if (req.body.username !== undefined && String(req.body.username).trim()) next.username = String(req.body.username);
      if (req.body.password !== undefined && String(req.body.password)) next.password = String(req.body.password);
      if (req.body.clear_credentials === true) {
        next.username = '';
        next.password = '';
      }
      if (req.body.force !== undefined) {
        if (!validWebdavForce(req.body.force)) return res.status(400).json({ error: 'Classement WebDAV invalide' });
        next.force = req.body.force;
      }
      if (req.body.max_depth !== undefined) next.maxDepth = Math.min(Math.max(Number(req.body.max_depth) || 0, 0), 20);
      if (req.body.max_items !== undefined) next.maxItems = Math.min(Math.max(Number(req.body.max_items) || 10000000, 1), 10000000);
      if (req.body.extensions !== undefined) next.extensions = normalizeExtensions(req.body.extensions);
      if (req.body.sync_interval_minutes !== undefined) {
        next.syncIntervalMinutes = this.normalizeSourceInterval(req.body.sync_interval_minutes);
      }
      if (req.body.use_proxy !== undefined) next.useProxy = Boolean(req.body.use_proxy);
      try {
        const connectionChanged = next.url !== current.url
          || next.username !== current.username
          || next.password !== current.password
          || next.useProxy !== current.useProxy;
        if (connectionChanged) await webdavParser.inspect(next);
        sources[index] = next;
        this.db.setConfig('webdav_sources', JSON.stringify(sources));
        if (connectionChanged) this.db.deleteSourceSyncState(webdavParser.sourceKey(next.id));
        res.json(webdavForApi(next));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.delete('/api/webdav-sources/:id', this.authMiddleware.bind(this), (req, res) => {
      const sources = webdavParser.getSources();
      const next = sources.filter(source => source.id !== req.params.id);
      if (next.length === sources.length) return res.status(404).json({ error: 'Source introuvable' });
      this.db.setConfig('webdav_sources', JSON.stringify(next));
      this.db.deleteSourceSyncState(webdavParser.sourceKey(req.params.id));
      res.json({ success: true });
    });

    // ─── Sources WaCustom ──────────────────────────────────────────────────
    const waCustomParser = this.rssParser.waCustomParser;
    const waCustomForApi = source => ({
      id: source.id,
      name: source.name,
      url: source.url,
      paused: Boolean(source.paused),
      has_admin_password: Boolean(source.adminPassword),
      catalog_types: this.rssParser.newznabParser.normalizeCatalogTypes(source.catalogTypes),
      max_items_per_sync: Number(source.maxItemsPerSync) || 10000000,
      page_size: Number(source.pageSize) || 1000,
      request_delay_ms: Number(source.requestDelayMs) || 250,
      sync_interval_minutes: source.syncIntervalMinutes || null,
      source_key: waCustomParser.sourceKey(source.id),
      runtime: this.getSourceRuntime(
        waCustomParser.sourceKey(source.id),
        source.syncIntervalMinutes
      )
    });

    this.app.get('/api/wacustom-sources', this.authMiddleware.bind(this), (req, res) => {
      res.json(waCustomParser.getSources().map(waCustomForApi));
    });

    this.app.post('/api/wacustom-sources/preview', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const existing = req.body.source_id
          ? waCustomParser.getSources().find(source => source.id === req.body.source_id)
          : null;
        const source = {
          ...(existing || {}),
          url: req.body.url || existing?.url,
          adminPassword: req.body.admin_password || existing?.adminPassword
        };
        if (!/^https?:\/\//i.test(source.url || '')) {
          return res.status(400).json({ error: 'URL HTTP(S) invalide' });
        }
        res.json(await waCustomParser.inspect(source));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.post('/api/wacustom-sources', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const { name = '', url, admin_password: adminPassword } = req.body;
        if (!/^https?:\/\//i.test(url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
        if (!String(adminPassword || '').trim()) {
          return res.status(400).json({ error: 'Mot de passe administrateur requis' });
        }
        const sources = waCustomParser.getSources();
        if (sources.some(source => waCustomParser.baseUrl(source.url) === waCustomParser.baseUrl(url))) {
          return res.status(409).json({ error: 'Cette source existe déjà' });
        }
        const source = {
          id: crypto.randomUUID(),
          name: String(name).trim() || 'WaCustom',
          url: waCustomParser.baseUrl(url),
          adminPassword: String(adminPassword),
          paused: Boolean(req.body.paused),
          catalogTypes: normalizeCatalogTypes(
            this.rssParser.newznabParser,
            req.body.catalog_types,
            req.body.catalog_types !== undefined
          ),
          maxItemsPerSync: Math.min(Math.max(Number(req.body.max_items_per_sync) || 10000000, 1), 10000000),
          pageSize: Math.min(Math.max(Number(req.body.page_size) || 1000, 10), 5000),
          requestDelayMs: Math.min(Math.max(Number(req.body.request_delay_ms) || 250, 0), 10000),
          syncIntervalMinutes: this.normalizeSourceInterval(req.body.sync_interval_minutes)
        };
        await waCustomParser.inspect(source);
        sources.push(source);
        this.db.setConfig('wacustom_sources', JSON.stringify(sources));
        res.status(201).json(waCustomForApi(source));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.put('/api/wacustom-sources/:id', this.authMiddleware.bind(this), async (req, res) => {
      const sources = waCustomParser.getSources();
      const index = sources.findIndex(source => source.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Source introuvable' });
      const current = sources[index];
      try {
        const next = {
          ...current,
          ...(req.body.name !== undefined ? { name: String(req.body.name).trim() || current.name } : {}),
          ...(req.body.url !== undefined ? { url: waCustomParser.baseUrl(req.body.url) } : {}),
          ...(req.body.admin_password ? { adminPassword: String(req.body.admin_password) } : {}),
          ...(req.body.paused !== undefined ? { paused: Boolean(req.body.paused) } : {}),
          ...(req.body.catalog_types !== undefined ? {
            catalogTypes: normalizeCatalogTypes(this.rssParser.newznabParser, req.body.catalog_types, true)
          } : {}),
          ...(req.body.max_items_per_sync !== undefined ? {
            maxItemsPerSync: Math.min(Math.max(Number(req.body.max_items_per_sync) || 10000000, 1), 10000000)
          } : {}),
          ...(req.body.page_size !== undefined ? {
            pageSize: Math.min(Math.max(Number(req.body.page_size) || 1000, 10), 5000)
          } : {}),
          ...(req.body.request_delay_ms !== undefined ? {
            requestDelayMs: Math.min(Math.max(Number(req.body.request_delay_ms) || 250, 0), 10000)
          } : {}),
          ...(req.body.sync_interval_minutes !== undefined ? {
            syncIntervalMinutes: this.normalizeSourceInterval(req.body.sync_interval_minutes)
          } : {})
        };
        if (!/^https?:\/\//i.test(next.url || '')) {
          return res.status(400).json({ error: 'URL HTTP(S) invalide' });
        }
        const connectionChanged = next.url !== current.url || next.adminPassword !== current.adminPassword;
        const selectionChanged = JSON.stringify(next.catalogTypes || [])
          !== JSON.stringify(current.catalogTypes || []);
        if (connectionChanged) await waCustomParser.inspect(next);
        sources[index] = next;
        this.db.setConfig('wacustom_sources', JSON.stringify(sources));
        if (connectionChanged || selectionChanged) this.db.deleteSourceSyncState(waCustomParser.sourceKey(next.id));
        res.json(waCustomForApi(next));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.delete('/api/wacustom-sources/:id', this.authMiddleware.bind(this), (req, res) => {
      const sources = waCustomParser.getSources();
      const next = sources.filter(source => source.id !== req.params.id);
      if (next.length === sources.length) return res.status(404).json({ error: 'Source introuvable' });
      this.db.setConfig('wacustom_sources', JSON.stringify(next));
      this.db.deleteSourceSyncState(waCustomParser.sourceKey(req.params.id));
      res.json({ success: true });
    });

    // ─── Sources Plex / Jellyfin ───────────────────────────────────────────
    const mediaServerParser = this.rssParser.mediaServerParser;
    const mediaServerForApi = source => ({
      id: source.id,
      name: source.name,
      kind: source.kind,
      url: source.url,
      paused: Boolean(source.paused),
      has_api_key: Boolean(source.apiKey),
      targets: source.targets || [],
      target_labels: source.targetLabels || [],
      max_items: Number(source.maxItems) || 10000000,
      page_size: Number(source.pageSize) || 500,
      sync_interval_minutes: source.syncIntervalMinutes || null,
      use_proxy: Boolean(source.useProxy),
      source_key: mediaServerParser.sourceKey(source.id),
      runtime: this.getSourceRuntime(mediaServerParser.sourceKey(source.id), source.syncIntervalMinutes)
    });
    const mediaServerPayload = (body, existing = null) => ({
      ...(existing || {}),
      ...(body.name !== undefined ? { name: String(body.name).trim() || existing?.name || 'Serveur multimédia' } : {}),
      ...(body.kind !== undefined ? { kind: body.kind } : {}),
      ...(body.url !== undefined ? { url: mediaServerParser.baseUrl(body.url) } : {}),
      ...(String(body.api_key || '').trim() ? { apiKey: String(body.api_key).trim() } : {}),
      ...(body.targets !== undefined ? { targets: Array.isArray(body.targets) ? body.targets.filter(Boolean) : [] } : {}),
      ...(body.target_labels !== undefined ? { targetLabels: Array.isArray(body.target_labels) ? body.target_labels : [] } : {}),
      ...(body.paused !== undefined ? { paused: Boolean(body.paused) } : {}),
      ...(body.use_proxy !== undefined ? { useProxy: Boolean(body.use_proxy) } : {}),
      ...(body.max_items !== undefined ? { maxItems: Math.min(Math.max(Number(body.max_items) || 10000000, 1), 10000000) } : {}),
      ...(body.page_size !== undefined ? { pageSize: Math.min(Math.max(Number(body.page_size) || 500, 10), 1000) } : {}),
      ...(body.sync_interval_minutes !== undefined ? {
        syncIntervalMinutes: this.normalizeSourceInterval(body.sync_interval_minutes)
      } : {})
    });

    this.app.get('/api/media-server-sources', this.authMiddleware.bind(this), (req, res) => {
      res.json(mediaServerParser.getSources().map(mediaServerForApi));
    });

    this.app.post('/api/media-server-sources/preview', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const existing = req.body.source_id
          ? mediaServerParser.getSources().find(source => source.id === req.body.source_id)
          : null;
        const source = mediaServerPayload(req.body, existing);
        if (!['plex', 'jellyfin'].includes(source.kind)) return res.status(400).json({ error: 'Type invalide' });
        if (!/^https?:\/\//i.test(source.url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
        if (!source.apiKey) return res.status(400).json({ error: 'Jeton API requis' });
        res.json(await mediaServerParser.inspect(source));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.post('/api/media-server-sources', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const source = mediaServerPayload(req.body);
        if (!['plex', 'jellyfin'].includes(source.kind)) return res.status(400).json({ error: 'Type invalide' });
        if (!/^https?:\/\//i.test(source.url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
        if (!source.apiKey) return res.status(400).json({ error: 'Jeton API requis' });
        const inspection = await mediaServerParser.inspect(source);
        source.id = crypto.randomUUID();
        source.name ||= inspection.server;
        source.targets ||= inspection.targets.map(target => target.id);
        source.targetLabels = inspection.targets.filter(target => source.targets.includes(target.id));
        const sources = mediaServerParser.getSources();
        sources.push(source);
        this.db.setConfig('media_server_sources', JSON.stringify(sources));
        res.status(201).json(mediaServerForApi(source));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.put('/api/media-server-sources/:id', this.authMiddleware.bind(this), async (req, res) => {
      const sources = mediaServerParser.getSources();
      const index = sources.findIndex(source => source.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Source introuvable' });
      try {
        const current = sources[index];
        const next = mediaServerPayload(req.body, current);
        const connectionChanged = next.kind !== current.kind || next.url !== current.url || next.apiKey !== current.apiKey;
        if (connectionChanged) await mediaServerParser.inspect(next);
        sources[index] = next;
        this.db.setConfig('media_server_sources', JSON.stringify(sources));
        if (connectionChanged) this.db.deleteSourceSyncState(mediaServerParser.sourceKey(next.id));
        res.json(mediaServerForApi(next));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.delete('/api/media-server-sources/:id', this.authMiddleware.bind(this), (req, res) => {
      const sources = mediaServerParser.getSources();
      const next = sources.filter(source => source.id !== req.params.id);
      if (next.length === sources.length) return res.status(404).json({ error: 'Source introuvable' });
      this.db.setConfig('media_server_sources', JSON.stringify(next));
      this.db.deleteSourceSyncState(mediaServerParser.sourceKey(req.params.id));
      res.json({ success: true });
    });

    // ─── Sources StreamFusion ─────────────────────────────────────────────
    const streamFusionParser = this.rssParser.streamFusionParser;
    const streamFusionForApi = source => ({
      id: source.id,
      name: source.name,
      url: source.url,
      paused: Boolean(source.paused),
      has_key_id: Boolean(source.keyId),
      has_secret: Boolean(source.secret),
      catalog_types: this.rssParser.newznabParser.normalizeCatalogTypes(source.catalogTypes),
      max_items_per_sync: Number(source.maxItemsPerSync) || 10000000,
      page_size: Number(source.pageSize) || 1000,
      request_delay_ms: Number(source.requestDelayMs) || 100,
      sync_interval_minutes: source.syncIntervalMinutes || null,
      use_proxy: Boolean(source.useProxy),
      source_key: streamFusionParser.sourceKey(source.id),
      runtime: this.getSourceRuntime(streamFusionParser.sourceKey(source.id), source.syncIntervalMinutes)
    });
    const streamFusionPayload = (body, existing = null) => ({
      ...(existing || {}),
      ...(body.name !== undefined ? { name: String(body.name).trim() || existing?.name || 'StreamFusion' } : {}),
      ...(body.url !== undefined ? { url: streamFusionParser.baseUrl(body.url) } : {}),
      ...(String(body.key_id || '').trim() ? { keyId: String(body.key_id).trim() } : {}),
      ...(String(body.secret || '').trim() ? { secret: String(body.secret).trim() } : {}),
      ...(body.paused !== undefined ? { paused: Boolean(body.paused) } : {}),
      ...(body.use_proxy !== undefined ? { useProxy: Boolean(body.use_proxy) } : {}),
      ...(body.catalog_types !== undefined ? {
        catalogTypes: normalizeCatalogTypes(this.rssParser.newznabParser, body.catalog_types, true)
      } : {}),
      ...(body.max_items_per_sync !== undefined ? {
        maxItemsPerSync: Math.min(Math.max(Number(body.max_items_per_sync) || 10000000, 1), 10000000)
      } : {}),
      ...(body.page_size !== undefined ? {
        pageSize: Math.min(Math.max(Number(body.page_size) || 1000, 1), 2000)
      } : {}),
      ...(body.request_delay_ms !== undefined ? {
        requestDelayMs: Math.min(Math.max(Number(body.request_delay_ms) || 100, 0), 10000)
      } : {}),
      ...(body.sync_interval_minutes !== undefined ? {
        syncIntervalMinutes: this.normalizeSourceInterval(body.sync_interval_minutes)
      } : {})
    });

    this.app.get('/api/streamfusion-sources', this.authMiddleware.bind(this), (req, res) => {
      res.json(streamFusionParser.getSources().map(streamFusionForApi));
    });

    this.app.post('/api/streamfusion-sources/preview', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const existing = req.body.source_id
          ? streamFusionParser.getSources().find(source => source.id === req.body.source_id)
          : null;
        res.json(await streamFusionParser.inspect(streamFusionPayload(req.body, existing)));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.post('/api/streamfusion-sources', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const source = streamFusionPayload(req.body);
        if (!source.keyId || !source.secret) return res.status(400).json({ error: 'Peer Key ID et secret requis' });
        await streamFusionParser.inspect(source);
        source.id = crypto.randomUUID();
        const sources = streamFusionParser.getSources();
        sources.push(source);
        this.db.setConfig('streamfusion_sources', JSON.stringify(sources));
        res.status(201).json(streamFusionForApi(source));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.put('/api/streamfusion-sources/:id', this.authMiddleware.bind(this), async (req, res) => {
      const sources = streamFusionParser.getSources();
      const index = sources.findIndex(source => source.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Source introuvable' });
      try {
        const current = sources[index];
        const next = streamFusionPayload(req.body, current);
        const connectionChanged = ['url', 'keyId', 'secret'].some(field => next[field] !== current[field]);
        const selectionChanged = JSON.stringify(next.catalogTypes || [])
          !== JSON.stringify(current.catalogTypes || []);
        if (connectionChanged) await streamFusionParser.inspect(next);
        sources[index] = next;
        this.db.setConfig('streamfusion_sources', JSON.stringify(sources));
        if (connectionChanged || selectionChanged) this.db.deleteSourceSyncState(streamFusionParser.sourceKey(next.id));
        res.json(streamFusionForApi(next));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.delete('/api/streamfusion-sources/:id', this.authMiddleware.bind(this), (req, res) => {
      const sources = streamFusionParser.getSources();
      const next = sources.filter(source => source.id !== req.params.id);
      if (next.length === sources.length) return res.status(404).json({ error: 'Source introuvable' });
      this.db.setConfig('streamfusion_sources', JSON.stringify(next));
      this.db.deleteSourceSyncState(streamFusionParser.sourceKey(req.params.id));
      res.json({ success: true });
    });

    // ─── Pairs CometNet ciblés (réception passive) ────────────────────────
    const cometNetParser = this.rssParser.cometNetParser;
    const cometNetForApi = source => {
      const inbox = this.db.getCometNetInboxStats(source.id);
      return {
        id: source.id,
        name: source.name,
        url: source.url,
        paused: Boolean(source.paused),
        catalog_types: this.rssParser.newznabParser.normalizeCatalogTypes(source.catalogTypes),
        max_items_per_sync: Number(source.maxItemsPerSync) || 10000000,
        source_key: cometNetParser.sourceKey(source.id),
        peer_node_id: source.peerNodeId || null,
        peer_alias: source.peerAlias || null,
        connection: cometNetParser.getState(source.id),
        inbox: {
          received: Number(inbox.received) || 0,
          pending: Number(inbox.pending) || 0,
          last_received_at: inbox.last_received_at || null
        },
        runtime: this.getSourceRuntime(cometNetParser.sourceKey(source.id), null)
      };
    };
    const cometNetPayload = (body, existing = null) => ({
      ...(existing || {}),
      ...(body.name !== undefined
        ? { name: String(body.name).trim() || existing?.name || 'CometNet' }
        : {}),
      ...(body.url !== undefined ? { url: cometNetParser.normalizeUrl(body.url) } : {}),
      ...(body.paused !== undefined ? { paused: Boolean(body.paused) } : {}),
      ...(body.catalog_types !== undefined ? {
        catalogTypes: normalizeCatalogTypes(this.rssParser.newznabParser, body.catalog_types, true)
      } : {}),
      ...(body.max_items_per_sync !== undefined ? {
        maxItemsPerSync: Math.min(Math.max(Number(body.max_items_per_sync) || 10000000, 1), 10000000)
      } : {})
    });

    this.app.get('/api/cometnet-sources', this.authMiddleware.bind(this), (req, res) => {
      res.json(cometNetParser.getSources().map(cometNetForApi));
    });

    this.app.post('/api/cometnet-sources/preview', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const existing = req.body.source_id
          ? cometNetParser.getSources().find(source => source.id === req.body.source_id)
          : null;
        const source = cometNetPayload(req.body, existing);
        res.json(await cometNetParser.inspect(source));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.post('/api/cometnet-sources', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const source = cometNetPayload(req.body);
        if (!source.url) return res.status(400).json({ error: 'URL WebSocket requise' });
        source.id = crypto.randomUUID();
        const inspected = await cometNetParser.inspect(source);
        source.peerNodeId = inspected.peer_node_id;
        source.peerAlias = inspected.peer_alias;
        const sources = cometNetParser.getSources();
        sources.push(source);
        cometNetParser.saveSources(sources);
        cometNetParser.refreshSource(source.id);
        res.status(201).json(cometNetForApi(source));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.put('/api/cometnet-sources/:id', this.authMiddleware.bind(this), async (req, res) => {
      const sources = cometNetParser.getSources();
      const index = sources.findIndex(source => source.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Source introuvable' });
      try {
        const current = sources[index];
        const next = cometNetPayload(req.body, current);
        const connectionChanged = next.url !== current.url;
        if (connectionChanged) {
          delete next.peerNodeId;
          delete next.peerAlias;
          const inspected = await cometNetParser.inspect(next);
          next.peerNodeId = inspected.peer_node_id;
          next.peerAlias = inspected.peer_alias;
          this.db.deleteSourceSyncState(cometNetParser.sourceKey(next.id));
        }
        sources[index] = next;
        cometNetParser.saveSources(sources);
        cometNetParser.refreshSource(next.id);
        res.json(cometNetForApi(next));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.delete('/api/cometnet-sources/:id', this.authMiddleware.bind(this), (req, res) => {
      const sources = cometNetParser.getSources();
      const next = sources.filter(source => source.id !== req.params.id);
      if (next.length === sources.length) return res.status(404).json({ error: 'Source introuvable' });
      cometNetParser.disconnect(req.params.id, false);
      cometNetParser.saveSources(next);
      this.db.deleteSourceSyncState(cometNetParser.sourceKey(req.params.id));
      const inboxDeleted = this.db.deleteCometNetInbox(req.params.id);
      res.json({ success: true, inbox_deleted: inboxDeleted });
    });

    // ─── Services d'identification Stremio ────────────────────────────────
    const metadataService = this.tmdbMatcher.stremioMetadata;
    const metadataForApi = source => ({
      id: source.id,
      name: source.name,
      url: source.url,
      priority: Number(source.priority) || 100,
      paused: Boolean(source.paused),
      use_proxy: source.useProxy !== false
    });
    const saveMetadataSources = sources => {
      this.db.setConfig('stremio_metadata_sources', JSON.stringify(sources));
      this.db.setConfig('stremio_metadata_enabled', sources.some(source => !source.paused) ? 'true' : 'false');
      metadataService.manifestCache.clear();
    };
    const metadataPayload = (body, existing = null) => metadataService.normalizeSource({
      ...(existing || {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.url !== undefined ? { url: body.url } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.paused !== undefined ? { paused: body.paused } : {}),
      ...(body.use_proxy !== undefined ? { useProxy: Boolean(body.use_proxy) } : {})
    });

    this.app.get('/api/metadata-providers', this.authMiddleware.bind(this), (req, res) => {
      res.json(metadataService.getSources().map(metadataForApi));
    });

    this.app.post('/api/metadata-providers/preview', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const existing = req.body.source_id
          ? metadataService.getSources().find(source => source.id === req.body.source_id)
          : null;
        res.json(await metadataService.inspect(metadataPayload(req.body, existing)));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.post('/api/metadata-providers', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const source = metadataPayload(req.body);
        const inspection = await metadataService.inspect(source);
        if (!String(req.body.name || '').trim()) source.name = inspection.name;
        const sources = metadataService.getSources().filter(item => item.id !== 'legacy');
        sources.push(source);
        saveMetadataSources(sources);
        res.status(201).json(metadataForApi(source));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.put('/api/metadata-providers/:id', this.authMiddleware.bind(this), async (req, res) => {
      const sources = metadataService.getSources();
      const index = sources.findIndex(source => source.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Service introuvable' });
      try {
        const current = sources[index];
        const next = metadataPayload(req.body, current);
        if (next.url !== current.url) await metadataService.inspect(next);
        sources[index] = next;
        saveMetadataSources(sources);
        res.json(metadataForApi(next));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.delete('/api/metadata-providers/:id', this.authMiddleware.bind(this), (req, res) => {
      const sources = metadataService.getSources();
      const next = sources.filter(source => source.id !== req.params.id);
      if (next.length === sources.length) return res.status(404).json({ error: 'Service introuvable' });
      saveMetadataSources(next);
      res.json({ success: true });
    });

    // ─── Guides MDBList ───────────────────────────────────────────────────
    const mdblistParser = this.rssParser.mdblistGuideParser;
    const mdblistForApi = source => ({
      id: source.id,
      name: source.name,
      kind: source.kind || 'mdblist',
      url: source.url,
      paused: Boolean(source.paused),
      has_api_key: Boolean(source.apiKey),
      has_username: Boolean(source.username),
      has_password: Boolean(source.password),
      has_access_token: Boolean(source.accessToken),
      list_type: source.listType || null,
      list_id: source.listId || null,
      statuses: source.statuses || [],
      max_items: Number(source.maxItems) || 10000000,
      sync_interval_minutes: source.syncIntervalMinutes || null,
      stats: this.db.getGuideItemStats(source.id),
      sample: this.db.listGuideItems(source.id, 5),
      runtime: this.getSourceRuntime(mdblistParser.sourceKey(source.id), source.syncIntervalMinutes)
    });

    const mdblistPayload = (body, existing = null) => ({
      ...(existing || {}),
      ...(body.name !== undefined ? { name: String(body.name).trim() || existing?.name || 'Guide MDBList' } : {}),
      ...(body.url !== undefined ? { url: String(body.url).trim() } : {}),
      ...(body.kind !== undefined && ['mdblist', 'listsync', 'suggestarr', 'agregarr'].includes(body.kind)
        ? { kind: body.kind }
        : {}),
      ...(body.api_key ? { apiKey: String(body.api_key).trim() } : {}),
      ...(body.username !== undefined ? { username: String(body.username).trim() } : {}),
      ...(body.password ? { password: String(body.password) } : {}),
      ...(body.access_token ? { accessToken: String(body.access_token).trim() } : {}),
      ...(body.list_type !== undefined ? { listType: String(body.list_type).trim() } : {}),
      ...(body.list_id !== undefined ? { listId: String(body.list_id).trim() } : {}),
      ...(Array.isArray(body.statuses) ? { statuses: body.statuses.map(String) } : {}),
      ...(body.paused !== undefined ? { paused: Boolean(body.paused) } : {}),
      ...(body.max_items !== undefined ? {
        maxItems: Math.min(Math.max(Number(body.max_items) || 10000000, 1), 10000000)
      } : {}),
      ...(body.sync_interval_minutes !== undefined ? {
        syncIntervalMinutes: this.normalizeSourceInterval(body.sync_interval_minutes)
      } : {})
    });

    this.app.get('/api/mdblist-guides', this.authMiddleware.bind(this), (req, res) => {
      res.json(mdblistParser.getSources().map(mdblistForApi));
    });

    this.app.post('/api/mdblist-guides/preview', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const existing = req.body.source_id
          ? mdblistParser.getSources().find(source => source.id === req.body.source_id)
          : null;
        const source = mdblistPayload(req.body, existing);
        if (!source.url) return res.status(400).json({ error: 'Adresse de liste requise' });
        if ((source.kind || 'mdblist') === 'mdblist' && !source.apiKey) {
          return res.status(400).json({ error: 'Clé API MDBList requise' });
        }
        res.json(await mdblistParser.inspect(source));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.post('/api/mdblist-guides', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const source = {
          ...mdblistPayload(req.body),
          id: crypto.randomUUID(),
          kind: ['mdblist', 'listsync', 'suggestarr', 'agregarr'].includes(req.body.kind) ? req.body.kind : 'mdblist',
          name: String(req.body.name || '').trim() || 'Guide MDBList',
          paused: Boolean(req.body.paused),
          maxItems: Math.min(Math.max(Number(req.body.max_items) || 10000000, 1), 10000000),
          syncIntervalMinutes: this.normalizeSourceInterval(req.body.sync_interval_minutes)
        };
        if (!source.url) return res.status(400).json({ error: 'Adresse requise' });
        if (source.kind === 'mdblist') mdblistParser.parseListReference(source.url);
        const sources = mdblistParser.getSources();
        sources.push(source);
        this.db.setConfig('mdblist_guides', JSON.stringify(sources));
        try {
          await mdblistParser.syncSource(source);
        } catch (error) {
          this.db.setConfig('mdblist_guides', JSON.stringify(sources.filter(item => item.id !== source.id)));
          this.db.deleteSourceSyncState(mdblistParser.sourceKey(source.id));
          throw error;
        }
        this.stremioAddon.clearCache();
        res.status(201).json(mdblistForApi(source));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.put('/api/mdblist-guides/:id', this.authMiddleware.bind(this), async (req, res) => {
      const sources = mdblistParser.getSources();
      const index = sources.findIndex(source => source.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Guide introuvable' });
      try {
        const current = sources[index];
        const next = mdblistPayload(req.body, current);
        if (!next.url) return res.status(400).json({ error: 'Adresse requise' });
        if ((next.kind || 'mdblist') === 'mdblist') mdblistParser.parseListReference(next.url);
        const connectionChanged = [
          'url', 'kind', 'apiKey', 'username', 'password', 'accessToken', 'listType', 'listId'
        ].some(field => next[field] !== current[field]);
        if (connectionChanged) await mdblistParser.inspect(next);
        sources[index] = next;
        this.db.setConfig('mdblist_guides', JSON.stringify(sources));
        if (connectionChanged) {
          this.db.deleteSourceSyncStates([
            mdblistParser.sourceKey(next.id, current.kind || 'mdblist'),
            mdblistParser.sourceKey(next.id, next.kind || 'mdblist')
          ]);
        }
        res.json(mdblistForApi(next));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.post('/api/mdblist-guides/:id/sync', this.authMiddleware.bind(this), async (req, res) => {
      const source = mdblistParser.getSources().find(item => item.id === req.params.id);
      if (!source) return res.status(404).json({ error: 'Guide introuvable' });
      try {
        const result = await mdblistParser.syncSource(source);
        this.stremioAddon.clearCache();
        this.db.setConfig('last_catalog_refresh', String(Date.now()));
        res.json({ success: true, ...result, guide: mdblistForApi(source) });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.delete('/api/mdblist-guides/:id', this.authMiddleware.bind(this), (req, res) => {
      const sources = mdblistParser.getSources();
      const current = sources.find(source => source.id === req.params.id);
      const next = sources.filter(source => source.id !== req.params.id);
      if (next.length === sources.length) return res.status(404).json({ error: 'Guide introuvable' });
      this.db.setConfig('mdblist_guides', JSON.stringify(next));
      this.db.deleteGuideItems(req.params.id);
      this.db.deleteSourceSyncState(mdblistParser.sourceKey(req.params.id, current.kind || 'mdblist'));
      this.stremioAddon.clearCache();
      res.json({ success: true });
    });

    // ─── Catalogues personnalisés ──────────────────────────────────────────
    this.app.get('/api/catalogs', this.authMiddleware.bind(this), (req, res) => {
      res.json(this.db.listCustomCatalogs());
    });

    this.app.post('/api/catalogs', this.authMiddleware.bind(this), (req, res) => {
      const { name, type, source_urls = [], filters = {}, enabled = true, updates_enabled = true } = req.body;
      if (!String(name || '').trim()) return res.status(400).json({ error: 'Nom requis' });
      if (!SUPPORTED_CATALOG_TYPES.includes(type)) return res.status(400).json({ error: 'Type invalide' });
      const slug = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'catalogue';
      const id = `custom_${slug}_${crypto.randomUUID().slice(0, 8)}`;
      let normalizedFilters;
      try {
        normalizedFilters = this.validateCatalogComposition({ id, type, filters });
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
      const catalog = this.db.saveCustomCatalog({
        id,
        name: String(name).trim(), type, source_urls,
        filters: normalizedFilters, enabled, updates_enabled
      });
      this.bumpManifestRevision('catalog_created', catalog);
      this.stremioAddon.clearCache();
      res.status(201).json(catalog);
    });

    this.app.put('/api/catalogs/:id', this.authMiddleware.bind(this), (req, res) => {
      const current = this.db.getCustomCatalog(req.params.id);
      if (!current) return res.status(404).json({ error: 'Catalogue introuvable' });
      const next = { ...current, ...req.body, id: current.id };
      if (!String(next.name || '').trim() || !SUPPORTED_CATALOG_TYPES.includes(next.type)) {
        return res.status(400).json({ error: 'Nom ou type invalide' });
      }
      try {
        next.filters = this.validateCatalogComposition(next);
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
      const catalog = this.db.saveCustomCatalog(next);
      let event = 'catalog_updated';
      if (current.enabled !== catalog.enabled) {
        event = catalog.enabled ? 'catalog_published' : 'catalog_hidden';
      } else if (current.updates_enabled !== catalog.updates_enabled) {
        event = catalog.updates_enabled ? 'catalog_updates_resumed' : 'catalog_updates_paused';
      } else if (current.name !== catalog.name) {
        event = 'catalog_renamed';
      }
      this.bumpManifestRevision(event, catalog, {
        previous: {
          name: current.name,
          enabled: current.enabled,
          updates_enabled: current.updates_enabled
        }
      });
      this.stremioAddon.clearCache();
      res.json(catalog);
    });

    this.app.delete('/api/catalogs/:id', this.authMiddleware.bind(this), (req, res) => {
      const current = this.db.getCustomCatalog(req.params.id);
      if (!current || !this.db.deleteCustomCatalog(req.params.id)) return res.status(404).json({ error: 'Catalogue introuvable' });
      this.db.removeCustomCatalogReferences(req.params.id);
      this.bumpManifestRevision('catalog_deleted', current);
      this.stremioAddon.clearCache();
      res.json({ success: true });
    });

    this.app.post('/api/catalogs/preview', this.authMiddleware.bind(this), (req, res) => {
      const virtual = {
        id: null,
        type: req.body.type,
        source_urls: req.body.source_urls || [],
        filters: req.body.filters || {}
      };
      if (!SUPPORTED_CATALOG_TYPES.includes(virtual.type)) return res.status(400).json({ error: 'Type invalide' });
      try {
        virtual.filters = this.validateCatalogComposition(virtual);
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
      const items = this.db.getCustomCatalogMedia(virtual, 0, 21);
      res.json({
        count: this.db.countCustomCatalogMedia(virtual),
        items: items.slice(0, 20).map(item => ({ imdb_id: item.imdb_id, name: item.name, year: item.year }))
      });
    });

    this.app.get('/api/manifest/history', this.authMiddleware.bind(this), (req, res) => {
      res.json({
        revision: Number(this.db.getConfig('manifest_revision')) || 0,
        last_catalog_refresh: Number(this.db.getConfig('last_catalog_refresh')) || null,
        items: this.db.listManifestHistory(parseInt(req.query.limit) || 50)
      });
    });

    // ─── Stats ──────────────────────────────────────────────────────────────
    this.app.get('/api/stats', this.authMiddleware.bind(this), (req, res) => {
      const films         = this.db.getMediaCount('films');
      const documentaires = this.db.getMediaCount('documentaires');
      const series        = this.db.getMediaCount('series');
      const emissions     = this.db.getMediaCount('emissions');
      const animes        = this.db.getMediaCount('animés');
      const concerts      = this.db.getMediaCount('concerts');
      const spectacles    = this.db.getMediaCount('spectacles');
      const total = films + documentaires + series + emissions + animes + concerts + spectacles;
      res.json({ films, documentaires, series, emissions, animes, concerts, spectacles, total });
    });

    // ─── Overview ───────────────────────────────────────────────────────────
    this.app.get('/api/overview', this.authMiddleware.bind(this), (req, res) => {
      const lastSync    = this.db.getLatestSync() || null;
      const failedCount = this.db.getFailedReleasesCount();
      const sources     = this.db.getSourceStats();
      const recentByCat = {
        films:         this.db.getRecentCatalogAdditions('films', 10),
        documentaires: this.db.getRecentCatalogAdditions('documentaires', 10),
        series:        this.db.getRecentCatalogAdditions('series', 10),
        emissions:     this.db.getRecentCatalogAdditions('emissions', 10),
        animes:        this.db.getRecentCatalogAdditions('animés', 10),
        concerts:      this.db.getRecentCatalogAdditions('concerts', 10),
        spectacles:    this.db.getRecentCatalogAdditions('spectacles', 10)
      };
      const rpdbEnabled = this.db.getConfig('rpdb_enabled') === 'true';
      const rpdbKey     = this.db.getConfig('rpdb_api_key') || '';
      res.json({
        lastSync,
        failedCount,
        sourcesCount: sources.length,
        recentByCat,
        rpdbEnabled,
        rpdbKey
      });
    });

    // ─── Media Library ──────────────────────────────────────────────────────
    this.app.get('/api/media/list', this.authMiddleware.bind(this), (req, res) => {
      const { catalog, search, page = 1, limit = 24, sort = 'date_desc', year, quality } = req.query;
      const result = this.db.getMediaList({
        catalog: catalog || null,
        search: search || '',
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 24,
        sort: sort || 'date_desc',
        year: year || null,
        quality: quality || null
      });
      const sourceNameMap = this.getSourceNameMap();
      result.items = result.items.map(item => ({
        ...item,
        source_names: [...new Set((item.source_urls || [])
          .map(sourceUrl => sourceNameMap[sourceUrl])
          .filter(Boolean))]
      }));
      res.json(result);
    });

    this.app.get('/api/media/years', this.authMiddleware.bind(this), (req, res) => {
      res.json(this.db.getMediaYears());
    });

    this.app.get('/api/releases/list', this.authMiddleware.bind(this), (req, res) => {
      const { search, page = 1, limit = 50 } = req.query;
      const result = this.db.getReleasesList({
        search: search || '',
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50
      });
      const sourceNameMap = this.getSourceNameMap();
      result.items = result.items.map(item => ({
        ...item,
        source_name: (item.source_url && sourceNameMap[item.source_url]) || null
      }));
      res.json(result);
    });

    this.app.get('/api/media/:imdbId/releases', this.authMiddleware.bind(this), (req, res) => {
      const sourceNameMap = this.getSourceNameMap();
      const releases = this.db.getReleasesByMedia(req.params.imdbId);
      res.json(releases.map(release => ({
        ...release,
        source_name: (release.source_url && sourceNameMap[release.source_url]) || null
      })));
    });

    this.app.post('/api/media/:imdbId/catalog', this.authMiddleware.bind(this), (req, res) => {
      const { imdbId } = req.params;
      const { catalog_type } = req.body;
      const valid = ['films', 'series', 'documentaires', 'emissions', 'animés', 'concerts', 'spectacles'];
      if (!valid.includes(catalog_type)) {
        return res.status(400).json({ error: 'Catégorie invalide' });
      }
      this.db.batchUpdateCatalogTypes([{ imdb_id: imdbId, catalog_type }]);
      this.stremioAddon.clearCache();
      console.log(`[Manual] ${imdbId} → ${catalog_type}`);
      res.json({ success: true });
    });

    // ─── Sources ────────────────────────────────────────────────────────────
    this.app.get('/api/sources/stats', this.authMiddleware.bind(this), (req, res) => {
      const nameMap = this.getSourceNameMap();

      // Flux avec releases
      const stats = this.db.getSourceStats();
      stats.forEach(s => { s.name = nameMap[s.source_url] || ''; });

      // Flux en erreur sans aucune release (jamais fonctionné)
      const errorsOnly = this.db.getFeedErrorsOnly();
      errorsOnly.forEach(s => {
        s.name = nameMap[s.source_url] || '';
        s.release_count = 0; s.media_count = 0;
        s.films_count = 0; s.documentaires_count = 0;
        s.series_count = 0; s.emissions_count = 0;
        s.first_seen = null; s.last_seen = null;
      });

      res.json([...stats, ...errorsOnly]);
    });

    this.app.get('/api/source-alerts/config', this.authMiddleware.bind(this), (req, res) => {
      const config = this.getSourceAlertConfig();
      res.json({
        enabled: config.enabled,
        default_threshold: config.defaultThreshold,
        probe_enabled: this.getSourceProbeConfig().enabled,
        probe_interval_minutes: this.getSourceProbeConfig().intervalMinutes,
        sources: this.getSourceAlertSources().map(source => ({
          ...source,
          threshold: Math.min(Math.max(
            Number(config.thresholds[source.source_key]) || config.defaultThreshold,
            1
          ), 100),
          uses_default: config.thresholds[source.source_key] === undefined,
          runtime: this.getSourceRuntime(source.source_key)
        }))
      });
    });

    this.app.put('/api/source-alerts/config', this.authMiddleware.bind(this), async (req, res) => {
      const enabled = req.body.enabled !== false;
      const defaultThreshold = Math.min(Math.max(Number(req.body.default_threshold) || 3, 1), 100);
      const probeEnabled = req.body.probe_enabled !== false;
      const probeIntervalMinutes = Math.min(Math.max(Number(req.body.probe_interval_minutes) || 5, 1), 1440);
      const knownKeys = new Set(this.getSourceAlertSources().map(source => source.source_key));
      const thresholds = {};
      for (const [sourceKey, rawThreshold] of Object.entries(req.body.thresholds || {})) {
        if (!knownKeys.has(sourceKey)) continue;
        const threshold = Number(rawThreshold);
        if (Number.isFinite(threshold)) thresholds[sourceKey] = Math.min(Math.max(threshold, 1), 100);
      }
      this.db.setConfig('source_alerts_enabled', enabled ? 'true' : 'false');
      this.db.setConfig('source_alert_default_threshold', String(defaultThreshold));
      this.db.setConfig('source_alert_thresholds', JSON.stringify(thresholds));
      this.db.setConfig('source_probe_enabled', probeEnabled ? 'true' : 'false');
      this.db.setConfig('source_probe_interval_minutes', String(probeIntervalMinutes));
      await this.processSourceHealthAlerts();
      await this.runSourceProbes();
      res.json({ success: true });
    });

    this.app.get('/api/source-alerts/history', this.authMiddleware.bind(this), (req, res) => {
      res.json(this.db.listSourceAlerts(Number(req.query.limit) || 100));
    });

    // ─── Sync ───────────────────────────────────────────────────────────────
    this.app.post('/api/sync', this.authMiddleware.bind(this), async (req, res) => {
      if (this.syncInProgress) return res.status(409).json({ error: 'Synchronisation déjà en cours' });
      const tmdbKey = this.db.getConfig('tmdb_api_key');
      const hasPastebin = this.rssParser.pastebinParser.getSources().some(source => !source.paused);
      const hasStremio = this.rssParser.stremioManifestParser.getSources().some(source => !source.paused);
      const hasNewznab = this.rssParser.newznabParser.getSources().some(source => !source.paused);
      const hasWebdav = this.rssParser.webdavParser.getSources().some(source => !source.paused);
      const hasWaCustom = this.rssParser.waCustomParser.getSources().some(source => !source.paused);
      const hasMediaServer = this.rssParser.mediaServerParser.getSources().some(source => !source.paused);
      const hasStreamFusion = this.rssParser.streamFusionParser.getSources().some(source => !source.paused);
      const hasCometNet = this.rssParser.cometNetParser.getSources().some(source => !source.paused);
      const hasRss = this.getRssSources().some(source => !source.paused);
      if (!hasRss && !hasPastebin && !hasStremio && !hasNewznab && !hasWebdav && !hasWaCustom && !hasMediaServer && !hasStreamFusion && !hasCometNet) {
        return res.status(400).json({ error: 'Au moins une source active est requise' });
      }
      if ((hasRss || hasPastebin || hasNewznab || hasWebdav) && !tmdbKey) {
        return res.status(400).json({ error: 'La clé TMDB est requise pour les sources RSS, Pastebin, Newznab et WebDAV' });
      }

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host     = req.headers['x-forwarded-host'] || req.headers.host || req.hostname;
      this.baseUrl   = `${protocol}://${host}`;

      this.syncInProgress = true;
      this.syncStartedAt  = Date.now();
      this.syncStatus = { running: true, stage: 'Démarrage...', progress: 0, total: 0, matched: 0, failed: 0 };
      res.json({ success: true, message: 'Synchronisation démarrée' });
      this.runSync({ forceAll: true }).catch(error => {
        console.error('Sync error:', error);
        this.syncStatus.error = error.message;
      }).finally(() => {
        this.syncInProgress = false;
        this.syncStartedAt  = null;
      });
    });

    this.app.get('/api/sync/status', this.authMiddleware.bind(this), (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.json(this.syncStatus || { running: false });
    });

    this.app.get('/api/sync/history', this.authMiddleware.bind(this), (req, res) => {
      res.json(this.db.getSyncHistory(parseInt(req.query.limit) || 3));
    });

    this.app.get('/api/sync/history/dates', this.authMiddleware.bind(this), (req, res) => {
      res.json(this.db.getSyncHistoryDates());
    });

    this.app.get('/api/sync/history/by-date', this.authMiddleware.bind(this), (req, res) => {
      if (!req.query.date) return res.status(400).json({ error: 'Date required' });
      res.json(this.db.getSyncHistoryByDate(req.query.date));
    });

    // ─── Failed Releases ────────────────────────────────────────────────────
    this.app.get('/api/failed', this.authMiddleware.bind(this), (req, res) => {
      const limit  = parseInt(req.query.limit)  || 200;
      const offset = parseInt(req.query.offset) || 0;
      res.json({ items: this.db.getFailedReleases(limit, offset), total: this.db.getFailedReleasesCount() });
    });

    this.app.delete('/api/failed/:id', this.authMiddleware.bind(this), (req, res) => {
      res.json({ success: this.db.deleteFailedRelease(parseInt(req.params.id)) > 0 });
    });

    this.app.delete('/api/failed', this.authMiddleware.bind(this), (req, res) => {
      res.json({ success: true, cleared: this.db.clearFailedReleases() });
    });

    this.app.post('/api/failed/retry', this.authMiddleware.bind(this), async (req, res) => {
      if (this.syncInProgress) return res.status(409).json({ error: 'Synchronisation déjà en cours' });
      res.json({ success: true, message: 'Retry des releases échouées démarré' });

      this.syncInProgress = true;
      this.syncStartedAt  = Date.now();
      this.syncStatus = { running: true, stage: 'Retry des releases échouées...', progress: 0, total: 0, matched: 0, failed: 0, alreadyInDb: 0 };

      try {
        const result = await this.tmdbMatcher.retryFailed((progress) => {
          this.syncStatus.progress    = progress.current;
          this.syncStatus.total       = progress.total;
          this.syncStatus.matched     = progress.matched;
          this.syncStatus.failed      = progress.failed;
          this.syncStatus.alreadyInDb = progress.alreadyInDb || 0;
        });
        this.syncStatus.stage     = 'Retry terminé';
        this.syncStatus.running   = false;
        this.syncStatus.completed = true;
        console.log('[Retry]', result);
        if (result.recovered > 0) this.stremioAddon.clearCache();
      } catch (err) {
        console.error('[Retry] Erreur:', err);
        this.syncStatus.stage   = 'Erreur';
        this.syncStatus.error   = err.message;
        this.syncStatus.running = false;
      } finally {
        this.syncInProgress = false;
        this.syncStartedAt  = null;
      }
    });

    // ─── Override manuel d'une release échouée ──────────────────────────────
    this.app.post('/api/failed/:id/override', this.authMiddleware.bind(this), async (req, res) => {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'ID invalide' });

      const { id_type, id_value } = req.body;
      if (!id_type || !id_value || !id_value.trim()) {
        return res.status(400).json({ error: 'id_type et id_value sont requis' });
      }

      const failedRelease = this.db.getFailedReleaseById(id);
      if (!failedRelease) return res.status(404).json({ error: 'Release introuvable' });

      try {
        const result = await this.tmdbMatcher.applyOverride(failedRelease, id_type, id_value.trim());
        this.stremioAddon.clearCache();
        res.json({ success: true, imdb_id: result.imdb_id, name: result.name });
      } catch (err) {
        console.error(`[Override] Erreur pour release #${id}:`, err.message);
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Maintenance : analyse, réparation et historique ──────────────────
    this.app.get('/api/maintenance/analysis', this.authMiddleware.bind(this), (req, res) => {
      try {
        res.json(this.db.getMaintenanceAnalysis());
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/maintenance/history', this.authMiddleware.bind(this), (req, res) => {
      try {
        res.json(this.db.listMaintenanceHistory(req.query.limit));
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/maintenance/apply', this.authMiddleware.bind(this), async (req, res) => {
      if (this.syncInProgress) {
        return res.status(409).json({ error: 'Une synchronisation est en cours' });
      }
      if (this.maintenanceInProgress) {
        return res.status(409).json({ error: 'Une maintenance est déjà en cours' });
      }
      this.maintenanceInProgress = true;
      try {
        res.json(await this.applyMaintenanceRepairs({ includeAnime: req.body.include_anime === true }));
      } catch (error) {
        console.error('[Maintenance] Réparation échouée :', error);
        res.status(500).json({ error: error.message });
      } finally {
        this.maintenanceInProgress = false;
      }
    });

    this.app.get('/api/maintenance/resolution-reprocessing/analysis', this.authMiddleware.bind(this), (req, res) => {
      try {
        res.json({ ...this.getResolutionReprocessingAnalysis(), status: this.resolutionReprocessingStatus });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/maintenance/resolution-reprocessing/status', this.authMiddleware.bind(this), (req, res) => {
      res.json(this.resolutionReprocessingStatus || { running: false, idle: true });
    });

    this.app.post('/api/maintenance/resolution-reprocessing/apply', this.authMiddleware.bind(this), (req, res) => {
      if (this.resolutionReprocessingInProgress) {
        return res.status(409).json({ error: 'Un retraitement des résolutions est déjà en cours' });
      }
      this.resolutionReprocessingInProgress = true;
      // La tâche est découplée de la collecte : les lots cèdent régulièrement
      // l'exécution afin que les nouvelles releases restent indexables.
      setImmediate(() => this.runResolutionReprocessing());
      res.json({ success: true, message: 'Retraitement des résolutions démarré' });
    });

    // ─── Reclassifier tous les médias selon config flux actuelle ───────────
    this.app.post('/api/reclassify', this.authMiddleware.bind(this), async (req, res) => {
      if (this.syncInProgress) return res.status(409).json({ error: 'Une synchronisation est en cours' });
      if (this.maintenanceInProgress) return res.status(409).json({ error: 'Une maintenance est déjà en cours' });
      this.maintenanceInProgress = true;
      let historyId = null;
      let backupPath = null;
      try {
        // Construire la map url → force depuis la config actuelle
        const feedMap = {};
        const mainUrl   = this.db.getConfig('rss_films_url');
        const mainForce = this.db.getConfig('rss_films_force') || 'auto';
        if (mainUrl) feedMap[mainUrl] = mainForce;
        try {
          const additional = JSON.parse(this.db.getConfig('rss_additional_urls') || '[]');
          additional.forEach(f => { if (f.url) feedMap[f.url] = f.force || 'auto'; });
        } catch (e) { /* silencieux */ }

        // Hiérarchie de spécificité : plus la valeur est haute, plus la catégorie est précise.
        // Une reclassification automatique (non forcée) ne peut PAS faire descendre la spécificité.
        const CATALOG_SPECIFICITY = {
          films: 1, series: 2,
          emissions: 3, documentaires: 3, concerts: 3, spectacles: 3,
          'animés': 4
        };

        const allMedia = this.db.getAllMediaWithPrimarySource();
        const updates  = [];
        const byCategory = {};
        let skipped = 0;

        for (const media of allMedia) {
          const sourceUrl    = media.primary_source_url;
          const releaseName  = media.primary_release_name || media.release_name || '';

          // Force configurée pour ce flux
          const configForce  = sourceUrl ? (feedMap[sourceUrl] || 'auto') : 'auto';
          // URL hint en mode auto
          const urlHint      = (configForce === 'auto') ? this.rssParser.guessForceFromUrl(sourceUrl) : null;
          const effectiveForce = (configForce !== 'auto') ? configForce : (urlHint || 'auto');

          // Détection depuis le titre (fallback)
          const info = this.rssParser.parseReleaseName(releaseName);
          const detectedCatalog = info.isAnime    ? 'animés'
                                : info.isDoc      ? 'documentaires'
                                : info.isEmission ? 'emissions'
                                : info.isSeries   ? 'series'
                                : 'films';
          const detected = this.rssParser.applyForce(detectedCatalog, info.isSeries ? 'series' : 'movie', effectiveForce);

          if (detected.catalogType !== media.catalog_type) {
            const currentSpec = CATALOG_SPECIFICITY[media.catalog_type] ?? 1;
            const newSpec     = CATALOG_SPECIFICITY[detected.catalogType] ?? 1;

            // En mode auto/hint URL, on ne rétrograde jamais une catégorie plus spécifique.
            // Seule une force explicite configurée par l'utilisateur peut forcer le changement.
            if (configForce !== 'auto' || newSpec > currentSpec) {
              updates.push({ imdb_id: media.imdb_id, catalog_type: detected.catalogType });
              byCategory[detected.catalogType] = (byCategory[detected.catalogType] || 0) + 1;
              console.log(`[Reclassify] ${media.catalog_type} (spec=${currentSpec}) → ${detected.catalogType} (spec=${newSpec}) : ${media.release_name || media.imdb_id}`);
            } else {
              skipped++;
              console.log(`[Reclassify] Conservé ${media.catalog_type} (spec=${currentSpec}) — ignoré ${detected.catalogType} (spec=${newSpec}) : ${media.release_name || media.imdb_id}`);
            }
          }
        }

        if (updates.length > 0) {
          historyId = this.db.startMaintenanceHistory('source_reclassification', {
            candidates: updates.length,
            by_category: byCategory
          });
          backupPath = await this.db.createMaintenanceBackup('before-source-reclassification');
        }
        const reclassified = updates.length > 0 ? this.db.batchUpdateCatalogTypes(updates) : 0;
        if (reclassified > 0) this.stremioAddon.clearCache();
        if (historyId) {
          this.db.finishMaintenanceHistory(historyId, {
            details: { total: allMedia.length, reclassified, skipped, by_category: byCategory },
            backupPath
          });
        }

        console.log(`[Reclassify] ${reclassified}/${allMedia.length} médias reclassifiés, ${skipped} conservés (spécificité supérieure)`);
        res.json({ success: true, total: allMedia.length, reclassified, skipped, byCategory, backup_path: backupPath });
      } catch (err) {
        if (historyId) {
          this.db.finishMaintenanceHistory(historyId, {
            status: 'error',
            details: {},
            backupPath,
            error: err.message
          });
        }
        console.error('[Reclassify]', err);
        res.status(500).json({ error: err.message });
      } finally {
        this.maintenanceInProgress = false;
      }
    });

    // ─── Maintenance : Reclassifier animés ──────────────────────────────────
    this.app.post('/api/admin/reclassify-animes', this.authMiddleware.bind(this), async (req, res) => {
      const apiKey = this.db.getConfig('tmdb_api_key');
      if (!apiKey) return res.status(400).json({ error: 'Clé TMDB non configurée' });

      // Candidats : films/séries ayant le genre 16 (Animation) en base
      const candidates = this.db.getAnimeCandidatesForReclassify();

      if (candidates.length === 0) {
        return res.json({ candidates: 0, reclassified: 0, skipped: 0, errors: [] });
      }

      const axiosConfig = this.tmdbMatcher.getAxiosConfig();
      let reclassified = 0, skipped = 0;
      const errors = [];

      for (const item of candidates) {
        try {
          await new Promise(r => setTimeout(r, 260)); // ~3.8 req/s, sous la limite TMDB
          const endpoint = item.type === 'movie'
            ? `https://api.themoviedb.org/3/movie/${item.tmdb_id}`
            : `https://api.themoviedb.org/3/tv/${item.tmdb_id}`;
          const r = await axios.get(endpoint, {
            ...axiosConfig,
            params: { api_key: apiKey }
          });
          const data = r.data;
          const lang = data.original_language;
          const countries = Array.isArray(data.origin_country)
            ? data.origin_country
            : (Array.isArray(data.production_countries)
                ? data.production_countries.map(c => c.iso_3166_1) : []);
          const isJapanese = lang === 'ja' || countries.includes('JP');

          if (isJapanese) {
            this.db.reclassifyMediaCatalogType(item.imdb_id, 'animés');
            console.log(`[Reclassify] ✓ animé : ${item.name}`);
            reclassified++;
          } else {
            skipped++;
          }
        } catch (e) {
          errors.push({ name: item.name, error: e.message });
        }
      }

      res.json({ candidates: candidates.length, reclassified, skipped, errors });
    });

    // ─── Maintenance : Reclassifier documentaires (genre 99 déjà en base) ──
    this.app.post('/api/admin/reclassify-docs', this.authMiddleware.bind(this), (req, res) => {
      try {
        const candidates = this.db.getDocumentaryCandidatesForReclassify();
        if (candidates.length === 0) {
          return res.json({ candidates: 0, reclassified: 0 });
        }
        const updates = candidates.map(c => ({ imdb_id: c.imdb_id, catalog_type: 'documentaires' }));
        const reclassified = this.db.batchUpdateCatalogTypes(updates);
        if (reclassified > 0) {
          this.stremioAddon.clearCache();
          candidates.forEach(c => console.log(`[Reclassify-Docs] ✓ documentaire : ${c.name} (était : ${c.catalog_type})`));
        }
        res.json({ candidates: candidates.length, reclassified });
      } catch (err) {
        console.error('[Reclassify-Docs]', err);
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Maintenance : Corriger les faux documentaires ──────────────────────
    this.app.post('/api/admin/fix-false-docs', this.authMiddleware.bind(this), (req, res) => {
      try {
        const candidates = this.db.getFalseDocumentaryCandidates();
        if (candidates.length === 0) {
          return res.json({ candidates: 0, fixed: 0 });
        }
        const updates = candidates.map(c => ({
          imdb_id:      c.imdb_id,
          catalog_type: c.type === 'series' ? 'series' : 'films'
        }));
        const fixed = this.db.batchUpdateCatalogTypes(updates);
        if (fixed > 0) {
          this.stremioAddon.clearCache();
          candidates.forEach(c => {
            const to = c.type === 'series' ? 'series' : 'films';
            console.log(`[Fix-False-Docs] documentaires → ${to} : ${c.name}`);
          });
        }
        res.json({ candidates: candidates.length, fixed });
      } catch (err) {
        console.error('[Fix-False-Docs]', err);
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Maintenance : Corriger les fausses émissions ───────────────────────
    this.app.post('/api/admin/fix-false-emissions', this.authMiddleware.bind(this), (req, res) => {
      try {
        const candidates = this.db.getFalseEmissionCandidates();
        if (candidates.length === 0) {
          return res.json({ candidates: 0, fixed: 0 });
        }
        const updates = candidates.map(c => ({
          imdb_id:      c.imdb_id,
          catalog_type: 'series'
        }));
        const fixed = this.db.batchUpdateCatalogTypes(updates);
        if (fixed > 0) {
          this.stremioAddon.clearCache();
          candidates.forEach(c => console.log(`[Fix-False-Emissions] emissions → series : ${c.name}`));
        }
        res.json({ candidates: candidates.length, fixed });
      } catch (err) {
        console.error('[Fix-False-Emissions]', err);
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Maintenance : Reclassifier concerts (genre 10402 stocké) ───────────
    this.app.post('/api/admin/reclassify-concerts', this.authMiddleware.bind(this), (req, res) => {
      try {
        const candidates = this.db.getConcertCandidatesFromGenre();
        if (candidates.length === 0) {
          return res.json({ candidates: 0, reclassified: 0 });
        }
        const updates = candidates.map(c => ({ imdb_id: c.imdb_id, catalog_type: 'concerts' }));
        const reclassified = this.db.batchUpdateCatalogTypes(updates);
        if (reclassified > 0) {
          this.stremioAddon.clearCache();
          candidates.forEach(c => console.log(`[Reclassify-Concerts] ${c.catalog_type} → concerts : ${c.name}`));
        }
        res.json({ candidates: candidates.length, reclassified });
      } catch (err) {
        console.error('[Reclassify-Concerts]', err);
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Maintenance : Corriger les faux concerts ────────────────────────────
    this.app.post('/api/admin/fix-false-concerts', this.authMiddleware.bind(this), (req, res) => {
      try {
        const candidates = this.db.getFalseConcertCandidates();
        if (candidates.length === 0) {
          return res.json({ candidates: 0, fixed: 0 });
        }
        const updates = candidates.map(c => ({
          imdb_id:      c.imdb_id,
          catalog_type: c.type === 'series' ? 'series' : 'films'
        }));
        const fixed = this.db.batchUpdateCatalogTypes(updates);
        if (fixed > 0) {
          this.stremioAddon.clearCache();
          candidates.forEach(c => console.log(`[Fix-False-Concerts] concerts → ${c.type === 'series' ? 'series' : 'films'} : ${c.name}`));
        }
        res.json({ candidates: candidates.length, fixed });
      } catch (err) {
        console.error('[Fix-False-Concerts]', err);
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Maintenance : Reclassifier spectacles (mots-clés titre) ─────────────
    this.app.post('/api/admin/reclassify-spectacles', this.authMiddleware.bind(this), (req, res) => {
      try {
        const candidates = this.db.getSpectacleCandidatesFromTitle();
        if (candidates.length === 0) {
          return res.json({ candidates: 0, reclassified: 0 });
        }
        const updates = candidates.map(c => ({ imdb_id: c.imdb_id, catalog_type: 'spectacles' }));
        const reclassified = this.db.batchUpdateCatalogTypes(updates);
        if (reclassified > 0) {
          this.stremioAddon.clearCache();
          candidates.forEach(c => console.log(`[Reclassify-Spectacles] ${c.catalog_type} → spectacles : ${c.name}`));
        }
        res.json({ candidates: candidates.length, reclassified });
      } catch (err) {
        console.error('[Reclassify-Spectacles]', err);
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Apprise Test ───────────────────────────────────────────────────────
    this.app.post('/api/apprise/test', this.authMiddleware.bind(this), async (req, res) => {
      const serverUrl = req.body.server_url || this.db.getConfig('apprise_server_url');
      const urls      = req.body.urls       || this.db.getConfig('apprise_urls');
      if (!serverUrl || !serverUrl.trim()) {
        return res.status(400).json({ ok: false, error: 'URL du serveur Apprise manquante' });
      }
      const ns = getStrings(this.db.getConfig('notification_language') || 'fr');
      const ok = await sendAppriseNotification(serverUrl, urls, {
        title: `✅ ${ns.syncTest}`,
        body:  ns.appriseTestBody,
        type:  'success'
      });
      res.json({ ok });
    });

    this.app.post('/api/postersplus/test', this.authMiddleware.bind(this), async (req, res) => {
      const template = String(
        req.body.template || this.db.getConfig('postersplus_url_template') || ''
      ).trim();
      if (!['{tmdb_id}', '{imdb_id}', '{type}'].every(token => template.includes(token))) {
        return res.status(400).json({
          error: 'Le template doit contenir {tmdb_id}, {imdb_id} et {type}'
        });
      }
      const candidates = [
        ...this.db.getMedia('films', 0, 20),
        ...this.db.getMedia('series', 0, 20)
      ];
      const media = candidates.find(item => item.tmdb_id && /^tt\d+$/i.test(item.imdb_id || ''));
      if (!media) return res.status(400).json({ error: 'Aucun média IMDb/TMDB compatible en base' });
      const posterUrl = this.stremioAddon.buildPostersPlusUrl(media, template);
      if (!posterUrl) return res.status(400).json({ error: 'Template PostersPlus invalide' });
      try {
        const response = await axios.get(posterUrl, {
          timeout: 60000,
          responseType: 'arraybuffer',
          maxContentLength: 15 * 1024 * 1024,
          validateStatus: status => status >= 200 && status < 500
        });
        const contentType = String(response.headers['content-type'] || '');
        if (response.status !== 200 || !contentType.startsWith('image/')) {
          return res.status(400).json({
            error: `PostersPlus a répondu HTTP ${response.status}${contentType ? ` (${contentType})` : ''}`
          });
        }
        res.json({
          ok: true,
          media: { imdb_id: media.imdb_id, tmdb_id: media.tmdb_id, name: media.name, type: media.type },
          poster_url: posterUrl
        });
      } catch (error) {
        res.status(400).json({ error: `PostersPlus indisponible : ${error.message}` });
      }
    });

    // ─── Proxy Test ─────────────────────────────────────────────────────────
    this.app.post('/api/proxy/test', this.authMiddleware.bind(this), async (req, res) => {
      const { protocol = 'http', host, port, username, password } = req.body;
      if (!host || !port) return res.status(400).json({ ok: false, error: 'Hôte et port requis' });

      try {
        let proxyUrl = `${protocol}://`;
        if (username && password) proxyUrl += `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
        proxyUrl += `${host}:${port}`;

        const agent = protocol.startsWith('socks')
          ? new SocksProxyAgent(proxyUrl)
          : new HttpsProxyAgent(proxyUrl);

        const resp = await axios.get('https://api.ipify.org?format=json', {
          httpsAgent: agent, httpAgent: agent, timeout: 8000
        });
        res.json({ ok: true, ip: resp.data.ip });
      } catch (err) {
        res.json({ ok: false, error: err.message });
      }
    });

    // ─── Stremio Addon ──────────────────────────────────────────────────────
    this.app.get('/manifest.json', (req, res) => {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.json(this.stremioAddon.getManifest());
    });

    this.app.get('/image-cache/:key', async (req, res) => {
      await this.stremioAddon.imageCache.serve(req.params.key, res);
    });

    this.app.get('/catalog/:type/:id.json', async (req, res) => {
      try {
        const startedAt = process.hrtime.bigint();
        const cached = this.stremioAddon.isCatalogCached(req.params.id, req.query);
        const protocol = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
        const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
        const configuredBaseUrl = String(process.env.ADDON_BASE_URL || '').trim().replace(/\/+$/, '');
        const requestBaseUrl = configuredBaseUrl || `${protocol}://${host}`;
        const result = await this.stremioAddon.handleCatalog({
          type: req.params.type,
          id: req.params.id,
          extra: req.query,
          baseUrl: requestBaseUrl
        });
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        const cacheSeconds = Math.min(
          Math.max(Number(process.env.CATALOG_HTTP_CACHE_SECONDS) || 30, 0),
          300
        );
        res.setHeader(
          'Cache-Control',
          cacheSeconds > 0
            ? `public, max-age=${cacheSeconds}, must-revalidate`
            : 'no-cache'
        );
        res.setHeader('X-Catalog-Cache', cached ? 'HIT' : 'MISS');
        res.setHeader('Server-Timing', `catalog;dur=${durationMs.toFixed(1)}`);
        res.json(result);
      } catch (error) {
        console.error('Catalog error:', error);
        res.status(500).json({ metas: [] });
      }
    });
  }

  normalizeSourceInterval(value) {
    if (value === null || value === undefined || value === '') return null;
    return Math.min(Math.max(Number(value) || 5, 5), 43200);
  }

  validateCatalogComposition(catalog) {
    const filters = { ...(catalog.filters || {}) };
    const requestedIds = Array.isArray(filters.catalog_ids)
      ? [...new Set(filters.catalog_ids.map(String).filter(Boolean))]
      : [];
    const allCatalogs = new Map(this.db.listCustomCatalogs().map(item => [item.id, item]));
    if (catalog.id) allCatalogs.set(catalog.id, { ...catalog, filters: { ...filters, catalog_ids: requestedIds } });
    for (const id of requestedIds) {
      const included = allCatalogs.get(id);
      if (!included) throw new Error(`Catalogue à fusionner introuvable : ${id}`);
      if (id === catalog.id) throw new Error('Un catalogue ne peut pas se contenir lui-même');
      if (included.type !== catalog.type) {
        throw new Error(`Types incompatibles : ${included.name || id}`);
      }
    }
    if (catalog.id) {
      const visit = (id, path = new Set()) => {
        if (path.has(id)) throw new Error('La composition créerait une boucle entre catalogues');
        const current = allCatalogs.get(id);
        if (!current) return;
        const nextPath = new Set(path).add(id);
        for (const childId of current.filters?.catalog_ids || []) visit(String(childId), nextPath);
      };
      visit(catalog.id);
    }
    filters.catalog_ids = requestedIds;
    return filters;
  }

  getSourceRuntime(sourceKey, ownInterval = null) {
    const own = this.normalizeSourceInterval(ownInterval);
    const intervalMinutes = own || Number(this.db.getConfig('refresh_interval')) || 180;
    const state = this.db.getSourceSyncState(sourceKey);
    const rateLimitUntil = this.db.getSourceRateLimitUntil(sourceKey);
    return {
      source_key: sourceKey,
      interval_minutes: intervalMinutes,
      uses_global_interval: !own,
      next_sync_at: Math.max(
        state?.last_attempt_at
          ? state.last_attempt_at + intervalMinutes * 60 * 1000
          : Date.now(),
        rateLimitUntil
      ),
      last_attempt_at: state?.last_attempt_at || null,
      last_success_at: state?.last_success_at || null,
      last_duration_ms: state?.last_duration_ms || null,
      last_items_fetched: state?.last_items_fetched || 0,
      last_error_at: state?.last_error_at || null,
      last_error_message: state?.last_error_message || null,
      last_http_status: state?.last_http_status || null,
      consecutive_errors: state?.consecutive_errors || 0,
      rate_limit_until: rateLimitUntil || null,
      quota_limit: state?.quota_limit ?? null,
      quota_used: state?.quota_used ?? null,
      quota_status: state?.quota_status || null,
      backfill_in_progress: state?.cursor?.committed?.backfill_complete === false
        || Boolean(state?.cursor?.committed?.cursor)
    };
  }

  bumpManifestRevision(event = 'updated', catalog = null, details = {}) {
    const next = (Number(this.db.getConfig('manifest_revision')) || 0) + 1;
    this.db.setConfig('manifest_revision', String(next));
    this.db.recordManifestHistory({ revision: next, event, catalog, details });
    return next;
  }

  getSourceNameMap() {
    const nameMap = {};
    const mainUrl = this.db.getConfig('rss_films_url');
    const mainName = this.db.getConfig('rss_films_name');
    if (mainUrl && mainName) nameMap[mainUrl] = mainName;
    try {
      const additional = JSON.parse(this.db.getConfig('rss_additional_urls') || '[]');
      additional.forEach(source => {
        if (source.url && source.name) nameMap[source.url] = source.name;
      });
    } catch {}
    this.rssParser.pastebinParser.getSources().forEach(source => {
      if (source.url && source.name) nameMap[source.url] = source.name;
    });
    this.rssParser.stremioManifestParser.getSources().forEach(source => {
      (source.catalogs || []).forEach(catalog => {
        nameMap[this.rssParser.stremioManifestParser.sourceKey(source.id, catalog)] =
          `${source.name} — ${catalog.name}`;
      });
    });
    this.rssParser.newznabParser.getSources().forEach(source => {
      if (source.categories?.movie) {
        nameMap[this.rssParser.newznabParser.sourceKey(source.id, 'movie')] = `${source.name} — Films`;
      }
      if (source.categories?.series) {
        nameMap[this.rssParser.newznabParser.sourceKey(source.id, 'series')] = `${source.name} — Séries`;
      }
    });
    this.rssParser.webdavParser.getSources().forEach(source => {
      nameMap[this.rssParser.webdavParser.sourceKey(source.id)] = source.name || 'WebDAV';
    });
    this.rssParser.waCustomParser.getSources().forEach(source => {
      nameMap[this.rssParser.waCustomParser.sourceKey(source.id)] = source.name || 'WaCustom';
    });
    this.rssParser.mediaServerParser.getSources().forEach(source => {
      nameMap[this.rssParser.mediaServerParser.sourceKey(source.id)] =
        source.name || (source.kind === 'plex' ? 'Plex' : 'Jellyfin');
    });
    this.rssParser.streamFusionParser.getSources().forEach(source => {
      nameMap[this.rssParser.streamFusionParser.sourceKey(source.id)] = source.name || 'StreamFusion';
    });
    this.rssParser.cometNetParser.getSources().forEach(source => {
      nameMap[this.rssParser.cometNetParser.sourceKey(source.id)] = source.name || 'CometNet';
    });
    return nameMap;
  }

  getSourceAlertSources() {
    const sources = [];
    const push = (sourceKey, name, kind, paused = false) => {
      if (sourceKey && !sources.some(source => source.source_key === sourceKey)) {
        sources.push({ source_key: sourceKey, name: name || sourceKey, kind, paused: Boolean(paused) });
      }
    };
    this.getRssSources().forEach(source => push(`rss:${source.id}`, source.name, 'rss', source.paused));
    this.rssParser.pastebinParser.getSources().forEach(source => {
      push(`pastebin:${source.id}`, source.name, 'pastebin', source.paused);
    });
    this.rssParser.stremioManifestParser.getSources().forEach(source => {
      push(`stremio:${source.id}`, source.name, 'stremio', source.paused);
    });
    this.rssParser.newznabParser.getSources().forEach(source => {
      push(this.rssParser.newznabParser.scheduleKey(source), source.name, source.kind || 'newznab', source.paused);
    });
    this.rssParser.webdavParser.getSources().forEach(source => {
      push(this.rssParser.webdavParser.sourceKey(source.id), source.name, 'webdav', source.paused);
    });
    this.rssParser.waCustomParser.getSources().forEach(source => {
      push(this.rssParser.waCustomParser.sourceKey(source.id), source.name, 'wacustom', source.paused);
    });
    this.rssParser.mediaServerParser.getSources().forEach(source => {
      push(this.rssParser.mediaServerParser.sourceKey(source.id), source.name, source.kind, source.paused);
    });
    this.rssParser.streamFusionParser.getSources().forEach(source => {
      push(this.rssParser.streamFusionParser.sourceKey(source.id), source.name, 'streamfusion', source.paused);
    });
    this.rssParser.cometNetParser.getSources().forEach(source => {
      push(this.rssParser.cometNetParser.sourceKey(source.id), source.name, 'cometnet', source.paused);
    });
    this.rssParser.mdblistGuideParser.getSources().forEach(source => {
      push(this.rssParser.mdblistGuideParser.sourceKey(source.id), source.name, source.kind || 'mdblist', source.paused);
    });
    return sources.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  getSourceAlertConfig() {
    let thresholds = {};
    try {
      thresholds = JSON.parse(this.db.getConfig('source_alert_thresholds') || '{}');
    } catch {}
    const defaultThreshold = Math.min(Math.max(
      Number(this.db.getConfig('source_alert_default_threshold')) || 3,
      1
    ), 100);
    return {
      enabled: this.db.getConfig('source_alerts_enabled') !== 'false',
      defaultThreshold,
      thresholds
    };
  }

  getSourceProbeConfig() {
    return {
      enabled: this.db.getConfig('source_probe_enabled') !== 'false',
      intervalMinutes: Math.min(Math.max(
        Number(this.db.getConfig('source_probe_interval_minutes')) || 5,
        1
      ), 1440)
    };
  }

  getSourceProbeTargets() {
    const targets = [];
    const push = (sourceKey, name, kind, url, paused = false) => {
      if (sourceKey && url && !paused) targets.push({ sourceKey, name: name || sourceKey, kind, url });
    };
    this.getRssSources().forEach(source => push(`rss:${source.id}`, source.name, 'rss', source.url, source.paused));
    this.rssParser.pastebinParser.getSources().forEach(source => push(`pastebin:${source.id}`, source.name, 'pastebin', source.url, source.paused));
    this.rssParser.stremioManifestParser.getSources().forEach(source => push(`stremio:${source.id}`, source.name, 'stremio', source.url, source.paused));
    this.rssParser.newznabParser.getSources().forEach(source => push(this.rssParser.newznabParser.scheduleKey(source), source.name, source.kind || 'newznab', source.url, source.paused));
    this.rssParser.webdavParser.getSources().forEach(source => push(this.rssParser.webdavParser.sourceKey(source.id), source.name, 'webdav', source.url, source.paused));
    this.rssParser.waCustomParser.getSources().forEach(source => push(this.rssParser.waCustomParser.sourceKey(source.id), source.name, 'wacustom', source.url, source.paused));
    this.rssParser.mediaServerParser.getSources().forEach(source => push(this.rssParser.mediaServerParser.sourceKey(source.id), source.name, source.kind, source.url, source.paused));
    this.rssParser.streamFusionParser.getSources().forEach(source => push(this.rssParser.streamFusionParser.sourceKey(source.id), source.name, 'streamfusion', source.url, source.paused));
    this.rssParser.mdblistGuideParser.getSources().forEach(source => push(this.rssParser.mdblistGuideParser.sourceKey(source.id), source.name, source.kind || 'mdblist', source.url, source.paused));
    return targets;
  }

  async runSourceProbes() {
    if (this.sourceProbeProcessing) return this.sourceProbeProcessing;
    this.sourceProbeProcessing = this.runSourceProbesUnlocked();
    try {
      return await this.sourceProbeProcessing;
    } finally {
      this.sourceProbeProcessing = null;
    }
  }

  async runSourceProbesUnlocked() {
    const config = this.getSourceProbeConfig();
    if (!config.enabled) return;
    const axiosConfig = {
      ...this.rssParser.getAxiosConfig(),
      timeout: 10000,
      maxRedirects: 3,
      validateStatus: status => status < 500
    };
    for (const target of this.getSourceProbeTargets()) {
      const stateKey = `probe:${target.sourceKey}`;
      if (!this.db.isSourceDue(stateKey, config.intervalMinutes)) continue;
      const startedAt = this.db.beginSourceSync(stateKey, 'probe');
      try {
        const response = await axios.head(target.url, axiosConfig);
        this.db.finishSourceSync(stateKey, {
          sourceKind: 'probe', startedAt, itemsFetched: 0,
          httpStatus: response.status
        });
      } catch (error) {
        this.db.failSourceSync(stateKey, {
          sourceKind: 'probe', startedAt,
          errorMessage: `Sonde ${target.kind} : ${error.message}`,
          httpStatus: error.response?.status || null
        });
      }
    }
    // CometNet maintient une connexion persistante plutôt qu'une URL HTTP à sonder.
    for (const source of this.rssParser.cometNetParser.getSources()) {
      if (source.paused) continue;
      const stateKey = `probe:${this.rssParser.cometNetParser.sourceKey(source.id)}`;
      if (!this.db.isSourceDue(stateKey, config.intervalMinutes)) continue;
      const startedAt = this.db.beginSourceSync(stateKey, 'probe');
      const state = this.rssParser.cometNetParser.getState(source.id);
      if (state.status === 'connected') {
        this.db.finishSourceSync(stateKey, { sourceKind: 'probe', startedAt, itemsFetched: 0 });
      } else {
        this.db.failSourceSync(stateKey, {
          sourceKind: 'probe', startedAt,
          errorMessage: `Sonde CometNet : ${state.last_error || `pair ${state.status || 'déconnecté'}`}`
        });
      }
    }
    await this.processSourceHealthAlerts();
  }

  async sendSourceHealthAlert(alert) {
    const channels = ['webui'];
    const discordEnabled = this.db.getConfig('discord_notifications_enabled') === 'true';
    const webhookUrl = this.db.getConfig('discord_webhook_url');
    if (discordEnabled && webhookUrl && await sendDiscordSourceAlert(webhookUrl, alert)) {
      channels.push('discord');
    }
    const appriseEnabled = this.db.getConfig('apprise_enabled') === 'true';
    const appriseServerUrl = this.db.getConfig('apprise_server_url');
    if (appriseEnabled && appriseServerUrl) {
      const isRecovery = alert.eventType === 'recovery';
      const sent = await sendAppriseNotification(
        appriseServerUrl,
        this.db.getConfig('apprise_urls'),
        {
          title: isRecovery
            ? `✅ Source rétablie — ${alert.sourceName}`
            : `⚠️ Source indisponible — ${alert.sourceName}`,
          body: `${alert.message || ''}\n\nSource : \`${alert.sourceKey}\`${
            isRecovery ? '' : `\nÉchecs consécutifs : ${alert.consecutiveErrors} / seuil ${alert.threshold}`
          }`,
          type: isRecovery ? 'success' : 'failure'
        }
      );
      if (sent) channels.push('apprise');
    }
    this.db.recordSourceAlert({ ...alert, channels });
  }

  async processSourceHealthAlerts() {
    if (this.sourceAlertProcessing) return this.sourceAlertProcessing;
    this.sourceAlertProcessing = this.processSourceHealthAlertsUnlocked();
    try {
      return await this.sourceAlertProcessing;
    } finally {
      this.sourceAlertProcessing = null;
    }
  }

  async processSourceHealthAlertsUnlocked() {
    const config = this.getSourceAlertConfig();
    const pendingEvents = this.db.getPendingSourceHealthEvents(500);
    if (!config.enabled) {
      this.db.markSourceHealthEventsProcessed(pendingEvents.map(event => event.id));
      return;
    }
    const sourceMap = new Map(this.getSourceAlertSources().map(source => [source.source_key, source]));
    const processFailure = async ({
      source_key: sourceKey,
      consecutive_errors: consecutiveErrors,
      error_message: errorMessage
    }) => {
      const configuredKey = sourceKey.startsWith('probe:') ? sourceKey.slice('probe:'.length) : sourceKey;
      const source = sourceMap.get(configuredKey);
      // Certains connecteurs conservent aussi des états techniques internes
      // (par exemple une catégorie Newznab). L'alerte reste rattachée à la
      // source configurable, afin d'éviter les doublons et des seuils invisibles.
      if (!source) return;
      const threshold = Math.min(Math.max(Number(config.thresholds[configuredKey]) || config.defaultThreshold, 1), 100);
      const alertState = this.db.getSourceAlertState(sourceKey);
      if (Number(consecutiveErrors) < threshold || alertState.outage_notified) return;
      const alert = {
        sourceKey,
        sourceName: source?.name || sourceKey,
        eventType: 'failure',
        threshold,
        consecutiveErrors: Number(consecutiveErrors) || threshold,
        message: errorMessage || this.db.getSourceSyncState(sourceKey)?.last_error_message || 'Source indisponible'
      };
      await this.sendSourceHealthAlert(alert);
      this.db.setSourceAlertState(sourceKey, {
        outageNotified: true,
        lastAlertAt: Date.now()
      });
    };
    const processRecovery = async sourceKey => {
      const configuredKey = sourceKey.startsWith('probe:') ? sourceKey.slice('probe:'.length) : sourceKey;
      if (!sourceMap.has(configuredKey)) return;
      const alertState = this.db.getSourceAlertState(sourceKey);
      if (!alertState.outage_notified) return;
      const source = sourceMap.get(configuredKey);
      const threshold = Math.min(Math.max(Number(config.thresholds[configuredKey]) || config.defaultThreshold, 1), 100);
      await this.sendSourceHealthAlert({
        sourceKey,
        sourceName: source?.name || sourceKey,
        eventType: 'recovery',
        threshold,
        consecutiveErrors: 0,
        message: 'La source répond de nouveau correctement.'
      });
      this.db.setSourceAlertState(sourceKey, {
        outageNotified: false,
        lastRecoveryAt: Date.now()
      });
    };

    for (const event of pendingEvents) {
      if (event.event_type === 'failure') await processFailure(event);
      if (event.event_type === 'recovery') await processRecovery(event.source_key);
    }
    // Prend également en compte un seuil abaissé après le dernier échec.
    for (const state of this.db.listSourceSyncStates()) {
      if (Number(state.consecutive_errors) > 0) await processFailure(state);
      else await processRecovery(state.source_key);
    }
    this.db.markSourceHealthEventsProcessed(pendingEvents.map(event => event.id));
  }

  getAdditionalRssSources() {
    try {
      const values = JSON.parse(this.db.getConfig('rss_additional_urls') || '[]');
      const usedIds = new Set();
      return (Array.isArray(values) ? values : []).map((value, index) => {
        const source = typeof value === 'string' ? { url: value } : { ...value };
        source.name ||= source.url;
        source.force ||= 'auto';
        // Les anciennes configurations ne stockaient pas d'identifiant. Plusieurs
        // variantes (Films/Séries/Docs) peuvent partager la même URL : l'URL seule
        // produisait alors le même ID et les actions visaient toujours la première.
        if (!source.id || usedIds.has(source.id)) {
          let salt = 0;
          do {
            source.id = `rss-${crypto.createHash('sha256')
              .update(`${source.url || ''}\n${source.name || ''}\n${source.force}\n${index}\n${salt++}`)
              .digest('hex').slice(0, 12)}`;
          } while (usedIds.has(source.id));
        }
        usedIds.add(source.id);
        source.paused = Boolean(source.paused);
        source.syncIntervalMinutes = this.normalizeSourceInterval(source.syncIntervalMinutes);
        return source;
      });
    } catch {
      return [];
    }
  }

  getRssSources() {
    const sources = [];
    const mainUrl = this.db.getConfig('rss_films_url');
    if (mainUrl) {
      sources.push({
        id: 'rss-main',
        kind: 'rss',
        name: this.db.getConfig('rss_films_name') || mainUrl,
        url: mainUrl,
        force: this.db.getConfig('rss_films_force') || 'auto',
        paused: this.db.getConfig('rss_films_paused') === 'true',
        syncIntervalMinutes: this.normalizeSourceInterval(this.db.getConfig('rss_films_sync_interval'))
      });
    }
    return [...sources, ...this.getAdditionalRssSources().map(source => ({ ...source, kind: 'rss' }))];
  }

  async runSync({ forceAll = false } = {}) {
    let syncId = null;
    const startTime = Date.now();
    const availabilityEnabled = forceAll
      && this.db.getConfig('availability_enabled') === 'true';
    const availabilityScanToken = availabilityEnabled
      ? this.db.beginAvailabilityScan()
      : null;
    const notifLang = this.db.getConfig('notification_language') || 'fr';
    const catalogsBefore = {
      films:          this.db.getMediaCount('films'),
      documentaires:  this.db.getMediaCount('documentaires'),
      series:         this.db.getMediaCount('series'),
      emissions:      this.db.getMediaCount('emissions'),
      animes:         this.db.getMediaCount('animés'),
      concerts:       this.db.getMediaCount('concerts'),
      spectacles:     this.db.getMediaCount('spectacles')
    };

    try {
      this.syncStatus.stage = 'Collecte des sources...';
      const rssData = await this.rssParser.parseAll({
        forceAll,
        defaultIntervalMinutes: Number(this.db.getConfig('refresh_interval')) || 180
      });
      await this.processSourceHealthAlerts();
      console.log('Sources récupérées - Éléments: ' + rssData.films.length);

      const allItems = [...rssData.films].map(item => ({
        ...item,
        availability_scan_token: availabilityScanToken
      }));
      if (allItems.length === 0) {
        if (rssData.guides?.updated) {
          this.stremioAddon.clearCache();
          this.db.setConfig('last_catalog_refresh', String(Date.now()));
        }
        this.db.commitPendingSourceCursors(rssData.pendingCursorKeys);
        this.db.markCometNetItemsProcessed(rssData.pendingCometNetKeys);
        this.syncStatus.stage = rssData.guides?.updated
          ? `${rssData.guides.updated} guide(s) actualisé(s), aucun nouveau contenu à traiter`
          : (forceAll ? 'Aucun élément trouvé' : 'Aucune source arrivée à échéance');
        this.syncStatus.running = false;
        this.syncStatus.completed = true;
        this.syncStatus.noItems = true;
        console.log('Aucun élément trouvé dans les sources');
        return;
      }
      syncId = this.db.createSyncHistory(allItems.length);

      this.syncStatus.total = allItems.length;
      this.syncStatus.stage = 'Traitement et actualisation des catalogues...';
      console.log('Starting TMDB matching for ' + allItems.length + ' items...');
      const result = await this.tmdbMatcher.matchBatch(allItems, (progress) => {
        this.syncStatus.progress    = progress.current;
        this.syncStatus.matched     = progress.matched;
        this.syncStatus.failed      = progress.failed;
        this.syncStatus.alreadyInDb = progress.alreadyInDb || 0;
      });

      const availability = availabilityScanToken
        ? this.db.finalizeAvailabilityScan(availabilityScanToken, {
            missingScans: Number(this.db.getConfig('availability_missing_scans')) || 3,
            expirationDays: Number(this.db.getConfig('availability_expiration_days')) || 0,
            sourceUrls: allItems.map(item => item.source_url)
          })
        : { releasesHidden: 0, mediaHidden: 0, mediaRestored: 0 };

      const catalogsAfter = {
        films:         this.db.getMediaCount('films'),
        documentaires: this.db.getMediaCount('documentaires'),
        series:        this.db.getMediaCount('series'),
        emissions:     this.db.getMediaCount('emissions'),
        animes:        this.db.getMediaCount('animés'),
        concerts:      this.db.getMediaCount('concerts'),
        spectacles:    this.db.getMediaCount('spectacles')
      };

      const filmsAdded         = Math.max(0, catalogsAfter.films         - catalogsBefore.films);
      const documentairesAdded = Math.max(0, catalogsAfter.documentaires - catalogsBefore.documentaires);
      const seriesAdded        = Math.max(0, catalogsAfter.series        - catalogsBefore.series);
      const emissionsAdded     = Math.max(0, catalogsAfter.emissions     - catalogsBefore.emissions);
      const animesAdded        = Math.max(0, catalogsAfter.animes        - catalogsBefore.animes);
      const concertsAdded      = Math.max(0, catalogsAfter.concerts      - catalogsBefore.concerts);
      const spectaclesAdded    = Math.max(0, catalogsAfter.spectacles    - catalogsBefore.spectacles);

      this.db.updateSyncHistory(syncId, {
        matched_items:        result.matched,
        failed_items:         result.failed,
        already_in_db:        result.alreadyInDb || 0,
        films_added:          filmsAdded,
        documentaires_added:  documentairesAdded,
        series_added:         seriesAdded,
        concerts_added:       concertsAdded,
        spectacles_added:     spectaclesAdded,
        status:               'completed',
        finished_at:          Date.now()
      });

      const duration = Math.round((Date.now() - startTime) / 1000);

      this.syncStatus.stage              = 'Terminée';
      this.syncStatus.running            = false;
      this.syncStatus.completed          = true;
      this.syncStatus.filmsAdded         = filmsAdded;
      this.syncStatus.documentairesAdded = documentairesAdded;
      this.syncStatus.seriesAdded        = seriesAdded;
      this.syncStatus.emissionsAdded     = emissionsAdded;
      this.syncStatus.animesAdded        = animesAdded;
      this.syncStatus.concertsAdded      = concertsAdded;
      this.syncStatus.spectaclesAdded    = spectaclesAdded;
      this.syncStatus.availability       = availability;

      console.log('Sync completed:', result);
      if (availability.mediaHidden || availability.mediaRestored) {
        console.log('[Disponibilité] Mise à jour :', availability);
      }
      this.stremioAddon.clearCache();
      this.db.setConfig('last_catalog_refresh', String(Date.now()));
      this.db.commitPendingSourceCursors(rssData.pendingCursorKeys);
      this.db.markCometNetItemsProcessed(rssData.pendingCometNetKeys);

      const discordEnabled = this.db.getConfig('discord_notifications_enabled') === 'true';
      const webhookUrl     = this.db.getConfig('discord_webhook_url');
      if (discordEnabled && webhookUrl) {
        const notificationData = {
          status: 'completed',
          filmsAdded, documentairesAdded, seriesAdded, emissionsAdded, animesAdded, concertsAdded, spectaclesAdded,
          totalFilms:      catalogsAfter.films,
          totalDocs:       catalogsAfter.documentaires,
          totalSeries:     catalogsAfter.series,
          totalEmissions:  catalogsAfter.emissions,
          totalAnimes:     catalogsAfter.animes,
          totalConcerts:   catalogsAfter.concerts,
          totalSpectacles: catalogsAfter.spectacles,
          matched:         result.matched,
          failed:          result.failed,
          duration,
          installUrl:  this.baseUrl ? `${this.baseUrl}/manifest.json` : null,
          rpdbEnabled: this.db.getConfig('discord_rpdb_posters_enabled') === 'true',
          rpdbKey:     this.db.getConfig('rpdb_api_key'),
          postersPlusEnabled: this.db.getConfig('postersplus_enabled') === 'true',
          postersPlusTemplate: this.db.getConfig('postersplus_url_template')
        };
        const enhancedEnabled = this.db.getConfig('discord_enhanced_notifications_enabled') === 'true';
        if (enhancedEnabled && (filmsAdded > 0 || documentairesAdded > 0 || seriesAdded > 0 || emissionsAdded > 0 || animesAdded > 0 || concertsAdded > 0 || spectaclesAdded > 0)) {
          notificationData.recentAdditions = {
            films:         filmsAdded         > 0 ? this.db.getRecentCatalogAdditions('films', 5)         : [],
            documentaires: documentairesAdded > 0 ? this.db.getRecentCatalogAdditions('documentaires', 5) : [],
            series:        seriesAdded        > 0 ? this.db.getRecentCatalogAdditions('series', 5)        : [],
            emissions:     emissionsAdded     > 0 ? this.db.getRecentCatalogAdditions('emissions', 5)     : [],
            animes:        animesAdded        > 0 ? this.db.getRecentCatalogAdditions('animés', 5)        : [],
            concerts:      concertsAdded      > 0 ? this.db.getRecentCatalogAdditions('concerts', 5)      : [],
            spectacles:    spectaclesAdded    > 0 ? this.db.getRecentCatalogAdditions('spectacles', 5)    : []
          };
        }
        await sendDiscordNotification(webhookUrl, notificationData, notifLang);
      }

      // ─── Apprise ──────────────────────────────────────────────────────────
      const appriseEnabled   = this.db.getConfig('apprise_enabled') === 'true';
      const appriseServerUrl = this.db.getConfig('apprise_server_url');
      if (appriseEnabled && appriseServerUrl) {
        const ns = getStrings(notifLang);
        const added = [
          filmsAdded         > 0 ? `${ns.films}         : **+${filmsAdded}**`         : null,
          documentairesAdded > 0 ? `${ns.documentaires} : **+${documentairesAdded}**` : null,
          seriesAdded        > 0 ? `${ns.series}        : **+${seriesAdded}**`        : null,
          emissionsAdded     > 0 ? `${ns.emissions}     : **+${emissionsAdded}**`     : null,
          animesAdded        > 0 ? `${ns.animes}        : **+${animesAdded}**`        : null,
          concertsAdded      > 0 ? `${ns.concerts}      : **+${concertsAdded}**`      : null,
          spectaclesAdded    > 0 ? `${ns.spectacles}    : **+${spectaclesAdded}**`    : null
        ].filter(Boolean);
        const body = [
          added.length ? `**${ns.appriseAdded} :** ${added.join(' · ')}` : `**${ns.noneAdded}**`,
          `${ns.duration} : ${duration}${ns.seconds} · ${ns.matched} : ${result.matched} · ${ns.failed} : ${result.failed}`
        ].join('\n');
        await sendAppriseNotification(
          appriseServerUrl,
          this.db.getConfig('apprise_urls'),
          { title: `✅ Stremio RSS Catalog — ${ns.syncSuccess}`, body, type: 'success' }
        );
      }
    } catch (error) {
      console.error('Sync error:', error);
      console.error('Stack trace:', error.stack);
      try {
        await this.processSourceHealthAlerts();
      } catch (alertError) {
        console.error('Source alert processing error:', alertError);
      }
      this.syncStatus.stage   = 'Erreur';
      this.syncStatus.error   = error.message;
      this.syncStatus.running = false;

      if (syncId) {
        this.db.updateSyncHistory(syncId, { status: 'error', error_message: error.message, finished_at: Date.now() });
      }

      const discordEnabled = this.db.getConfig('discord_notifications_enabled') === 'true';
      const webhookUrl     = this.db.getConfig('discord_webhook_url');
      if (discordEnabled && webhookUrl) {
        const duration = Math.round((Date.now() - startTime) / 1000);
        await sendDiscordNotification(webhookUrl, {
          status: 'error', errorMessage: error.message, duration,
          installUrl: this.baseUrl ? `${this.baseUrl}/manifest.json` : null
        }, notifLang);
      }

      const appriseEnabled   = this.db.getConfig('apprise_enabled') === 'true';
      const appriseServerUrl = this.db.getConfig('apprise_server_url');
      if (appriseEnabled && appriseServerUrl) {
        const ns = getStrings(notifLang);
        const duration = Math.round((Date.now() - startTime) / 1000);
        await sendAppriseNotification(
          appriseServerUrl,
          this.db.getConfig('apprise_urls'),
          {
            title: `❌ Stremio RSS Catalog — ${ns.syncError}`,
            body:  `**${ns.fieldError} :** ${error.message}\n${ns.duration} : ${duration}${ns.seconds}`,
            type:  'failure'
          }
        );
      }
    }
  }

  async runAutoSync() {
    if (this.syncInProgress && this.syncStartedAt) {
      const elapsed = Date.now() - this.syncStartedAt;
      if (elapsed > 2 * 60 * 60 * 1000) {
        console.warn('[Auto-Refresh] syncInProgress bloqué depuis ' + Math.round(elapsed / 60000) + ' min — reset forcé');
        this.syncInProgress = false;
        this.syncStartedAt  = null;
        if (this.syncStatus) this.syncStatus.running = false;
      }
    }
    if (!this.syncInProgress) {
      console.log('[Auto-Refresh] Lancement de la synchronisation automatique...');
      this.syncInProgress = true;
      this.syncStartedAt  = Date.now();
      this.syncStatus = { running: true, stage: 'Démarrage...', progress: 0, total: 0, matched: 0, failed: 0 };
      try {
        await this.runSync({ forceAll: false });
      } catch (error) {
        console.error('[Auto-Refresh] Erreur:', error);
      } finally {
        this.syncInProgress = false;
        this.syncStartedAt  = null;
      }
    } else {
      console.log('[Auto-Refresh] Synchronisation déjà en cours, passage au prochain cycle');
    }
  }

  startAutoRefresh(triggerImmediate = false) {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
    const enabled = this.db.getConfig('auto_refresh_enabled') === 'true';
    if (!enabled) { console.log('[Auto-Refresh] Désactivé'); return; }
    const interval   = parseInt(this.db.getConfig('refresh_interval')) || 180;
    const schedulerMs = 60 * 1000;
    if (triggerImmediate) {
      console.log('[Auto-Refresh] Activé - Fréquence par défaut: ' + interval + ' minutes - vérification immédiate des échéances');
      this.runAutoSync();
    } else {
      console.log('[Auto-Refresh] Fréquence par défaut mise à jour : ' + interval + ' minutes (échéances vérifiées chaque minute)');
    }
    this.autoRefreshInterval = setInterval(() => this.runAutoSync(), schedulerMs);
  }

  stopAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
      console.log('[Auto-Refresh] Arrêté');
    }
  }

  listen(port) {
    this.app.listen(port, () => {
      console.log('\nStremio RSS Catalog démarré sur le port ' + port);
      console.log('\nWebUI: http://localhost:' + port);
      console.log('Manifest: http://localhost:' + port + '/manifest.json\n');
    });
  }
}

module.exports = WebUI;
