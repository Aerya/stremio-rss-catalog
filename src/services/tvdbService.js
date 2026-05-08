const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');

const BASE_URL = 'https://api4.thetvdb.com/v4';

class TVDBService {
  constructor(db) {
    this.db = db;
  }

  getApiKey() {
    return this.db.getConfig('tvdb_api_key');
  }

  getAxiosConfig() {
    const config = { timeout: 10000 };
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
            protocol, host, port: parseInt(port),
            ...(username && password && { auth: { username, password } })
          };
        }
      }
    }

    return config;
  }

  async getToken() {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;

    // Vérifie le token en cache (valide 25 jours pour être safe vis-à-vis de l'expiration 30j)
    const cachedToken = this.db.getConfig('tvdb_token');
    const cachedExpiry = parseInt(this.db.getConfig('tvdb_token_expiry') || '0');

    if (cachedToken && cachedExpiry > Date.now()) {
      return cachedToken;
    }

    try {
      const response = await axios.post(`${BASE_URL}/login`, { apikey: apiKey }, {
        ...this.getAxiosConfig(),
        headers: { 'Content-Type': 'application/json' }
      });
      const token = response.data?.data?.token;
      if (!token) throw new Error('No token in response');

      const expiry = Date.now() + (25 * 24 * 60 * 60 * 1000);
      this.db.setConfig('tvdb_token', token);
      this.db.setConfig('tvdb_token_expiry', expiry.toString());
      console.log('[TVDB] Token obtenu et mis en cache');
      return token;
    } catch (err) {
      console.error('[TVDB] Auth failed:', err.message);
      return null;
    }
  }

  async searchSeries(title, year = null) {
    const token = await this.getToken();
    if (!token) return null;

    try {
      const params = { query: title, type: 'series' };
      if (year) params.year = year;

      const response = await axios.get(`${BASE_URL}/search`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
        ...this.getAxiosConfig()
      });

      const results = response.data?.data;
      if (!results || results.length === 0) return null;
      return results[0];
    } catch (err) {
      console.error(`[TVDB] Search failed for "${title}":`, err.message);
      return null;
    }
  }

  // Récupère les détails étendus d'une série pour obtenir l'IMDB ID si absent du search
  async getSeriesExtended(tvdbId) {
    const token = await this.getToken();
    if (!token || !tvdbId) return null;

    try {
      const response = await axios.get(`${BASE_URL}/series/${tvdbId}/extended`, {
        headers: { Authorization: `Bearer ${token}` },
        ...this.getAxiosConfig()
      });
      return response.data?.data || null;
    } catch (err) {
      console.error(`[TVDB] Extended fetch failed for tvdb_id ${tvdbId}:`, err.message);
      return null;
    }
  }

  // Extrait l'IMDB ID depuis les remoteIds TVDB (sourceId 2 = IMDB)
  extractImdbId(extended) {
    if (!extended?.remoteIds) return null;
    const imdbEntry = extended.remoteIds.find(r => r.sourceName === 'IMDB' || r.type === 2);
    return imdbEntry?.id || null;
  }

  // Vérifie si le résultat de recherche TVDB indique un documentaire
  isDocumentary(result) {
    if (!result) return false;
    const genres = result.genres || result.genre_ids || [];
    return genres.some(g => {
      const name = typeof g === 'string' ? g : g.name || '';
      return name.toLowerCase() === 'documentary';
    });
  }

  // Recherche complète : retourne { imdb_id, name, year, isDocumentary } ou null
  async match(title, year = null) {
    const result = await this.searchSeries(title, year);
    if (!result) return null;

    let imdbId = result.imdb_id || null;

    // Si pas d'IMDB ID dans le search, tente l'endpoint extended
    if (!imdbId && result.tvdb_id) {
      const extended = await this.getSeriesExtended(result.tvdb_id);
      imdbId = this.extractImdbId(extended);
    }

    return {
      imdb_id: imdbId,
      tvdb_id: result.tvdb_id,
      name: result.name || result.title,
      year: result.year ? String(result.year) : null,
      isDocumentary: this.isDocumentary(result)
    };
  }

  // Invalide le token en cache (à appeler quand la clé API change)
  invalidateToken() {
    this.db.setConfig('tvdb_token', '');
    this.db.setConfig('tvdb_token_expiry', '0');
  }

  isConfigured() {
    const key = this.getApiKey();
    return !!(key && key.trim() !== '');
  }
}

module.exports = TVDBService;
