const axios = require('axios');
const crypto = require('crypto');

class StreamFusionParser {
  constructor(db, axiosConfigFactory, filterTitle = () => true) {
    this.db = db;
    this.axiosConfigFactory = axiosConfigFactory;
    this.filterTitle = filterTitle;
    this.lastPendingCursorKeys = [];
  }

  getSources() {
    try {
      const sources = JSON.parse(this.db.getConfig('streamfusion_sources') || '[]');
      return Array.isArray(sources) ? sources : [];
    } catch {
      return [];
    }
  }

  sourceKey(sourceId) {
    return `streamfusion:${sourceId}`;
  }

  baseUrl(value) {
    const url = new URL(String(value || '').trim());
    if (!/^https?:$/.test(url.protocol)) throw new Error('URL HTTP(S) invalide');
    url.pathname = url.pathname.replace(/\/(?:api\/peer\/private\/export)?\/?$/i, '');
    url.search = '';
    url.hash = '';
    return url.href.replace(/\/$/, '');
  }

  axiosConfig(source, extra = {}) {
    const config = {
      ...(this.axiosConfigFactory ? this.axiosConfigFactory() : {}),
      timeout: 30000,
      maxContentLength: 25 * 1024 * 1024,
      maxBodyLength: 25 * 1024 * 1024
    };
    if (!source.useProxy) {
      delete config.proxy;
      delete config.httpAgent;
      delete config.httpsAgent;
    }
    return { ...config, ...extra };
  }

  signedHeaders(source, body) {
    if (!source.keyId || !source.secret) throw new Error('Peer Key ID et secret StreamFusion requis');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const bodyHash = crypto.createHash('sha256').update(body).digest();
    const message = Buffer.concat([Buffer.from(`${timestamp}.`), bodyHash]);
    const signature = crypto.createHmac('sha256', source.secret).update(message).digest('hex');
    return {
      'Content-Type': 'application/json',
      'X-Peer-Key-Id': source.keyId,
      'X-Peer-Timestamp': timestamp,
      'X-Peer-Signature': signature
    };
  }

  decryptPayload(secret, token) {
    const key = crypto.createHash('sha256').update(`sf-peer-cache-v1:${secret}`).digest();
    const signingKey = key.subarray(0, 16);
    const encryptionKey = key.subarray(16);
    const raw = Buffer.from(String(token).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (raw.length < 73 || raw[0] !== 0x80) throw new Error('Payload Fernet StreamFusion invalide');
    const signed = raw.subarray(0, -32);
    const signature = raw.subarray(-32);
    const expected = crypto.createHmac('sha256', signingKey).update(signed).digest();
    if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) {
      throw new Error('Signature du payload StreamFusion invalide');
    }
    const iv = raw.subarray(9, 25);
    const encrypted = raw.subarray(25, -32);
    const decipher = crypto.createDecipheriv('aes-128-cbc', encryptionKey, iv);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    return JSON.parse(plaintext);
  }

  async exportPage(source, { since = null, cursor = null, limit = 500 } = {}) {
    const payload = {
      ...(since ? { since } : {}),
      ...(cursor ? { cursor } : {}),
      limit: Math.min(Math.max(Number(limit) || 500, 1), 2000)
    };
    const body = JSON.stringify(payload);
    const response = await axios.post(
      `${this.baseUrl(source.url)}/api/peer/private/export`,
      body,
      this.axiosConfig(source, { headers: this.signedHeaders(source, body) })
    );
    if (!response.data?.payload) throw new Error('Réponse StreamFusion invalide');
    const decrypted = this.decryptPayload(source.secret, response.data.payload);
    if (!Array.isArray(decrypted.items)) throw new Error('Export StreamFusion invalide');
    return decrypted;
  }

