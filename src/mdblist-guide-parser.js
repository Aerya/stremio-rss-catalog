const axios = require('axios');

class MDBListGuideParser {
  constructor(db, getAxiosConfig) {
    this.db = db;
    this.getAxiosConfig = getAxiosConfig;
  }

  getSources() {
    try {
      const values = JSON.parse(this.db.getConfig('mdblist_guides') || '[]');
      return Array.isArray(values) ? values : [];
    } catch {
      return [];
    }
  }

  sourceKey(id, kind = null) {
    const source = this.getSources().find(item => item.id === id);
    return `guide:${kind || source?.kind || 'mdblist'}:${id}`;
  }

  baseUrl(value) {
    const url = new URL(String(value || '').trim());
    if (!/^https?:$/.test(url.protocol)) throw new Error('URL HTTP(S) invalide');
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
  }

  parseListReference(value) {
    const raw = String(value || '').trim();
    if (/^\d+$/.test(raw)) return { kind: 'id', id: raw };
    let url;
    try {
      url = new URL(raw);
    } catch {
      throw new Error('Adresse ou identifiant MDBList invalide');
    }
    if (!/(^|\.)mdblist\.com$/i.test(url.hostname)) {
      throw new Error('Cette adresse ne correspond pas à une liste MDBList');
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'lists' || parts.length < 3) {
      throw new Error('Utilisez une adresse de liste MDBList complète');
    }
    return {
      kind: 'slug',
      username: decodeURIComponent(parts[1]),
      listname: decodeURIComponent(parts[2])
    };
  }

  itemsUrl(reference) {
    if (reference.kind === 'id') {
      return `https://api.mdblist.com/lists/${encodeURIComponent(reference.id)}/items`;
    }
    return `https://api.mdblist.com/lists/${encodeURIComponent(reference.username)}/${encodeURIComponent(reference.listname)}/items`;
  }

  async fetchMDBListItems(source, { maxItems = null } = {}) {
    const reference = this.parseListReference(source.url || source.listId);
    const limit = Math.min(Math.max(Number(maxItems || source.maxItems) || 5000, 1), 50000);
    const pageSize = Math.min(limit, 1000);
    const seen = new Set();
    const items = [];
    let cursor = null;
    let quota = {};

    while (items.length < limit) {
      const response = await axios.get(this.itemsUrl(reference), {
        ...this.getAxiosConfig(),
        params: {
          apikey: source.apiKey,
          limit: Math.min(pageSize, limit - items.length),
          ...(cursor ? { cursor } : {})
        }
      });
      quota = {
        limit: Number(response.headers['x-ratelimit-limit']) || null,
        remaining: Number(response.headers['x-ratelimit-remaining']) || null
      };
      const data = response.data || {};
      const page = [
        ...(Array.isArray(data.movies) ? data.movies : []),
        ...(Array.isArray(data.shows) ? data.shows : [])
      ].map((item, index) => ({
        media_type: item.mediatype === 'show' ? 'show' : 'movie',
        imdb_id: item.imdb_id || item.ids?.imdb || null,
        tmdb_id: item.ids?.tmdb ?? item.tmdb_id ?? item.id ?? null,
        title: item.title || null,
        year: item.release_year ?? null,
        rank: Number(item.rank) || (items.length + index + 1)
      })).sort((a, b) => a.rank - b.rank);

      for (const item of page) {
        const identity = item.imdb_id || (item.tmdb_id ? `tmdb:${item.tmdb_id}:${item.media_type}` : null);
        if (!identity || seen.has(identity)) continue;
        seen.add(identity);
        items.push({ ...item, position: items.length });
        if (items.length >= limit) break;
      }

      const nextCursor = data.pagination?.next_cursor || data.next_cursor || response.headers['x-next-cursor'];
      const hasMore = String(response.headers['x-has-more'] || '').toLowerCase() === 'true';
      if (!nextCursor || (!hasMore && page.length === 0)) break;
      if (nextCursor === cursor) break;
      cursor = nextCursor;
    }

    return {
      items,
      truncated: items.length >= limit,
      quota
    };
  }

