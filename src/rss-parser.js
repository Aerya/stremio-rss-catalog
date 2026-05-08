const axios = require('axios');
const xml2js = require('xml2js');
const { SocksProxyAgent } = require('socks-proxy-agent');

class RSSParser {
  constructor(config, db) {
    this.config = config;
    this.db = db;
    this.axiosConfig = this.getAxiosConfig();
  }

  getAxiosConfig() {
    const config = { timeout: 30000 };

    const proxyEnabled = this.db.getConfig('proxy_enabled') === 'true';

    if (proxyEnabled) {
      const protocol = this.db.getConfig('proxy_protocol') || 'http';
      const host = this.db.getConfig('proxy_host');
      const port = this.db.getConfig('proxy_port');
      const username = this.db.getConfig('proxy_username');
      const password = this.db.getConfig('proxy_password');

      if (host && host.trim() !== '' && port && port.trim() !== '') {
        if (protocol.startsWith('socks')) {
          const proxyUrl = username && password
            ? `${protocol}://${username}:${password}@${host}:${port}`
            : `${protocol}://${host}:${port}`;
          config.httpsAgent = new SocksProxyAgent(proxyUrl);
          config.httpAgent = new SocksProxyAgent(proxyUrl);
        } else {
          config.proxy = {
            protocol,
            host,
            port: parseInt(port),
            ...(username && password && { auth: { username, password } })
          };
        }
      } else {
        console.warn('[RSS] Proxy enabled but host/port not configured, ignoring proxy settings');
      }
    }

    return config;
  }