  rowToItem(source, row) {
    const title = String(row.raw_title || '').trim();
    if (!title || (!row.imdb_id && !row.tmdb_id)) return null;
    if (!this.filterTitle(title)) return null;
    const imdbId = String(row.imdb_id || '').match(/tt\d{5,12}/i)?.[0]?.toLowerCase() || null;
    const tmdbId = /^\d+$/.test(String(row.tmdb_id || '')) ? String(row.tmdb_id) : null;
    const typeValue = String(row.type || row.parsed_data?.type || '').toLowerCase();
    const isSeries = ['series', 'show', 'tv'].includes(typeValue)
      || (row.parsed_data?.season !== null && row.parsed_data?.season !== undefined)
      || (row.parsed_data?.episode !== null && row.parsed_data?.episode !== undefined);
    const year = String(row.parsed_data?.year || '').match(/\b(19|20)\d{2}\b/)?.[0] || null;
    const item = {
      release_name: title,
      indexer_rlz_id: `streamfusion:${row.info_hash}`,
      cleanName: row.parsed_data?.title || title,
      year,
      catalog_type: isSeries ? 'series' : 'films',
      type: isSeries ? 'series' : 'movie',
      tmdb_id: tmdbId,
      source_url: this.sourceKey(source.id),
      source_force: isSeries ? 'series' : 'films',
      quality: row.parsed_data?.quality || row.parsed_data?.resolution || null,
      hash: row.info_hash || null
    };
    if (imdbId) {
      item.direct_meta = {
        imdb_id: imdbId,
        tmdb_id: tmdbId,
        name: row.parsed_data?.title || title,
        year,
        poster: null,
        background: null,
        description: null,
        genres: [],
        vote_average: null,
        original_language: null,
        origin_country: []
      };
    }
    return item;
  }

  async inspect(source) {
    const page = await this.exportPage(source, { limit: 1 });
    return {
      items: page.items.length,
      has_more: Boolean(page.next_cursor),
      fields: Object.keys(page.items[0] || {}).sort()
    };
  }

  async fetchSource(source) {
    const sourceKey = this.sourceKey(source.id);
    const startedAt = this.db.beginSourceSync(sourceKey, 'streamfusion');
    const syncStartedAt = Math.floor(startedAt / 1000);
    const maxItems = Math.min(Math.max(Number(source.maxItemsPerSync) || 10000000, 1), 10000000);
    const pageSize = Math.min(Math.max(Number(source.pageSize) || 1000, 1), 2000);
    const delayMs = Math.min(Math.max(Number(source.requestDelayMs) || 100, 0), 10000);
    const committed = this.db.getSourceSyncState(sourceKey)?.cursor?.committed || {};
    let since = committed.since || null;
    let cursor = committed.cursor || null;
    let nextCursor = cursor;
    const rows = [];

    try {
      while (rows.length < maxItems) {
        const page = await this.exportPage(source, {
          since,
          cursor: nextCursor,
          limit: Math.min(pageSize, maxItems - rows.length)
        });
        rows.push(...page.items);
        nextCursor = page.next_cursor || null;
        if (!nextCursor || rows.length >= maxItems) break;
        if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      const pending = nextCursor
        ? { since, cursor: nextCursor, backfill_complete: false }
        : { since: syncStartedAt, cursor: null, backfill_complete: true };
      this.db.finishSourceSync(sourceKey, {
        sourceKind: 'streamfusion',
        startedAt,
        itemsFetched: rows.length,
        quotaLimit: maxItems,
        quotaUsed: rows.length,
        quotaStatus: nextCursor ? 'limit_reached' : 'available',
        cursor: { committed, pending }
      });
      this.lastPendingCursorKeys.push(sourceKey);
      return rows.map(row => this.rowToItem(source, row)).filter(Boolean);
    } catch (error) {
      this.db.failSourceSync(sourceKey, {
        sourceKind: 'streamfusion',
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
      const interval = Math.min(Math.max(
        Number(source.syncIntervalMinutes) || Number(defaultIntervalMinutes) || 180,
        5
      ), 43200);
      const state = this.db.getSourceSyncState(this.sourceKey(source.id));
      const backfillInProgress = state?.cursor?.committed?.backfill_complete === false
        || Boolean(state?.cursor?.committed?.cursor);
      if (!forceAll && !backfillInProgress && !this.db.isSourceDue(this.sourceKey(source.id), interval)) continue;
      try {
        items.push(...await this.fetchSource(source));
      } catch (error) {
        console.error(`[StreamFusion] Échec de la source ${source.id}: ${error.message}`);
      }
    }
    return items;
  }
}

module.exports = StreamFusionParser;
