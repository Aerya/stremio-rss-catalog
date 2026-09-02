const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const TVDBService     = require('./services/tvdbService');
const MALService      = require('./services/malService');
const AniListService  = require('./services/anilistService');
const KitsuService    = require('./services/kitsuService');
const OMDbService     = require('./services/omdbService');
const StremioMetadataService = require('./services/stremioMetadataService');

// Genres TMDB qui indiquent une émission TV plutôt qu'une série narrative
const EMISSIONS_GENRE_IDS = new Set([10763, 10764, 10766, 10767]); // News, Reality, Soap, Talk

// Genre TMDB documentaire (film et série)
const DOCUMENTARY_GENRE_ID = 99;

// Genre TMDB animation (anime si origine japonaise)
const ANIMATION_GENRE_ID = 16;

// Genre TMDB musique — signal principal pour les concerts
const MUSIC_GENRE_ID = 10402;

// Genres incompatibles avec un documentaire — leur présence annule la détection genre 99
// (Action, Science-Fiction, Fantastique, Horreur)
const DOC_DISQUALIFYING_GENRE_IDS = new Set([28, 878, 14, 27]);

// Genres incompatibles avec une émission TV — annule la détection émission
// (Science-Fiction, Fantastique, SF&Fantasy TV, Animation, Horreur)
const EMISSION_DISQUALIFYING_GENRE_IDS = new Set([878, 14, 10765, 16, 27]);

// Genres qui disqualifient la détection concert (= biopic, comédie musicale ou film narratif)
// Drama (18), Comédie (35), Romance (10749), Action (28), Horreur (27), SF (878), Fantastique (14), Thriller (53)
const CONCERT_DISQUALIFYING_GENRE_IDS = new Set([18, 35, 10749, 28, 27, 878, 14, 53]);

const DOCUMENTARY_KEYWORDS = new Set(['documentary', 'docuseries']);
const SPECTACLE_KEYWORDS = new Set([
  'stand-up comedy', 'stand up comedy', 'comedy special', 'one-man show',
  'one-woman show', 'stage play', 'theatre', 'theater', 'circus', 'magic show'
]);
const CONCERT_KEYWORDS = new Set([
  'concert', 'concert film', 'live performance', 'music festival', 'live music'
]);
const EMISSION_KEYWORDS = new Set([
  'talk show', 'game show', 'reality show', 'variety show', 'television news', 'magazine show'
]);
const EMISSION_TV_TYPES = new Set(['news', 'reality', 'talk show']);
const DOCUMENTARY_TV_TYPES = new Set(['documentary']);

