const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const TVDBService = require('./services/tvdbService');

// Genres TMDB qui indiquent une émission TV plutôt qu'une série narrative
const EMISSIONS_GENRE_IDS = new Set([10763, 10764, 10766, 10767]); // News, Reality, Soap, Talk

// Genre TMDB documentaire (film et série)
const DOCUMENTARY_GENRE_ID = 99;

class TMDBMatcher {
  constructor(db) {
    this.db = db;
    this.baseUrl = 'https://api.themoviedb.org/3';
    this.tvdb = new TVDBService(db);
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
          vote_average: movie.vote_average || null
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
          vote_average: show.vote_average || null
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

      // 3. Recherche TMDB multi-tentatives
      let match = null;
      try {
        match = await this.matchItem(item);
      } catch (err) {
        console.error(`[TMDB] Erreur inattendue sur "${item.cleanName}":`, err.message);
      }

      if (match && match.imdb_id) {
        let catalogType = item.catalog_type;

        // Reclassification automatique via genres TMDB (source_force='auto' uniquement)
        if (item.source_force === 'auto' && match.genres) {
          const isDocGenre = match.genres.includes(DOCUMENTARY_GENRE_ID);
          const isEmissionGenre = match.genres.some(g => EMISSIONS_GENRE_IDS.has(g));

          if (isDocGenre && catalogType !== 'documentaires') {
            catalogType = 'documentaires';
            console.log(`[TMDB] ↪ Reclassifié en documentaire (genre 99) : ${match.name}`);
          } else if (isEmissionGenre && catalogType === 'series') {
            catalogType = 'emissions';
            console.log(`[TMDB] ↪ Reclassifié en émission (genres) : ${match.name}`);
          } else if (!isDocGenre && catalogType === 'series' && this.tvdb.isConfigured()) {
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
            tmdb_id: match.tmdb_id.toString(),
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
