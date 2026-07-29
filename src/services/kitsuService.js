const axios = require('axios');

const SUBTYPE_MAP = {
  TV: 'series',
  OVA: 'series',
  ONA: 'series',
  special: 'series',
  movie: 'movie'
};

class KitsuService {
  constructor(db, getAxiosConfig = () => ({ timeout: 10000 })) {
    this.db = db;
    this.getAxiosConfig = getAxiosConfig;
    this.cache = new Map();
  }

  isEnabled() {
    return this.db.getConfig('kitsu_enabled') !== 'false';
  }

  async search(title, year = null) {
    if (!this.isEnabled()) return null;
    const cacheKey = `${title}|${year || ''}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    try {
      const response = await axios.get('https://kitsu.io/api/edge/anime', {
        ...this.getAxiosConfig(),
        params: {
          'filter[text]': title,
          'page[limit]': 10
        },
        headers: { Accept: 'application/vnd.api+json' }
      });
      const results = response.data?.data || [];
      if (!results.length) {
        this.cache.set(cacheKey, null);
        return null;
      }

      const expectedYear = Number(year) || null;
      const best = results.find(entry => {
        const candidateYear = Number(String(entry.attributes?.startDate || '').slice(0, 4)) || null;
        return !expectedYear || !candidateYear || Math.abs(expectedYear - candidateYear) <= 1;
      }) || results[0];
      const attributes = best.attributes || {};
      const subtype = attributes.subtype || attributes.showType;
      const result = {
        kitsu_id: String(best.id),
        title: attributes.titles?.en || attributes.titles?.en_jp
          || attributes.canonicalTitle || title,
        title_romaji: attributes.titles?.en_jp || null,
        title_ja: attributes.titles?.ja_jp || null,
        year: String(attributes.startDate || '').match(/^\d{4}/)?.[0] || null,
        stremio_type: SUBTYPE_MAP[subtype] || 'series',
        score: attributes.averageRating ? Number(attributes.averageRating) / 10 : null,
        synopsis: attributes.synopsis || null,
        poster: attributes.posterImage?.large || attributes.posterImage?.medium || null,
        background: attributes.coverImage?.original || attributes.coverImage?.large || null
      };
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`[Kitsu] Erreur recherche "${title}":`, error.message);
      this.cache.set(cacheKey, null);
      return null;
    }
  }
}

module.exports = KitsuService;
