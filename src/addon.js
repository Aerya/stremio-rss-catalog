const CATALOG_MAP = {
  'useflowfr_films':               { catalogType: 'films',         typeFilter: null },
  'useflowfr_documentaires':       { catalogType: 'documentaires', typeFilter: 'movie' },
  'useflowfr_documentaires_series':{ catalogType: 'documentaires', typeFilter: 'series' },
  'useflowfr_series':              { catalogType: 'series',        typeFilter: null },
  'useflowfr_emissions':           { catalogType: 'emissions',     typeFilter: null },
  'useflowfr_animes_films':        { catalogType: 'animés',        typeFilter: 'movie' },
  'useflowfr_animes_series':       { catalogType: 'animés',        typeFilter: 'series' },
  'useflowfr_concerts':            { catalogType: 'concerts',      typeFilter: null },
  'useflowfr_spectacles':          { catalogType: 'spectacles',    typeFilter: null }
};

const PAGE_SIZE = 100;
const ImageCacheService = require('./services/imageCacheService');

class StremioAddon {
  constructor(db) {
    this.db = db;
    this.imageCache = new ImageCacheService(db);
    // Cache invalidé à chaque sync. Clé : "id:skip:search". Pas de TTL — le contenu
    // ne change qu'à chaque sync. Les recherches ne sont pas mises en cache (trop variées).
    this._cache = new Map();
    this._warmTimer = null;
    this._warming = false;

    this.manifest = {
      id: 'community.useflowfr.catalog',
      version: '1.0.0',
      name: 'Stremio RSS Catalog',
      description: 'Catalogues Stremio depuis vos sources BitTorrent, Usenet et autres',
      logo: 'https://raw.githubusercontent.com/Aerya/stremio-rss-catalog/main/src/public/logo.png',
      resources: [
        'catalog',
        { name: 'meta', types: ['movie', 'series'], idPrefixes: ['tmdb'] }
      ],
      types: ['movie', 'series'],
      idPrefixes: ['tt', 'tmdb', 'kitsu', 'mal', 'anilist', 'anidb'],
      catalogs: [
        {
          type: 'movie',
          id: 'useflowfr_films',
          name: 'Stremio RSS Catalog - Films',
          extra: [{ name: 'skip', isRequired: false }, { name: 'search', isRequired: false }]
        },
        {
          type: 'movie',
          id: 'useflowfr_documentaires',
          name: 'Stremio RSS Catalog - Documentaires',
          extra: [{ name: 'skip', isRequired: false }, { name: 'search', isRequired: false }]
        },
        {
          type: 'series',
          id: 'useflowfr_documentaires_series',
          name: 'Stremio RSS Catalog - Documentaires',
          extra: [{ name: 'skip', isRequired: false }, { name: 'search', isRequired: false }]
        },
        {
          type: 'series',
          id: 'useflowfr_series',
          name: 'Stremio RSS Catalog - Séries',
          extra: [{ name: 'skip', isRequired: false }, { name: 'search', isRequired: false }]
        },
        {
          type: 'series',
          id: 'useflowfr_emissions',
          name: 'Stremio RSS Catalog - Émissions TV',
          extra: [{ name: 'skip', isRequired: false }, { name: 'search', isRequired: false }]
        },
        {
          type: 'movie',
          id: 'useflowfr_animes_films',
          name: 'Stremio RSS Catalog - Animés (Films)',
          extra: [{ name: 'skip', isRequired: false }, { name: 'search', isRequired: false }]
        },
        {
          type: 'series',
          id: 'useflowfr_animes_series',
          name: 'Stremio RSS Catalog - Animés (Séries)',
          extra: [{ name: 'skip', isRequired: false }, { name: 'search', isRequired: false }]
        },
        {
          type: 'movie',
          id: 'useflowfr_concerts',
          name: 'Stremio RSS Catalog - Concerts',
          extra: [{ name: 'skip', isRequired: false }, { name: 'search', isRequired: false }]
        },
        {
          type: 'movie',
          id: 'useflowfr_spectacles',
          name: 'Stremio RSS Catalog - Spectacles',
          extra: [{ name: 'skip', isRequired: false }, { name: 'search', isRequired: false }]
        }
      ]
    };

    this.scheduleWarmCache(1000);
  }

