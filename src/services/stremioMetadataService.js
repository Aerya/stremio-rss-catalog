const axios = require('axios');
const crypto = require('crypto');

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
    this.manifestCache = new Map();
  }

  getSources() {
    let configured = [];
    try {
      const parsed = JSON.parse(this.db.getConfig('stremio_metadata_sources') || '[]');
      if (Array.isArray(parsed)) configured = parsed;
    } catch {
      configured = [];
    }
    if (!configured.length
        && this.db.getConfig('stremio_metadata_enabled') === 'true'
        && /^https?:\/\//i.test(this.db.getConfig('stremio_metadata_manifest_url') || '')) {
      configured = [{
        id: 'legacy',
        name: 'Addon de métadonnées',
        url: this.db.getConfig('stremio_metadata_manifest_url'),
        paused: false,
        priority: 100,
        useProxy: true
      }];
    }
    return configured
      .filter(source => source && /^https?:\/\//i.test(source.url || ''))
      .sort((left, right) => (Number(left.priority) || 100) - (Number(right.priority) || 100));
  }

  isConfigured() {
    return this.getSources().some(source => !source.paused);
  }

  normalizeSource(source) {
    const url = new URL(String(source.url || '').trim());
    if (!/\/manifest\.json$/i.test(url.pathname)) {
      throw new Error('L’URL doit pointer vers un manifest.json');
    }
    return {
      ...source,
      id: source.id || crypto.randomUUID(),
      name: String(source.name || '').trim() || 'Addon de métadonnées',
      url: url.toString(),
      priority: Math.min(Math.max(Number(source.priority) || 100, 1), 9999),
      paused: Boolean(source.paused),
      useProxy: source.useProxy !== false
    };
  }

  requestConfig(source) {
    const config = { ...this.getAxiosConfig(), timeout: 15000 };
    if (!source.useProxy) {
      delete config.proxy;
      delete config.httpAgent;
      delete config.httpsAgent;
    }
    return config;
  }

  async loadManifest(source, { force = false } = {}) {
    const normalized = this.normalizeSource(source);
    const url = normalized.url;
    const now = Date.now();
    const cached = this.manifestCache.get(url);
    if (!force && cached && now - cached.loadedAt < 300000) {
      return cached.value;
    }

    const response = await axios.get(url, this.requestConfig(normalized));
    if (!response.data || !Array.isArray(response.data.catalogs)) {
      throw new Error('Le manifeste ne contient aucun catalogue de recherche');
    }
    const searchable = response.data.catalogs.filter(catalog =>
      ['movie', 'series'].includes(catalog.type)
      && Array.isArray(catalog.extra)
      && catalog.extra.some(extra => extra?.name === 'search')
    );
    if (!searchable.length) {
      throw new Error('Le manifeste ne contient aucun catalogue Films/Séries avec recherche');
    }
    this.manifestCache.set(url, { loadedAt: now, value: response.data });
    return response.data;
  }

  searchUrl(source, catalog, title) {
    const url = new URL(source.url);
    const root = url.pathname.replace(/\/manifest\.json$/i, '');
    url.pathname = `${root}/catalog/${encodeURIComponent(catalog.type)}/${encodeURIComponent(catalog.id)}/search=${encodeURIComponent(title)}.json`;
    return url.toString();
  }

  async inspect(source) {
    const normalized = this.normalizeSource(source);
    const manifest = await this.loadManifest(normalized, { force: true });
    const catalogs = manifest.catalogs
      .filter(catalog => ['movie', 'series'].includes(catalog.type))
      .filter(catalog => (catalog.extra || []).some(extra => extra?.name === 'search'))
      .map(catalog => ({ id: catalog.id, type: catalog.type, name: catalog.name || catalog.id }));
    return {
      name: manifest.name || normalized.name,
      id: manifest.id || null,
      version: manifest.version || null,
      catalogs
    };
  }

  async search(item) {
    if (!this.isConfigured()) return null;

    for (const source of this.getSources().filter(entry => !entry.paused)) {
      try {
        const manifest = await this.loadManifest(source);
        const expectedType = item.type === 'series' ? 'series' : 'movie';
        const catalogs = manifest.catalogs.filter(catalog => {
          if (catalog.type !== expectedType) return false;
          const extras = Array.isArray(catalog.extra) ? catalog.extra : [];
          return extras.some(extra => extra?.name === 'search');
        });

        for (const catalog of catalogs) {
          const response = await axios.get(
            this.searchUrl(this.normalizeSource(source), catalog, item.cleanName),
            this.requestConfig(source)
          );
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
            identification_provider: source.name || manifest.name || 'Stremio metadata'
          };
        }
      } catch (error) {
        console.error(`[Métadonnées Stremio] ${source.name || source.id} — recherche impossible pour "${item.cleanName}":`, error.message);
      }
    }
    return null;
  }
}

module.exports = StremioMetadataService;