  async fetchListSyncItems(source, { maxItems = null } = {}) {
    if (!source.listType || !source.listId) {
      throw new Error('Type et identifiant de liste ListSync requis');
    }
    const limit = Math.min(Math.max(Number(maxItems || source.maxItems) || 100, 1), 100);
    const url = `${this.baseUrl(source.url)}/api/lists/${encodeURIComponent(source.listType)}/${encodeURIComponent(source.listId)}/items`;
    const response = await axios.get(url, {
      ...this.getAxiosConfig(),
      params: { limit }
    });
    const rows = Array.isArray(response.data?.items) ? response.data.items : [];
    return {
      items: rows.map((item, index) => ({
        media_type: ['show', 'tv', 'series'].includes(String(item.media_type || item.type).toLowerCase())
          ? 'show'
          : 'movie',
        imdb_id: item.imdb_id || item.imdbId || null,
        tmdb_id: item.tmdb_id ?? item.tmdbId ?? null,
        title: item.title || item.name || null,
        year: item.year ?? item.release_year ?? null,
        position: index
      })).filter(item => item.imdb_id || item.tmdb_id),
      truncated: Boolean(response.data?.has_more),
      quota: {}
    };
  }

  async suggestArrToken(source) {
    if (source.accessToken) return source.accessToken;
    if (!source.username || !source.password) {
      throw new Error('Identifiant et mot de passe SuggestArr requis');
    }
    const response = await axios.post(
      `${this.baseUrl(source.url)}/api/auth/login`,
      { username: source.username, password: source.password },
      this.getAxiosConfig()
    );
    if (!response.data?.access_token) throw new Error('SuggestArr n’a pas renvoyé de jeton d’accès');
    return response.data.access_token;
  }

  async fetchSuggestArrItems(source, { maxItems = null } = {}) {
    const limit = Math.min(Math.max(Number(maxItems || source.maxItems) || 500, 1), 5000);
    const token = await this.suggestArrToken(source);
    const statuses = Array.isArray(source.statuses) && source.statuses.length
      ? source.statuses
      : ['awaiting_approval'];
    const allowed = new Set(['awaiting_approval', 'queued', 'submitting', 'submitted', 'rejected', 'failed']);
    const items = [];
    const seen = new Set();

    for (const status of statuses.filter(value => allowed.has(value))) {
      let page = 1;
      let pages = 1;
      while (page <= pages && items.length < limit) {
        const response = await axios.get(`${this.baseUrl(source.url)}/api/jobs/suggestions`, {
          ...this.getAxiosConfig(),
          headers: {
            ...(this.getAxiosConfig().headers || {}),
            Authorization: `Bearer ${token}`
          },
          params: {
            status,
            page,
            per_page: Math.min(100, limit - items.length)
          }
        });
        const data = response.data || {};
        const rows = Array.isArray(data.items) ? data.items : [];
        for (const item of rows) {
          const mediaType = String(item.media_type || '').toLowerCase();
          const identity = `${mediaType}:${item.tmdb_id}`;
          if (!item.tmdb_id || seen.has(identity)) continue;
          seen.add(identity);
          items.push({
            media_type: mediaType === 'tv' ? 'show' : 'movie',
            imdb_id: item.imdb_id || null,
            tmdb_id: item.tmdb_id,
            title: item.title || null,
            year: String(item.release_date || '').match(/^\d{4}/)?.[0] || null,
            position: items.length
          });
          if (items.length >= limit) break;
        }
        pages = Math.max(1, Number(data.pages) || 1);
        if (!rows.length) break;
        page++;
      }
    }
    return { items, truncated: items.length >= limit, quota: {} };
  }

  agregarrConfig(source) {
    return {
      ...this.getAxiosConfig(),
      timeout: 30000,
      headers: {
        ...(this.getAxiosConfig().headers || {}),
        'X-Api-Key': source.apiKey
      }
    };
  }

  async listAgregarrCollections(source) {
    if (!String(source.apiKey || '').trim()) throw new Error('Clé API Agregarr requise');
    const response = await axios.get(
      `${this.baseUrl(source.url)}/api/v1/collections`,
      this.agregarrConfig(source)
    );
    const rows = Array.isArray(response.data?.collectionConfigs)
      ? response.data.collectionConfigs
      : [];
    return rows.map((collection, index) => ({
      id: String(collection.id || collection.collectionId || index),
      name: collection.name || collection.title || collection.customTitle || `Collection ${index + 1}`,
      type: collection.type || null,
      media_type: collection.mediaType || collection.libraryType || null,
      config: collection
    }));
  }

