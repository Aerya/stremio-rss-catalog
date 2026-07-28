const axios = require('axios');
const crypto = require('crypto');

const CATEGORY_MAP = {
  FILMS: { catalog_type: 'films', type: 'movie' },
  MOVIES: { catalog_type: 'films', type: 'movie' },
  SERIES: { catalog_type: 'series', type: 'series' },
  TV: { catalog_type: 'series', type: 'series' },
  CARTOONS_MOVIES: { catalog_type: 'animés', type: 'movie' },
  CARTOONS_SERIES: { catalog_type: 'animés', type: 'series' },
  ANIMES_FILMS: { catalog_type: 'animés', type: 'movie' },
  ANIMES_SERIES: { catalog_type: 'animés', type: 'series' },
  DOCUMENTAIRES: { catalog_type: 'documentaires', type: 'movie' },
  DOCUMENTAIRES_SERIES: { catalog_type: 'documentaires', type: 'series' },
  DOCU_SERIES: { catalog_type: 'documentaires', type: 'series' },
  EMISSIONS: { catalog_type: 'emissions', type: 'series' },
  CONCERTS: { catalog_type: 'concerts', type: 'movie' },
  SPECTACLES: { catalog_type: 'spectacles', type: 'movie' }
};

class PastebinParser {
  constructor(db, axiosConfigFactory) {
    this.db = db;
    this.axiosConfigFactory = axiosConfigFactory;
  }

  getSources() {
    try {
      const sources = JSON.parse(this.db.getConfig('pastebin_sources') || '[]');
      return Array.isArray(sources) ? sources : [];
    } catch {
      return [];
    }
  }

  async fetchText(url) {
    const response = await axios.get(url, {
      ...(this.axiosConfigFactory ? this.axiosConfigFactory() : {}),
      responseType: 'text',
      maxContentLength: 25 * 1024 * 1024,
      maxBodyLength: 25 * 1024 * 1024,
      transformResponse: [data => data]
    });
    return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  }

