const axios = require('axios');
const crypto = require('crypto');

class WaCustomParser {
  constructor(db, axiosConfigFactory, filterTitle = () => true) {
    this.db = db;
    this.axiosConfigFactory = axiosConfigFactory;
    this.filterTitle = filterTitle;
    this.lastPendingCursorKeys = [];
  }

  getSources() {
    try {
      const sources = JSON.parse(this.db.getConfig('wacustom_sources') || '[]');
      return Array.isArray(sources) ? sources : [];
    } catch {
      return [];
    }
  }

  sourceKey(sourceId) {
    return `wacustom:${sourceId}`;
  }

  baseUrl(value) {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/(?:admin\/login|admin\/api\/wasource)?\/?$/i, '');
    url.search = '';
    url.hash = '';
    return url.href.replace(/\/$/, '');
  }

  axiosConfig(extra = {}) {
    return {
      ...(this.axiosConfigFactory ? this.axiosConfigFactory() : {}),
      maxContentLength: 25 * 1024 * 1024,
      maxBodyLength: 25 * 1024 * 1024,
      ...extra
    };
  }

  async authenticate(source) {
    if (!source.adminPassword) throw new Error('Mot de passe administrateur WaCustom manquant');
    const response = await axios.post(
      `${this.baseUrl(source.url)}/admin/login`,
      { password: source.adminPassword },
      this.axiosConfig({ validateStatus: status => status >= 200 && status < 500 })
    );
    if (response.status !== 200) {
      const error = new Error(response.data?.error || `Authentification WaCustom refusée (HTTP ${response.status})`);
      error.response = response;
      throw error;
    }
    const cookies = Array.isArray(response.headers['set-cookie']) ? response.headers['set-cookie'] : [];
    const adminCookie = cookies.map(cookie => cookie.split(';', 1)[0])
      .find(cookie => cookie.startsWith('admin_token='));
    if (!adminCookie) throw new Error('WaCustom n’a pas renvoyé de session administrateur');
    return adminCookie;
  }

  async fetchPage(source, cookie, { limit = 1000, offset = 0 } = {}) {
    const response = await axios.get(`${this.baseUrl(source.url)}/admin/api/wasource`, this.axiosConfig({
      headers: { Cookie: cookie },
      params: { limit, offset }
    }));
    if (!response.data || !Array.isArray(response.data.contents)) {
      throw new Error('Réponse WaCustom invalide');
    }
    return response.data;
  }

  rowToItem(source, row) {
    const imdbId = String(row?.imdb_id || '').match(/tt\d{5,12}/i)?.[0]?.toLowerCase();
    if (!imdbId || !row?.title) return null;
    const isSeries = row.season !== null && row.season !== undefined;
    const releaseNames = (Array.isArray(row.releases) ? row.releases : [])
      .map(release => release?.release_name)
      .filter(Boolean);
    const releaseName = (releaseNames.length ? releaseNames : [String(row.title)])
      .find(candidate => this.filterTitle(candidate));
    if (!releaseName) return null;
    const identity = crypto.createHash('sha256')
      .update(`${source.id}|${row.id}|${row.updated_at || row.created_at || ''}`)
      .digest('hex').slice(0, 32);
    return {
      release_name: releaseName,
      indexer_rlz_id: `wacustom:${identity}`,
      cleanName: String(row.title),
      year: /^\d{4}$/.test(String(row.year || '')) ? String(row.year) : null,
      catalog_type: isSeries ? 'series' : 'films',
      type: isSeries ? 'series' : 'movie',
      tmdb_id: /^\d+$/.test(String(row.tmdb_id || '')) ? String(row.tmdb_id) : null,
      source_url: this.sourceKey(source.id),
      source_force: isSeries ? 'series' : 'films',
      quality: null,
      hash: null,
      direct_meta: {
        imdb_id: imdbId,
        tmdb_id: /^\d+$/.test(String(row.tmdb_id || '')) ? String(row.tmdb_id) : null,
        name: String(row.title),
        year: /^\d{4}$/.test(String(row.year || '')) ? String(row.year) : null,
        poster: null,
        background: null,
        description: null,
        genres: [],
        vote_average: null,
        original_language: null,
        origin_country: []
      }
    };
  }

  async inspect(source) {
    const cookie = await this.authenticate(source);
    const data = await this.fetchPage(source, cookie, { limit: 1, offset: 0 });
    return {
      total: Number(data.total) || 0,
      fields: Object.keys(data.contents[0] || {}).sort()
    };
  }

  async fetchSource(source) {
    const sourceKey = this.sourceKey(source.id);
    const startedAt = this.db.beginSourceSync(sourceKey, 'wacustom');
    const maxItems = Math.min(Math.max(Number(source.maxItemsPerSync) || 10000000, 1), 10000000);
    const pageSize = Math.min(Math.max(Number(source.pageSize) || 1000, 10), 5000);
    const delayMs = Math.min(Math.max(Number(source.requestDelayMs) || 250, 0), 10000);
    const previousState = this.db.getSourceSyncState(sourceKey);
    const storedCursor = previousState?.cursor || {};
    const committed = storedCursor.committed || {};
    let offset = committed.backfill_complete
      ? 0
      : Math.max(Number(committed.backfill_offset) || 0, 0);
    const initialOffset = offset;
    let total = null;
    let fetchedRaw = 0;
    const items = [];

    try {
      const cookie = await this.authenticate(source);
      while (fetchedRaw < maxItems) {
        const limit = Math.min(pageSize, maxItems - fetchedRaw);
        const page = await this.fetchPage(source, cookie, { limit, offset });
        total = Number(page.total) || 0;
        fetchedRaw += page.contents.length;
        offset += page.contents.length;
        for (const row of page.contents) {
          const item = this.rowToItem(source, row);
          if (item) items.push(item);
        }
        if (!page.contents.length || page.contents.length < limit || offset >= total || fetchedRaw >= maxItems) break;
        if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      const backfillComplete = Boolean(committed.backfill_complete)
        || (total !== null && offset >= total);
      const pendingCursor = {
        backfill_complete: backfillComplete,
        backfill_offset: backfillComplete ? 0 : Math.max(offset, initialOffset),
        total_at_sync: total,
        updated_at: Date.now()
      };
      this.db.finishSourceSync(sourceKey, {
        sourceKind: 'wacustom',
        startedAt,
        itemsFetched: fetchedRaw,
        quotaLimit: maxItems,
        quotaUsed: fetchedRaw,
        quotaStatus: fetchedRaw >= maxItems && total > fetchedRaw ? 'limit_reached' : 'available',
        cursor: { committed, pending: pendingCursor }
      });
      this.lastPendingCursorKeys.push(sourceKey);
      return items;
    } catch (error) {
      this.db.failSourceSync(sourceKey, {
        sourceKind: 'wacustom',
        startedAt,
        errorMessage: error.message,
        httpStatus: error.response?.status || null
      });
      throw error;
    }
  }

  async parseAll({ forceAll = false, defaultIntervalMinutes = 180 } = {}) {
    const items = [];
    this.lastPendingCursorKeys = [];
    for (const source of this.getSources()) {
      if (source.paused) continue;
      const intervalMinutes = Math.min(Math.max(
        Number(source.syncIntervalMinutes) || Number(defaultIntervalMinutes) || 180,
        5
      ), 43200);
      const sourceKey = this.sourceKey(source.id);
      const state = this.db.getSourceSyncState(sourceKey);
      const backfillInProgress = state?.cursor?.committed?.backfill_complete === false;
      if (!forceAll && !backfillInProgress && !this.db.isSourceDue(sourceKey, intervalMinutes)) continue;
      try {
        items.push(...await this.fetchSource(source));
      } catch (error) {
        this.db.recordFeedError(sourceKey, error.message, error.response?.status || null);
        console.error(`[WaCustom] Échec de la source ${source.id}: ${error.message}`);
      }
    }
    return items;
  }
}

module.exports = WaCustomParser;
