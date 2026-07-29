const axios = require('axios');
const xml2js = require('xml2js');

const DEFAULT_EXTENSIONS = [
  'mkv', 'mp4', 'avi', 'mov', 'm4v', 'webm', 'ts', 'm2ts', 'iso', 'strm'
];

class WebDavParser {
  constructor(db, axiosConfigFactory, parseItems) {
    this.db = db;
    this.axiosConfigFactory = axiosConfigFactory;
    this.parseItems = parseItems;
  }

  getSources() {
    try {
      const sources = JSON.parse(this.db.getConfig('webdav_sources') || '[]');
      return Array.isArray(sources) ? sources : [];
    } catch {
      return [];
    }
  }

  sourceKey(sourceId) {
    return `webdav:${sourceId}`;
  }

  requestConfig(source) {
    const shared = this.axiosConfigFactory ? this.axiosConfigFactory() : {};
    const config = source.useProxy
      ? { ...shared }
      : { ...shared, proxy: false, httpAgent: undefined, httpsAgent: undefined };
    if (source.username || source.password) {
      config.auth = {
        username: String(source.username || ''),
        password: String(source.password || '')
      };
    }
    return config;
  }

  normalizeDirectoryUrl(value) {
    const url = new URL(value);
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    url.hash = '';
    return url.href;
  }

  async listDirectory(source, directoryUrl) {
    const response = await axios.request({
      ...this.requestConfig(source),
      method: 'PROPFIND',
      url: directoryUrl,
      headers: {
        Depth: '1',
        'Content-Type': 'application/xml; charset=utf-8'
      },
      data: `<?xml version="1.0" encoding="utf-8"?>
        <propfind xmlns="DAV:">
          <prop>
            <displayname/><resourcetype/><getlastmodified/><getcontentlength/><getcontenttype/><getetag/>
          </prop>
        </propfind>`,
      maxContentLength: 20 * 1024 * 1024,
      maxBodyLength: 20 * 1024 * 1024,
      validateStatus: status => status >= 200 && status < 300
    });
    const parser = new xml2js.Parser({
      explicitArray: false,
      tagNameProcessors: [xml2js.processors.stripPrefix]
    });
    const body = await parser.parseStringPromise(response.data);
    const entries = body?.multistatus?.response;
    return Array.isArray(entries) ? entries : (entries ? [entries] : []);
  }

  responseProp(entry) {
    const propstats = Array.isArray(entry?.propstat) ? entry.propstat : [entry?.propstat].filter(Boolean);
    return propstats.find(value => /(?:^|\s)200(?:\s|$)/.test(String(value?.status || '')))?.prop
      || propstats[0]?.prop
      || {};
  }

  isCollection(prop) {
    const resourceType = prop?.resourcetype;
    return Boolean(resourceType && typeof resourceType === 'object'
      && Object.hasOwn(resourceType, 'collection'));
  }

  fileNameFromUrl(url) {
    const path = new URL(url).pathname.replace(/\/$/, '');
    const raw = path.slice(path.lastIndexOf('/') + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  allowedFile(source, fileName) {
    const extensions = (Array.isArray(source.extensions) ? source.extensions : DEFAULT_EXTENSIONS)
      .map(value => String(value).trim().replace(/^\./, '').toLowerCase())
      .filter(Boolean);
    const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
    return Boolean(extension && extensions.includes(extension));
  }

  async scan(source) {
    const root = this.normalizeDirectoryUrl(source.url);
    const rootUrl = new URL(root);
    const configuredDepth = Number(source.maxDepth);
    const maxDepth = Math.min(Math.max(Number.isFinite(configuredDepth) ? configuredDepth : 8, 0), 20);
    const maxItems = Math.min(Math.max(Number(source.maxItems) || 10000000, 1), 10000000);
    const queue = [{ url: root, depth: 0 }];
    const visited = new Set();
    const items = [];

    while (queue.length && items.length < maxItems) {
      const current = queue.shift();
      const normalized = this.normalizeDirectoryUrl(current.url);
      if (visited.has(normalized)) continue;
      visited.add(normalized);
      const responses = await this.listDirectory(source, normalized);

      for (const entry of responses) {
        if (!entry?.href) continue;
        const entryUrl = new URL(String(entry.href), normalized);
        entryUrl.hash = '';
        if (entryUrl.origin !== rootUrl.origin || !entryUrl.pathname.startsWith(rootUrl.pathname)) continue;
        const prop = this.responseProp(entry);
        const collection = this.isCollection(prop);
        if (collection) {
          const child = this.normalizeDirectoryUrl(entryUrl.href);
          if (child !== normalized && current.depth < maxDepth && !visited.has(child)) {
            queue.push({ url: child, depth: current.depth + 1 });
          }
          continue;
        }

        const fileName = String(prop?.displayname || this.fileNameFromUrl(entryUrl));
        if (!fileName || !this.allowedFile(source, fileName)) continue;
        items.push({
          title: fileName,
          guid: entryUrl.href,
          link: entryUrl.href,
          pubDate: prop?.getlastmodified || null,
          enclosure: { $: { url: entryUrl.href } }
        });
        if (items.length >= maxItems) break;
      }
    }

    return {
      items,
      directoriesScanned: visited.size,
      limitReached: items.length >= maxItems
    };
  }

  async inspect(source) {
    const result = await this.scan({ ...source, maxItems: Math.min(Number(source.maxItems) || 100, 100) });
    return {
      items: result.items.length,
      directories: result.directoriesScanned,
      sample: result.items.slice(0, 10).map(item => item.title),
      limitReached: result.limitReached
    };
  }

  async parseAll({ forceAll = false, defaultIntervalMinutes = 180 } = {}) {
    const parsed = [];
    for (const source of this.getSources()) {
      if (!source?.url || source.paused === true) continue;
      const stateKey = this.sourceKey(source.id);
      const intervalMinutes = Math.min(Math.max(
        Number(source.syncIntervalMinutes) || Number(defaultIntervalMinutes) || 180,
        5
      ), 43200);
      if (!forceAll && !this.db.isSourceDue(stateKey, intervalMinutes)) continue;
      const startedAt = this.db.beginSourceSync(stateKey, 'webdav');
      try {
        const result = await this.scan(source);
        parsed.push(...this.parseItems(result.items, source.force || 'auto', stateKey));
        this.db.finishSourceSync(stateKey, {
          sourceKind: 'webdav',
          startedAt,
          itemsFetched: result.items.length,
          quotaLimit: Number(source.maxItems) || 10000000,
          quotaUsed: result.items.length,
          quotaStatus: result.limitReached ? 'limit_reached' : 'available'
        });
      } catch (error) {
        this.db.failSourceSync(stateKey, {
          sourceKind: 'webdav',
          startedAt,
          errorMessage: error.message,
          httpStatus: error.response?.status || null
        });
      }
    }
    return parsed;
  }
}

WebDavParser.DEFAULT_EXTENSIONS = DEFAULT_EXTENSIONS;

module.exports = WebDavParser;
