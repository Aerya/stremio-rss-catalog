const axios = require('axios');
const xml2js = require('xml2js');
const { parseRetryAfterAt, rateLimitMessage } = require('./http-rate-limit');

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
      const retryAfterAt = parseRetryAfterAt(error);
      const wrapped = new Error(retryAfterAt
        ? rateLimitMessage(`L’API ${label}`, retryAfterAt)
        : status
          ? `API ${label} indisponible (HTTP ${status})`
          : error.message);
      wrapped.httpStatus = status || null;
      wrapped.retryAfterAt = retryAfterAt;
      throw wrapped;
    }
  }

  supportedCatalogTypes() {
    return ['films', 'series', 'documentaires', 'emissions', 'animés', 'concerts', 'spectacles'];
  }

  normalizeCatalogTypes(value) {
    const requested = Array.isArray(value) ? value : [];
    const normalized = requested.filter(type => this.supportedCatalogTypes().includes(type));
    return normalized.length ? [...new Set(normalized)] : this.supportedCatalogTypes();
  }

  normalizeCategoryText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  classifyCategory(category) {
    const ownText = this.normalizeCategoryText(category.name);
    const text = this.normalizeCategoryText(category.path || category.name);
    const id = String(category.id || '');
    const seriesCategory = /^5\d{3}$/.test(id)
      || /(?:^|[/ >_-])(?:tv|series?|serie)(?:$|[/ >_-])/.test(text);
    if (/(?:documentary|documentaire|docuser)/.test(text)) {
      return { catalogType: 'documentaires', mediaType: seriesCategory ? 'series' : 'movie' };
    }
    if (/(?:emission|talk[ _-]?show|reality|variet|tele[- ]?realite)/.test(text)) {
      return { catalogType: 'emissions', mediaType: 'series' };
    }
    if (/(?:concert)/.test(text)) {
      return { catalogType: 'concerts', mediaType: 'movie' };
    }
    if (/(?:spectacle|live[ _-]?show|stand[ _-]?up|one[ _-]?man[ _-]?show|theatre|cirque|comedy[ _-]?special)/.test(text)) {
      return { catalogType: 'spectacles', mediaType: 'movie' };
    }
    if (/(?:anime|animation|manga)/.test(text)) {
      return { catalogType: 'animés', mediaType: seriesCategory ? 'series' : 'movie' };
    }
    if (/(?:^|[/ >_-])(?:tv|series?|serie|sport|television)(?:$|[/ >_-])/.test(ownText)) {
      return { catalogType: 'series', mediaType: 'series' };
    }
    if (id === '2000' || /(?:movie|film|cinema|court[ _-]?metrage)/.test(ownText)) {
      return { catalogType: 'films', mediaType: 'movie' };
    }
    return null;
  }

  categorySuggestions(categories, selectedCatalogTypes = null) {
    const selected = this.normalizeCatalogTypes(selectedCatalogTypes);
    const byCatalog = Object.fromEntries(this.supportedCatalogTypes().map(type => [type, {
      movie: [],
      series: []
    }]));
    for (const category of categories || []) {
      const classification = this.classifyCategory(category);
      if (!classification) continue;
      byCatalog[classification.catalogType][classification.mediaType].push(String(category.id));
    }
    if (byCatalog.films.movie.some(id => id !== '2000')) {
      byCatalog.films.movie = byCatalog.films.movie.filter(id => id !== '2000');
    }
    if (byCatalog.series.series.some(id => id !== '5000')) {
      byCatalog.series.series = byCatalog.series.series.filter(id => id !== '5000');
    }
    for (const target of Object.values(byCatalog)) {
      target.movie = [...new Set(target.movie)];
      target.series = [...new Set(target.series)];
    }
    const joinIds = mediaType => [...new Set(selected.flatMap(type => byCatalog[type][mediaType]))].join(',');
    return {
      selected,
      byCatalog,
      movie: joinIds('movie'),
      series: joinIds('series')
    };
  }

  collectCategories(node, output = [], parentPath = '') {
    if (!node || typeof node !== 'object') return output;
    const name = node.$?.id ? String(node.$.name || node.$.id) : '';
    const path = name ? [parentPath, name].filter(Boolean).join('/') : parentPath;
    if (node.$?.id) output.push({ id: String(node.$.id), name, path });
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(item => this.collectCategories(item, output, path));
      else if (value && typeof value === 'object') this.collectCategories(value, output, path);
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

  itemAttributeValues(item, name) {
    const expected = String(name).toLowerCase();
    const attrs = [
      ...(!item?.['newznab:attr'] ? [] : (Array.isArray(item['newznab:attr']) ? item['newznab:attr'] : [item['newznab:attr']])),
      ...(!item?.['torznab:attr'] ? [] : (Array.isArray(item['torznab:attr']) ? item['torznab:attr'] : [item['torznab:attr']]))
    ];
    return attrs
      .filter(attr => String(attr?.$?.name || '').toLowerCase() === expected)
      .map(attr => String(attr.$.value || '').trim())
      .filter(Boolean);
  }

  catalogHint(item, capabilities, mediaType) {
    const categories = new Map((capabilities?.categories || [])
      .map(category => [String(category.id), category]));
    for (const categoryId of this.itemAttributeValues(item, 'category')) {
      const classification = this.classifyCategory(categories.get(categoryId) || {});
      if (classification && classification.catalogType !== (mediaType === 'series' ? 'series' : 'films')) {
        return classification.catalogType;
      }
    }
    return null;
  }

  normalizeImdbId(value) {
    if (!value) return null;
    const match = String(value).match(/(?:tt)?(\d{7,10})/i);
    return match ? `tt${match[1]}` : null;
  }

  enrichParsedItems(rawItems, parsedItems, capabilities = null, mediaType = null) {
    const byId = new Map();
    for (const item of rawItems) {
      const id = typeof item.guid === 'object' ? item.guid._ : (item.guid || item.link);
      if (id) byId.set(String(id), item);
    }
    return parsedItems.map(item => {
      const raw = byId.get(String(item.indexer_rlz_id));
      const attrs = this.itemAttributes(raw);
      const catalogHint = mediaType ? this.catalogHint(raw, capabilities, mediaType) : null;
      const hintedType = mediaType === 'series' ? 'series' : mediaType === 'movie' ? 'movie' : item.type;
      const classifiedItem = {
        ...item,
        ...(catalogHint ? { catalog_type: catalogHint, type: hintedType } : {}),
        source_force: 'auto',
        enrich_direct_meta: true
      };
      const imdbId = this.normalizeImdbId(attrs.imdb || attrs.imdbid);
      const tmdbId = /^\d+$/.test(String(attrs.tmdbid || attrs.tmdb || ''))
        ? String(attrs.tmdbid || attrs.tmdb)
        : null;
      if (!imdbId) return tmdbId ? { ...classifiedItem, tmdb_id: tmdbId } : classifiedItem;
      return {
        ...classifiedItem,
        ...(tmdbId ? { tmdb_id: tmdbId } : {}),
        direct_meta: {
          imdb_id: imdbId,
          name: classifiedItem.cleanName,
          year: classifiedItem.year,
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
    const sourceKey = this.sourceKey(source.id, mediaType);
    if (this.db.isSourceRateLimited(sourceKey)) return [];
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
    const backfillActive = previousCursor.backfill_complete === false
      || (!knownIds.size && previousCursor.backfill_complete !== true);
    const lookbackHours = Math.min(Math.max(Number(source.lookbackHours) || 24, 1), 24 * 30);
    const oldestUsefulTimestamp = previousCursor.newest_published_at
      ? Number(previousCursor.newest_published_at) - lookbackHours * 60 * 60 * 1000
      : null;
    const fetchedIds = [];
    let newestPublishedAt = Number(previousCursor.newest_published_at) || null;
    let fetchedRaw = 0;
    let cursorReached = false;
    let offset = backfillActive ? Math.max(0, Number(previousCursor.backfill_offset) || 0) : 0;
    let backfillComplete = previousCursor.backfill_complete === true;
    const safeResumeOffset = () => Math.max(0, offset - pageSize);

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
          if (!backfillActive && knownIds.has(id)) cursorReached = true;
          return !knownIds.has(id);
        });

        if (uniqueItems.length) {
          const pageItems = this.parseItems(uniqueItems, 'auto', sourceKey, {
            typeHint: mediaType,
            ignoreUrlHint: true
          });
          const allowedCatalogTypes = this.normalizeCatalogTypes(source.catalogTypes);
          parsed.push(...this.enrichParsedItems(uniqueItems, pageItems, caps, mediaType)
            .map(item => ({ ...item, allowed_catalog_types: allowedCatalogTypes })));
        }
        offset += page.items.length;
        const pageDates = page.items.map(item => this.itemPublishedAt(item)).filter(Boolean);
        const pageIsOlderThanWindow = oldestUsefulTimestamp && pageDates.length
          && Math.max(...pageDates) < oldestUsefulTimestamp;
        const reachedEnd = !page.items.length
          || page.items.length < limit
          || (page.total !== null && offset >= page.total);
        if (reachedEnd) {
          if (backfillActive) backfillComplete = true;
          break;
        }
        if (fetchedRaw >= maxItems) break;
        if (!backfillActive && knownIds.size > 0 && (cursorReached || pageIsOlderThanWindow)) break;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      const pendingCursor = {
        recent_ids: [...new Set([...knownIds, ...fetchedIds])].slice(0, 500),
        newest_published_at: newestPublishedAt,
        backfill_complete: backfillActive ? backfillComplete : true,
        backfill_offset: backfillActive && !backfillComplete ? safeResumeOffset() : 0,
        updated_at: Date.now()
      };
      this.db.finishSourceSync(sourceKey, {
        sourceKind: source.kind || 'newznab',
        startedAt,
        itemsFetched: fetchedRaw,
        quotaLimit: maxItems,
        quotaUsed: fetchedRaw,
        quotaStatus: backfillActive && !backfillComplete
          ? 'backfill_in_progress'
          : fetchedRaw >= maxItems
            ? 'limit_reached'
            : (cursorReached ? 'cursor_reached' : 'available'),
        cursor: {
          committed: previousCursor,
          pending: pendingCursor
        }
      });
      return parsed.slice(0, maxItems);
    } catch (error) {
      const pendingCursor = {
        recent_ids: [...new Set([...knownIds, ...fetchedIds])].slice(0, 500),
        newest_published_at: newestPublishedAt,
        backfill_complete: false,
        backfill_offset: safeResumeOffset(),
        updated_at: Date.now()
      };
      this.db.failSourceSync(sourceKey, {
        sourceKind: source.kind || 'newznab',
        startedAt,
        errorMessage: error.message,
        httpStatus: error.httpStatus || error.response?.status || null,
        retryAfterAt: error.retryAfterAt || null,
        itemsFetched: fetchedRaw,
        quotaLimit: maxItems,
        quotaUsed: fetchedRaw,
        quotaStatus: error.httpStatus === 429 ? 'rate_limited' : 'error',
        cursor: {
          committed: previousCursor,
          ...(fetchedRaw > 0 ? { pending: pendingCursor } : {})
        }
      });
      if (error.httpStatus === 429 && fetchedRaw > 0) return parsed.slice(0, maxItems);
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
      if (this.db.isSourceRateLimited(scheduleKey)) continue;
      if (!forceAll && !this.db.isSourceDue(scheduleKey, intervalMinutes)) continue;
      const startedAt = this.db.beginSourceSync(scheduleKey, source.kind || 'newznab');
      let fetched = 0;
      let quotaLimit = 0;
      let quotaUsed = 0;
      let quotaStatus = 'available';
      let rateLimitedState = null;
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
          if (categoryState?.last_http_status === 429) {
            quotaStatus = 'rate_limited';
            rateLimitedState = categoryState;
            break;
          } else if (categoryState?.quota_status === 'backfill_in_progress') {
            quotaStatus = 'backfill_in_progress';
          } else if (categoryState?.quota_status === 'limit_reached') quotaStatus = 'limit_reached';
          else if (categoryState?.quota_status === 'cursor_reached' && quotaStatus !== 'limit_reached') {
            quotaStatus = 'cursor_reached';
          }
        }
        if (rateLimitedState) {
          this.db.failSourceSync(scheduleKey, {
            sourceKind: source.kind || 'newznab',
            startedAt,
            itemsFetched: quotaUsed,
            errorMessage: rateLimitedState.last_error_message,
            httpStatus: 429,
            retryAfterAt: rateLimitedState.cursor?._rate_limit_until || null,
            quotaLimit: quotaLimit || null,
            quotaUsed,
            quotaStatus
          });
        } else {
          this.db.finishSourceSync(scheduleKey, {
            sourceKind: source.kind || 'newznab',
            startedAt,
            itemsFetched: quotaUsed,
            quotaLimit: quotaLimit || null,
            quotaUsed: quotaUsed || 0,
            quotaStatus
          });
        }
      } catch (error) {
        this.db.failSourceSync(scheduleKey, {
          sourceKind: source.kind || 'newznab',
          startedAt,
          errorMessage: error.message,
          httpStatus: error.httpStatus || error.response?.status || null,
          retryAfterAt: error.retryAfterAt || null
        });
        this.db.recordFeedError(
          scheduleKey,
          error.message,
          error.httpStatus || error.response?.status || null
        );
        console.error(`[Indexeur] Échec de la source ${source.id}: ${error.message}`);
      }
    }
    return allItems;
  }
}

module.exports = NewznabParser;
