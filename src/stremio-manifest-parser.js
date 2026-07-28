const axios = require('axios');
const crypto = require('crypto');

class StremioManifestParser {
  constructor(db, axiosConfigFactory) {
    this.db = db;
    this.axiosConfigFactory = axiosConfigFactory;
  }

  getSources() {
    try {
      const sources = JSON.parse(this.db.getConfig('stremio_manifest_sources') || '[]');
      return Array.isArray(sources) ? sources : [];
    } catch {
      return [];
    }
  }

  maskUrl(value) {
    return value ? 'manifest.json — URL masquée' : 'URL masquée';
  }

  async fetchJson(url) {
    const response = await axios.get(url, {
      ...(this.axiosConfigFactory ? this.axiosConfigFactory() : {}),
      maxContentLength: 10 * 1024 * 1024,
      maxBodyLength: 10 * 1024 * 1024
    });
    return response.data;
  }

  sourceKey(sourceId, catalog) {
    return `stremio-manifest:${sourceId}:${catalog.type}:${catalog.id}`;
  }

  async inspect(url) {
    const manifest = await this.fetchJson(url);
    if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.catalogs)) {
      throw new Error('Le document ne contient pas de manifeste Stremio valide');
    }
    const catalogs = manifest.catalogs
      .filter(catalog => catalog?.id && catalog?.type)
      .map(catalog => ({
        id: String(catalog.id),
        type: String(catalog.type),
        name: String(catalog.name || catalog.id),
        supported: ['movie', 'series'].includes(String(catalog.type).toLowerCase())
      }));
    return {
      name: String(manifest.name || 'Addon Stremio'),
      id: String(manifest.id || ''),
      version: String(manifest.version || ''),
      catalogs
    };
  }

  anonymizeInspection(inspection) {
    const counts = {};
    const labels = {
      films: 'Films importés',
      series: 'Séries importées',
      documentaires: 'Documentaires importés',
      'animés': 'Animés importés',
      concerts: 'Concerts importés',
      spectacles: 'Spectacles importés',
      emissions: 'Émissions importées'
    };
    const catalogs = inspection.catalogs.map(catalog => {
      const category = this.guessCatalogType(catalog);
      counts[category] = (counts[category] || 0) + 1;
      return {
        ...catalog,
        name: `${labels[category] || 'Catalogue importé'}${counts[category] > 1 ? ` ${counts[category]}` : ''}`
      };
    });
    return {
      name: 'Manifeste Stremio',
      id: '',
      version: inspection.version,
      catalogs
    };
  }

  catalogUrl(manifestUrl, catalog, skip = 0) {
    const url = new URL(manifestUrl);
    const basePath = url.pathname.replace(/\/manifest\.json$/i, '').replace(/\/$/, '');
    const type = encodeURIComponent(catalog.type);
    const id = encodeURIComponent(catalog.id);
    url.pathname = skip > 0
      ? `${basePath}/catalog/${type}/${id}/skip=${skip}.json`
      : `${basePath}/catalog/${type}/${id}.json`;
    return url.href;
  }

  catalogUrlWithQuerySkip(manifestUrl, catalog, skip) {
    const url = new URL(this.catalogUrl(manifestUrl, catalog, 0));
    url.searchParams.set('skip', String(skip));
    return url.href;
  }

  guessCatalogType(catalog) {
    const text = `${catalog.id} ${catalog.name}`.toLowerCase();
    if (/document|docu/.test(text)) return 'documentaires';
    if (/anime|anim[eé]|cartoon/.test(text)) return 'animés';
    if (/concert|music/.test(text)) return 'concerts';
    if (/spectacle|stand.?up|theatre|th[eé][aâ]tre/.test(text)) return 'spectacles';
    if (/emission|talk|reality/.test(text)) return 'emissions';
    return catalog.type === 'series' ? 'series' : 'films';
  }

  metaToItem(meta, source, catalog) {
    if (!meta?.id || !meta?.name) return null;
    const rawId = String(meta.id);
    const imdb = rawId.match(/tt\d{5,12}/i)?.[0] || null;
    const tmdb = rawId.match(/(?:tmdb[:_-]?)(\d+)/i)?.[1] || null;
    const identity = crypto.createHash('sha256')
      .update(`${source.id}|${catalog.type}|${catalog.id}|${rawId}`)
      .digest('hex').slice(0, 32);
    const type = meta.type === 'series' || catalog.type === 'series' ? 'series' : 'movie';
    return {
      release_name: meta.name,
      indexer_rlz_id: `stremio:${identity}`,
      cleanName: meta.name,
      year: String(meta.releaseInfo || meta.year || '').match(/\b(19|20)\d{2}\b/)?.[0] || null,
      catalog_type: this.guessCatalogType(catalog),
      type,
      tmdb_id: tmdb,
      source_url: this.sourceKey(source.id, catalog),
      source_force: this.guessCatalogType(catalog),
      direct_meta: imdb ? {
        imdb_id: imdb,
        tmdb_id: tmdb,
        name: meta.name,
        year: String(meta.releaseInfo || meta.year || '').match(/\b(19|20)\d{2}\b/)?.[0] || null,
        poster: meta.poster || null,
        background: meta.background || null,
        description: meta.description || null,
        genres: Array.isArray(meta.genre_ids) ? meta.genre_ids.map(Number).filter(Number.isInteger) : [],
        vote_average: Number(meta.imdbRating || meta.vote_average) || null,
        original_language: null,
        origin_country: []
      } : null
    };
  }

  async fetchCatalog(source, catalog) {
    const limit = Math.min(Math.max(Number(source.maxItemsPerCatalog) || 5000, 1), 20000);
    const items = [];
    const seenIds = new Set();
    let skip = 0;
    while (items.length < limit) {
      let data;
      try {
        data = await this.fetchJson(this.catalogUrl(source.url, catalog, skip));
      } catch (error) {
        if (skip === 0) throw error;
        try {
          data = await this.fetchJson(this.catalogUrlWithQuerySkip(source.url, catalog, skip));
        } catch {
          break;
        }
      }
      const metas = Array.isArray(data?.metas) ? data.metas : [];
      let added = 0;
      for (const meta of metas) {
        if (!meta?.id || seenIds.has(String(meta.id))) continue;
        seenIds.add(String(meta.id));
        const item = this.metaToItem(meta, source, catalog);
        if (item) { items.push(item); added++; }
        if (items.length >= limit) break;
      }
      if (added === 0 || metas.length < 100 || data?.hasMore === false) break;
      skip += metas.length;
    }
    return items;
  }

  async parseAll({ forceAll = false, defaultIntervalMinutes = 180 } = {}) {
    const items = [];
    for (const source of this.getSources()) {
      if (!source?.url || source.paused === true) continue;
      const stateKey = `stremio:${source.id}`;
      const intervalMinutes = Math.min(Math.max(
        Number(source.syncIntervalMinutes) || Number(defaultIntervalMinutes) || 180,
        5
      ), 43200);
      if (!forceAll && !this.db.isSourceDue(stateKey, intervalMinutes)) continue;
      const startedAt = this.db.beginSourceSync(stateKey, 'stremio');
      let fetched = 0;
      let errors = 0;
      for (const catalog of source.catalogs || []) {
        if (catalog.enabled === false || catalog.supported === false || !['movie', 'series'].includes(catalog.type)) continue;
        try {
          const catalogItems = await this.fetchCatalog(source, catalog);
          fetched += catalogItems.length;
          items.push(...catalogItems);
          this.db.recordFeedSuccess(this.sourceKey(source.id, catalog));
        } catch (error) {
          errors++;
          this.db.recordFeedError(this.sourceKey(source.id, catalog), error.message, error.response?.status || null);
        }
      }
      if (errors > 0 && fetched === 0) {
        this.db.failSourceSync(stateKey, {
          sourceKind: 'stremio',
          startedAt,
          errorMessage: `${errors} catalogue(s) indisponible(s)`
        });
      } else {
        this.db.finishSourceSync(stateKey, {
          sourceKind: 'stremio',
          startedAt,
          itemsFetched: fetched,
          quotaLimit: Number(source.maxItemsPerCatalog) || 5000,
          quotaUsed: fetched,
          quotaStatus: fetched >= (Number(source.maxItemsPerCatalog) || 5000) ? 'limit_reached' : 'available'
        });
      }
    }
    return items;
  }
}

module.exports = StremioManifestParser;
