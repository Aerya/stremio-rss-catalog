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
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}${url.search ? '?…' : ''}`;
    } catch {
      return 'URL masquée';
    }
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
        name: String(catalog.name || catalog.id)
      }));
    return {
      name: String(manifest.name || 'Addon Stremio'),
      id: String(manifest.id || ''),
      version: String(manifest.version || ''),
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
    let skip = 0;
    while (items.length < limit) {
      let data;
      try {
        data = await this.fetchJson(this.catalogUrl(source.url, catalog, skip));
      } catch (error) {
        if (skip === 0) throw error;
        break;
      }
      const metas = Array.isArray(data?.metas) ? data.metas : [];
      for (const meta of metas) {
        const item = this.metaToItem(meta, source, catalog);
        if (item) items.push(item);
        if (items.length >= limit) break;
      }
      if (metas.length < 100 || data?.hasMore === false) break;
      skip += metas.length;
    }
    return items;
  }

  async parseAll() {
    const items = [];
    for (const source of this.getSources()) {
      if (!source?.url || source.paused === true) continue;
      for (const catalog of source.catalogs || []) {
        if (catalog.enabled === false) continue;
        try {
          items.push(...await this.fetchCatalog(source, catalog));
        } catch (error) {
          this.db.recordFeedError(this.sourceKey(source.id, catalog), error.message, error.response?.status || null);
        }
      }
    }
    return items;
  }
}

module.exports = StremioManifestParser;
