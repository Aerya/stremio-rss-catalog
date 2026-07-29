const axios = require('axios');
const crypto = require('crypto');
const xml2js = require('xml2js');

class MediaServerParser {
  constructor(db, axiosConfigFactory) {
    this.db = db;
    this.axiosConfigFactory = axiosConfigFactory;
  }

  getSources() {
    try {
      const sources = JSON.parse(this.db.getConfig('media_server_sources') || '[]');
      return Array.isArray(sources) ? sources : [];
    } catch {
      return [];
    }
  }

  sourceKey(sourceId) {
    return `media-server:${sourceId}`;
  }

  baseUrl(value) {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.href.replace(/\/$/, '');
  }

  axiosConfig(source, extra = {}) {
    const config = {
      ...(this.axiosConfigFactory ? this.axiosConfigFactory() : {}),
      timeout: 30000,
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024
    };
    if (!source.useProxy) {
      delete config.proxy;
      delete config.httpAgent;
      delete config.httpsAgent;
    }
    return { ...config, ...extra };
  }

  authHeaders(source) {
    return source.kind === 'plex'
      ? { 'X-Plex-Token': source.apiKey, Accept: 'application/xml' }
      : { 'X-Emby-Token': source.apiKey, Accept: 'application/json' };
  }

  async plexRequest(source, path, params = {}) {
    const response = await axios.get(`${this.baseUrl(source.url)}${path}`, this.axiosConfig(source, {
      headers: this.authHeaders(source),
      params
    }));
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: false });
    return parser.parseStringPromise(response.data);
  }

  async inspectPlex(source) {
    const document = await this.plexRequest(source, '/library/sections');
    const directories = document?.MediaContainer?.Directory || [];
    const libraries = (Array.isArray(directories) ? directories : [directories])
      .filter(Boolean)
      .filter(entry => ['movie', 'show'].includes(entry.$?.type))
      .map(entry => ({
        id: `library:${entry.$.key}`,
        name: entry.$.title,
        type: entry.$.type === 'show' ? 'series' : 'movie',
        kind: 'library'
      }));
    const collections = [];
    for (const library of libraries) {
      const sectionId = library.id.split(':')[1];
      try {
        const result = await this.plexRequest(source, `/library/sections/${encodeURIComponent(sectionId)}/collections`);
        const container = result?.MediaContainer || {};
        const rows = [
          ...(Array.isArray(container.Directory) ? container.Directory : container.Directory ? [container.Directory] : []),
          ...(Array.isArray(container.Metadata) ? container.Metadata : container.Metadata ? [container.Metadata] : [])
        ];
        for (const row of rows.filter(Boolean)) {
          collections.push({
            id: `collection:${row.$.ratingKey}`,
            name: `${row.$.title} — ${library.name}`,
            type: library.type,
            kind: 'collection'
          });
        }
      } catch (error) {
        console.warn(`[Plex] Collections non lisibles pour ${library.name}: ${error.message}`);
      }
    }
    return { server: document?.MediaContainer?.$?.friendlyName || new URL(source.url).hostname, targets: [...libraries, ...collections] };
  }

  async inspectJellyfin(source) {
    const response = await axios.get(`${this.baseUrl(source.url)}/Library/VirtualFolders`, this.axiosConfig(source, {
      headers: this.authHeaders(source)
    }));
    const libraries = (Array.isArray(response.data) ? response.data : [])
      .filter(folder => folder.ItemId)
      .map(folder => ({
        id: `library:${folder.ItemId}`,
        name: folder.Name,
        type: folder.CollectionType === 'tvshows' ? 'series'
          : folder.CollectionType === 'movies' ? 'movie' : 'mixed',
        kind: 'library'
      }));
    let collections = [];
    try {
      const result = await axios.get(`${this.baseUrl(source.url)}/Items`, this.axiosConfig(source, {
        headers: this.authHeaders(source),
        params: {
          Recursive: true,
          IncludeItemTypes: 'BoxSet',
          Fields: 'ChildCount'
        }
      }));
      collections = (Array.isArray(result.data?.Items) ? result.data.Items : []).map(item => ({
        id: `collection:${item.Id}`,
        name: item.Name,
        type: 'mixed',
        kind: 'collection'
      }));
    } catch (error) {
      console.warn(`[Jellyfin] Collections non lisibles : ${error.message}`);
    }
    return { server: new URL(source.url).hostname, targets: [...libraries, ...collections] };
  }

  async inspect(source) {
    if (!['plex', 'jellyfin'].includes(source.kind)) throw new Error('Type de serveur multimédia invalide');
    if (!source.apiKey) throw new Error('Jeton API requis');
    return source.kind === 'plex' ? this.inspectPlex(source) : this.inspectJellyfin(source);
  }

  directItem(source, row) {
    const imdbId = String(row.imdbId || '').match(/tt\d{5,12}/i)?.[0]?.toLowerCase() || null;
    const tmdbId = /^\d+$/.test(String(row.tmdbId || '')) ? String(row.tmdbId) : null;
    if (!imdbId && !tmdbId) return null;
    const type = row.type === 'series' ? 'series' : 'movie';
    const sourceUrl = this.sourceKey(source.id);
    const identity = crypto.createHash('sha256')
      .update(`${source.kind}|${source.id}|${row.id}`)
      .digest('hex').slice(0, 32);
    const item = {
      release_name: row.name,
      indexer_rlz_id: `${source.kind}:${identity}`,
      cleanName: row.name,
      year: row.year ? String(row.year) : null,
      catalog_type: type === 'series' ? 'series' : 'films',
      type,
      tmdb_id: tmdbId,
      source_url: sourceUrl,
      source_force: type === 'series' ? 'series' : 'films',
      quality: null,
      hash: null
    };
    if (imdbId) {
      item.direct_meta = {
        imdb_id: imdbId,
        tmdb_id: tmdbId,
        name: row.name,
        year: row.year ? String(row.year) : null,
        poster: null,
        background: null,
        description: row.description || null,
        genres: row.genres || [],
        vote_average: row.rating || null,
        original_language: null,
        origin_country: [],
        external_ids: tmdbId ? [`tmdb:${tmdbId}`] : []
      };
    }
    return item;
  }

  plexRows(container) {
    const entries = [
      ...(Array.isArray(container?.Video) ? container.Video : container?.Video ? [container.Video] : []),
      ...(Array.isArray(container?.Directory) ? container.Directory : container?.Directory ? [container.Directory] : []),
      ...(Array.isArray(container?.Metadata) ? container.Metadata : container?.Metadata ? [container.Metadata] : [])
    ];
    return entries.map(entry => {
      const attrs = entry.$ || {};
      const guids = (Array.isArray(entry.Guid) ? entry.Guid : entry.Guid ? [entry.Guid] : [])
        .map(guid => guid.$?.id || guid.id).filter(Boolean);
      const legacyGuid = attrs.guid ? [attrs.guid] : [];
      const ids = [...guids, ...legacyGuid];
      return {
        id: attrs.ratingKey || attrs.key,
        name: attrs.title,
        year: attrs.year || null,
        type: attrs.type === 'show' ? 'series' : 'movie',
        imdbId: ids.find(id => /^imdb:\/\/tt/i.test(id))?.replace(/^imdb:\/\//i, '') || null,
        tmdbId: ids.find(id => /^tmdb:\/\/\d+/i.test(id))?.replace(/^tmdb:\/\//i, '') || null,
        rating: Number(attrs.rating) || null,
        description: attrs.summary || null,
        genres: []
      };
    });
  }

  async fetchPlex(source, maxItems) {
    const targets = source.targets?.length ? source.targets : (await this.inspectPlex(source)).targets.map(target => target.id);
    const rows = [];
    const seen = new Set();
    const pageSize = Math.min(Number(source.pageSize) || 500, 1000);
    for (const target of targets) {
      let offset = 0;
      while (rows.length < maxItems) {
        const [kind, id] = String(target).split(':', 2);
        const path = kind === 'collection'
          ? `/library/collections/${encodeURIComponent(id)}/children`
          : `/library/sections/${encodeURIComponent(id)}/all`;
        const result = await this.plexRequest(source, path, {
          includeGuids: 1,
          'X-Plex-Container-Start': offset,
          'X-Plex-Container-Size': Math.min(pageSize, maxItems - rows.length)
        });
        const container = result?.MediaContainer || {};
        const page = this.plexRows(container);
        for (const item of page) {
          if (!item.id || seen.has(item.id)) continue;
          seen.add(item.id);
          rows.push(item);
        }
        offset += page.length;
        const total = Number(container.$?.totalSize || container.$?.size || page.length);
        if (!page.length || offset >= total) break;
      }
      if (rows.length >= maxItems) break;
    }
    return rows;
  }

  async fetchJellyfin(source, maxItems) {
    const targets = source.targets?.length ? source.targets : (await this.inspectJellyfin(source)).targets.map(target => target.id);
    const rows = [];
    const seen = new Set();
    const pageSize = Math.min(Number(source.pageSize) || 500, 1000);
    for (const target of targets) {
      const parentId = String(target).replace(/^(?:library|collection):/, '');
      let offset = 0;
      while (rows.length < maxItems) {
        const response = await axios.get(`${this.baseUrl(source.url)}/Items`, this.axiosConfig(source, {
          headers: this.authHeaders(source),
          params: {
            ParentId: parentId,
            Recursive: true,
            IncludeItemTypes: 'Movie,Series',
            Fields: 'ProviderIds,ProductionYear,Overview,Genres,CommunityRating',
            StartIndex: offset,
            Limit: Math.min(pageSize, maxItems - rows.length)
          }
        }));
        const page = Array.isArray(response.data?.Items) ? response.data.Items : [];
        for (const item of page) {
          if (seen.has(item.Id)) continue;
          seen.add(item.Id);
          rows.push({
            id: item.Id,
            name: item.Name,
            year: item.ProductionYear || null,
            type: item.Type === 'Series' ? 'series' : 'movie',
            imdbId: item.ProviderIds?.Imdb || null,
            tmdbId: item.ProviderIds?.Tmdb || null,
            rating: Number(item.CommunityRating) || null,
            description: item.Overview || null,
            genres: Array.isArray(item.Genres) ? item.Genres : []
          });
        }
        offset += page.length;
        if (!page.length || offset >= Number(response.data?.TotalRecordCount || page.length)) break;
      }
      if (rows.length >= maxItems) break;
    }
    return rows;
  }

  async fetchSource(source) {
    const key = this.sourceKey(source.id);
    const startedAt = this.db.beginSourceSync(key, source.kind);
    const maxItems = Math.min(Math.max(Number(source.maxItems) || 20000, 1), 100000);
    try {
      const rows = source.kind === 'plex'
        ? await this.fetchPlex(source, maxItems)
        : await this.fetchJellyfin(source, maxItems);
      const items = rows.map(row => this.directItem(source, row)).filter(Boolean);
      this.db.finishSourceSync(key, {
        sourceKind: source.kind,
        startedAt,
        itemsFetched: rows.length,
        quotaLimit: maxItems,
        quotaUsed: rows.length,
        quotaStatus: rows.length >= maxItems ? 'limit_reached' : 'available'
      });
      return items;
    } catch (error) {
      this.db.failSourceSync(key, {
        sourceKind: source.kind,
        startedAt,
        errorMessage: error.message,
        httpStatus: error.response?.status || null
      });
      throw error;
    }
  }

  async parseAll({ forceAll = false, defaultIntervalMinutes = 180 } = {}) {
    const items = [];
    for (const source of this.getSources()) {
      if (source.paused) continue;
      const interval = Math.min(Math.max(Number(source.syncIntervalMinutes) || Number(defaultIntervalMinutes) || 180, 5), 43200);
      if (!forceAll && !this.db.isSourceDue(this.sourceKey(source.id), interval)) continue;
      try {
        items.push(...await this.fetchSource(source));
      } catch (error) {
        console.error(`[${source.kind}] Échec de la source ${source.id}: ${error.message}`);
      }
    }
    return items;
  }
}

module.exports = MediaServerParser;
