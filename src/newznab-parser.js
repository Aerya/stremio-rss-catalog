const axios = require('axios');
const xml2js = require('xml2js');

class NewznabParser {
  constructor(db, axiosConfigFactory, parseItems) {
    this.db = db;
    this.axiosConfigFactory = axiosConfigFactory;
    this.parseItems = parseItems;
  }

  getSources() {
    try {
      const sources = JSON.parse(this.db.getConfig('newznab_sources') || '[]');
      return Array.isArray(sources) ? sources : [];
    } catch {
      return [];
    }
  }

  sourceKey(sourceId, mediaType) {
    const source = this.getSources().find(item => item.id === sourceId);
    const kind = ['newznab', 'prowlarr', 'jackett', 'nzbhydra2'].includes(source?.kind) ? source.kind : 'newznab';
    return `${kind}:${sourceId}:${mediaType}`;
  }

  scheduleKey(source) {
    const kind = ['newznab', 'prowlarr', 'jackett', 'nzbhydra2'].includes(source?.kind) ? source.kind : 'newznab';
    return `${kind}:${source.id}`;
  }

  buildUrl(source, params) {
    const url = new URL(source.url);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    url.searchParams.set('apikey', source.apiKey);
    return url.href;
  }

  async fetchXml(source, params) {
    try {
      const response = await axios.get(this.buildUrl(source, params), {
        ...(this.axiosConfigFactory ? this.axiosConfigFactory() : {}),
        responseType: 'text',
        maxContentLength: 25 * 1024 * 1024,
        maxBodyLength: 25 * 1024 * 1024,
        transformResponse: [data => data]
      });
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);
      const apiError = result?.error?.$;
      if (apiError) throw new Error(apiError.description || `Erreur API ${apiError.code || ''}`.trim());
      return result;
    } catch (error) {
      const status = error.response?.status;
      const label = source.kind === 'jackett' ? 'Jackett'
        : source.kind === 'prowlarr' ? 'Prowlarr'
          : source.kind === 'nzbhydra2' ? 'NZBHydra2'
            : 'Newznab';
      throw new Error(status ? `API ${label} indisponible (HTTP ${status})` : error.message);
    }
  }

  collectCategories(node, output = []) {
    if (!node || typeof node !== 'object') return output;
    if (node.$?.id) output.push({ id: String(node.$.id), name: String(node.$.name || node.$.id) });
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(item => this.collectCategories(item, output));
      else if (value && typeof value === 'object') this.collectCategories(value, output);
    }
    return output;
  }

  async inspect(source) {
    const result = await this.fetchXml(source, { t: 'caps' });
    const caps = result?.caps || {};
    const limits = caps.limits?.$ || {};
    const categories = this.collectCategories(caps.categories || {});
    return {
      serverMax: Math.min(Math.max(Number(limits.max) || 100, 1), 1000),
      serverDefault: Math.min(Math.max(Number(limits.default) || 100, 1), 1000),
      categories: [...new Map(categories.map(category => [category.id, category])).values()]
    };
  }

  responseData(result) {
    const channel = result?.rss?.channel || {};
    const rawItems = !channel.item ? [] : (Array.isArray(channel.item) ? channel.item : [channel.item]);
    const response = channel['newznab:response']?.$ || channel['torznab:response']?.$ || {};
    return {
      items: rawItems,
      total: Number.isFinite(Number(response.total)) ? Number(response.total) : null
    };
  }

  itemId(item) {
    const value = typeof item?.guid === 'object' ? item.guid._ : (item?.guid || item?.link || item?.title);
    return value ? String(value) : null;
  }

  itemPublishedAt(item) {
    const value = item?.pubDate || item?.published || item?.updated;
    const timestamp = value ? Date.parse(String(value)) : NaN;
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  itemAttributes(item) {
    const attrs = [
      ...(!item?.['newznab:attr'] ? [] : (Array.isArray(item['newznab:attr']) ? item['newznab:attr'] : [item['newznab:attr']])),
      ...(!item?.['torznab:attr'] ? [] : (Array.isArray(item['torznab:attr']) ? item['torznab:attr'] : [item['torznab:attr']]))
    ];
    return Object.fromEntries(attrs
      .filter(attr => attr?.$?.name)
      .map(attr => [String(attr.$.name).toLowerCase(), attr.$.value]));
  }

  normalizeImdbId(value) {
    if (!value) return null;
    const match = String(value).match(/(?:tt)?(\d{7,10})/i);
    return match ? `tt${match[1]}` : null;
  }

  enrichParsedItems(rawItems, parsedItems) {
    const byId = new Map();
    for (const item of rawItems) {
      const id = typeof item.guid === 'object' ? item.guid._ : (item.guid || item.link);
      if (id) byId.set(String(id), item);
    }
    return parsedItems.map(item => {
      const raw = byId.get(String(item.indexer_rlz_id));
      const attrs = this.itemAttributes(raw);
      const imdbId = this.normalizeImdbId(attrs.imdb || attrs.imdbid);
      const tmdbId = /^\d+$/.test(String(attrs.tmdbid || attrs.tmdb || ''))
        ? String(attrs.tmdbid || attrs.tmdb)
        : null;
      if (!imdbId) return tmdbId ? { ...item, tmdb_id: tmdbId } : item;
      return {
        ...item,
        ...(tmdbId ? { tmdb_id: tmdbId } : {}),
        direct_meta: {
          imdb_id: imdbId,
          name: item.cleanName,
          year: item.year,
          poster: null,
          background: null,
          description: null,
          genres: [],
          vote_average: null,
          original_language: null,
          origin_country: []
        }
      };
    });
  }

  async fetchCategory(source, mediaType, categoryIds, capabilities = null) {
    const force = mediaType === 'series' ? 'series' : 'films';
    const sourceKey = this.sourceKey(source.id, mediaType);
    const startedAt = this.db.beginSourceSync(sourceKey, source.kind || 'newznab');
    const caps = capabilities || await this.inspect(source);
    const requestedPageSize = Math.min(Math.max(Number(source.pageSize) || caps.serverMax, 1), 1000);
    const pageSize = Math.min(requestedPageSize, caps.serverMax);
    const maxItems = Math.min(Math.max(Number(source.maxItemsPerCategory) || 10000000, 1), 10000000);
    const delayMs = Math.min(Math.max(Number(source.requestDelayMs) || 750, 250), 10000);
    const parsed = [];
    const seen = new Set();
    const previousState = this.db.getSourceSyncState(sourceKey);
    const storedCursor = previousState?.cursor || {};
    const previousCursor = storedCursor.committed || (
      Array.isArray(storedCursor.recent_ids) ? storedCursor : {}
    );
    const knownIds = new Set(Array.isArray(previousCursor.recent_ids) ? previousCursor.recent_ids.map(String) : []);
    const lookbackHours = Math.min(Math.max(Number(source.lookbackHours) || 24, 1), 24 * 30);
    const oldestUsefulTimestamp = previousCursor.newest_published_at
      ? Number(previousCursor.newest_published_at) - lookbackHours * 60 * 60 * 1000
      : null;
    const fetchedIds = [];
    let newestPublishedAt = Number(previousCursor.newest_published_at) || null;
    let fetchedRaw = 0;
    let cursorReached = false;
    let offset = 0;

    try {
      while (fetchedRaw < maxItems) {
        const limit = Math.min(pageSize, maxItems - fetchedRaw);
        const result = await this.fetchXml(source, {
          t: 'search',
          cat: categoryIds,
          extended: 1,
          offset,
          limit
        });
        const page = this.responseData(result);
        fetchedRaw += page.items.length;
        const uniqueItems = page.items.filter(item => {
          const id = this.itemId(item);
          if (!id || seen.has(id)) return false;
          seen.add(id);
          fetchedIds.push(id);
          const publishedAt = this.itemPublishedAt(item);
          if (publishedAt && (!newestPublishedAt || publishedAt > newestPublishedAt)) {
            newestPublishedAt = publishedAt;
          }
          if (knownIds.has(id)) cursorReached = true;
          return !knownIds.has(id);
        });

        if (uniqueItems.length) {
          const pageItems = this.parseItems(uniqueItems, force, sourceKey);
          parsed.push(...this.enrichParsedItems(uniqueItems, pageItems));
        }
        offset += page.items.length;
        const pageDates = page.items.map(item => this.itemPublishedAt(item)).filter(Boolean);
        const pageIsOlderThanWindow = oldestUsefulTimestamp && pageDates.length
          && Math.max(...pageDates) < oldestUsefulTimestamp;
        if (
          !page.items.length
          || page.items.length < limit
          || (page.total !== null && offset >= page.total)
          || fetchedRaw >= maxItems
          || (knownIds.size > 0 && (cursorReached || pageIsOlderThanWindow))
        ) break;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      const pendingCursor = {
        recent_ids: [...new Set([...fetchedIds, ...knownIds])].slice(0, 500),
        newest_published_at: newestPublishedAt,
        updated_at: Date.now()
      };
      this.db.finishSourceSync(sourceKey, {
        sourceKind: source.kind || 'newznab',
        startedAt,
        itemsFetched: fetchedRaw,
        quotaLimit: maxItems,
        quotaUsed: fetchedRaw,
        quotaStatus: fetchedRaw >= maxItems ? 'limit_reached' : (cursorReached ? 'cursor_reached' : 'available'),
        cursor: {
          committed: previousCursor,
          pending: pendingCursor
        }
      });
      return parsed.slice(0, maxItems);
    } catch (error) {
      this.db.failSourceSync(sourceKey, {
        sourceKind: source.kind || 'newznab',
        startedAt,
        errorMessage: error.message,
        httpStatus: error.response?.status || null
      });
      throw error;
    }
  }

  async parseAll({ forceAll = false, defaultIntervalMinutes = 180 } = {}) {
    const allItems = [];
    this.lastPendingCursorKeys = [];
    for (const source of this.getSources()) {
      if (source.paused) continue;
      const intervalMinutes = Math.min(Math.max(
        Number(source.syncIntervalMinutes) || Number(defaultIntervalMinutes) || 180,
        5
      ), 43200);
      const scheduleKey = this.scheduleKey(source);
      if (!forceAll && !this.db.isSourceDue(scheduleKey, intervalMinutes)) continue;
      const startedAt = this.db.beginSourceSync(scheduleKey, source.kind || 'newznab');
      let fetched = 0;
      let quotaLimit = 0;
      let quotaUsed = 0;
      let quotaStatus = 'available';
      try {
        const capabilities = await this.inspect(source);
        const mappings = [
          ['movie', source.categories?.movie],
          ['series', source.categories?.series]
        ];
        for (const [mediaType, categoryIds] of mappings) {
          if (!String(categoryIds || '').trim()) continue;
          const items = await this.fetchCategory(source, mediaType, categoryIds, capabilities);
          this.lastPendingCursorKeys.push(this.sourceKey(source.id, mediaType));
          fetched += items.length;
          allItems.push(...items);
          const categoryState = this.db.getSourceSyncState(this.sourceKey(source.id, mediaType));
          quotaLimit += Number(categoryState?.quota_limit) || 0;
          quotaUsed += Number(categoryState?.quota_used) || 0;
          if (categoryState?.quota_status === 'limit_reached') quotaStatus = 'limit_reached';
          else if (categoryState?.quota_status === 'cursor_reached' && quotaStatus !== 'limit_reached') {
            quotaStatus = 'cursor_reached';
          }
        }
        this.db.finishSourceSync(scheduleKey, {
          sourceKind: source.kind || 'newznab',
          startedAt,
          itemsFetched: quotaUsed,
          quotaLimit: quotaLimit || null,
          quotaUsed: quotaUsed || 0,
          quotaStatus
        });
      } catch (error) {
        this.db.failSourceSync(scheduleKey, {
          sourceKind: source.kind || 'newznab',
          startedAt,
          errorMessage: error.message,
          httpStatus: error.response?.status || null
        });
        this.db.recordFeedError(scheduleKey, error.message, error.response?.status || null);
        console.error(`[Indexeur] Échec de la source ${source.id}: ${error.message}`);
      }
    }
    return allItems;
  }
}

module.exports = NewznabParser;