function normalizeMatchTitle(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchTitleVariants(value) {
  const normalized = normalizeMatchTitle(value);
  const withoutArticle = normalized.replace(
    /^(?:the|a|an|le|la|les|l|un|une|des|der|die|das|ein|eine|el|los|las|il|lo|i)\s+/,
    ''
  );
  return [...new Set([normalized, withoutArticle].filter(Boolean))];
}

function levenshteinRatio(left, right) {
  if (left === right) return 1;
  if (!left || !right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return 1 - (previous[right.length] / Math.max(left.length, right.length));
}

function tokenDice(left, right) {
  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = new Set(right.split(' ').filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let common = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) common++;
  return (2 * common) / (leftTokens.size + rightTokens.size);
}

function parseStoredReasons(value) {
  if (Array.isArray(value)) return value;
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

class TMDBMatcher {
  constructor(db) {
    this.db   = db;
    this.baseUrl = 'https://api.themoviedb.org/3';
    this.tvdb    = new TVDBService(db);
    this.mal     = new MALService(db);
    this.anilist = new AniListService(db);
    this.kitsu   = new KitsuService(db, () => this.getAxiosConfig());
    this.omdb    = new OMDbService(db);
    this.stremioMetadata = new StremioMetadataService(db, () => this.getAxiosConfig());
  }

  linkDirectIdentities(item, mediaId) {
    if (!mediaId) return;
    const identities = [
      mediaId,
      ...(Array.isArray(item.direct_meta?.external_ids) ? item.direct_meta.external_ids : [])
    ];
    for (const externalId of new Set(identities.filter(Boolean))) {
      this.db.linkMediaIdentity(mediaId, externalId);
    }
  }

  isCatalogAllowed(item, catalogType) {
    return !Array.isArray(item.allowed_catalog_types)
      || !item.allowed_catalog_types.length
      || item.allowed_catalog_types.includes(catalogType);
  }

  buildMediaId(match, fallbackType = 'movie') {
    const imdbId = String(match?.imdb_id || '').trim();
    if (/^tt\d+$/i.test(imdbId)) return imdbId;

    // Préserver les identifiants natifs déjà pris en charge avant l'ajout
    // du fallback TMDB. Ils sont notamment utilisés pour les animés sans IMDb.
    if (/^(?:kitsu|mal|anilist|anidb):[^\s]+$/i.test(imdbId)) return imdbId;

    const tmdbId = String(match?.tmdb_id || '').trim();
    if (!tmdbId) return null;

    const mediaType = match?.media_type === 'tv' || fallbackType === 'series'
      ? 'tv'
      : 'movie';
    return `tmdb:${mediaType}:${tmdbId}`;
  }

  getApiKey() {
    return this.db.getConfig('tmdb_api_key');
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
            protocol,
            host,
            port: parseInt(port),
            ...(username && password && { auth: { username, password } })
          };
        }
      } else {
        console.warn('[TMDB] Proxy enabled but host/port not configured, ignoring proxy settings');
      }
    }

    return config;
  }

  async _fetchWithRetry(url, params, config, maxRetries = 3) {
    let retries = 0;
    while (retries < maxRetries) {
      try {
        return await axios.get(url, { params, ...config });
      } catch (error) {
        if (error.response && error.response.status === 429) {
          console.log(`[TMDB] Rate limit (429), attente 5s...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          retries++;
        } else {
          throw error;
        }
      }
    }
    throw new Error(`Max retries (${maxRetries}) exceeded for ${url}`);
  }

  async searchMovie(title, year = null, language = 'fr-FR', expectedTitle = title, expectedYear = year) {
    return this.searchMediaCandidates('movie', title, year, language, expectedTitle, expectedYear);
  }

  async searchTVShow(title, year = null, language = 'fr-FR', expectedTitle = title, expectedYear = year) {
    return this.searchMediaCandidates('tv', title, year, language, expectedTitle, expectedYear);
  }

  scoreCandidate(candidate, expectedTitle, expectedYear, mediaType) {
    const expectedVariants = matchTitleVariants(expectedTitle);
    const candidateTitles = [
      candidate.title, candidate.name, candidate.original_title, candidate.original_name
    ].flatMap(matchTitleVariants).filter(Boolean);
    const titleSimilarity = expectedVariants.reduce((outerBest, expected) => Math.max(
      outerBest,
      candidateTitles.reduce((best, candidateTitle) => Math.max(
        best,
        levenshteinRatio(expected, candidateTitle),
        tokenDice(expected, candidateTitle)
      ), 0)
    ), 0);
    const exactTitle = expectedVariants.some(expected => candidateTitles.includes(expected));
    const candidateYear = String(candidate.release_date || candidate.first_air_date || '').slice(0, 4);
    const requestedYear = /^\d{4}$/.test(String(expectedYear || '')) ? Number(expectedYear) : null;
    const actualYear = /^\d{4}$/.test(candidateYear) ? Number(candidateYear) : null;
    let yearPoints = 0;
    let yearReason = 'année inconnue';
    if (requestedYear && actualYear) {
      const difference = Math.abs(requestedYear - actualYear);
      yearPoints = difference === 0 ? 15 : difference === 1 ? 8 : difference === 2 ? 2 : -12;
      yearReason = difference === 0 ? 'année exacte' : `écart de ${difference} an(s)`;
    }
    const popularityPoints = Math.min(5, Math.log10(Math.max(1, Number(candidate.popularity) || 1)) * 2);
    const score = Math.max(0, Math.min(
      100,
      titleSimilarity * 70 + (exactTitle ? 15 : 0) + yearPoints + popularityPoints
    ));
    return {
      candidate,
      score,
      reasons: [
        `titre ${Math.round(titleSimilarity * 100)} %`,
        yearReason,
        mediaType === 'tv' ? 'type série' : 'type film'
      ]
    };
  }

  async searchMediaCandidates(
    mediaType, title, year = null, language = 'fr-FR',
    expectedTitle = title, expectedYear = year
  ) {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;
    try {
      const params = { api_key: apiKey, query: title, language, include_adult: true };
      if (year) params[mediaType === 'tv' ? 'first_air_date_year' : 'year'] = year;
      const response = await this._fetchWithRetry(
        `${this.baseUrl}/search/${mediaType}`, params, this.getAxiosConfig()
      );
      const ranked = (response.data.results || [])
        .slice(0, 20)
        .map(candidate => this.scoreCandidate(candidate, expectedTitle, expectedYear, mediaType))
        .sort((left, right) => right.score - left.score);
      const best = ranked[0];
      const minimum = Math.min(95, Math.max(
        0, Number(this.db.getConfig('tmdb_match_min_confidence')) || 58
      ));
      if (!best || best.score < minimum) {
        if (best) {
          console.log(`[TMDB] Candidat refusé pour "${expectedTitle}" : ${best.score.toFixed(1)} < ${minimum}`);
        }
        return null;
      }
      const detailed = await this.fetchByTmdbId(best.candidate.id, mediaType, language);
      if (!detailed) return null;
      detailed.match_confidence = Math.round(best.score * 10) / 10;
      detailed.match_reasons = best.reasons;
      detailed.match_provider = 'tmdb';
      return detailed;
    } catch (error) {
      console.error(`[TMDB] Error searching ${mediaType} "${title}":`, error.message);
      return null;
    }
  }

  async getExternalIds(mediaType, tmdbId) {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;
    try {
      const response = await this._fetchWithRetry(
        `${this.baseUrl}/${mediaType}/${tmdbId}/external_ids`,
        { api_key: apiKey },
        this.getAxiosConfig()
      );
      return response.data;
    } catch (error) {
      console.error(`[TMDB] Error getting external IDs for ${mediaType}/${tmdbId}:`, error.message);
      return null;
    }
  }

  // Stratégie multi-tentatives : exact FR → sans année FR → sans année EN → titre simplifié EN
  async matchItem(item) {
    const isTV = item.type === 'series';
    const search = isTV
      ? (t, y, l) => this.searchTVShow(t, y, l, item.cleanName, item.year)
      : (t, y, l) => this.searchMovie(t, y, l, item.cleanName, item.year);

    // Titre simplifié : on garde seulement les 3 premiers mots pour les titres longs
    const simplifiedName = item.cleanName.split(' ').slice(0, 3).join(' ');

    if (
      item.source_force === 'auto'
      && item.type_confidence === 'low'
      && item.cleanName
    ) {
      const [movieCandidate, tvCandidate] = await Promise.all([
        this.searchMovie(item.cleanName, item.year, 'fr-FR', item.cleanName, item.year),
        this.searchTVShow(item.cleanName, item.year, 'fr-FR', item.cleanName, item.year)
      ]);
      const candidates = [movieCandidate, tvCandidate].filter(Boolean)
        .sort((left, right) => (right.match_confidence || 0) - (left.match_confidence || 0));
      if (candidates[0]) {
        candidates[0].match_reasons = [
          ...(candidates[0].match_reasons || []),
          'type film/série comparé automatiquement'
        ];
        return candidates[0];
      }
    }

    const attempts = [
      // 1. Exact + année, français
      () => search(item.cleanName, item.year, 'fr-FR'),
      // 2. Sans année, français
      () => item.year ? search(item.cleanName, null, 'fr-FR') : null,
      // 3. Sans année, anglais
      () => search(item.cleanName, null, 'en-US'),
      // 4. Titre simplifié, anglais (utile pour les titres avec tokens parasites)
      () => simplifiedName !== item.cleanName ? search(simplifiedName, item.year, 'en-US') : null,
      // 5. Titre simplifié sans année, anglais
      () => simplifiedName !== item.cleanName ? search(simplifiedName, null, 'en-US') : null,
    ];

    for (let i = 0; i < attempts.length; i++) {
      const match = await attempts[i]();
      if (match && (match.imdb_id || match.tmdb_id)) {
        if (i > 0) console.log(`[TMDB] Matched "${item.cleanName}" on attempt ${i + 1} → "${match.name}"`);
        return match;
      }
      // Petit délai entre tentatives pour éviter le rate-limit
      if (i < attempts.length - 1) await new Promise(r => setTimeout(r, 150));
    }

    return null;
  }

  /**
   * Matching spécialisé anime :
   * 1. Cherche sur MAL → obtient le titre EN canonique
   * 2. Utilise ce titre pour chercher sur TMDB (meilleur taux de succès)
   * 3. Si MAL non configuré ou échec MAL : fallback sur matchItem() standard
   */
  async matchAnimeItem(item) {
    let malResult    = null;
    let anilistResult = null;
    let kitsuResult = null;

    // ── 1. MAL (si clé configurée) ────────────────────────────────────────────
    if (this.mal.isConfigured()) {
      try {
        malResult = await this.mal.search(item.cleanName, item.year);
        if (malResult) {
          console.log(`[MAL] ✓ "${item.cleanName}" → "${malResult.title}" (id:${malResult.mal_id}, type:${malResult.type})`);
        }
      } catch (err) {
        console.error(`[MAL] Erreur pour "${item.cleanName}":`, err.message);
      }
    }

    // ── 2. AniList (si activé, anonyme) ──────────────────────────────────────
    if (this.anilist.isEnabled()) {
      try {
        anilistResult = await this.anilist.search(item.cleanName, item.year);
        if (anilistResult) {
          console.log(`[AniList] ✓ "${item.cleanName}" → "${anilistResult.title}" (id:${anilistResult.anilist_id}, format:${anilistResult.format})`);
        }
      } catch (err) {
        console.error(`[AniList] Erreur pour "${item.cleanName}":`, err.message);
      }
    }

    // ── 3. Kitsu (sans clé) ───────────────────────────────────────────────────
    if (this.kitsu.isEnabled()) {
      try {
        kitsuResult = await this.kitsu.search(item.cleanName, item.year);
        if (kitsuResult) {
          console.log(`[Kitsu] ✓ "${item.cleanName}" → "${kitsuResult.title}" (id:${kitsuResult.kitsu_id})`);
        }
      } catch (err) {
        console.error(`[Kitsu] Erreur pour "${item.cleanName}":`, err.message);
      }
    }

    // ── 4. Matching TMDB avec titres normalisés ───────────────────────────────
    if (malResult || anilistResult || kitsuResult) {
      // Priorité MAL, puis AniList et Kitsu en compléments
      const primary = malResult || anilistResult || kitsuResult;
      const secondaryResults = [anilistResult, kitsuResult]
        .filter(result => result && result !== primary);

      const isTV = (primary.stremio_type === 'series') || item.type === 'series';
      const search = isTV
        ? (t, y, l) => this.searchTVShow(t, y, l)
        : (t, y, l) => this.searchMovie(t, y, l);

      // Construire la liste des titres uniques à tenter (en préservant la priorité)
      const seen   = new Set();
      const titles = [];
      const addTitle = (t) => {
        if (t && !seen.has(t.toLowerCase().trim())) {
          seen.add(t.toLowerCase().trim());
          titles.push(t);
        }
      };

      // Titres principaux (MAL prioritaire)
      addTitle(primary.title);
      secondaryResults.forEach(result => addTitle(result.title));

      // Titres alternatifs
      addTitle(primary.title_romaji ?? primary.title_ja);
      secondaryResults.forEach(result => {
        addTitle(result.title_romaji);
        addTitle(result.title_ja);
      });
      addTitle(primary.title_ja);
      addTitle(item.cleanName); // toujours en dernier fallback

      const bestYear = primary.year || secondaryResults.find(result => result.year)?.year || item.year;

      // Tentatives : premier titre + année, puis tous les titres sans année
      const attempts = [
        () => search(titles[0], bestYear, 'en-US'),
        ...titles.map(t => () => search(t, null, 'en-US')),
        // si cleanName diffère du premier titre, retenter avec année
        ...(item.cleanName !== titles[0] ? [() => search(item.cleanName, item.year, 'en-US')] : [])
      ];

      for (let i = 0; i < attempts.length; i++) {
        const fn = attempts[i];
        if (!fn) continue;
        const match = await fn();
        if (match && (match.imdb_id || match.tmdb_id)) {
          if (i > 0) console.log(`[Anime→TMDB] Tentative ${i + 1} réussie : "${match.name}"`);

          // Enrichir score (MAL > AniList > TMDB)
          if (!match.vote_average) {
            if (malResult?.score)      match.vote_average = malResult.score;
            else if (anilistResult?.score) match.vote_average = anilistResult.score;
          }
          // Enrichir poster (MAL > AniList > TMDB)
          if (!match.poster) {
            if (malResult?.poster)      match.poster = malResult.poster;
            else if (anilistResult?.poster) match.poster = anilistResult.poster;
          }
          return match;
        }
        if (i < attempts.length - 1) await new Promise(r => setTimeout(r, 150));
      }

      console.log(`[Anime→TMDB] Aucun résultat TMDB pour "${primary.title}" (${item.cleanName})`);
    }

    // ── 5. Fallback fournisseur de métadonnées Stremio ───────────────────────
    const standardMatch = await this.matchItem(item);
    if (standardMatch) return standardMatch;

    const stremioMatch = await this.stremioMetadata.search(item);
    if (stremioMatch) return stremioMatch;

    // ── 6. ID anime natif ─────────────────────────────────────────────────────
    // Ces identifiants sont résolus dans Stremio par un addon de métadonnées
    // compatible (AIOMetadata, Kitsu Anime, etc.), sans imposer un faux IMDb ID.
    const native = kitsuResult
      ? { ...kitsuResult, id: `kitsu:${kitsuResult.kitsu_id}` }
      : malResult
      ? { ...malResult, id: `mal:${malResult.mal_id}` }
      : anilistResult
      ? { ...anilistResult, id: `anilist:${anilistResult.anilist_id}` }
      : null;
    if (!native) return null;

    return {
      imdb_id: native.id,
      tmdb_id: null,
      name: native.title || item.cleanName,
      year: native.year || item.year || null,
      poster: native.poster || null,
      background: native.background || null,
      description: native.synopsis || null,
      genres: [],
      vote_average: native.score || null,
      original_language: 'ja',
      origin_country: ['JP']
    };
  }

  async matchBatch(items, onProgress = null) {
    const results = [];
    let matched = 0;
    let failed = 0;
    let alreadyInDb = 0;
    console.log(`[TMDB] Démarrage batch : ${items.length} items`);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (!item.indexer_rlz_id || !item.cleanName) {
        console.log(`[TMDB] ✗ Item invalide (pas de cleanName ou indexer_rlz_id):`, item.release_name);
        failed++;
        if (onProgress) onProgress({ current: i + 1, total: items.length, matched, failed, alreadyInDb });
        continue;
      }

      // 1. Dédup par release exacte (indexer_rlz_id)
      if (this.db.hasRelease(item.indexer_rlz_id)) {
        this.db.markReleaseSeenByIndexer(
          item.indexer_rlz_id,
          item.availability_scan_token || null
        );
        alreadyInDb++;
        matched++;
        if (onProgress) onProgress({ current: i + 1, total: items.length, matched, failed, alreadyInDb });
        continue;
      }

      // 1b. Dédup par hash (quand disponible) — même torrent depuis un feed différent
      if (item.hash && this.db.hasReleaseByHash(item.hash)) {
        this.db.markReleaseSeenByHash(item.hash, item.availability_scan_token || null);
        alreadyInDb++;
        matched++;
        console.log(`[TMDB] ↩ Doublon hash détecté : ${item.cleanName} (${item.hash})`);
        if (onProgress) onProgress({ current: i + 1, total: items.length, matched, failed, alreadyInDb });
        continue;
      }

      // 1c. Les API Newznab fournissent souvent directement un identifiant TMDB.
      // Si le média est déjà indexé, aucune requête TMDB supplémentaire n'est nécessaire.
      if (item.tmdb_id) {
        const existingByTmdb = this.db.getMediaByTmdbId(item.tmdb_id, item.type);
        if (existingByTmdb) {
          if (!this.isCatalogAllowed(item, existingByTmdb.catalog_type)) {
            if (onProgress) onProgress({ current: i + 1, total: items.length, matched, failed, alreadyInDb });
            continue;
          }
          this.db.addRelease({
            media_imdb_id: existingByTmdb.imdb_id,
            release_name: item.release_name,
            indexer_rlz_id: item.indexer_rlz_id,
            source_url: item.source_url || null,
            quality: item.quality || null,
            hash: item.hash || null,
            scan_token: item.availability_scan_token || null
          });
          alreadyInDb++;
          matched++;
          console.log(`[TMDB] ↩ ID TMDB déjà connu : ${existingByTmdb.name} (${existingByTmdb.imdb_id})`);
          if (onProgress) onProgress({ current: i + 1, total: items.length, matched, failed, alreadyInDb });
          continue;
        }
      }

      // 1d. Les imports structurés (WaCustom, StreamFusion, CometNet, manifestes)
      // fournissent souvent déjà un IMDb. Si ce média est connu, enregistrer la
      // release immédiatement évite un appel OMDb/TMDB et la temporisation réseau
      // pour chaque ligne d'un gros rattrapage.
      if (item.direct_meta && /^tt\d+$/i.test(item.direct_meta.imdb_id || '')) {
        const externalIds = Array.isArray(item.direct_meta.external_ids)
          ? item.direct_meta.external_ids
          : [];
        const existingDirect = this.db.getMediaByImdbId(item.direct_meta.imdb_id)
          || externalIds.map(externalId => this.db.getMediaByExternalId(externalId)).find(Boolean);
        if (existingDirect) {
          if (!this.isCatalogAllowed(item, existingDirect.catalog_type)) {
            if (onProgress) onProgress({ current: i + 1, total: items.length, matched, failed, alreadyInDb });
            continue;
          }
          this.db.addRelease({
            media_imdb_id: existingDirect.imdb_id,
            release_name: item.release_name,
            indexer_rlz_id: item.indexer_rlz_id,
            source_url: item.source_url || null,
            quality: item.quality || null,
            hash: item.hash || null,
            scan_token: item.availability_scan_token || null
          });
          this.linkDirectIdentities(item, existingDirect.imdb_id);
          alreadyInDb++;
          matched++;
          if (onProgress) onProgress({ current: i + 1, total: items.length, matched, failed, alreadyInDb });
          continue;
        }
      }

      // 3. Recherche TMDB (via MAL si animé, sinon multi-tentatives standard)
      let match = null;
      try {
        const isAnime = item.catalog_type === 'animés';
        match = item.direct_meta && item.enrich_direct_meta && item.tmdb_id && this.getApiKey()
          ? (await this.fetchByTmdbId(item.tmdb_id, item.type === 'series' ? 'tv' : 'movie')) || item.direct_meta
          : item.direct_meta && item.enrich_direct_meta && this.getApiKey()
          ? (await this.fetchByImdbId(item.direct_meta.imdb_id)) || item.direct_meta
          : item.direct_meta
          ? item.direct_meta
          : item.tmdb_id
          ? await this.fetchByTmdbId(item.tmdb_id, item.type === 'series' ? 'tv' : 'movie')
          : (isAnime ? await this.matchAnimeItem(item) : await this.matchItem(item));
        if (!match && !isAnime) {
          match = await this.stremioMetadata.search(item);
        }
      } catch (err) {
        console.error(`[TMDB] Erreur inattendue sur "${item.cleanName}":`, err.message);
      }

      const matchedMediaId = this.buildMediaId(match, item.type);
      if (match && matchedMediaId) {
        let catalogType = item.catalog_type;
        const resolvedType = match.media_type === 'tv'
          ? 'series'
          : match.media_type === 'movie'
          ? 'movie'
          : item.type;
        if (
          item.source_force === 'auto'
          && item.type_confidence === 'low'
          && resolvedType !== item.type
        ) {
          item.type = resolvedType;
          if (catalogType === 'films' || catalogType === 'series') {
            catalogType = resolvedType === 'series' ? 'series' : 'films';
          }
          console.log(`[Matching] Type corrigé automatiquement : ${item.cleanName} → ${resolvedType}`);
        }

        // ── Appel OMDb (concerts & spectacles) ──────────────────────────────
        // On appelle OMDb uniquement si la clé est configurée et que le média
        // n'est pas déjà dans une catégorie spécifique (animés).
        let omdbResult = null;
        if (this.omdb.isConfigured() && catalogType !== 'animés' && /^tt\d+$/i.test(match.imdb_id)) {
          try {
            omdbResult = await this.omdb.fetch(match.imdb_id);
          } catch (err) {
            console.error(`[OMDb] Erreur pour ${match.imdb_id}:`, err.message);
          }
        }

        if (match.genres) {
          const keywordSet = new Set((match.keywords || []).map(keyword => normalizeMatchTitle(keyword)));
          const hasKeyword = expected => [...expected]
            .some(keyword => keywordSet.has(normalizeMatchTitle(keyword)));
          const tvType = normalizeMatchTitle(match.tv_type);
          const isDocGenre      = match.genres.includes(DOCUMENTARY_GENRE_ID);
          const isDocKeyword    = hasKeyword(DOCUMENTARY_KEYWORDS);
          const isDocTvType     = DOCUMENTARY_TV_TYPES.has(tvType);
          const isDocumentary   = isDocGenre || isDocKeyword || isDocTvType;
          const isAnimeGenre    = match.genres.includes(ANIMATION_GENRE_ID);
          const isMusicGenre    = match.genres.includes(MUSIC_GENRE_ID);
          const isConcertKeyword = hasKeyword(CONCERT_KEYWORDS);
          const isSpectacleKeyword = hasKeyword(SPECTACLE_KEYWORDS);
          const isEmissionGenre = match.genres.some(g => EMISSIONS_GENRE_IDS.has(g));
          const isEmissionMetadata = isEmissionGenre
            || hasKeyword(EMISSION_KEYWORDS)
            || EMISSION_TV_TYPES.has(tvType);
          const isJapanese      = match.original_language === 'ja'
                                || (Array.isArray(match.origin_country) && match.origin_country.includes('JP'));

          // ── Couche de sécurité documentaires : s'applique toujours, quel que soit le flux ──
          // Mais annulée si des genres contradictoires sont présents (Action, SF, Fantastique, Horreur)
          if (isDocumentary && catalogType !== 'documentaires') {
            const hasDisqualifier = match.genres.some(g => DOC_DISQUALIFYING_GENRE_IDS.has(g));
            if (!hasDisqualifier || isDocKeyword || isDocTvType) {
              catalogType = 'documentaires';
              console.log(`[TMDB] ↪ Forcé en documentaire (genre/type/mot-clé) : ${match.name}`);
            } else {
              console.log(`[TMDB] ↪ Genre 99 ignoré — genres contradictoires présents : ${match.name}`);
            }
          }

          // ── Détection concert : TMDB genre Music (10402) + confirmation OMDb ──
          // Ne s'applique pas si déjà classé explicitement en spectacles ou animés.
          // Disqualifié si le film a des genres narratifs (biopic, comédie musicale…).
          if ((isMusicGenre || isConcertKeyword) && !isDocumentary
              && catalogType !== 'concerts' && catalogType !== 'animés') {
            const hasConcertDisqualifier = match.genres.some(g => CONCERT_DISQUALIFYING_GENRE_IDS.has(g));
            const omdbConfirmsMusic      = this.omdb.isMusicGenre(omdbResult);
            // Concert si : pas de genres narratifs disqualifiants ET OMDb confirme "Music"
            // OU : flux forcé en concerts (déjà géré en amont)
            if (!hasConcertDisqualifier && (omdbConfirmsMusic || isConcertKeyword)) {
              catalogType = 'concerts';
              console.log(`[TMDB+OMDb] ↪ Classé en concert (métadonnées concordantes) : ${match.name}`);
            } else if (isMusicGenre && !hasConcertDisqualifier) {
              console.log(`[TMDB] ↪ Genre Music sans confirmation OMDb — conservé ${catalogType} : ${match.name}`);
            }
          }

          // ── Détection spectacle : mots-clés titre + confirmation OMDb ──
          // (TMDB n'a pas de genre dédié pour stand-up, théâtre, cirque…)
          if (catalogType !== 'spectacles' && catalogType !== 'concerts'
              && catalogType !== 'animés' && catalogType !== 'documentaires') {
            const titleLower    = (item.release_name || item.cleanName || '').toLowerCase();
            const hasTitleHint  = /\b(stand[\-\s]?up|one[\-\s]man[\-\s]show|one[\-\s]woman[\-\s]show|spectacle|th[eé][aâ]tre|cirque|magic\s*show|humori[st]te|caf[eé][\-\s]?th[eé][aâ]tre)\b/i.test(titleLower);
            const omdbIsStandup = this.omdb.isStandupComedy(omdbResult);
            if (hasTitleHint || omdbIsStandup || isSpectacleKeyword) {
              catalogType = 'spectacles';
              console.log(`[TMDB+OMDb] ↪ Classé en spectacle (titre/OMDb) : ${match.name}`);
            }
          }

          // ── Reclassifications auto (uniquement si le flux est en mode auto) ──
          if (item.source_force === 'auto' && !isDocumentary
              && catalogType !== 'concerts' && catalogType !== 'spectacles') {
            if (isAnimeGenre && isJapanese) {
              catalogType = 'animés';
              console.log(`[TMDB] ↪ Reclassifié en animé (genre 16 + JP) : ${match.name}`);
            } else if (isEmissionMetadata && catalogType === 'series') {
              const hasEmissionDisqualifier = match.genres.some(g => EMISSION_DISQUALIFYING_GENRE_IDS.has(g));
              if (!hasEmissionDisqualifier) {
                catalogType = 'emissions';
                console.log(`[TMDB] ↪ Reclassifié en émission (genres) : ${match.name}`);
              } else {
                console.log(`[TMDB] ↪ Genre émission ignoré — genres contradictoires présents : ${match.name}`);
              }
            } else if (!isAnimeGenre && catalogType === 'series' && this.tvdb.isConfigured()) {
              // TMDB n'a pas le genre 99 → vérification TVDB pour confirmation documentaire
              try {
                const tvdbResult = await this.tvdb.match(item.cleanName, item.year);
                if (tvdbResult && tvdbResult.isDocumentary) {
                  catalogType = 'documentaires';
                  console.log(`[TVDB] ↪ Confirmé documentaire via TVDB : ${match.name}`);
                }
              } catch (err) {
                console.error(`[TVDB] Erreur vérification docu "${item.cleanName}":`, err.message);
              }
            }
          }
        }

        // Vérifier si ce média est déjà en base.
        // Les médias historiques gardent leur IMDb comme clé ; ceux sans IMDb
        // utilisent une clé interne tmdb:<type>:<id>.
        const externalIds = Array.isArray(item.direct_meta?.external_ids)
          ? item.direct_meta.external_ids
          : [];
        const existingMedia = this.db.getMediaByImdbId(matchedMediaId)
          || (match.tmdb_id ? this.db.getMediaByTmdbId(match.tmdb_id, item.type) : null)
          || externalIds.map(externalId => this.db.getMediaByExternalId(externalId)).find(Boolean);
        const finalCatalogType = existingMedia?.catalog_type || catalogType;
        if (!this.isCatalogAllowed(item, finalCatalogType)) {
          console.log(`[TMDB] ↪ Ignoré par la sélection de catalogues : ${match.name} (${finalCatalogType})`);
          if (onProgress) onProgress({ current: i + 1, total: items.length, matched, failed, alreadyInDb });
          continue;
        }

        if (existingMedia) {
          const mediaId = existingMedia.imdb_id;
          this.db.addMedia({
            ...existingMedia,
            poster: match.poster || existingMedia.poster,
            background: match.background || existingMedia.background,
            description: match.description || existingMedia.description,
            genres: match.genres?.length ? match.genres : existingMedia.genres,
            keywords: match.keywords?.length ? match.keywords : existingMedia.keywords,
            vote_average: match.vote_average || existingMedia.vote_average,
            match_confidence: match.match_confidence ?? existingMedia.match_confidence,
            match_provider: match.match_provider || existingMedia.match_provider,
            match_reasons: match.match_reasons || parseStoredReasons(existingMedia.match_reasons),
            release_name: item.release_name
          });
          // Média déjà connu : on ajoute juste la nouvelle release
          this.db.addRelease({
            media_imdb_id: mediaId,
            release_name: item.release_name,
            indexer_rlz_id: item.indexer_rlz_id,
            source_url: item.source_url || null,
            quality: item.quality || null,
            hash: item.hash || null,
            scan_token: item.availability_scan_token || null
          });
          this.linkDirectIdentities(item, mediaId);
          matched++;
          alreadyInDb++;
          console.log(`[TMDB] ↩ Nouvelle release pour média existant : ${match.name} (${mediaId})`);
        } else {
          // Nouveau média
          const mediaData = {
            imdb_id: matchedMediaId,
            tmdb_id: match.tmdb_id ? match.tmdb_id.toString() : null,
            type: item.type,
            catalog_type: catalogType,
            name: match.name,
            year: match.year,
            poster: match.poster,
            background: match.background,
            description: match.description,
            genres: match.genres,
            keywords: match.keywords || [],
            vote_average: match.vote_average,
            match_confidence: match.match_confidence ?? null,
            match_provider: match.match_provider || (item.direct_meta ? 'source-directe' : null),
            match_reasons: match.match_reasons || [],
            release_name: item.release_name
          };

          const mediaSaved = this.db.addMedia(mediaData);
          if (mediaSaved) {
            this.db.addRelease({
              media_imdb_id: matchedMediaId,
              release_name: item.release_name,
              indexer_rlz_id: item.indexer_rlz_id,
              source_url: item.source_url || null,
              quality: item.quality || null,
              hash: item.hash || null,
              scan_token: item.availability_scan_token || null
            });
            this.linkDirectIdentities(item, matchedMediaId);
            if (match.tmdb_id) this.db.linkMediaIdentity(matchedMediaId, matchedMediaId);
            matched++;
            results.push(mediaData);
            console.log(`[TMDB] ✓ ${item.cleanName} → ${match.name} (${matchedMediaId})`);
          } else {
            failed++;
            console.log(`[TMDB] ✗ Échec sauvegarde : ${item.cleanName}`);
          }
        }
      } else {
        // Fallback TVDB pour les séries si TMDB n'a rien trouvé
        let tvdbMatch = null;
        if (item.type === 'series' && this.tvdb.isConfigured()) {
          try {
            tvdbMatch = await this.tvdb.match(item.cleanName, item.year);
            if (!tvdbMatch?.imdb_id && item.year) {
              // 2ème tentative sans année
              tvdbMatch = await this.tvdb.match(item.cleanName, null);
            }
          } catch (err) {
            console.error(`[TVDB] Fallback error "${item.cleanName}":`, err.message);
          }
        }

        if (tvdbMatch && tvdbMatch.imdb_id) {
          const catalogType = tvdbMatch.isDocumentary ? 'documentaires' : item.catalog_type;
          if (!this.isCatalogAllowed(item, catalogType)) {
            if (onProgress) onProgress({ current: i + 1, total: items.length, matched, failed, alreadyInDb });
            continue;
          }
          console.log(`[TVDB] ✓ Fallback match : ${item.cleanName} → ${tvdbMatch.name} (${tvdbMatch.imdb_id})${tvdbMatch.isDocumentary ? ' [docu]' : ''}`);

          const existingMedia = this.db.getMediaByImdbId(tvdbMatch.imdb_id);
          if (existingMedia) {
            this.db.addRelease({
              media_imdb_id: tvdbMatch.imdb_id,
              release_name: item.release_name,
              indexer_rlz_id: item.indexer_rlz_id,
              source_url: item.source_url || null,
              quality: item.quality || null,
              hash: item.hash || null,
              scan_token: item.availability_scan_token || null
            });
            matched++;
            alreadyInDb++;
          } else {
            const mediaData = {
              imdb_id: tvdbMatch.imdb_id,
              tmdb_id: tvdbMatch.tvdb_id ? `tvdb-${tvdbMatch.tvdb_id}` : null,
              type: item.type,
              catalog_type: catalogType,
              name: tvdbMatch.name,
              year: tvdbMatch.year,
              poster: null,
              background: null,
              description: null,
              genres: [],
              keywords: [],
              vote_average: null,
              match_confidence: null,
              match_provider: 'tvdb',
              match_reasons: ['fallback TVDB'],
              release_name: item.release_name
            };
            const mediaSaved = this.db.addMedia(mediaData);
            if (mediaSaved) {
              this.db.addRelease({
                media_imdb_id: tvdbMatch.imdb_id,
                release_name: item.release_name,
                indexer_rlz_id: item.indexer_rlz_id,
                source_url: item.source_url || null,
                quality: item.quality || null,
                hash: item.hash || null,
                scan_token: item.availability_scan_token || null
              });
              matched++;
              results.push(mediaData);
            } else {
              failed++;
            }
          }
        } else {
          // Aucun match TMDB ni TVDB : stocker dans failed_releases pour retry ultérieur
          failed++;
          this.db.addFailedRelease({
            release_name: item.release_name,
            clean_name: item.cleanName,
            indexer_rlz_id: item.indexer_rlz_id,
            source_url: item.source_url || null,
            catalog_type: item.catalog_type,
            type: item.type,
            year: item.year || null,
            fail_reason: 'no_tmdb_match'
          });
          console.log(`[TMDB] ✗ Aucun match (TMDB + TVDB) : ${item.cleanName}`);
        }
      }

      if (onProgress) {
        onProgress({ current: i + 1, total: items.length, matched, failed, alreadyInDb });
      }

      // Les métadonnées directes n'utilisent pas le réseau, sauf si OMDb est
      // configuré pour classifier un média encore inconnu.
      if (i < items.length - 1 && (!item.direct_meta || this.omdb.isConfigured())) {
        await new Promise(resolve => setTimeout(resolve, 33));
      }
    }

    return { matched, failed, alreadyInDb, results };
  }

  // ─── Override manuel ────────────────────────────────────────────────────────

  async fetchByImdbId(imdbId) {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;
    try {
      const response = await this._fetchWithRetry(
        `${this.baseUrl}/find/${imdbId}`,
        { api_key: apiKey, external_source: 'imdb_id' },
        this.getAxiosConfig()
      );
      const data = response.data;
      if (data.movie_results && data.movie_results.length > 0) {
        const m = data.movie_results[0];
        return {
          tmdb_id: m.id, imdb_id: imdbId, name: m.title,
          year: m.release_date ? m.release_date.substring(0, 4) : null,
          poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
          background: m.backdrop_path ? `https://image.tmdb.org/t/p/original${m.backdrop_path}` : null,
          description: m.overview || null, genres: m.genre_ids || [],
          vote_average: m.vote_average || null, media_type: 'movie',
          original_language: m.original_language || null,
          origin_country: m.origin_country || []
        };
      }
      if (data.tv_results && data.tv_results.length > 0) {
        const s = data.tv_results[0];
        return {
          tmdb_id: s.id, imdb_id: imdbId, name: s.name,
          year: s.first_air_date ? s.first_air_date.substring(0, 4) : null,
          poster: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null,
          background: s.backdrop_path ? `https://image.tmdb.org/t/p/original${s.backdrop_path}` : null,
          description: s.overview || null, genres: s.genre_ids || [],
          vote_average: s.vote_average || null, media_type: 'tv',
          original_language: s.original_language || null,
          origin_country: s.origin_country || []
        };
      }
      return null;
    } catch (err) {
      console.error(`[TMDB] fetchByImdbId error for ${imdbId}:`, err.message);
      return null;
    }
  }

  async fetchByTmdbId(tmdbId, mediaType, language = 'fr-FR') {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;
    try {
      const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
      const response = await this._fetchWithRetry(
        `${this.baseUrl}/${endpoint}/${tmdbId}`,
        { api_key: apiKey, language, append_to_response: 'external_ids,keywords' },
        this.getAxiosConfig()
      );
      const d = response.data;
      const keywordRows = d.keywords?.keywords || d.keywords?.results || [];
      return {
        tmdb_id: d.id,
        imdb_id: d.external_ids?.imdb_id || d.imdb_id || null,
        name: d.title || d.name,
        year: (d.release_date || d.first_air_date || '').substring(0, 4) || null,
        poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
        background: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null,
        description: d.overview || null,
        genres: (d.genres || []).map(g => g.id),
        keywords: keywordRows.map(keyword => keyword.name).filter(Boolean),
        vote_average: d.vote_average || null,
        original_language: d.original_language || null,
        origin_country: d.origin_country || d.production_countries?.map(country => country.iso_3166_1) || [],
        tv_type: endpoint === 'tv' ? d.type || null : null,
        media_type: mediaType,
        match_provider: 'tmdb'
      };
    } catch (err) {
      console.error(`[TMDB] fetchByTmdbId error for ${mediaType}/${tmdbId}:`, err.message);
      return null;
    }
  }

  async applyOverride(failedRelease, idType, idValue) {
    let match = null;
    let itemType = failedRelease.type || 'movie';
    let catalogType = failedRelease.catalog_type || 'films';

    if (idType === 'imdb') {
      match = await this.fetchByImdbId(idValue);
      if (match) {
        itemType    = match.media_type === 'tv' ? 'series' : 'movie';
        catalogType = itemType === 'series' ? 'series' : 'films';
      }
    } else if (idType === 'tmdb_movie') {
      match = await this.fetchByTmdbId(idValue, 'movie');
      if (match) { itemType = 'movie'; catalogType = 'films'; }
    } else if (idType === 'tmdb_tv') {
      match = await this.fetchByTmdbId(idValue, 'tv');
      if (match) { itemType = 'series'; catalogType = 'series'; }
    } else if (idType === 'tvdb') {
      if (!this.tvdb.isConfigured()) throw new Error('TVDB non configuré');
      const extended = await this.tvdb.getSeriesExtended(parseInt(idValue));
      if (!extended) throw new Error('Série TVDB non trouvée');
      const imdbId = this.tvdb.extractImdbId(extended);
      if (!imdbId) throw new Error('Pas d\'IMDB ID disponible dans la réponse TVDB');
      match = {
        tmdb_id: `tvdb-${idValue}`,
        imdb_id: imdbId,
        name: extended.name || failedRelease.clean_name,
        year: extended.firstAired ? extended.firstAired.substring(0, 4) : null,
        poster: null, background: null, description: null,
        genres: [], vote_average: null, media_type: 'tv'
      };
      itemType = 'series'; catalogType = 'series';
    } else {
      throw new Error('Type d\'identifiant inconnu : ' + idType);
    }

    const mediaId = this.buildMediaId(match, itemType);
    if (!match || !mediaId) throw new Error('Aucun résultat trouvé pour cet identifiant');

    const existingMedia = this.db.getMediaByImdbId(mediaId)
      || (match.tmdb_id ? this.db.getMediaByTmdbId(match.tmdb_id, itemType) : null);
    if (existingMedia) {
      this.db.addRelease({
        media_imdb_id: existingMedia.imdb_id,
        release_name: failedRelease.release_name,
        indexer_rlz_id: failedRelease.indexer_rlz_id,
        source_url: failedRelease.source_url || null,
        quality: null, hash: null
      });
    } else {
      const mediaData = {
        imdb_id: mediaId,
        tmdb_id: match.tmdb_id ? match.tmdb_id.toString() : null,
        type: itemType,
        catalog_type: catalogType,
        name: match.name,
        year: match.year,
        poster: match.poster || null,
        background: match.background || null,
        description: match.description || null,
        genres: match.genres || [],
        keywords: match.keywords || [],
        vote_average: match.vote_average || null,
        release_name: failedRelease.release_name
      };
      const saved = this.db.addMedia(mediaData);
      if (!saved) throw new Error('Erreur lors de la sauvegarde du média en base');
      this.db.addRelease({
        media_imdb_id: mediaId,
        release_name: failedRelease.release_name,
        indexer_rlz_id: failedRelease.indexer_rlz_id,
        source_url: failedRelease.source_url || null,
        quality: null, hash: null
      });
      if (match.tmdb_id) this.db.linkMediaIdentity(mediaId, mediaId);
    }

    this.db.deleteFailedRelease(failedRelease.id);
    console.log(`[Override] ✓ ${failedRelease.release_name} → ${match.name} (${existingMedia?.imdb_id || mediaId})`);
    return {
      imdb_id: /^tt\d+$/i.test(existingMedia?.imdb_id || mediaId) ? (existingMedia?.imdb_id || mediaId) : null,
      tmdb_id: match.tmdb_id ? String(match.tmdb_id) : null,
      media_id: existingMedia?.imdb_id || mediaId,
      name: match.name
    };
  }

  // Retry des releases échouées — appelé depuis la WebUI
  async retryFailed(onProgress = null) {
    const failedItems = this.db.popFailedReleasesForRetry(500);
    if (failedItems.length === 0) return { retried: 0, recovered: 0, stillFailed: 0 };

    console.log(`[TMDB] Retry de ${failedItems.length} releases échouées...`);

    // Convertir failed_releases en items compatibles avec matchBatch
    const items = failedItems.map(f => ({
      release_name: f.release_name,
      indexer_rlz_id: f.indexer_rlz_id,
      cleanName: f.clean_name || f.release_name,
      year: f.year,
      catalog_type: f.catalog_type,
      type: f.type,
      source_url: f.source_url,
      quality: null,
      hash: null
    }));

    const result = await this.matchBatch(items, onProgress);
    return {
      retried: failedItems.length,
      recovered: result.matched - result.alreadyInDb,
      stillFailed: result.failed
    };
  }
}

module.exports = TMDBMatcher;
