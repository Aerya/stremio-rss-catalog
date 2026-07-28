const axios = require('axios');
const xml2js = require('xml2js');
const { SocksProxyAgent } = require('socks-proxy-agent');
const PastebinParser = require('./pastebin-parser');
const StremioManifestParser = require('./stremio-manifest-parser');
const NewznabParser = require('./newznab-parser');

class RSSParser {
  constructor(config, db) {
    this.config = config;
    this.db = db;
    this.axiosConfig = this.getAxiosConfig();
    this.pastebinParser = new PastebinParser(db, () => this.getAxiosConfig());
    this.stremioManifestParser = new StremioManifestParser(db, () => this.getAxiosConfig());
    this.newznabParser = new NewznabParser(
      db,
      () => this.getAxiosConfig(),
      (items, force, sourceUrl) => this._parseItems(items, force, sourceUrl)
    );
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

  safeUrl(value) {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}${url.search ? '?…' : ''}`;
    } catch {
      return '[URL invalide]';
    }
  }

  async fetchRSS(url, { stateKey = url, sourceKind = 'rss' } = {}) {
    const startedAt = this.db.beginSourceSync(stateKey, sourceKind);
    try {
      console.log(`Fetching RSS: ${this.safeUrl(url)}`);
      const response = await axios.get(url, this.axiosConfig);
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(response.data);
      this.db.recordFeedSuccess(url);

      if (result.rss && result.rss.channel && result.rss.channel.item) {
        const items = Array.isArray(result.rss.channel.item)
          ? result.rss.channel.item
          : [result.rss.channel.item];
        this.db.finishSourceSync(stateKey, { sourceKind, startedAt, itemsFetched: items.length });
        return items;
      }
      this.db.finishSourceSync(stateKey, { sourceKind, startedAt, itemsFetched: 0 });
      return [];
    } catch (error) {
      console.error(`Error fetching RSS ${this.safeUrl(url)}:`, error.message);
      const httpStatus = error.response?.status || null;
      this.db.failSourceSync(stateKey, { sourceKind, startedAt, errorMessage: error.message, httpStatus });
      if (stateKey !== url) this.db.recordFeedError(url, error.message, httpStatus);
      return [];
    }
  }

  // Extrait la qualité depuis le nom de release
  extractQuality(title) {
    const tags = [];

    // Résolution
    if (/\b(2160p|4K|UHD)\b/i.test(title))      tags.push('4K');
    else if (/\b1080p\b/i.test(title))            tags.push('1080p');
    else if (/\b720p\b/i.test(title))             tags.push('720p');
    else if (/\b480p\b/i.test(title))             tags.push('480p');
    else if (/\b(SD|576p)\b/.test(title))         tags.push('SD');

    // HDR / couleur
    if (/\bHDR(10\+?)?\b/i.test(title))           tags.push('HDR');
    if (/\b(DV|DoVi|Dolby[\.\s]?Vision)\b/i.test(title)) tags.push('DV');

    // Source
    if      (/\b(BluRay|BDRip|BRRip|BD-?Rip)\b/i.test(title)) tags.push('BluRay');
    else if (/\bWEBRip\b/i.test(title))            tags.push('WEBRip');
    else if (/\bWEB-?DL\b/i.test(title))           tags.push('WEB-DL');
    else if (/\bWEB\b/i.test(title))               tags.push('WEB');
    else if (/\bHDTV\b/i.test(title))              tags.push('HDTV');
    else if (/\bTVRip\b/i.test(title))             tags.push('TVRip');
    else if (/\bDVDRip\b/i.test(title))            tags.push('DVDRip');
    else if (/\bDVDScr\b/i.test(title))            tags.push('DVDScr');
    else if (/\bDVD\b/i.test(title))               tags.push('DVD');
    else if (/\bPDTV\b/i.test(title))              tags.push('PDTV');
    else if (/\bVODRip\b/i.test(title))            tags.push('VODRip');
    else if (/\b(CAM|HDCAM)\b/i.test(title))       tags.push('CAM');
    else if (/\b(TS|TELESYNC)\b/i.test(title))     tags.push('TS');
    else if (/\bTC\b/i.test(title))                tags.push('TC');

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

  // Déduit la catégorie probable depuis l'URL du flux (ex: feed?cat=documentaires)
  guessForceFromUrl(url) {
    if (!url) return null;
    const u = url.toLowerCase();
    // Ordre : du plus spécifique au plus générique
    if (/documentaire|documentary/.test(u))                                    return 'documentaires';
    if (/anim[eé]|anime|manga/.test(u))                                        return 'animés';
    if (/concert|live[\-_]show|music[\-_]film|film[\-_]concert/.test(u))       return 'concerts';
    if (/spectacle|stand[\-_]?up|one[\-_]man[\-_]show|th[eé][aâ]tre|cirque/.test(u)) return 'spectacles';
    if (/[eé]mission|talkshow|talk[\-_]show|variet/.test(u))                   return 'emissions';
    if (/s[eé]rie|series|saison/.test(u))                                      return 'series';
    if (/film|movie|cin[eé]/.test(u))                                          return 'films';
    return null;
  }

  parseReleaseName(title) {
    const info = {
      name: title,
      year: null,
      isDoc: false,
      isSeries: false,
      isAnime: false,
      isEmission: false,
      isConcert: false,
      isSpectacle: false
    };

    // Documentaires
    if (/\b(doc|docu|documentary|documentaire|docuserie|docu[\-\s]?serie)\b/i.test(title)) {
      info.isDoc = true;
    }

    // Animé
    if (/\b(OVA|OAV|ANIME)\b/i.test(title) || /\b(anim[eé])\b/i.test(title)) {
      info.isAnime  = true;
      info.isSeries = true;
    }

    // Emissions / Talk-shows
    if (/\b(TALKSHOW|TALK[\.\-]SHOW|VARIET[EÉ]|EMISSION|[EÉ]MISSION)\b/i.test(title)) {
      info.isEmission = true;
      info.isSeries   = true;
    }

    // Concerts / Live
    if (/\b(CONCERT|LIVE[\s\-]AT|LIVE[\s\-]IN|LIVE[\s\-]FROM|LIVE[\s\-]SHOW|MUSIC[\s\-]FESTIVAL|ACOUSTI[CQ][\s\-]LIVE|UNPLUGGED|LIVE[\s\-]TOUR)\b/i.test(title)) {
      info.isConcert = true;
    }

    // Spectacles (stand-up, théâtre, cirque…)
    if (/\b(STAND[\s\-]?UP|ONE[\s\-]MAN[\s\-]SHOW|ONE[\s\-]WOMAN[\s\-]SHOW|SPECTACLE|TH[EÉ][AÂ]TRE|CIRQUE|MAGIC[\s\-]SHOW|HUMORI[ST]TE|CAF[EÉ][\s\-]?TH[EÉ][AÂ]TRE)\b/i.test(title)) {
      info.isSpectacle = true;
    }

    // Séries (pattern S01E01, Saison X, Season X)
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
    if (force === 'films')         return { catalogType: 'films',         type: 'movie' };
    if (force === 'series')        return { catalogType: 'series',        type: 'series' };
    if (force === 'documentaires') return { catalogType: 'documentaires', type: 'movie' };
    if (force === 'emissions')     return { catalogType: 'emissions',     type: 'series' };
    if (force === 'animés')        return { catalogType: 'animés',        type };
    if (force === 'concerts')      return { catalogType: 'concerts',      type: 'movie' };
    if (force === 'spectacles')    return { catalogType: 'spectacles',    type: 'movie' };
    return { catalogType, type };
  }

  _parseItems(items, force, sourceUrl) {
    // En mode auto : tenter de deviner la catégorie depuis l'URL du flux
    const urlHint = (force === 'auto' || !force) ? this.guessForceFromUrl(sourceUrl) : null;
    const effectiveForce = (force && force !== 'auto') ? force : (urlHint || 'auto');

    if (urlHint && (force === 'auto' || !force)) {
      console.log(`[RSS] URL hint "${urlHint}" détecté automatiquement depuis : ${this.safeUrl(sourceUrl)}`);
    }

    const parsed = [];
    for (const item of items) {
      if (!this.filterByRequiredTags(item.title)) continue;
      const info = this.parseReleaseName(item.title);
      const releaseId = typeof item.guid === 'object' && item.guid._ ? item.guid._ : (item.guid || item.link);
      // Priorité titre : animé > concert > spectacle > doc > émission > série > film
      const detectedCatalog = info.isAnime     ? 'animés'
                            : info.isConcert   ? 'concerts'
                            : info.isSpectacle ? 'spectacles'
                            : info.isDoc       ? 'documentaires'
                            : info.isEmission  ? 'emissions'
                            : info.isSeries    ? 'series'
                            : 'films';
      const detectedType = info.isSeries ? 'series' : 'movie';
      const detected = this.applyForce(detectedCatalog, detectedType, effectiveForce);

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

  async parseFilmsRSS({ forceAll = false, defaultIntervalMinutes = 180 } = {}) {
    const rssUrl = this.db.getConfig('rss_films_url');
    if (!rssUrl || this.db.getConfig('rss_films_paused') === 'true') {
      console.log('No RSS Films URL configured');
      return [];
    }

    const stateKey = 'rss:rss-main';
    const intervalMinutes = Math.min(Math.max(
      Number(this.db.getConfig('rss_films_sync_interval')) || Number(defaultIntervalMinutes) || 180,
      5
    ), 43200);
    if (!forceAll && !this.db.isSourceDue(stateKey, intervalMinutes)) return [];
    const force = this.db.getConfig('rss_films_force') || 'auto';
    const items = await this.fetchRSS(rssUrl, { stateKey });
    return this._parseItems(items, force, rssUrl);
  }

  async parseAdditionalRSS({ forceAll = false, defaultIntervalMinutes = 180 } = {}) {
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
      const sourceId = typeof entry === 'string'
        ? `legacy-${Buffer.from(rssUrl || '').toString('base64url').slice(0, 16)}`
        : entry.id;
      const stateKey = `rss:${sourceId}`;
      const configuredInterval = typeof entry === 'object'
        ? (Number(entry.syncIntervalMinutes) || Number(defaultIntervalMinutes) || 180)
        : (Number(defaultIntervalMinutes) || 180);
      const intervalMinutes = Math.min(Math.max(configuredInterval, 5), 43200);

      if (!rssUrl || !rssUrl.trim() || (typeof entry === 'object' && entry.paused === true)) continue;
      if (!forceAll && !this.db.isSourceDue(stateKey, intervalMinutes)) continue;
      console.log('[RSS] Parsing additional feed:', this.safeUrl(rssUrl) + ' (force: ' + force + ')');

      try {
        const items = await this.fetchRSS(rssUrl.trim(), { stateKey });
        allParsed.push(...this._parseItems(items, force, rssUrl.trim()));
      } catch (err) {
        console.error('[RSS] Error parsing additional feed:', this.safeUrl(rssUrl), err.message);
      }
    }

    return allParsed;
  }

  async parseAll(options = {}) {
    const defaultIntervalMinutes = Number(options.defaultIntervalMinutes)
      || Number(this.db.getConfig('refresh_interval')) || 180;
    const parserOptions = { ...options, defaultIntervalMinutes };
    const filmsItems = await this.parseFilmsRSS(parserOptions);
    const additionalItems = await this.parseAdditionalRSS(parserOptions);
    const pastebinItems = await this.pastebinParser.parseAll(parserOptions);
    const stremioItems = await this.stremioManifestParser.parseAll(parserOptions);
    const newznabItems = await this.newznabParser.parseAll(parserOptions);
    return {
      films: [...filmsItems, ...additionalItems, ...pastebinItems, ...stremioItems, ...newznabItems],
      pendingCursorKeys: this.newznabParser.lastPendingCursorKeys || []
    };
  }
}

module.exports = RSSParser;
