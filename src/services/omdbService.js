const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');

/**
 * Service OMDb — utilisé pour confirmer/affiner la classification des concerts
 * et spectacles après le match TMDB (qui fournit l'imdb_id).
 *
 * API : https://www.omdbapi.com/?apikey=KEY&i=ttXXXXXXX
 * Réponse clé : { Genre: "Music, Documentary", Type: "movie|series", ... }
 */
class OMDbService {
  constructor(db) {
    this.db    = db;
    this.cache = new Map(); // cache in-memory par imdb_id (durée de vie = process)
  }

  getApiKey() {
    return this.db.getConfig('omdb_api_key') || '';
  }

  isConfigured() {
    return !!this.getApiKey().trim();
  }

  getAxiosConfig() {
    const cfg = { timeout: 8000 };
    const proxyEnabled = this.db.getConfig('proxy_enabled') === 'true';
    if (proxyEnabled) {
      const protocol = this.db.getConfig('proxy_protocol') || 'http';
      const host     = this.db.getConfig('proxy_host');
      const port     = this.db.getConfig('proxy_port');
      const username = this.db.getConfig('proxy_username');
      const password = this.db.getConfig('proxy_password');
      if (host && port) {
        if (protocol.startsWith('socks')) {
          const proxyUrl = username && password
            ? `${protocol}://${username}:${password}@${host}:${port}`
            : `${protocol}://${host}:${port}`;
          cfg.httpsAgent = new SocksProxyAgent(proxyUrl);
          cfg.httpAgent  = new SocksProxyAgent(proxyUrl);
        } else {
          cfg.proxy = { protocol, host, port: parseInt(port),
            ...(username && password && { auth: { username, password } }) };
        }
      }
    }
    return cfg;
  }

  /**
   * Récupère les données OMDb pour un imdb_id donné.
   * @returns {{ genres: string[], type: string, title: string }|null}
   */
  async fetch(imdbId) {
    if (!imdbId || !this.isConfigured()) return null;
    if (this.cache.has(imdbId)) return this.cache.get(imdbId);

    try {
      const resp = await axios.get('https://www.omdbapi.com/', {
        params: { apikey: this.getApiKey(), i: imdbId, type: undefined },
        ...this.getAxiosConfig()
      });
      const d = resp.data;
      if (!d || d.Response === 'False') {
        this.cache.set(imdbId, null);
        return null;
      }
      const genres = (d.Genre || '').split(',').map(g => g.trim()).filter(Boolean);
      const result = { genres, type: d.Type || null, title: d.Title || null };
      this.cache.set(imdbId, result);
      return result;
    } catch (err) {
      console.error(`[OMDb] Erreur pour ${imdbId}:`, err.message);
      this.cache.set(imdbId, null);
      return null;
    }
  }

  /**
   * Indique si un résultat OMDb confirme qu'il s'agit d'un concert/live.
   * Critère : "Music" présent dans les genres.
   */
  isMusicGenre(omdbResult) {
    if (!omdbResult) return false;
    return omdbResult.genres.some(g => /^music$/i.test(g));
  }

  /**
   * Indique si un résultat OMDb confirme un spectacle de comédie (stand-up, one-man-show).
   * Critère : "Comedy" présent SANS genres narratifs longs (Drama, Adventure, Action…).
   */
  isStandupComedy(omdbResult) {
    if (!omdbResult) return false;
    const NARRATIVE_GENRES = new Set(['drama', 'adventure', 'action', 'thriller', 'horror',
      'romance', 'fantasy', 'science fiction', 'sci-fi', 'mystery', 'crime', 'biography']);
    const hasComedy  = omdbResult.genres.some(g => /^comedy$/i.test(g));
    const hasNarrative = omdbResult.genres.some(g => NARRATIVE_GENRES.has(g.toLowerCase()));
    return hasComedy && !hasNarrative;
  }
}

module.exports = OMDbService;
