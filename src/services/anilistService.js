const axios = require('axios');

/**
 * AniList API (GraphQL) — normalisateur de titre pour les animés.
 * Complémentaire à MAL : pas de clé API requise, accès anonyme.
 *
 * https://anilist.gitbook.io/anilist-apiv2-docs/
 * Endpoint : POST https://graphql.anilist.co
 */

const ANILIST_URL = 'https://graphql.anilist.co';

const SEARCH_QUERY = `
query ($search: String) {
  Page(perPage: 8) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      title { romaji english native }
      startDate { year }
      format
      meanScore
      coverImage { large }
    }
  }
}
`;

// AniList format → type Stremio
const FORMAT_MAP = {
  TV:       'series',
  TV_SHORT: 'series',
  OVA:      'series',
  ONA:      'series',
  SPECIAL:  'series',
  MUSIC:    'series',
  MOVIE:    'movie'
};

class AniListService {
  constructor(db) {
    this.db    = db;
    this.cache = new Map();
  }

  isEnabled() {
    return this.db.getConfig('anilist_enabled') !== 'false'; // activé par défaut
  }

  /**
   * Cherche un animé sur AniList et retourne le titre anglais canonique + métadonnées.
   * @param {string} title  - Titre nettoyé (cleanName)
   * @param {string|null} year
   * @returns {object|null}
   */
  async search(title, year = null) {
    const cacheKey = `${title}|${year || ''}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    try {
      const resp = await axios.post(ANILIST_URL, {
        query:     SEARCH_QUERY,
        variables: { search: title }
      }, {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: 8000
      });

      const results = resp.data?.data?.Page?.media || [];
      if (!results.length) {
        this.cache.set(cacheKey, null);
        return null;
      }

      // Meilleur match : priorité à l'année si fournie (tolérance ±1 an)
      const yearInt = year ? parseInt(year) : null;
      let best = null;

      if (yearInt) {
        best = results.find(r => {
          const ry = r.startDate?.year;
          return ry && Math.abs(yearInt - ry) <= 1;
        });
      }
      if (!best) best = results[0];

      const titleEn     = best.title.english  || best.title.romaji || best.title.native;
      const titleRomaji = best.title.romaji    || null;
      const titleJa     = best.title.native    || null;
      const aniYear     = best.startDate?.year || null;
      const format      = (best.format || '').toUpperCase();
      const stremioType = FORMAT_MAP[format] || 'series';

      // AniList score : 0-100 → ramener en 0-10 comme TMDB/MAL
      const score = best.meanScore ? Math.round(best.meanScore / 10 * 10) / 10 : null;

      const result = {
        anilist_id:    best.id,
        title:         titleEn,
        title_romaji:  titleRomaji,
        title_ja:      titleJa,
        year:          aniYear ? String(aniYear) : null,
        format,
        stremio_type:  stremioType,
        score,
        poster:        best.coverImage?.large || null
      };

      this.cache.set(cacheKey, result);
      return result;

    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        console.warn('[AniList] Rate limit atteint — réessayer plus tard');
      } else {
        console.error(`[AniList] Erreur recherche "${title}":`, err.message);
      }
      this.cache.set(cacheKey, null);
      return null;
    }
  }
}

module.exports = AniListService;
