const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const TVDBService     = require('./services/tvdbService');
const MALService      = require('./services/malService');
const AniListService  = require('./services/anilistService');
const OMDbService     = require('./services/omdbService');

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

class TMDBMatcher {
  constructor(db) {
    this.db   = db;
    this.baseUrl = 'https://api.themoviedb.org/3';
    this.tvdb    = new TVDBService(db);
    this.mal     = new MALService(db);
    this.anilist = new AniListService(db);
    this.omdb    = new OMDbService(db);
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

  async searchMovie(title, year = null, language = 'fr-FR') {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;
    try {
      const params = { api_key: apiKey, query: title, language, include_adult: true };
      if (year) params.year = year;
      const response = await this._fetchWithRetry(
        `${this.baseUrl}/search/movie`, params, this.getAxiosConfig()
      );
      if (response.data.results && response.data.results.length > 0) {
        const movie = response.data.results[0];
        const externalIds = await this.getExternalIds('movie', movie.id);
        return {
          tmdb_id: movie.id,
          imdb_id: externalIds?.imdb_id || null,
          name: movie.title,
          year: movie.release_date ? movie.release_date.substring(0, 4) : null,
          poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
          background: movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : null,
          description: movie.overview || null,
          genres: movie.genre_ids || [],
          vote_average: movie.vote_average || null,
          original_language: movie.original_language || null,
          origin_country: []
        };
      }
      return null;
    } catch (error) {
      console.error(`[TMDB] Error searching movie "${title}":`, error.message);
      return null;
    }
  }

  async searchTVShow(title, year = null, language = 'fr-FR') {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;
    try {
      const params = { api_key: apiKey, query: title, language, include_adult: true };
      if (year) params.first_air_date_year = year;
      const response = await this._fetchWithRetry(
        `${this.baseUrl}/search/tv`, params, this.getAxiosConfig()
      );
      if (response.data.results && response.data.results.length > 0) {
        const show = response.data.results[0];
        const externalIds = await this.getExternalIds('tv', show.id);
        return {
          tmdb_id: show.id,
          imdb_id: externalIds?.imdb_id || null,
          name: show.name,
          year: show.first_air_date ? show.first_air_date.substring(0, 4) : null,
          poster: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
          background: show.backdrop_path ? `https://image.tmdb.org/t/p/original${show.backdrop_path}` : null,
          description: show.overview || null,
          genres: show.genre_ids || [],
          vote_average: show.vote_average || null,
          original_language: show.original_language || null,
          origin_country: show.origin_country || []
        };
      }
      return null;
    } catch (error) {
      console.error(`[TMDB] Error searching TV "${title}":`, error.message);
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
      ? (t, y, l) => this.searchTVShow(t, y, l)
      : (t, y, l) => this.searchMovie(t, y, l);

    // Titre simplifié : on garde seulement les 3 premiers mots pour les titres longs
    const simplifiedName = item.cleanName.split(' ').slice(0, 3).join(' ');

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
      if (match && match.imdb_id) {
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

    // ── 3. Matching TMDB avec titres normalisés ───────────────────────────────
    if (malResult || anilistResult) {
      // Priorité MAL, AniList en complément
      const primary   = malResult || anilistResult;
      const secondary = malResult ? anilistResult : null;

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
      if (secondary) addTitle(secondary.title);

      // Titres alternatifs
      addTitle(primary.title_romaji ?? primary.title_ja);
      if (secondary) {
        addTitle(secondary.title_romaji);
        addTitle(secondary.title_ja);
      }
      addTitle(primary.title_ja);
      addTitle(item.cleanName); // toujours en dernier fallback

      const bestYear = primary.year || (secondary && secondary.year) || item.year;

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
        if (match && match.imdb_id) {
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

    // Fallback : matching standard TMDB sans normalisateur
    return this.matchItem(item);
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
        alreadyInDb++;
        matched++;
        if (onProgress) onProgress({ current: i + 1, total: items.length, matched, failed, alreadyInDb });
        continue;
      }

      // 1b. Dédup par hash (quand disponible) — même torrent depuis un feed différent
      if (item.hash && this.db.hasReleaseByHash(item.hash)) {
        alreadyInDb++;
        matched++;
        console.log(`[TMDB] ↩ Doublon hash détecté : ${item.cleanName} (${item.hash})`);
        if (onProgress) onProgress({ current: i + 1, total: items.length, matched, failed, alreadyInDb });
        continue;
      }

      // 2. Pour les séries : si le show est déjà en base (même titre TMDB), on ajoute juste la release
      if (item.type === 'series') {
        // On ne peut pas faire ça sans connaître le nom TMDB... on le sait uniquement après match.
        // On vérifie via cleanName (approximatif) — si match confirmé, on ajoutera la release plus bas.
      }

      // 3. Recherche TMDB (via MAL si animé, sinon multi-tentatives standard)
      let match = null;
      try {
        const isAnime = item.catalog_type === 'animés';
        match = item.direct_meta
          ? item.direct_meta
          : item.tmdb_id
          ? await this.fetchByTmdbId(item.tmdb_id, item.type === 'series' ? 'tv' : 'movie')
          : (isAnime ? await this.matchAnimeItem(item) : await this.matchItem(item));
      } catch (err) {
        console.error(`[TMDB] Erreur inattendue sur "${item.cleanName}":`, err.message);
      }

      if (match && match.imdb_id) {
        let catalogType = item.catalog_type;

        // ── Appel OMDb (concerts & spectacles) ──────────────────────────────
        // On appelle OMDb uniquement si la clé est configurée et que le média
        // n'est pas déjà dans une catégorie spécifique (animés).
        let omdbResult = null;
        if (this.omdb.isConfigured() && catalogType !== 'animés') {
          try {
            omdbResult = await this.omdb.fetch(match.imdb_id);
          } catch (err) {
            console.error(`[OMDb] Erreur pour ${match.imdb_id}:`, err.message);
          }
        }

        if (match.genres) {
          const isDocGenre      = match.genres.includes(DOCUMENTARY_GENRE_ID);
          const isAnimeGenre    = match.genres.includes(ANIMATION_GENRE_ID);
          const isMusicGenre    = match.genres.includes(MUSIC_GENRE_ID);
          const isEmissionGenre = match.genres.some(g => EMISSIONS_GENRE_IDS.has(g));
          const isJapanese      = match.original_language === 'ja'
                                || (Array.isArray(match.origin_country) && match.origin_country.includes('JP'));

          // ── Couche de sécurité documentaires : s'applique toujours, quel que soit le flux ──
          // Mais annulée si des genres contradictoires sont présents (Action, SF, Fantastique, Horreur)
          if (isDocGenre && catalogType !== 'documentaires') {
            const hasDisqualifier = match.genres.some(g => DOC_DISQUALIFYING_GENRE_IDS.has(g));
            if (!hasDisqualifier) {
              catalogType = 'documentaires';
              console.log(`[TMDB] ↪ Forcé en documentaire (genre 99) : ${match.name}`);
            } else {
              console.log(`[TMDB] ↪ Genre 99 ignoré — genres contradictoires présents : ${match.name}`);
            }
          }

          // ── Détection concert : TMDB genre Music (10402) + confirmation OMDb ──
          // Ne s'applique pas si déjà classé explicitement en spectacles ou animés.
          // Disqualifié si le film a des genres narratifs (biopic, comédie musicale…).
          if (isMusicGenre && !isDocGenre
              && catalogType !== 'concerts' && catalogType !== 'animés') {
            const hasConcertDisqualifier = match.genres.some(g => CONCERT_DISQUALIFYING_GENRE_IDS.has(g));
            const omdbConfirmsMusic      = this.omdb.isMusicGenre(omdbResult);
            // Concert si : pas de genres narratifs disqualifiants ET OMDb confirme "Music"
            // OU : flux forcé en concerts (déjà géré en amont)
            if (!hasConcertDisqualifier && omdbConfirmsMusic) {
              catalogType = 'concerts';
              console.log(`[TMDB+OMDb] ↪ Classé en concert (genre 10402 + OMDb Music) : ${match.name}`);
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
            if (hasTitleHint || omdbIsStandup) {
              catalogType = 'spectacles';
              console.log(`[TMDB+OMDb] ↪ Classé en spectacle (titre/OMDb) : ${match.name}`);
            }
          }

          // ── Reclassifications auto (uniquement si le flux est en mode auto) ──
          if (item.source_force === 'auto' && !isDocGenre
              && catalogType !== 'concerts' && catalogType !== 'spectacles') {
            if (isAnimeGenre && isJapanese) {
              catalogType = 'animés';
              console.log(`[TMDB] ↪ Reclassifié en animé (genre 16 + JP) : ${match.name}`);
            } else if (isEmissionGenre && catalogType === 'series') {
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

        // Vérifier si ce média (imdb_id) est déjà en base
        const existingMedia = this.db.getMediaByImdbId(match.imdb_id);

        if (existingMedia) {
          // Média déjà connu : on ajoute juste la nouvelle release
          this.db.addRelease({
            media_imdb_id: match.imdb_id,
            release_name: item.release_name,
            indexer_rlz_id: item.indexer_rlz_id,
            source_url: item.source_url || null,
            quality: item.quality || null,
            hash: item.hash || null
          });
          matched++;
          alreadyInDb++;
          console.log(`[TMDB] ↩ Nouvelle release pour média existant : ${match.name} (${match.imdb_id})`);
        } else {
          // Nouveau média
          const mediaData = {
            imdb_id: match.imdb_id,
            tmdb_id: match.tmdb_id ? match.tmdb_id.toString() : null,
            type: item.type,
            catalog_type: catalogType,
            name: match.name,
            year: match.year,
            poster: match.poster,
            background: match.background,
            description: match.description,
            genres: match.genres,
            vote_average: match.vote_average,
            release_name: item.release_name
          };

          const mediaSaved = this.db.addMedia(mediaData);
          if (mediaSaved) {
            this.db.addRelease({
              media_imdb_id: match.imdb_id,
              release_name: item.release_name,
              indexer_rlz_id: item.indexer_rlz_id,
              source_url: item.source_url || null,
              quality: item.quality || null,
              hash: item.hash || null
            });
            matched++;
            results.push(mediaData);
            console.log(`[TMDB] ✓ ${item.cleanName} → ${match.name} (${match.imdb_id})`);
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
          console.log(`[TVDB] ✓ Fallback match : ${item.cleanName} → ${tvdbMatch.name} (${tvdbMatch.imdb_id})${tvdbMatch.isDocumentary ? ' [docu]' : ''}`);

          const existingMedia = this.db.getMediaByImdbId(tvdbMatch.imdb_id);
          if (existingMedia) {
            this.db.addRelease({
              media_imdb_id: tvdbMatch.imdb_id,
              release_name: item.release_name,
              indexer_rlz_id: item.indexer_rlz_id,
              source_url: item.source_url || null,
              quality: item.quality || null,
              hash: item.hash || null
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
              vote_average: null,
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
                hash: item.hash || null
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

      // Rate limiting : ~30 req/sec
      if (i < items.length - 1) {
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
          vote_average: m.vote_average || null, media_type: 'movie'
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
          vote_average: s.vote_average || null, media_type: 'tv'
        };
      }
      return null;
    } catch (err) {
      console.error(`[TMDB] fetchByImdbId error for ${imdbId}:`, err.message);
      return null;
    }
  }

  async fetchByTmdbId(tmdbId, mediaType) {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;
    try {
      const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
      const response = await this._fetchWithRetry(
        `${this.baseUrl}/${endpoint}/${tmdbId}`,
        { api_key: apiKey, append_to_response: 'external_ids' },
        this.getAxiosConfig()
      );
      const d = response.data;
      return {
        tmdb_id: d.id,
        imdb_id: d.external_ids?.imdb_id || d.imdb_id || null,
        name: d.title || d.name,
        year: (d.release_date || d.first_air_date || '').substring(0, 4) || null,
        poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
        background: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null,
        description: d.overview || null,
        genres: (d.genres || []).map(g => g.id),
        vote_average: d.vote_average || null,
        original_language: d.original_language || null,
        origin_country: d.origin_country || d.production_countries?.map(country => country.iso_3166_1) || [],
        media_type: mediaType
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

    if (!match || !match.imdb_id) throw new Error('Aucun résultat trouvé pour cet identifiant');

    const existingMedia = this.db.getMediaByImdbId(match.imdb_id);
    if (existingMedia) {
      this.db.addRelease({
        media_imdb_id: match.imdb_id,
        release_name: failedRelease.release_name,
        indexer_rlz_id: failedRelease.indexer_rlz_id,
        source_url: failedRelease.source_url || null,
        quality: null, hash: null
      });
    } else {
      const mediaData = {
        imdb_id: match.imdb_id,
        tmdb_id: match.tmdb_id ? match.tmdb_id.toString() : null,
        type: itemType,
        catalog_type: catalogType,
        name: match.name,
        year: match.year,
        poster: match.poster || null,
        background: match.background || null,
        description: match.description || null,
        genres: match.genres || [],
        vote_average: match.vote_average || null,
        release_name: failedRelease.release_name
      };
      const saved = this.db.addMedia(mediaData);
      if (!saved) throw new Error('Erreur lors de la sauvegarde du média en base');
      this.db.addRelease({
        media_imdb_id: match.imdb_id,
        release_name: failedRelease.release_name,
        indexer_rlz_id: failedRelease.indexer_rlz_id,
        source_url: failedRelease.source_url || null,
        quality: null, hash: null
      });
    }

    this.db.deleteFailedRelease(failedRelease.id);
    console.log(`[Override] ✓ ${failedRelease.release_name} → ${match.name} (${match.imdb_id})`);
    return { imdb_id: match.imdb_id, name: match.name };
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
