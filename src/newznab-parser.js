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
    const caps = capabilities || await this.inspect(source);
    const requestedPageSize = Math.min(Math.max(Number(source.pageSize) || caps.serverMax, 1), 1000);
    const pageSize = Math.min(requestedPageSize, caps.serverMax);
    const maxItems = Math.min(Math.max(Number(source.maxItemsPerCategory) || 1000, 1), 20000);
    const delayMs = Math.min(Math.max(Number(source.requestDelayMs) || 750, 250), 10000);
    const parsed = [];
    const seen = new Set();
    let offset = 0;

    while (parsed.length < maxItems) {
      const limit = Math.min(pageSize, maxItems - parsed.length);
      const result = await this.fetchXml(source, {
        t: 'search',
        cat: categoryIds,
        extended: 1,
        offset,
        limit
      });
      const page = this.responseData(result);
      const uniqueItems = page.items.filter(item => {
        const id = typeof item.guid === 'object' ? item.guid._ : (item.guid || item.link || item.title);
        if (!id || seen.has(String(id))) return false;
        seen.add(String(id));
        return true;
      });
      if (!uniqueItems.length) break;

      const pageItems = this.parseItems(uniqueItems, force, sourceKey);
      parsed.push(...this.enrichParsedItems(uniqueItems, pageItems));
      offset += page.items.length;
      if (page.items.length < limit || (page.total !== null && offset >= page.total) || parsed.length >= maxItems) break;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    this.db.recordFeedSuccess(sourceKey);
    return parsed.slice(0, maxItems);
  }

  async parseAll() {
    const allItems = [];
    for (const source of this.getSources()) {
      if (source.paused) continue;
      try {
        const capabilities = await this.inspect(source);
        const mappings = [
          ['movie', source.categories?.movie],
          ['series', source.categories?.series]
        ];
        for (const [mediaType, categoryIds] of mappings) {
          if (!String(categoryIds || '').trim()) continue;
          allItems.push(...await this.fetchCategory(source, mediaType, categoryIds, capabilities));
        }
      } catch (error) {
        const sourceKey = this.sourceKey(source.id, 'all');
        this.db.recordFeedError(sourceKey, error.message, null);
        console.error(`[Indexeur] Échec de la source ${source.id}: ${error.message}`);
      }
    }
    return allItems;
  }
}

module.exports = NewznabParser;
