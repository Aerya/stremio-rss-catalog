const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const { sendDiscordNotification } = require('./services/discordService');

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

    this.setupMiddleware();
    this.setupRoutes();
    this.startAutoRefresh();
  }

  setupMiddleware() {
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
    this.app.use('/static', express.static(path.join(__dirname, 'public')));
  }

  authMiddleware(req, res, next) {
    if (req.session.authenticated) return next();
    res.status(401).json({ error: 'Non authentifié' });
  }

  setupRoutes() {
    // ─── Pages ─────────────────────────────────────────────────────────────
    this.app.get('/', (req, res) => {
      if (req.session.authenticated) return res.redirect('/dashboard');
      res.sendFile(path.join(__dirname, 'views', 'login.html'));
    });

    this.app.get('/dashboard', (req, res) => {
      if (!req.session.authenticated) return res.redirect('/');
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
      res.json(this.db.getAllConfig());
    });

    this.app.post('/api/config', this.authMiddleware.bind(this), (req, res) => {
      try {
        const config = req.body;
        const prevTvdbKey = this.db.getConfig('tvdb_api_key');
        for (const [key, value] of Object.entries(config)) {
          this.db.setConfig(key, value);
        }
        if (config.tvdb_api_key !== undefined && config.tvdb_api_key !== prevTvdbKey) {
          this.db.setConfig('tvdb_token', '');
          this.db.setConfig('tvdb_token_expiry', '0');
          console.log('[TVDB] Clé API modifiée — token invalidé');
        }
        this.startAutoRefresh();
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ─── Stats ──────────────────────────────────────────────────────────────
    this.app.get('/api/stats', this.authMiddleware.bind(this), (req, res) => {
      const films        = this.db.getMediaCount('films');
      const documentaires = this.db.getMediaCount('documentaires');
      const series       = this.db.getMediaCount('series');
      const emissions    = this.db.getMediaCount('emissions');
      res.json({ films, documentaires, series, emissions, total: films + documentaires + series + emissions });
    });

    // ─── Media Library ──────────────────────────────────────────────────────
    this.app.get('/api/media/list', this.authMiddleware.bind(this), (req, res) => {
      const { catalog, search, page = 1, limit = 24 } = req.query;
      const result = this.db.getMediaList({
        catalog: catalog || null,
        search: search || '',
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 24
      });
      res.json(result);
    });

    this.app.get('/api/media/:imdbId/releases', this.authMiddleware.bind(this), (req, res) => {
      const releases = this.db.getReleasesByMedia(req.params.imdbId);
      res.json(releases);
    });

    // ─── Sources ────────────────────────────────────────────────────────────
    this.app.get('/api/sources/stats', this.authMiddleware.bind(this), (req, res) => {
      res.json(this.db.getSourceStats());
    });

    // ─── Sync ───────────────────────────────────────────────────────────────
    this.app.post('/api/sync', this.authMiddleware.bind(this), async (req, res) => {
      if (this.syncInProgress) return res.status(409).json({ error: 'Synchronisation déjà en cours' });
      const rssUrl  = this.db.getConfig('rss_films_url');
      const tmdbKey = this.db.getConfig('tmdb_api_key');
      if (!rssUrl || !tmdbKey) return res.status(400).json({ error: 'Configuration RSS et TMDB requise' });

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host     = req.headers['x-forwarded-host'] || req.headers.host || req.hostname;
      this.baseUrl   = `${protocol}://${host}`;

      this.syncInProgress = true;
      this.syncStartedAt  = Date.now();
      this.syncStatus = { running: true, stage: 'Démarrage...', progress: 0, total: 0, matched: 0, failed: 0 };
      res.json({ success: true, message: 'Synchronisation démarrée' });
      this.runSync().catch(error => {
        console.error('Sync error:', error);
        this.syncStatus.error = error.message;
      }).finally(() => {
        this.syncInProgress = false;
        this.syncStartedAt  = null;
      });
    });

    this.app.get('/api/sync/status', this.authMiddleware.bind(this), (req, res) => {
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

    // ─── Stremio Addon ──────────────────────────────────────────────────────
    this.app.get('/manifest.json', (req, res) => {
      res.json(this.stremioAddon.manifest);
    });

    this.app.get('/catalog/:type/:id.json', async (req, res) => {
      try {
        const result = await this.stremioAddon.handleCatalog({
          type: req.params.type,
          id: req.params.id,
          extra: req.query
        });
        res.json(result);
      } catch (error) {
        console.error('Catalog error:', error);
        res.status(500).json({ metas: [] });
      }
    });
  }

  async runSync() {
    let syncId = null;
    const startTime = Date.now();
    const catalogsBefore = {
      films:          this.db.getMediaCount('films'),
      documentaires:  this.db.getMediaCount('documentaires'),
      series:         this.db.getMediaCount('series'),
      emissions:      this.db.getMediaCount('emissions')
    };

    try {
      this.syncStatus.stage = 'Récupération des flux RSS...';
      const rssData = await this.rssParser.parseAll();
      console.log('RSS fetched - Films: ' + rssData.films.length);

      const allItems = [...rssData.films];
      if (allItems.length === 0) {
        this.syncStatus.stage   = 'Aucun item trouvé';
        this.syncStatus.running = false;
        this.syncStatus.error   = 'Aucun item trouvé dans les flux RSS';
        console.log('No items found in RSS feeds');
        return;
      }
      syncId = this.db.createSyncHistory(allItems.length);

      this.syncStatus.total = allItems.length;
      this.syncStatus.stage = 'Matching TMDB...';
      console.log('Starting TMDB matching for ' + allItems.length + ' items...');
      const result = await this.tmdbMatcher.matchBatch(allItems, (progress) => {
        this.syncStatus.progress    = progress.current;
        this.syncStatus.matched     = progress.matched;
        this.syncStatus.failed      = progress.failed;
        this.syncStatus.alreadyInDb = progress.alreadyInDb || 0;
      });

      const catalogsAfter = {
        films:         this.db.getMediaCount('films'),
        documentaires: this.db.getMediaCount('documentaires'),
        series:        this.db.getMediaCount('series'),
        emissions:     this.db.getMediaCount('emissions')
      };

      const filmsAdded         = catalogsAfter.films         - catalogsBefore.films;
      const documentairesAdded = catalogsAfter.documentaires - catalogsBefore.documentaires;
      const seriesAdded        = catalogsAfter.series        - catalogsBefore.series;
      const emissionsAdded     = catalogsAfter.emissions     - catalogsBefore.emissions;

      this.db.updateSyncHistory(syncId, {
        matched_items:        result.matched,
        failed_items:         result.failed,
        already_in_db:        result.alreadyInDb || 0,
        films_added:          filmsAdded,
        documentaires_added:  documentairesAdded,
        series_added:         seriesAdded,
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

      console.log('Sync completed:', result);
      this.stremioAddon.clearCache();

      const discordEnabled = this.db.getConfig('discord_notifications_enabled') === 'true';
      const webhookUrl     = this.db.getConfig('discord_webhook_url');
      if (discordEnabled && webhookUrl) {
        const notificationData = {
          status: 'completed',
          filmsAdded, documentairesAdded, seriesAdded, emissionsAdded,
          totalFilms:     catalogsAfter.films,
          totalDocs:      catalogsAfter.documentaires,
          totalSeries:    catalogsAfter.series,
          totalEmissions: catalogsAfter.emissions,
          matched:        result.matched,
          failed:         result.failed,
          duration,
          installUrl:  this.baseUrl ? `${this.baseUrl}/manifest.json` : null,
          rpdbEnabled: this.db.getConfig('discord_rpdb_posters_enabled') === 'true',
          rpdbKey:     this.db.getConfig('rpdb_api_key')
        };
        const enhancedEnabled = this.db.getConfig('discord_enhanced_notifications_enabled') === 'true';
        if (enhancedEnabled && (filmsAdded > 0 || documentairesAdded > 0 || seriesAdded > 0 || emissionsAdded > 0)) {
          notificationData.recentAdditions = {
            films:         filmsAdded         > 0 ? this.db.getRecentCatalogAdditions('films', 5)         : [],
            documentaires: documentairesAdded > 0 ? this.db.getRecentCatalogAdditions('documentaires', 5) : [],
            series:        seriesAdded        > 0 ? this.db.getRecentCatalogAdditions('series', 5)        : [],
            emissions:     emissionsAdded     > 0 ? this.db.getRecentCatalogAdditions('emissions', 5)     : []
          };
        }
        await sendDiscordNotification(webhookUrl, notificationData);
      }
    } catch (error) {
      console.error('Sync error:', error);
      console.error('Stack trace:', error.stack);
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
        });
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
      try {
        await this.runSync();
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

  startAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
    const enabled = this.db.getConfig('auto_refresh_enabled') === 'true';
    if (!enabled) { console.log('[Auto-Refresh] Désactivé'); return; }
    const interval   = parseInt(this.db.getConfig('refresh_interval')) || 180;
    const intervalMs = interval * 60 * 1000;
    console.log('[Auto-Refresh] Activé - Intervalle: ' + interval + ' minutes - Sync immédiate au démarrage');
    this.runAutoSync();
    this.autoRefreshInterval = setInterval(() => this.runAutoSync(), intervalMs);
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
