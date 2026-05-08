const { addonBuilder } = require('stremio-addon-sdk');

const CATALOG_MAP = {
  'useflowfr_films':               { catalogType: 'films',         typeFilter: null },
  'useflowfr_documentaires':       { catalogType: 'documentaires', typeFilter: 'movie' },
  'useflowfr_documentaires_series':{ catalogType: 'documentaires', typeFilter: 'series' },
  'useflowfr_series':              { catalogType: 'series',        typeFilter: null },
  'useflowfr_emissions':           { catalogType: 'emissions',     typeFilter: null }
};

const PAGE_SIZE = 100;

class StremioAddon {
  constructor(db) {
    this.db = db;
    // Cache invalidé à chaque sync. Clé : "id:skip:search". Pas de TTL — le contenu
    // ne change qu'à chaque sync. Les recherches ne sont pas mises en cache (trop variées).
    this._cache = new Map();

    this.manifest = {
      id: 'community.useflowfr.catalog',
      version: '1.0.0',
      name: 'Stremio RSS Catalog',
      description: 'Catalogues Films, Documentaires et Séries depuis vos flux RSS',
      logo: 'https://raw.githubusercontent.com/Aerya/stremio-rss-catalogs/main/src/public/logo.png',
      resources: ['catalog'],
      types: ['movie', 'series'],
      idPrefixes: ['tt'],
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
        }
      ]
    };

    this.builder = new addonBuilder(this.manifest);
    this.setupHandlers();
  }

  // Appelé par webui.js après chaque sync réussie
  clearCache() {
    const size = this._cache.size;
    this._cache.clear();
    if (size > 0) console.log(`[Cache] Invalidé — ${size} entrées supprimées`);
  }

  _cacheKey(id, skip, search) {
    return `${id}:${skip}:${search || ''}`;
  }

  setupHandlers() {
    this.builder.defineCatalogHandler(async ({ type, id, extra }) => {
      const entry = CATALOG_MAP[id];
      if (!entry) return { metas: [] };

      const skip = parseInt(extra?.skip) || 0;
      const search = extra?.search || null;

      // Les recherches ne sont pas cachées (requêtes trop variées, usage rare)
      if (!search) {
        const key = this._cacheKey(id, skip, null);
        const cached = this._cache.get(key);
        if (cached) {
          console.log(`[Cache] HIT — ${id} skip=${skip}`);
          return cached;
        }
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
        console.log(`[Cache] MISS → stocké — ${id} skip=${skip} (${metas.length} items, cache size: ${this._cache.size})`);
      } else {
        console.log(`[Cache] SEARCH (non caché) — ${id} query="${search}" skip=${skip} → ${metas.length} items`);
      }

      return response;
    });
  }

  async handleCatalog({ type, id, extra }) {
    try {
      const entry = CATALOG_MAP[id];
      if (!entry) return { metas: [] };

      const skip = parseInt(extra?.skip) || 0;
      const search = extra?.search || null;

      if (!search) {
        const key = this._cacheKey(id, skip, null);
        const cached = this._cache.get(key);
        if (cached) return cached;
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

      return response;
    } catch (error) {
      console.error('Error in catalog handler:', error);
      return { metas: [] };
    }
  }

  itemToMetaPreview(item) {
    let poster = item.poster || 'https://via.placeholder.com/300x450?text=No+Poster';

    const rpdbEnabled = this.db.getConfig('rpdb_enabled') === 'true';
    let rpdbKey = this.db.getConfig('rpdb_api_key');

    if (rpdbEnabled && rpdbKey && item.imdb_id) {
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
      meta.genres = item.genres.map(id => genreMap[id] || 'Unknown').filter(g => g !== 'Unknown');
    }

    if (!item.description && item.release_name) {
      meta.description = `Release: ${item.release_name}`;
    } else if (item.description) {
      meta.description = item.description;
    }

    if (item.background) meta.background = item.background;

    return meta;
  }

  getInterface() {
    return this.builder.getInterface();
  }
}

module.exports = StremioAddon;