  normalizeCategory(value, fallback = null) {
    if (!value) return fallback;
    const key = String(value).trim().toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s-]+/g, '_');
    return CATEGORY_MAP[key] || fallback;
  }

  parseContentPage(content, url, inheritedCategory = null) {
    const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    if (!lines[0] || !/^CAT;TMDB;TITLE;/i.test(lines[0].trim())) return [];

    const items = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(';');
      if (parts.length < 9) continue;
      const rawCat = parts[0].trim().toLowerCase();
      const tmdbId = parts[1].trim();
      const title = parts[2].trim();
      const season = parts[3].trim();
      const year = parts[8].trim();
      if (!/^\d+$/.test(tmdbId) || !title) continue;

      const nativeCategory = rawCat === 'serie'
        ? { catalog_type: 'series', type: 'series' }
        : { catalog_type: 'films', type: 'movie' };
      const category = inheritedCategory || nativeCategory;
      const identity = crypto.createHash('sha256')
        .update(`${url}|${rawCat}|${tmdbId}|${season}`)
        .digest('hex').slice(0, 32);

      items.push({
        release_name: title,
        indexer_rlz_id: `pastebin:${identity}`,
        cleanName: title,
        year: /^\d{4}$/.test(year) ? year : null,
        catalog_type: category.catalog_type,
        type: category.type,
        tmdb_id: tmdbId,
        source_url: url,
        source_force: category.catalog_type,
        quality: null,
        hash: null
      });
    }
    return items;
  }

  parseIndex(content, currentUrl, inheritedCategory = null) {
    const refs = [];
    let category = inheritedCategory;
    const base = new URL('.', currentUrl);

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('#')) {
        category = this.normalizeCategory(line.slice(1), inheritedCategory);
        continue;
      }

      const assignment = line.match(/^(?:[A-Za-z0-9_-]+\s*=\s*)?(https?:\/\/\S+)$/i);
      if (assignment) {
        refs.push({ url: assignment[1], category });
        continue;
      }

      const codeAssignment = line.match(/^([A-Za-z0-9_-]{4,64})(?:\s*=.*)?$/);
      if (codeAssignment) {
        refs.push({ url: new URL(codeAssignment[1], base).href, category });
      }
    }
    return refs;
  }

  parsePointer(content) {
    try {
      const value = JSON.parse(content);
      if (!value || typeof value !== 'object') return [];
      const urls = [];
      for (const [key, raw] of Object.entries(value)) {
        if (!/(url|uri|source|index)/i.test(key)) continue;
        const values = Array.isArray(raw) ? raw : [raw];
        for (const candidate of values) {
          if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) urls.push(candidate);
        }
      }
      return urls;
    } catch {
      return [];
    }
  }

  async discover(startUrl, options = {}) {
    const maxDepth = Math.min(Math.max(Number(options.maxDepth) || 5, 0), 10);
    const maxPages = Math.min(Math.max(Number(options.maxPages) || 1000, 1), 5000);
    const visited = new Set();
    const pages = [];
    const items = [];
    const queue = [{ url: startUrl, category: this.normalizeCategory(options.force) }];
    let truncated = false;
    const allowedHosts = new Set([
      new URL(startUrl).hostname.toLowerCase(),
      ...(Array.isArray(options.allowedHosts) ? options.allowedHosts : [])
        .map(host => String(host).trim().toLowerCase())
        .filter(Boolean)
    ]);
    const queueDiscovered = (candidate) => {
      try {
        const parsed = new URL(candidate.url);
        if (!['http:', 'https:'].includes(parsed.protocol) || !allowedHosts.has(parsed.hostname.toLowerCase())) {
          pages.push({ url: candidate.url, kind: 'blocked', error: 'Hôte découvert non autorisé' });
          return;
        }
        queue.push(candidate);
      } catch {
        pages.push({ url: candidate.url, kind: 'blocked', error: 'URL découverte invalide' });
      }
    };

    while (queue.length) {
      const node = queue.shift();
      const depth = node.depth || 0;
      if (visited.has(node.url) || depth > maxDepth) continue;
      if (visited.size >= maxPages) { truncated = true; break; }
      visited.add(node.url);

      let content;
      try {
        content = await this.fetchText(node.url);
        this.db.recordFeedSuccess(node.url);
      } catch (error) {
        this.db.recordFeedError(node.url, error.message, error.response?.status || null);
        pages.push({ url: node.url, kind: 'error', error: error.message });
        continue;
      }

      const contentItems = this.parseContentPage(content, node.url, node.category);
      if (contentItems.length) {
        contentItems.forEach(item => {
          item.source_url = startUrl;
          item.source_page_url = node.url;
        });
        items.push(...contentItems);
        pages.push({ url: node.url, kind: 'content', count: contentItems.length, category: node.category?.catalog_type || null });
        continue;
      }

      const pointers = this.parsePointer(content);
      if (pointers.length) {
        pages.push({ url: node.url, kind: 'pointer', count: pointers.length });
        for (const url of pointers) queueDiscovered({ url, category: node.category, depth: depth + 1 });
        continue;
      }

      const refs = this.parseIndex(content, node.url, node.category);
      pages.push({ url: node.url, kind: refs.length ? 'index' : 'unknown', count: refs.length });
      for (const ref of refs) queueDiscovered({ ...ref, depth: depth + 1 });
    }

    const uniqueItems = [];
    const seenMedia = new Set();
    for (const item of items) {
      const key = `${item.type}:${item.tmdb_id}`;
      if (seenMedia.has(key)) continue;
      seenMedia.add(key);
      uniqueItems.push(item);
    }
    return {
      items: uniqueItems,
      rawItems: items.length,
      duplicates: items.length - uniqueItems.length,
      pages,
      visited: visited.size,
      truncated
    };
  }

  async parseAll({ forceAll = false, defaultIntervalMinutes = 180 } = {}) {
    const all = [];
    for (const source of this.getSources()) {
      if (!source?.url || source.paused === true) continue;
      const stateKey = `pastebin:${source.id}`;
      const intervalMinutes = Math.min(Math.max(
        Number(source.syncIntervalMinutes) || Number(defaultIntervalMinutes) || 180,
        5
      ), 43200);
      if (!forceAll && !this.db.isSourceDue(stateKey, intervalMinutes)) continue;
      const startedAt = this.db.beginSourceSync(stateKey, 'pastebin');
      try {
        const result = await this.discover(source.url, source);
        const successfulPages = result.pages.filter(page => !['error', 'blocked'].includes(page.kind));
        if (!successfulPages.length && result.pages.some(page => page.kind === 'error')) {
          throw new Error(result.pages.find(page => page.kind === 'error').error || 'Source Pastebin indisponible');
        }
        this.db.finishSourceSync(stateKey, {
          sourceKind: 'pastebin',
          startedAt,
          itemsFetched: result.rawItems,
          quotaLimit: Number(source.maxPages) || 1000,
          quotaUsed: result.visited,
          quotaStatus: result.truncated ? 'limit_reached' : 'available'
        });
        all.push(...result.items);
      } catch (error) {
        this.db.failSourceSync(stateKey, {
          sourceKind: 'pastebin',
          startedAt,
          errorMessage: error.message,
          httpStatus: error.response?.status || null
        });
      }
    }
    return all;
  }
}

module.exports = PastebinParser;
