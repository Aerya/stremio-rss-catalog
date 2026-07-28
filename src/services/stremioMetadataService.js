const axios = require('axios');

const SUPPORTED_ID = /^(?:tt\d+|kitsu:\d+|mal:\d+|anilist:\d+|anidb:\d+)$/i;

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractYear(meta) {
  const value = meta?.year || meta?.releaseInfo || meta?.released;
  const match = String(value || '').match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : null;
}

function titleScore(expected, candidate) {
  const left = normalizeTitle(expected);
  const right = normalizeTitle(candidate);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftTokens = new Set(left.split(' '));
  const rightTokens = new Set(right.split(' '));
  const common = [...leftTokens].filter(token => rightTokens.has(token)).length;
  return common / Math.max(leftTokens.size, rightTokens.size);
}

class StremioMetadataService {
  constructor(db, getAxiosConfig = () => ({ timeout: 10000 })) {
    this.db = db;
    this.getAxiosConfig = getAxiosConfig;
    this.manifestCache = null;
  }

  isConfigured() {
    return this.db.getConfig('stremio_metadata_enabled') === 'true'
      && /^https?:\/\//i.test(this.db.getConfig('stremio_metadata_manifest_url') || '');
  }

  getManifestUrl() {
    return (this.db.getConfig('stremio_metadata_manifest_url') || '').trim();
  }

  async loadManifest() {
    const url = this.getManifestUrl();
    const now = Date.now();
    if (this.manifestCache?.url === url && now - this.manifestCache.loadedAt < 300000) {
      return this.manifestCache.value;
    }

    const response = await axios.get(url, this.getAxiosConfig());
    if (!response.data || !Array.isArray(response.data.catalogs)) {
      throw new Error('Le manifeste ne contient aucun catalogue de recherche');
    }
    this.manifestCache = { url, loadedAt: now, value: response.data };
    return response.data;
  }

  searchUrl(catalog, title) {
    const url = new URL(this.getManifestUrl());
    if (!/\/manifest\.json$/i.test(url.pathname)) {
      throw new Error('L’URL doit pointer vers un manifest.json');
    }
    const root = url.pathname.replace(/\/manifest\.json$/i, '');
    url.pathname = `${root}/catalog/${encodeURIComponent(catalog.type)}/${encodeURIComponent(catalog.id)}/search=${encodeURIComponent(title)}.json`;
    return url.toString();
  }

  async search(item) {
    if (!this.isConfigured()) return null;

    try {
      const manifest = await this.loadManifest();
      const expectedType = item.type === 'series' ? 'series' : 'movie';
      const catalogs = manifest.catalogs.filter(catalog => {
        if (catalog.type !== expectedType) return false;
        const extras = Array.isArray(catalog.extra) ? catalog.extra : [];
        return extras.some(extra => extra?.name === 'search');
      });

      for (const catalog of catalogs) {
        const response = await axios.get(this.searchUrl(catalog, item.cleanName), this.getAxiosConfig());
        const metas = response.data?.metas || response.data?.metasDetailed || [];
        const ranked = metas
          .map(meta => ({
            meta,
            score: titleScore(item.cleanName, meta.name),
            year: extractYear(meta)
          }))
          .filter(entry => SUPPORTED_ID.test(String(entry.meta?.id || '')))
          .filter(entry => !item.year || !entry.year || Math.abs(Number(item.year) - Number(entry.year)) <= 1)
          .sort((a, b) => b.score - a.score);
        const best = ranked[0];
        if (!best || best.score < 0.6) continue;

        const meta = best.meta;
        return {
          imdb_id: String(meta.id),
          tmdb_id: meta.tmdb_id ? String(meta.tmdb_id) : null,
          name: meta.name || item.cleanName,
          year: best.year || item.year || null,
          poster: meta.poster || null,
          background: meta.background || null,
          description: meta.description || null,
          genres: Array.isArray(meta.genres) ? meta.genres : [],
          vote_average: Number(meta.imdbRating || meta.vote_average) || null,
          original_language: null,
          origin_country: [],
          identification_provider: manifest.name || 'Stremio metadata'
        };
      }
    } catch (error) {
      console.error(`[Métadonnées Stremio] Recherche impossible pour "${item.cleanName}":`, error.message);
    }
    return null;
  }
}

module.exports = StremioMetadataService;
