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

  sourceKey(id) {
    return `guide:mdblist:${id}`;
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

  async fetchItems(source, { maxItems = null } = {}) {
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

  async inspect(source) {
    if (!String(source.apiKey || '').trim()) throw new Error('Clé API MDBList requise');
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
    const startedAt = this.db.beginSourceSync(sourceKey, 'mdblist');
    try {
      const result = await this.fetchItems(source);
      const stats = this.db.replaceGuideItems(source.id, result.items);
      this.db.finishSourceSync(sourceKey, {
        sourceKind: 'mdblist',
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
        sourceKind: 'mdblist',
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
