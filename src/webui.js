const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { sendDiscordNotification } = require('./services/discordService');
const { sendAppriseNotification } = require('./services/appriseService');
const { getStrings }              = require('./services/notifStrings');
const crypto = require('crypto');

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
    this.startAutoRefresh(true);
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
    this.app.use('/static', express.static(path.join(__dirname, 'public'), {
      etag: false,
      setHeaders: (res) => res.setHeader('Cache-Control', 'no-store')
    }));
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
      res.json(config);
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

    // ─── Sources RSS ───────────────────────────────────────────────────────
    this.app.get('/api/rss-sources', this.authMiddleware.bind(this), (req, res) => {
      res.json(this.getRssSources());
    });

    this.app.post('/api/rss-sources', this.authMiddleware.bind(this), (req, res) => {
      const { name = '', url, force = 'auto', paused = false } = req.body;
      if (!/^https?:\/\//i.test(url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
      const additional = this.getAdditionalRssSources();
      if (this.getRssSources().some(source => source.url === url)) {
        return res.status(409).json({ error: 'Cette source existe déjà' });
      }
      const source = { id: crypto.randomUUID(), name: String(name).trim() || new URL(url).hostname, url, force, paused: Boolean(paused) };
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
        this.db.setConfig('rss_films_name', next.name || '');
        this.db.setConfig('rss_films_url', next.url);
        this.db.setConfig('rss_films_force', next.force || 'auto');
        this.db.setConfig('rss_films_paused', next.paused ? 'true' : 'false');
        return res.json(next);
      }
      const additional = this.getAdditionalRssSources();
      const index = additional.findIndex(source => source.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Source introuvable' });
      additional[index] = { ...additional[index], ...req.body, id: additional[index].id };
      this.db.setConfig('rss_additional_urls', JSON.stringify(additional));
      res.json({ ...additional[index], kind: 'rss' });
    });

    this.app.delete('/api/rss-sources/:id', this.authMiddleware.bind(this), (req, res) => {
      if (req.params.id === 'rss-main') {
        this.db.setConfig('rss_films_name', '');
        this.db.setConfig('rss_films_url', '');
        return res.json({ success: true });
      }
      const additional = this.getAdditionalRssSources();
      const next = additional.filter(source => source.id !== req.params.id);
      if (next.length === additional.length) return res.status(404).json({ error: 'Source introuvable' });
      this.db.setConfig('rss_additional_urls', JSON.stringify(next));
      res.json({ success: true });
    });

    // ─── Sources Pastebin ──────────────────────────────────────────────────
    this.app.get('/api/pastebins', this.authMiddleware.bind(this), (req, res) => {
      res.json(this.rssParser.pastebinParser.getSources());
    });

    this.app.post('/api/pastebins/preview', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const { url, maxPages = 25 } = req.body;
        if (!/^https?:\/\//i.test(url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
        const result = await this.rssParser.pastebinParser.discover(url, {
          maxPages: Math.min(Number(maxPages) || 25, 100),
          maxDepth: 5
        });
        res.json({
          visited: result.visited,
          truncated: result.truncated,
          items: result.items.length,
          raw_items: result.rawItems,
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
      const { name = '', url, paused = false, force = 'auto' } = req.body;
      if (!/^https?:\/\//i.test(url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
      const sources = this.rssParser.pastebinParser.getSources();
      if (sources.some(source => source.url === url)) return res.status(409).json({ error: 'Cette source existe déjà' });
      const source = {
        id: crypto.randomUUID(),
        name: String(name).trim() || new URL(url).hostname,
        url,
        paused: Boolean(paused),
        force,
        maxDepth: 5,
        maxPages: 1000
      };
      sources.push(source);
      this.db.setConfig('pastebin_sources', JSON.stringify(sources));
      res.status(201).json(source);
    });

    this.app.put('/api/pastebins/:id', this.authMiddleware.bind(this), (req, res) => {
      const sources = this.rssParser.pastebinParser.getSources();
      const index = sources.findIndex(source => source.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Source introuvable' });
      const next = { ...sources[index], ...req.body, id: sources[index].id };
      if (!/^https?:\/\//i.test(next.url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
      sources[index] = next;
      this.db.setConfig('pastebin_sources', JSON.stringify(sources));
      res.json(next);
    });

    this.app.delete('/api/pastebins/:id', this.authMiddleware.bind(this), (req, res) => {
      const sources = this.rssParser.pastebinParser.getSources();
      const next = sources.filter(source => source.id !== req.params.id);
      if (next.length === sources.length) return res.status(404).json({ error: 'Source introuvable' });
      this.db.setConfig('pastebin_sources', JSON.stringify(next));
      res.json({ success: true });
    });

    // ─── Sources manifestes Stremio ────────────────────────────────────────
    this.app.get('/api/stremio-sources', this.authMiddleware.bind(this), (req, res) => {
      const parser = this.rssParser.stremioManifestParser;
      res.json(parser.getSources().map(source => ({
        id: source.id,
        name: source.name,
        display_url: parser.maskUrl(source.url),
        paused: Boolean(source.paused),
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
        res.json(await this.rssParser.stremioManifestParser.inspect(url));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.post('/api/stremio-sources', this.authMiddleware.bind(this), async (req, res) => {
      try {
        const { url, name = '' } = req.body;
        if (!/^https?:\/\//i.test(url || '')) return res.status(400).json({ error: 'URL HTTP(S) invalide' });
        const parser = this.rssParser.stremioManifestParser;
        const sources = parser.getSources();
        if (sources.some(source => source.url === url)) return res.status(409).json({ error: 'Cette source existe déjà' });
        const inspected = await parser.inspect(url);
        const source = {
          id: crypto.randomUUID(),
          name: String(name).trim() || inspected.name,
          url,
          paused: false,
          maxItemsPerCatalog: 5000,
          catalogs: inspected.catalogs.map(catalog => ({ ...catalog, enabled: true }))
        };
        sources.push(source);
        this.db.setConfig('stremio_manifest_sources', JSON.stringify(sources));
        res.status(201).json({
          id: source.id,
          name: source.name,
          display_url: parser.maskUrl(source.url),
          paused: false,
          catalogs: source.catalogs.map(catalog => ({
            ...catalog,
            source_key: parser.sourceKey(source.id, catalog)
          }))
        });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    this.app.put('/api/stremio-sources/:id', this.authMiddleware.bind(this), (req, res) => {
      const parser = this.rssParser.stremioManifestParser;
      const sources = parser.getSources();
      const index = sources.findIndex(source => source.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Source introuvable' });
      const allowed = {};
      if (req.body.name !== undefined) allowed.name = String(req.body.name).trim();
      if (req.body.paused !== undefined) allowed.paused = Boolean(req.body.paused);
      if (Array.isArray(req.body.catalogs)) allowed.catalogs = req.body.catalogs;
      sources[index] = { ...sources[index], ...allowed };
      this.db.setConfig('stremio_manifest_sources', JSON.stringify(sources));
      res.json({ success: true });
    });

    this.app.delete('/api/stremio-sources/:id', this.authMiddleware.bind(this), (req, res) => {
      const parser = this.rssParser.stremioManifestParser;
      const sources = parser.getSources();
      const next = sources.filter(source => source.id !== req.params.id);
      if (next.length === sources.length) return res.status(404).json({ error: 'Source introuvable' });
      this.db.setConfig('stremio_manifest_sources', JSON.stringify(next));
      res.json({ success: true });
    });

    // ─── Catalogues personnalisés ──────────────────────────────────────────
    this.app.get('/api/catalogs', this.authMiddleware.bind(this), (req, res) => {
      res.json(this.db.listCustomCatalogs());
    });

    this.app.post('/api/catalogs', this.authMiddleware.bind(this), (req, res) => {
      const { name, type, source_urls = [], filters = {}, enabled = true } = req.body;
      if (!String(name || '').trim()) return res.status(400).json({ error: 'Nom requis' });
      if (!['movie', 'series'].includes(type)) return res.status(400).json({ error: 'Type invalide' });
      const slug = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'catalogue';
      const catalog = this.db.saveCustomCatalog({
        id: `custom_${slug}_${crypto.randomUUID().slice(0, 8)}`,
        name: String(name).trim(), type, source_urls, filters, enabled
      });
      this.bumpManifestRevision();
      this.stremioAddon.clearCache();
      res.status(201).json(catalog);
    });

    this.app.put('/api/catalogs/:id', this.authMiddleware.bind(this), (req, res) => {
      const current = this.db.getCustomCatalog(req.params.id);
      if (!current) return res.status(404).json({ error: 'Catalogue introuvable' });
      const next = { ...current, ...req.body, id: current.id };
      if (!String(next.name || '').trim() || !['movie', 'series'].includes(next.type)) {
        return res.status(400).json({ error: 'Nom ou type invalide' });
      }
      const catalog = this.db.saveCustomCatalog(next);
      this.bumpManifestRevision();
      this.stremioAddon.clearCache();
      res.json(catalog);
    });

    this.app.delete('/api/catalogs/:id', this.authMiddleware.bind(this), (req, res) => {
      if (!this.db.deleteCustomCatalog(req.params.id)) return res.status(404).json({ error: 'Catalogue introuvable' });
      this.bumpManifestRevision();
      this.stremioAddon.clearCache();
      res.json({ success: true });
    });

    this.app.post('/api/catalogs/preview', this.authMiddleware.bind(this), (req, res) => {
      const virtual = {
        type: req.body.type,
        source_urls: req.body.source_urls || [],
        filters: req.body.filters || {}
      };
      if (!['movie', 'series'].includes(virtual.type)) return res.status(400).json({ error: 'Type invalide' });
      const items = this.db.getCustomCatalogMedia(virtual, 0, 21);
      res.json({
        count_at_least: items.length,
        truncated: items.length > 20,
        items: items.slice(0, 20).map(item => ({ imdb_id: item.imdb_id, name: item.name, year: item.year }))
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
      // Build URL→name map from RSS config
      let feedNameMap = {};
      try {
        const rawUrls = this.db.getConfig('rss_additional_urls') || '[]';
        const feeds = JSON.parse(rawUrls);
        feeds.forEach(f => { if (f.url && f.name) feedNameMap[f.url] = f.name; });
      } catch (e) { /* silencieux */ }
      result.items = result.items.map(item => ({
        ...item,
        source_name: (item.source_url && feedNameMap[item.source_url]) || null
      }));
      res.json(result);
    });

    this.app.get('/api/media/:imdbId/releases', this.authMiddleware.bind(this), (req, res) => {
      const releases = this.db.getReleasesByMedia(req.params.imdbId);
      res.json(releases);
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
      // Map url → nom depuis la config
      const nameMap = {};
      const mainUrl  = this.db.getConfig('rss_films_url');
      const mainName = this.db.getConfig('rss_films_name');
      if (mainUrl && mainName) nameMap[mainUrl] = mainName;
      try {
        const additional = JSON.parse(this.db.getConfig('rss_additional_urls') || '[]');
        additional.forEach(item => { if (item.url && item.name) nameMap[item.url] = item.name; });
      } catch (e) {}
      this.rssParser.pastebinParser.getSources().forEach(item => {
        if (item.url && item.name) nameMap[item.url] = item.name;
      });
      this.rssParser.stremioManifestParser.getSources().forEach(source => {
        (source.catalogs || []).forEach(catalog => {
          nameMap[this.rssParser.stremioManifestParser.sourceKey(source.id, catalog)] = `${source.name} — ${catalog.name}`;
        });
      });

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

    // ─── Sync ───────────────────────────────────────────────────────────────
    this.app.post('/api/sync', this.authMiddleware.bind(this), async (req, res) => {
      if (this.syncInProgress) return res.status(409).json({ error: 'Synchronisation déjà en cours' });
      const tmdbKey = this.db.getConfig('tmdb_api_key');
      const hasPastebin = this.rssParser.pastebinParser.getSources().some(source => !source.paused);
      const hasStremio = this.rssParser.stremioManifestParser.getSources().some(source => !source.paused);
      const hasRss = this.getRssSources().some(source => !source.paused);
      if (!hasRss && !hasPastebin && !hasStremio) {
        return res.status(400).json({ error: 'Au moins une source active est requise' });
      }
      if ((hasRss || hasPastebin) && !tmdbKey) {
        return res.status(400).json({ error: 'La clé TMDB est requise pour les sources RSS et Pastebin' });
      }

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

    // ─── Reclassifier tous les médias selon config flux actuelle ───────────
    this.app.post('/api/reclassify', this.authMiddleware.bind(this), (req, res) => {
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

        const reclassified = updates.length > 0 ? this.db.batchUpdateCatalogTypes(updates) : 0;
        if (reclassified > 0) this.stremioAddon.clearCache();

        console.log(`[Reclassify] ${reclassified}/${allMedia.length} médias reclassifiés, ${skipped} conservés (spécificité supérieure)`);
        res.json({ success: true, total: allMedia.length, reclassified, skipped, byCategory });
      } catch (err) {
        console.error('[Reclassify]', err);
        res.status(500).json({ error: err.message });
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

  bumpManifestRevision() {
    const next = (Number(this.db.getConfig('manifest_revision')) || 0) + 1;
    this.db.setConfig('manifest_revision', String(next));
  }

  getAdditionalRssSources() {
    try {
      const values = JSON.parse(this.db.getConfig('rss_additional_urls') || '[]');
      return (Array.isArray(values) ? values : []).map(value => {
        const source = typeof value === 'string' ? { url: value } : { ...value };
        source.id ||= `rss-${crypto.createHash('sha256').update(source.url || crypto.randomUUID()).digest('hex').slice(0, 12)}`;
        source.name ||= source.url;
        source.force ||= 'auto';
        source.paused = Boolean(source.paused);
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
        paused: this.db.getConfig('rss_films_paused') === 'true'
      });
    }
    return [...sources, ...this.getAdditionalRssSources().map(source => ({ ...source, kind: 'rss' }))];
  }

  async runSync() {
    let syncId = null;
    const startTime = Date.now();
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
        emissions:     this.db.getMediaCount('emissions'),
        animes:        this.db.getMediaCount('animés'),
        concerts:      this.db.getMediaCount('concerts'),
        spectacles:    this.db.getMediaCount('spectacles')
      };

      const filmsAdded         = catalogsAfter.films         - catalogsBefore.films;
      const documentairesAdded = catalogsAfter.documentaires - catalogsBefore.documentaires;
      const seriesAdded        = catalogsAfter.series        - catalogsBefore.series;
      const emissionsAdded     = catalogsAfter.emissions     - catalogsBefore.emissions;
      const animesAdded        = catalogsAfter.animes        - catalogsBefore.animes;
      const concertsAdded      = catalogsAfter.concerts      - catalogsBefore.concerts;
      const spectaclesAdded    = catalogsAfter.spectacles    - catalogsBefore.spectacles;

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

      console.log('Sync completed:', result);
      this.stremioAddon.clearCache();

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
          rpdbKey:     this.db.getConfig('rpdb_api_key')
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

  startAutoRefresh(triggerImmediate = false) {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
    const enabled = this.db.getConfig('auto_refresh_enabled') === 'true';
    if (!enabled) { console.log('[Auto-Refresh] Désactivé'); return; }
    const interval   = parseInt(this.db.getConfig('refresh_interval')) || 180;
    const intervalMs = interval * 60 * 1000;
    if (triggerImmediate) {
      console.log('[Auto-Refresh] Activé - Intervalle: ' + interval + ' minutes - Sync immédiate au démarrage');
      this.runAutoSync();
    } else {
      console.log('[Auto-Refresh] Intervalle mis à jour : ' + interval + ' minutes (prochaine sync dans ' + interval + ' min)');
    }
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
