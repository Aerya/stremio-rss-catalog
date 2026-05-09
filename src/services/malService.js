const axios = require('axios');

/**
 * MyAnimeList API v2 — utilisé pour obtenir le titre anglais canonique d'un animé
 * avant de chercher sur TMDB. MAL ne fournit pas d'IMDB ID, donc on s'en sert
 * uniquement comme normalisateur de titre + enrichissement (score, type, synopsis).
 *
 * API key : https://myanimelist.net/apiconfig (gratuite, inscription requise)
 * Auth    : header X-MAL-CLIENT-ID (lecture seule, pas besoin d'OAuth)
 */
class MALService {
  constructor(db) {
    this.db      = db;
    this.baseUrl = 'https://api.myanimelist.net/v2';
  }

  getClientId() {
    return this.db.getConfig('mal_client_id') || '';
  }

  isConfigured() {
    return this.getClientId().trim().length > 0;
  }

  /**
   * Cherche un animé sur MAL et retourne le titre anglais canonique + métadonnées.
   * @param {string} title  - Titre nettoyé (cleanName)
   * @param {string|null} year
   * @returns {object|null}
   */
  async search(title, year = null) {
    const clientId = this.getClientId().trim();
    if (!clientId) return null;

    try {
      const response = await axios.get(`${this.baseUrl}/anime`, {
        params: {
          q: title,
          limit: 8,
          fields: 'title,alternative_titles,start_date,media_type,mean,synopsis,main_picture,genres'
        },
        headers: { 'X-MAL-CLIENT-ID': clientId },
        timeout: 8000
      });

      const results = response.data?.data || [];
      if (!results.length) return null;

      // On cherche le meilleur match par année si disponible
      const yearInt = year ? parseInt(year) : null;
      let best = null;

      for (const { node } of results) {
        const malYear = node.start_date ? parseInt(node.start_date.substring(0, 4)) : null;
        const yearOk  = !yearInt || !malYear || Math.abs(yearInt - malYear) <= 1;

        if (yearOk) {
          best = node;
          break;
        }
      }

      // Si aucun match d'année, prendre le premier résultat
      if (!best) best = results[0].node;

      const titleEn = best.alternative_titles?.en || best.title;
      const titleJa = best.title;
      const malYear = best.start_date ? best.start_date.substring(0, 4) : null;

      // Déduire le type Stremio depuis le media_type MAL
      const typeMap = {
        tv:      'series',
        ova:     'series',
        ona:     'series',
        special: 'series',
        music:   'series',
        movie:   'movie',
        unknown: null
      };
      const stremioType = typeMap[best.media_type] || null;

      return {
        mal_id:   best.id,
        title:    titleEn,    // titre EN canonique → utilisé pour TMDB
        title_ja: titleJa,
        year:     malYear,
        type:     best.media_type,   // 'tv' | 'movie' | 'ova' | 'ona' | 'special'
        stremio_type: stremioType,
        score:    best.mean   || null,
        synopsis: best.synopsis || null,
        poster:   best.main_picture?.large || best.main_picture?.medium || null
      };
    } catch (err) {
      if (err.response?.status === 401) {
        console.error('[MAL] Client ID invalide ou expiré');
      } else if (err.response?.status === 403) {
        console.error('[MAL] Accès refusé — vérifier les permissions de l\'app MAL');
      } else {
        console.error(`[MAL] Erreur recherche "${title}":`, err.message);
      }
      return null;
    }
  }
}

module.exports = MALService;