  async fetchAgregarrItems(source, { maxItems = null } = {}) {
    if (!source.listId) throw new Error('Collection Agregarr requise');
    const collections = await this.listAgregarrCollections(source);
    const selected = collections.find(collection => collection.id === String(source.listId));
    if (!selected) throw new Error('Collection Agregarr introuvable');
    const limit = Math.min(Math.max(Number(maxItems || source.maxItems) || 5000, 1), 50000);
    const started = await axios.post(
      `${this.baseUrl(source.url)}/api/v1/collections/preview`,
      { ...selected.config, maxItems: limit },
      this.agregarrConfig(source)
    );
    const sessionId = started.data?.sessionId;
    if (!sessionId) throw new Error('Agregarr n’a pas renvoyé de session d’aperçu');

    const deadline = Date.now() + 180000;
    let status;
    do {
      if (Date.now() >= deadline) throw new Error('Délai dépassé pendant l’aperçu Agregarr');
      const response = await axios.get(
        `${this.baseUrl(source.url)}/api/v1/collections/preview/status/${encodeURIComponent(sessionId)}`,
        this.agregarrConfig(source)
      );
      status = response.data || {};
      if (status.error) throw new Error(status.error);
      if (!status.completed) await new Promise(resolve => setTimeout(resolve, 500));
    } while (!status.completed);

    const rows = Array.isArray(status.result?.items) ? status.result.items : [];
    return {
      items: rows.slice(0, limit).map((item, index) => ({
        media_type: String(item.mediaType).toLowerCase() === 'tv' ? 'show' : 'movie',
        imdb_id: item.imdbId || null,
        tmdb_id: item.tmdbId ?? null,
        title: item.title || null,
        year: item.year ?? null,
        position: index
      })).filter(item => item.imdb_id || item.tmdb_id),
      truncated: rows.length > limit,
      quota: {}
    };
  }

  async fetchItems(source, options = {}) {
    const kind = source.kind || 'mdblist';
    if (kind === 'listsync') return this.fetchListSyncItems(source, options);
    if (kind === 'suggestarr') return this.fetchSuggestArrItems(source, options);
    if (kind === 'agregarr') return this.fetchAgregarrItems(source, options);
    return this.fetchMDBListItems(source, options);
  }

  async inspect(source) {
    if ((source.kind || 'mdblist') === 'mdblist' && !String(source.apiKey || '').trim()) {
      throw new Error('Clé API MDBList requise');
    }
    if (source.kind === 'agregarr' && !source.listId) {
      const collections = await this.listAgregarrCollections(source);
      return { collections: collections.map(({ config, ...collection }) => collection) };
    }
    const result = await this.fetchItems(source, {
      maxItems: Math.min(Number(source.maxItems) || 100, 100)
    });
    return {
      items: result.items.length,
      movies: result.items.filter(item => item.media_type === 'movie').length,
      shows: result.items.filter(item => item.media_type === 'show').length,
      sample: result.items.slice(0, 5),
      truncated: result.truncated,
      quota: result.quota
    };
  }

  async syncSource(source) {
    const sourceKey = this.sourceKey(source.id);
    const sourceKind = source.kind || 'mdblist';
    const startedAt = this.db.beginSourceSync(sourceKey, sourceKind);
    try {
      const result = await this.fetchItems(source);
      const stats = this.db.replaceGuideItems(source.id, result.items);
      this.db.finishSourceSync(sourceKey, {
        sourceKind,
        startedAt,
        itemsFetched: result.items.length,
        quotaLimit: result.quota.limit,
        quotaUsed: result.quota.limit !== null && result.quota.remaining !== null
          ? Math.max(0, result.quota.limit - result.quota.remaining)
          : null,
        quotaStatus: result.quota.remaining === null ? null : `${result.quota.remaining} requêtes restantes`,
        cursor: { count: result.items.length, truncated: result.truncated }
      });
      return { updated: true, stats };
    } catch (error) {
      this.db.failSourceSync(sourceKey, {
        sourceKind,
        startedAt,
        errorMessage: error.message,
        httpStatus: error.response?.status || null
      });
      throw error;
    }
  }

  async syncAll({ forceAll = false, defaultIntervalMinutes = 180 } = {}) {
    let updated = 0;
    const errors = [];
    for (const source of this.getSources()) {
      if (source.paused) continue;
      const interval = Math.min(Math.max(
        Number(source.syncIntervalMinutes) || Number(defaultIntervalMinutes) || 180,
        5
      ), 43200);
      if (!forceAll && !this.db.isSourceDue(this.sourceKey(source.id), interval)) continue;
      try {
        const result = await this.syncSource(source);
        if (result.updated) updated++;
      } catch (error) {
        errors.push({ id: source.id, error: error.message });
      }
    }
    return { updated, errors };
  }
}

module.exports = MDBListGuideParser;