  // Appelé par webui.js après chaque sync réussie
  clearCache() {
    const size = this._cache.size;
    this._cache.clear();
    if (size > 0) console.log(`[Cache] Invalidé — ${size} entrées supprimées`);
    this.scheduleWarmCache();
  }

  scheduleWarmCache(delayMs = 300) {
    if (this._warmTimer) clearTimeout(this._warmTimer);
    this._warmTimer = setTimeout(() => {
      this._warmTimer = null;
      this.warmCache().catch(error => console.error('[Cache] Préchauffage échoué :', error.message));
    }, delayMs);
    this._warmTimer.unref?.();
  }

  async warmCache() {
    if (this._warming) return;
    this._warming = true;
    const startedAt = Date.now();
    let warmed = 0;
    try {
      const catalogs = this.db.listCustomCatalogs(false)
        .filter(catalog => ['movie', 'series', 'anime'].includes(catalog.type));
      // Les cinq premières pages couvrent l'ouverture et plusieurs défilements
      // sans multiplier excessivement la mémoire sur les grosses instances.
      for (const catalog of catalogs) {
        for (let page = 0; page < 5; page++) {
          const result = await this.handleCatalog({
            type: catalog.type,
            id: catalog.id,
            extra: { skip: page * PAGE_SIZE }
          });
          warmed++;
          if (!result.hasMore) break;
        }
      }
      console.log(`[Cache] Préchauffé — ${warmed} page(s) en ${Date.now() - startedAt} ms`);
    } finally {
      this._warming = false;
    }
  }

  getManifest() {
    const managedCatalogs = this.db.listCustomCatalogs(false)
      .filter(catalog => ['movie', 'series', 'anime'].includes(catalog.type));
    const customCatalogs = managedCatalogs.map(catalog => ({
      type: catalog.type,
      id: catalog.id,
      name: `Stremio RSS Catalog - ${catalog.name}`,
      extra: [{ name: 'skip', isRequired: false }, { name: 'search', isRequired: false }]
    }));
    return {
      ...this.manifest,
      version: `1.1.${Math.max(0, Number(this.db.getConfig('manifest_revision')) || 0)}`,
      types: [...new Set([...this.manifest.types, ...managedCatalogs.map(catalog => catalog.type)])],
      catalogs: customCatalogs
    };
  }

  _cacheKey(id, skip, search) {
    return `${id}:${skip}:${search || ''}`;
  }

  isCatalogCached(id, extra = {}) {
    const search = extra.search || null;
    if (search) return false;
    const skip = parseInt(extra.skip) || 0;
    return this._cache.has(this._cacheKey(id, skip, null));
  }

  applyImageCache(response, baseUrl = null) {
    if (!response?.metas || !baseUrl || !this.imageCache.isEnabled()) return response;
    return {
      ...response,
      metas: response.metas.map(meta => ({
        ...meta,
        poster: meta.poster ? this.imageCache.register(meta.poster, baseUrl) : meta.poster
      }))
    };
  }

  async handleCatalog({ type, id, extra, baseUrl = null }) {
    try {
      const custom = this.db.getCustomCatalog(id);
      if (custom) {
        if (!custom.enabled || custom.type !== type) return { metas: [] };
        const skip = parseInt(extra?.skip) || 0;
        const search = extra?.search || null;
        const key = this._cacheKey(id, skip, search);
        if (!search && this._cache.has(key)) {
          return this.applyImageCache(this._cache.get(key), baseUrl);
        }
        const items = this.db.getCustomCatalogMedia(custom, skip, PAGE_SIZE + 1, search);
        const response = {
          metas: items.slice(0, PAGE_SIZE).map(item => this.itemToMetaPreview(item)),
          hasMore: items.length > PAGE_SIZE
        };
        if (!search) this._cache.set(key, response);
        return this.applyImageCache(response, baseUrl);
      }

      const entry = CATALOG_MAP[id];
      if (!entry) return { metas: [] };

      const skip = parseInt(extra?.skip) || 0;
      const search = extra?.search || null;

      if (!search) {
        const key = this._cacheKey(id, skip, null);
        const cached = this._cache.get(key);
        if (cached) return this.applyImageCache(cached, baseUrl);
      }

      const { catalogType, typeFilter } = entry;
      const fetchLimit = PAGE_SIZE + 1;

      const items = search
        ? this.db.searchMedia(catalogType, search, skip, fetchLimit, typeFilter)
        : this.db.getMedia(catalogType, skip, fetchLimit, typeFilter);

      const hasMore = items.length > PAGE_SIZE;
      const metas = items.slice(0, PAGE_SIZE).map(item => this.itemToMetaPreview(item));
      const response = { metas, hasMore };

      if (!search) {
        this._cache.set(this._cacheKey(id, skip, null), response);
      }

      return this.applyImageCache(response, baseUrl);
    } catch (error) {
      console.error('Error in catalog handler:', error);
      return { metas: [] };
    }
  }