  async fetchRSS(url) {
    try {
      console.log(`Fetching RSS: ${url}`);
      const response = await axios.get(url, this.axiosConfig);
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);

      if (result.rss && result.rss.channel && result.rss.channel.item) {
        const items = Array.isArray(result.rss.channel.item)
          ? result.rss.channel.item
          : [result.rss.channel.item];
        return items;
      }
      return [];
    } catch (error) {
      console.error(`Error fetching RSS ${url}:`, error.message);
      return [];
    }
  }

  // Extrait la qualité depuis le nom de release
  extractQuality(title) {
    const tags = [];
    if (/\b(2160p|4K|UHD)\b/i.test(title)) tags.push('4K');
    else if (/\b1080p\b/i.test(title)) tags.push('1080p');
    else if (/\b720p\b/i.test(title)) tags.push('720p');
    else if (/\b480p\b/i.test(title)) tags.push('480p');
    if (/\bHDR\b/i.test(title)) tags.push('HDR');
    if (/\bDV\b/i.test(title)) tags.push('DV');
    if (/\b(BluRay|BDRip|BRRip)\b/i.test(title)) tags.push('BluRay');
    else if (/\bWEBRip\b/i.test(title)) tags.push('WEBRip');
    else if (/\bWEB-?DL\b/i.test(title)) tags.push('WEB-DL');
    else if (/\bWEB\b/i.test(title)) tags.push('WEB');
    else if (/\bHDTV\b/i.test(title)) tags.push('HDTV');
    return tags.length > 0 ? tags.join(' ') : null;
  }

  // Extrait l'infohash depuis un lien magnet ou une URL torrent dans un item RSS
  extractHash(item) {
    const candidates = [];

    if (item.link) candidates.push(typeof item.link === 'string' ? item.link : item.link._);
    if (item.guid) candidates.push(typeof item.guid === 'string' ? item.guid : item.guid._);

    // Enclosure (lien torrent direct ou magnet)
    if (item.enclosure) {
      const enc = item.enclosure;
      if (enc.$ && enc.$.url) candidates.push(enc.$.url);
      else if (typeof enc === 'string') candidates.push(enc);
    }

    // Namespaces Torznab / Newznab (torrent:magnetURI etc.)
    for (const [key, val] of Object.entries(item)) {
      if (key.toLowerCase().includes('magneturi') || key.toLowerCase().includes('magnet')) {
        candidates.push(typeof val === 'string' ? val : (val._ || null));
      }
    }

    for (const str of candidates.filter(Boolean)) {
      // Magnet link : urn:btih:<hash hex 40 ou base32 32>
      const btih = str.match(/urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
      if (btih) return btih[1].toLowerCase();

      // URL torrent avec hash SHA1 dans le chemin
      const urlHash = str.match(/\/([a-fA-F0-9]{40})(?:\/|\.torrent|$)/i);
      if (urlHash) return urlHash[1].toLowerCase();
    }

    return null;
  }

  parseReleaseName(title) {
    const info = {
      name: title,
      year: null,
      isDoc: false,
      isSeries: false
    };

    if (/\b(doc|docu|documentary|documentaire)\b/i.test(title)) {
      info.isDoc = true;
    }

    if (/\bS\d{2}(E\d{2,3})?\b/i.test(title) || /\b(Saison|Season)\s*\d+\b/i.test(title)) {
      info.isSeries = true;
    }

    const yearMatch = title.match(/[.\s](19\d{2}|20\d{2})[.\s]/);
    if (yearMatch) {
      info.year = yearMatch[1];
    }

    let cleanName = title
      .replace(/\b(MULTi|FRENCH|TRUEFRENCH|VFF|VF2|VOSTFR|VOF|VFI|VFQ)\b/gi, '')
      .replace(/\b(2160p|1080p|720p|480p|4K|UHD|HDR|DV|BluRay|BDRip|BRRip|WEBRip|WEB-DL|WEB|HDTV)\b/gi, '')
      .replace(/\b(x264|x265|H264|H265|HEVC|AV1)\b/gi, '')
      .replace(/\b(AC3|DTS|EAC3|ATMOS|AAC|DD|DDP|TrueHD)\b/gi, '')
      .replace(/\b\d{1,2}\.\d\b/gi, '')
      .replace(/-[A-Z0-9]+$/gi, '')
      .replace(/[.\s]+/g, ' ')
      .trim();

    if (info.isSeries) {
      cleanName = cleanName
        .replace(/\s+S\d{2}(E\d{2,3}(-E?\d{2,3})?)?.*/i, '')
        .replace(/\s+(Saison|Season)\s*\d+.*/i, '')
        .trim();
    }

    if (info.year) {
      const parts = cleanName.split(info.year);
      cleanName = parts[0].trim();
    }

    info.cleanName = cleanName;
    return info;
  }

  filterByRequiredTags(title) {
    const raw = this.db.getConfig('required_tags') || '';
    const tags = raw.split(',').map(t => t.trim()).filter(t => t.length > 0);
    if (tags.length === 0) return true;
    return tags.some(tag => new RegExp('\\b' + tag + '\\b', 'i').test(title));
  }

  applyForce(catalogType, type, force) {
    if (!force || force === 'auto') return { catalogType, type };
    if (force === 'films') return { catalogType: 'films', type: 'movie' };
    if (force === 'series') return { catalogType: 'series', type: 'series' };
    if (force === 'documentaires') return { catalogType: 'documentaires', type: 'movie' };
    if (force === 'emissions') return { catalogType: 'emissions', type: 'series' };
    return { catalogType, type };
  }

  _parseItems(items, force, sourceUrl) {
    const parsed = [];
    for (const item of items) {
      if (!this.filterByRequiredTags(item.title)) continue;
      const info = this.parseReleaseName(item.title);
      const releaseId = typeof item.guid === 'object' && item.guid._ ? item.guid._ : (item.guid || item.link);
      // isDoc prime sur isSeries pour le catalogue : une docu-série va en Documentaires
      const detectedCatalog = info.isDoc ? 'documentaires' : (info.isSeries ? 'series' : 'films');
      const detectedType = info.isSeries ? 'series' : 'movie';
      const detected = this.applyForce(detectedCatalog, detectedType, force);

      parsed.push({
        release_name: item.title,
        indexer_rlz_id: releaseId,
        cleanName: info.cleanName,
        year: info.year,
        catalog_type: detected.catalogType,
        type: detected.type,
        pubDate: item.pubDate,
        source_url: sourceUrl,
        source_force: force,
        quality: this.extractQuality(item.title),
        hash: this.extractHash(item)
      });
    }
    return parsed;
  }

  async parseFilmsRSS() {
    const rssUrl = this.db.getConfig('rss_films_url');
    if (!rssUrl) {
      console.log('No RSS Films URL configured');
      return [];
    }

    const force = this.db.getConfig('rss_films_force') || 'auto';
    const items = await this.fetchRSS(rssUrl);
    return this._parseItems(items, force, rssUrl);
  }

  async parseAdditionalRSS() {
    let additionalUrls = [];
    try {
      const raw = this.db.getConfig('rss_additional_urls');
      if (raw) additionalUrls = JSON.parse(raw);
    } catch (e) {
      console.log('Error parsing rss_additional_urls:', e.message);
      return [];
    }

    if (!Array.isArray(additionalUrls) || additionalUrls.length === 0) {
      console.log('No additional RSS URLs configured');
      return [];
    }

    const allParsed = [];
    for (const entry of additionalUrls) {
      const rssUrl = typeof entry === 'string' ? entry : entry.url;
      const force = typeof entry === 'string' ? 'auto' : (entry.force || 'auto');

      if (!rssUrl || !rssUrl.trim()) continue;
      console.log('[RSS] Parsing additional feed:', rssUrl.substring(0, 50) + '... (force: ' + force + ')');

      try {
        const items = await this.fetchRSS(rssUrl.trim());
        allParsed.push(...this._parseItems(items, force, rssUrl.trim()));
      } catch (err) {
        console.error('[RSS] Error parsing additional feed:', rssUrl.substring(0, 50), err.message);
      }
    }

    return allParsed;
  }

  async parseAll() {
    const filmsItems = await this.parseFilmsRSS();
    const additionalItems = await this.parseAdditionalRSS();
    return { films: [...filmsItems, ...additionalItems] };
  }
}

module.exports = RSSParser;