  handleMeta({ type, id, baseUrl = null }) {
    const match = String(id || '').match(/^tmdb:(movie|tv):(\d+)$/);
    if (!match) return { meta: null };

    const expectedType = match[1] === 'tv' ? 'series' : 'movie';
    if (type !== expectedType) return { meta: null };

    const item = this.db.getMediaByImdbId(id);
    if (!item || item.type !== expectedType) return { meta: null };

    const meta = this.itemToMetaPreview(item);
    if (
      baseUrl
      && meta.poster
      && this.imageCache.isEnabled()
    ) {
      meta.poster = this.imageCache.register(meta.poster, baseUrl);
    }
    return { meta };
  }

  itemToMetaPreview(item) {
    let poster = item.poster || 'https://via.placeholder.com/300x450?text=No+Poster';

    const postersPlusEnabled = this.db.getConfig('postersplus_enabled') === 'true';
    const postersPlusTemplate = this.db.getConfig('postersplus_url_template');
    const rpdbEnabled = this.db.getConfig('rpdb_enabled') === 'true';
    let rpdbKey = this.db.getConfig('rpdb_api_key');

    const postersPlusUrl = postersPlusEnabled
      ? this.buildPostersPlusUrl(item, postersPlusTemplate)
      : null;
    if (postersPlusUrl) {
      poster = postersPlusUrl;
    } else if (rpdbEnabled && rpdbKey && /^tt\d+$/i.test(item.imdb_id || '')) {
      rpdbKey = rpdbKey.trim();
      poster = `https://api.ratingposterdb.com/${rpdbKey}/imdb/poster-default/${item.imdb_id}.jpg?fallback=true`;
    }

    const meta = {
      id: item.imdb_id,
      type: item.type,
      name: item.name,
      poster
    };

    if (item.year) meta.releaseInfo = item.year;

    if (item.genres && item.genres.length > 0) {
      const genreMap = {
        28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
        80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
        14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
        9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
        53: 'Thriller', 10752: 'War', 37: 'Western',
        10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News',
        10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap',
        10767: 'Talk', 10768: 'War & Politics'
      };
      meta.genres = item.genres
        .map(id => typeof id === 'string' && !/^\d+$/.test(id) ? id : (genreMap[id] || 'Unknown'))
        .filter(g => g !== 'Unknown');
    }

    if (!item.description && item.release_name) {
      meta.description = `Release: ${item.release_name}`;
    } else if (item.description) {
      meta.description = item.description;
    }

    if (item.background) meta.background = item.background;

    return meta;
  }

  buildPostersPlusUrl(item, template = null) {
    const value = String(template || '').trim();
    if (!value || !/^tt\d+$/i.test(item?.imdb_id || '')) return null;
    const type = item.type === 'series' ? 'tv' : 'movie';
    const replacements = {
      // Certains imports directs (StreamFusion, CometNet...) n'ont qu'un ID
      // IMDb. PostersPlus peut alors utiliser son fallback IMDb.
      '{tmdb_id}': item.tmdb_id ? String(item.tmdb_id) : '',
      '{imdb_id}': String(item.imdb_id),
      '{type}': type
    };
    let result = value;
    for (const [placeholder, replacement] of Object.entries(replacements)) {
      result = result.split(placeholder).join(encodeURIComponent(replacement));
    }
    if (/\{(?:tmdb_id|imdb_id|type)\}/.test(result)) return null;
    try {
      const url = new URL(result);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

}

module.exports = StremioAddon;
