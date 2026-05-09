const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class DatabaseManager {
  constructor(dbPath) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initTables();
  }

  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        total_items INTEGER NOT NULL,
        matched_items INTEGER NOT NULL,
        failed_items INTEGER NOT NULL,
        already_in_db INTEGER DEFAULT 0,
        films_added INTEGER DEFAULT 0,
        documentaires_added INTEGER DEFAULT 0,
        series_added INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        error_message TEXT
      )
    `);

    // Table principale : un média = une ligne (clé = imdb_id)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS media (
        imdb_id TEXT PRIMARY KEY,
        tmdb_id TEXT,
        type TEXT NOT NULL,
        catalog_type TEXT NOT NULL,
        name TEXT NOT NULL,
        year TEXT,
        poster TEXT,
        background TEXT,
        description TEXT,
        genres TEXT,
        vote_average REAL,
        release_name TEXT,
        first_seen_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Table des releases : toutes les releases connues pour chaque média
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS releases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_imdb_id TEXT NOT NULL REFERENCES media(imdb_id) ON DELETE CASCADE,
        release_name TEXT NOT NULL,
        indexer_rlz_id TEXT NOT NULL UNIQUE,
        source_url TEXT,
        quality TEXT,
        hash TEXT,
        added_at INTEGER NOT NULL
      )
    `);

    // Table des erreurs de fetch par flux RSS
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS feed_fetch_errors (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        source_url  TEXT    NOT NULL,
        error_msg   TEXT,
        http_status INTEGER,
        failed_at   INTEGER NOT NULL
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_feed_errors_url ON feed_fetch_errors(source_url);
    `);

    // Table des releases non matchées (pour retry)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS failed_releases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        release_name TEXT NOT NULL,
        clean_name TEXT,
        indexer_rlz_id TEXT NOT NULL UNIQUE,
        source_url TEXT,
        catalog_type TEXT,
        type TEXT,
        year TEXT,
        fail_reason TEXT,
        attempted_at INTEGER NOT NULL,
        retry_count INTEGER DEFAULT 0
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_media_catalog_type ON media(catalog_type);
      CREATE INDEX IF NOT EXISTS idx_media_type ON media(type);
      CREATE INDEX IF NOT EXISTS idx_media_first_seen ON media(first_seen_at);
      CREATE INDEX IF NOT EXISTS idx_media_catalog_seen ON media(catalog_type, first_seen_at DESC);
      CREATE INDEX IF NOT EXISTS idx_media_catalog_type_type ON media(catalog_type, type, first_seen_at DESC);
      CREATE INDEX IF NOT EXISTS idx_releases_media ON releases(media_imdb_id);
      CREATE INDEX IF NOT EXISTS idx_releases_indexer ON releases(indexer_rlz_id);
      CREATE INDEX IF NOT EXISTS idx_failed_indexer ON failed_releases(indexer_rlz_id);
    `);

    // Migration depuis l'ancien schéma catalog_items si nécessaire
    const alreadyMigrated = this.db.prepare("SELECT value FROM config WHERE key = 'schema_v2_migrated'").get();
    if (!alreadyMigrated) {
      const hasOldTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='catalog_items'").get();
      if (hasOldTable) {
        this._migrateFromV1();
      }
    }

    this.initDefaultConfig();
  }

  _migrateFromV1() {
    console.log('[DB] Migration v1 → v2 : catalog_items → media + releases...');
    try {
      const rows = this.db.prepare('SELECT * FROM catalog_items WHERE imdb_id IS NOT NULL').all();
      console.log(`[DB] ${rows.length} items à migrer`);

      const insertMedia = this.db.prepare(`
        INSERT OR IGNORE INTO media
          (imdb_id, tmdb_id, type, catalog_type, name, year, poster, background, description, genres, vote_average, release_name, first_seen_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertRelease = this.db.prepare(`
        INSERT OR IGNORE INTO releases
          (media_imdb_id, release_name, indexer_rlz_id, added_at)
        VALUES (?, ?, ?, ?)
      `);

      const migrate = this.db.transaction((rows) => {
        for (const row of rows) {
          insertMedia.run(
            row.imdb_id, row.tmdb_id, row.type, row.catalog_type,
            row.name, row.year, row.poster, row.background, row.description,
            row.genres, row.vote_average || null, row.release_name,
            row.added_at, row.added_at
          );
          insertRelease.run(row.imdb_id, row.release_name, row.indexer_rlz_id, row.added_at);
        }
      });

      migrate(rows);
      this.db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('schema_v2_migrated', 'true')").run();
      console.log(`[DB] Migration terminée : ${rows.length} médias migrés`);
    } catch (err) {
      console.error('[DB] Erreur migration :', err.message);
    }
  }

  initDefaultConfig() {
    const defaults = {
      rss_films_name: '',
      rss_films_url: '',
      rss_films_force: 'auto',
      rss_additional_urls: '[]',
      tmdb_api_key: '',
      tvdb_api_key: '',
      proxy_enabled: 'false',
      proxy_host: '',
      proxy_port: '',
      proxy_username: '',
      proxy_password: '',
      proxy_protocol: 'http',
      refresh_interval: '180',
      auto_refresh_enabled: 'false',
      last_sync_films: '0',
      discord_webhook_url: '',
      discord_notifications_enabled: 'false',
      discord_enhanced_notifications_enabled: 'false',
      discord_rpdb_posters_enabled: 'false',
      rpdb_enabled: 'false',
      rpdb_api_key: '',
      required_tags: 'FRENCH,MULTi,TRUEFRENCH,VOF,VFF,VFI,VFQ',
      prowlarr_url: '',
      prowlarr_apikey: '',
      nzbhydra2_url: '',
      nzbhydra2_apikey: '',
      mal_client_id: '',
      apprise_enabled: 'false',
      apprise_server_url: '',
      apprise_urls: ''
    };

    const stmt = this.db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(defaults)) {
      stmt.run(key, value);
    }
  }

  // ─── Config ───────────────────────────────────────────────────────────────

  getConfig(key) {
    const row = this.db.prepare('SELECT value FROM config WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  setConfig(key, value) {
    this.db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value);
  }

  getAllConfig() {
    const rows = this.db.prepare('SELECT key, value FROM config').all();
    return rows.reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});
  }

  // ─── Médias ───────────────────────────────────────────────────────────────

  addMedia(item) {
    const now = Date.now();
    try {
      this.db.prepare(`
        INSERT INTO media
          (imdb_id, tmdb_id, type, catalog_type, name, year, poster, background, description, genres, vote_average, release_name, first_seen_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(imdb_id) DO UPDATE SET
          poster       = excluded.poster,
          background   = excluded.background,
          description  = excluded.description,
          vote_average = excluded.vote_average,
          release_name = excluded.release_name,
          updated_at   = excluded.updated_at
      `).run(
        item.imdb_id,
        item.tmdb_id || null,
        item.type,
        item.catalog_type,
        item.name,
        item.year || null,
        item.poster || null,
        item.background || null,
        item.description || null,
        item.genres ? JSON.stringify(item.genres) : null,
        item.vote_average || null,
        item.release_name || null,
        item.first_seen_at || now,
        now
      );
      return true;
    } catch (err) {
      console.error('[DB] addMedia error:', err.message);
      return false;
    }
  }

  getMediaByImdbId(imdbId) {
    const row = this.db.prepare('SELECT * FROM media WHERE imdb_id = ?').get(imdbId);
    if (row && row.genres) row.genres = JSON.parse(row.genres);
    return row;
  }

  getMedia(catalogType, skip = 0, limit = 100, typeFilter = null) {
    if (typeFilter) {
      const rows = this.db.prepare(`
        SELECT * FROM media
        WHERE catalog_type = ? AND type = ?
        ORDER BY first_seen_at DESC
        LIMIT ? OFFSET ?
      `).all(catalogType, typeFilter, Number(limit), Number(skip));
      return rows.map(r => ({ ...r, genres: r.genres ? JSON.parse(r.genres) : [] }));
    }
    const rows = this.db.prepare(`
      SELECT * FROM media
      WHERE catalog_type = ?
      ORDER BY first_seen_at DESC
      LIMIT ? OFFSET ?
    `).all(catalogType, Number(limit), Number(skip));
    return rows.map(r => ({ ...r, genres: r.genres ? JSON.parse(r.genres) : [] }));
  }

  getMediaCount(catalogType, typeFilter = null) {
    if (typeFilter) {
      const row = this.db.prepare('SELECT COUNT(*) as count FROM media WHERE catalog_type = ? AND type = ?').get(catalogType, typeFilter);
      return row ? row.count : 0;
    }
    const row = this.db.prepare('SELECT COUNT(*) as count FROM media WHERE catalog_type = ?').get(catalogType);
    return row ? row.count : 0;
  }

  searchMedia(catalogType, query, skip = 0, limit = 20, typeFilter = null) {
    const term = `%${query}%`;
    if (typeFilter) {
      const rows = this.db.prepare(`
        SELECT * FROM media
        WHERE catalog_type = ? AND type = ? AND (name LIKE ? OR release_name LIKE ?)
        ORDER BY first_seen_at DESC
        LIMIT ? OFFSET ?
      `).all(catalogType, typeFilter, term, term, Number(limit), Number(skip));
      return rows.map(r => ({ ...r, genres: r.genres ? JSON.parse(r.genres) : [] }));
    }
    const rows = this.db.prepare(`
      SELECT * FROM media
      WHERE catalog_type = ? AND (name LIKE ? OR release_name LIKE ?)
      ORDER BY first_seen_at DESC
      LIMIT ? OFFSET ?
    `).all(catalogType, term, term, Number(limit), Number(skip));
    return rows.map(r => ({ ...r, genres: r.genres ? JSON.parse(r.genres) : [] }));
  }

  getRecentMediaAdditions(catalogType, limit = 5) {
    const rows = this.db.prepare(`
      SELECT * FROM media
      WHERE catalog_type = ?
      ORDER BY first_seen_at DESC
      LIMIT ?
    `).all(catalogType, limit);
    return rows.map(r => ({ ...r, genres: r.genres ? JSON.parse(r.genres) : [] }));
  }

  // ─── Releases ─────────────────────────────────────────────────────────────

  addRelease(release) {
    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO releases
          (media_imdb_id, release_name, indexer_rlz_id, source_url, quality, hash, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        release.media_imdb_id,
        release.release_name,
        release.indexer_rlz_id,
        release.source_url || null,
        release.quality || null,
        release.hash || null,
        release.added_at || Date.now()
      );
      return true;
    } catch (err) {
      console.error('[DB] addRelease error:', err.message);
      return false;
    }
  }

  hasRelease(indexerRlzId) {
    return !!this.db.prepare('SELECT id FROM releases WHERE indexer_rlz_id = ?').get(indexerRlzId);
  }

  hasReleaseByHash(hash) {
    if (!hash) return false;
    return !!this.db.prepare('SELECT id FROM releases WHERE hash = ?').get(hash);
  }

  // Pour les séries : vérifie si un show est déjà indexé (par nom TMDB)
  hasMediaByName(catalogType, name) {
    return !!this.db.prepare(
      'SELECT imdb_id FROM media WHERE catalog_type = ? AND name = ? COLLATE NOCASE LIMIT 1'
    ).get(catalogType, name);
  }

  getReleasesByMedia(imdbId) {
    return this.db.prepare('SELECT * FROM releases WHERE media_imdb_id = ? ORDER BY added_at DESC').all(imdbId);
  }

  // ─── Releases échouées ────────────────────────────────────────────────────

  addFailedRelease(item) {
    try {
      this.db.prepare(`
        INSERT INTO failed_releases
          (release_name, clean_name, indexer_rlz_id, source_url, catalog_type, type, year, fail_reason, attempted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(indexer_rlz_id) DO UPDATE SET
          retry_count  = retry_count + 1,
          attempted_at = excluded.attempted_at,
          fail_reason  = excluded.fail_reason
      `).run(
        item.release_name,
        item.clean_name || null,
        item.indexer_rlz_id,
        item.source_url || null,
        item.catalog_type || null,
        item.type || null,
        item.year || null,
        item.fail_reason || null,
        Date.now()
      );
      return true;
    } catch (err) {
      console.error('[DB] addFailedRelease error:', err.message);
      return false;
    }
  }

  getFailedReleases(limit = 200, offset = 0) {
    return this.db.prepare(`
      SELECT * FROM failed_releases
      ORDER BY attempted_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
  }

  getFailedReleasesCount() {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM failed_releases').get();
    return row ? row.count : 0;
  }

  getFailedReleaseById(id) {
    return this.db.prepare('SELECT * FROM failed_releases WHERE id = ?').get(id);
  }

  deleteFailedRelease(id) {
    return this.db.prepare('DELETE FROM failed_releases WHERE id = ?').run(id).changes;
  }

  clearFailedReleases() {
    return this.db.prepare('DELETE FROM failed_releases').run().changes;
  }

  // Récupère les releases échouées pour retry et les supprime (elles seront réinsérées si elles échouent encore)
  popFailedReleasesForRetry(limit = 500) {
    const rows = this.db.prepare(`
      SELECT * FROM failed_releases
      ORDER BY retry_count ASC, attempted_at ASC
      LIMIT ?
    `).all(limit);
    if (rows.length > 0) {
      const ids = rows.map(r => r.id);
      this.db.prepare(`DELETE FROM failed_releases WHERE id IN (${ids.join(',')})`).run();
    }
    return rows;
  }

  // ─── Historique des syncs ─────────────────────────────────────────────────

  createSyncHistory(totalItems) {
    const result = this.db.prepare(`
      INSERT INTO sync_history (started_at, total_items, matched_items, failed_items, already_in_db, status)
      VALUES (?, ?, 0, 0, 0, 'running')
    `).run(Date.now(), totalItems);
    return result.lastInsertRowid;
  }

  updateSyncHistory(syncId, data) {
    const fields = [];
    const values = [];
    const map = {
      matched_items: 'matched_items = ?',
      failed_items: 'failed_items = ?',
      already_in_db: 'already_in_db = ?',
      films_added: 'films_added = ?',
      documentaires_added: 'documentaires_added = ?',
      series_added: 'series_added = ?',
      status: 'status = ?',
      error_message: 'error_message = ?',
      finished_at: 'finished_at = ?'
    };
    for (const [key, expr] of Object.entries(map)) {
      if (data[key] !== undefined) {
        fields.push(expr);
        values.push(data[key]);
      }
    }
    if (fields.length === 0) return;
    values.push(syncId);
    this.db.prepare(`UPDATE sync_history SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  getSyncHistory(limit = 10) {
    return this.db.prepare('SELECT * FROM sync_history ORDER BY started_at DESC LIMIT ?').all(limit);
  }

  getLatestSync() {
    return this.db.prepare('SELECT * FROM sync_history ORDER BY started_at DESC LIMIT 1').get();
  }

  getSyncHistoryDates() {
    return this.db.prepare(`
      SELECT DATE(started_at / 1000, 'unixepoch') as date, COUNT(*) as count
      FROM sync_history GROUP BY date ORDER BY date DESC
    `).all();
  }

  getSyncHistoryByDate(date) {
    return this.db.prepare(`
      SELECT * FROM sync_history
      WHERE DATE(started_at / 1000, 'unixepoch') = ?
      ORDER BY started_at DESC
    `).all(date);
  }

  // ─── WebUI Listing ────────────────────────────────────────────────────────

  getMediaList({ catalog = null, search = '', page = 1, limit = 24, sort = 'date_desc', year = null, quality = null } = {}) {
    const offset = (Number(page) - 1) * Number(limit);
    const conditions = [];
    const params = [];

    if (catalog) { conditions.push('m.catalog_type = ?'); params.push(catalog); }
    if (search)  { conditions.push('(m.name LIKE ? OR m.release_name LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

    // Support plage d'années : "2010-2020" ou année seule "2024"
    if (year) {
      const rangeParts = String(year).match(/^(\d{4})-(\d{4})$/);
      if (rangeParts) {
        conditions.push('CAST(m.year AS INTEGER) >= ? AND CAST(m.year AS INTEGER) <= ?');
        params.push(parseInt(rangeParts[1]), parseInt(rangeParts[2]));
      } else {
        conditions.push('m.year = ?');
        params.push(String(year));
      }
    }

    if (quality) { conditions.push('EXISTS (SELECT 1 FROM releases rq WHERE rq.media_imdb_id = m.imdb_id AND rq.quality LIKE ?)'); params.push(`%${quality}%`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sortMap = {
      'date_desc': 'm.first_seen_at DESC',
      'date_asc':  'm.first_seen_at ASC',
      'year_desc': 'CAST(COALESCE(m.year, 0) AS INTEGER) DESC, m.first_seen_at DESC',
      'year_asc':  'CAST(COALESCE(m.year, 9999) AS INTEGER) ASC, m.first_seen_at DESC',
      'name_asc':  'm.name ASC COLLATE NOCASE',
      'name_desc': 'm.name DESC COLLATE NOCASE',
    };
    const orderBy = sortMap[sort] || 'm.first_seen_at DESC';

    const total = this.db.prepare(`SELECT COUNT(*) as c FROM media m ${where}`).get(...params).c;

    const rows = this.db.prepare(`
      SELECT m.*, COUNT(r.id) as release_count,
        (SELECT GROUP_CONCAT(release_name, '|||')
         FROM (SELECT release_name FROM releases WHERE media_imdb_id = m.imdb_id ORDER BY added_at DESC LIMIT 3)
        ) as release_names_raw
      FROM media m LEFT JOIN releases r ON r.media_imdb_id = m.imdb_id
      ${where}
      GROUP BY m.imdb_id
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, Number(limit), offset);

    return {
      items: rows.map(r => ({
        ...r,
        genres: r.genres ? JSON.parse(r.genres) : [],
        release_names: r.release_names_raw ? r.release_names_raw.split('|||') : []
      })),
      total, page: Number(page), limit: Number(limit),
      pages: Math.ceil(total / Number(limit))
    };
  }

  getMediaYears() {
    return this.db.prepare(`
      SELECT DISTINCT year FROM media
      WHERE year IS NOT NULL AND year != ''
      ORDER BY year DESC
    `).all().map(r => r.year);
  }

  getReleasesList({ search = '', page = 1, limit = 50 } = {}) {
    const offset = (Number(page) - 1) * Number(limit);
    const conditions = [];
    const params = [];

    if (search) {
      conditions.push('(r.release_name LIKE ? OR m.name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = this.db.prepare(`
      SELECT COUNT(*) as c FROM releases r
      LEFT JOIN media m ON r.media_imdb_id = m.imdb_id
      ${where}
    `).get(...params).c;

    const rows = this.db.prepare(`
      SELECT r.id, r.release_name, r.quality, r.hash, r.added_at, r.source_url,
             m.imdb_id as media_imdb_id, m.name as media_name, m.year as media_year,
             m.catalog_type, m.poster as media_poster
      FROM releases r
      LEFT JOIN media m ON r.media_imdb_id = m.imdb_id
      ${where}
      ORDER BY r.added_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(limit), offset);

    return {
      items: rows,
      total, page: Number(page), limit: Number(limit),
      pages: Math.ceil(total / Number(limit))
    };
  }

  recordFeedError(url, errorMsg, httpStatus = null) {
    try {
      this.db.prepare(`
        INSERT INTO feed_fetch_errors (source_url, error_msg, http_status, failed_at)
        VALUES (?, ?, ?, ?)
      `).run(url, errorMsg || null, httpStatus || null, Date.now());
    } catch (e) { console.error('[DB] recordFeedError:', e.message); }
  }

  recordFeedSuccess(url) {
    try {
      // On supprime les erreurs précédentes pour ce flux quand il revient en succès
      this.db.prepare(`DELETE FROM feed_fetch_errors WHERE source_url = ?`).run(url);
    } catch (e) { console.error('[DB] recordFeedSuccess:', e.message); }
  }

  getSourceStats() {
    // Stats principales avec breakdown par catégorie
    const rows = this.db.prepare(`
      SELECT
        r.source_url,
        COUNT(*)                      AS release_count,
        COUNT(DISTINCT r.media_imdb_id) AS media_count,
        MIN(r.added_at)               AS first_seen,
        MAX(r.added_at)               AS last_seen,
        SUM(CASE WHEN m.catalog_type = 'films'         THEN 1 ELSE 0 END) AS films_count,
        SUM(CASE WHEN m.catalog_type = 'documentaires' THEN 1 ELSE 0 END) AS documentaires_count,
        SUM(CASE WHEN m.catalog_type = 'series'        THEN 1 ELSE 0 END) AS series_count,
        SUM(CASE WHEN m.catalog_type = 'emissions'     THEN 1 ELSE 0 END) AS emissions_count,
        SUM(CASE WHEN m.catalog_type = 'animés'        THEN 1 ELSE 0 END) AS animes_count
      FROM releases r
      LEFT JOIN media m ON r.media_imdb_id = m.imdb_id
      WHERE r.source_url IS NOT NULL AND r.source_url != ''
      GROUP BY r.source_url
      ORDER BY release_count DESC
    `).all();

    // Erreurs de fetch par URL
    const errors = this.db.prepare(`
      SELECT
        source_url,
        COUNT(*)      AS error_count,
        MAX(failed_at) AS last_error_at,
        error_msg     AS last_error_msg,
        http_status   AS last_http_status
      FROM feed_fetch_errors
      GROUP BY source_url
    `).all();

    const errorMap = {};
    errors.forEach(e => { errorMap[e.source_url] = e; });

    return rows.map(r => ({
      ...r,
      error_count:      errorMap[r.source_url]?.error_count      || 0,
      last_error_at:    errorMap[r.source_url]?.last_error_at    || null,
      last_error_msg:   errorMap[r.source_url]?.last_error_msg   || null,
      last_http_status: errorMap[r.source_url]?.last_http_status || null,
    }));
  }

  // Flux configurés sans aucune release (jamais fetchés avec succès)
  getFeedErrorsOnly() {
    return this.db.prepare(`
      SELECT
        source_url,
        COUNT(*)       AS error_count,
        MAX(failed_at) AS last_error_at,
        error_msg      AS last_error_msg,
        http_status    AS last_http_status
      FROM feed_fetch_errors
      WHERE source_url NOT IN (SELECT DISTINCT source_url FROM releases WHERE source_url IS NOT NULL)
      GROUP BY source_url
      ORDER BY last_error_at DESC
    `).all();
  }

  // ─── Aliases backward-compat ──────────────────────────────────────────────

  getCatalogItems(catalogType, skip, limit) { return this.getMedia(catalogType, skip, limit); }
  getCatalogCount(catalogType) { return this.getMediaCount(catalogType); }
  searchCatalog(catalogType, query, skip, limit) { return this.searchMedia(catalogType, query, skip, limit); }
  getRecentCatalogAdditions(catalogType, limit) { return this.getRecentMediaAdditions(catalogType, limit); }

  // Retourne tous les médias avec l'URL de leur release la plus ancienne (source d'origine)
  getAllMediaWithPrimarySource() {
    return this.db.prepare(`
      SELECT
        m.imdb_id, m.catalog_type, m.type, m.release_name,
        (SELECT source_url  FROM releases WHERE media_imdb_id = m.imdb_id ORDER BY added_at ASC LIMIT 1) AS primary_source_url,
        (SELECT release_name FROM releases WHERE media_imdb_id = m.imdb_id ORDER BY added_at ASC LIMIT 1) AS primary_release_name
      FROM media m
    `).all();
  }

  // Mise à jour groupée de catalog_type (transaction)
  batchUpdateCatalogTypes(updates) {
    const stmt = this.db.prepare('UPDATE media SET catalog_type = ?, updated_at = ? WHERE imdb_id = ?');
    const now  = Date.now();
    const run  = this.db.transaction((rows) => {
      let count = 0;
      for (const u of rows) count += stmt.run(u.catalog_type, now, u.imdb_id).changes;
      return count;
    });
    return run(updates);
  }

  // Médias avec genre 99 (Documentaire TMDB) mais pas encore classés en documentaires
  // Exclut ceux qui ont des genres contradictoires (Action=28, SF=878, Fantastique=14, Horreur=27)
  getDocumentaryCandidatesForReclassify() {
    return this.db.prepare(`
      SELECT imdb_id, name, catalog_type
      FROM media
      WHERE catalog_type != 'documentaires'
        AND genres IS NOT NULL
        AND EXISTS     (SELECT 1 FROM json_each(genres) WHERE value = 99)
        AND NOT EXISTS (SELECT 1 FROM json_each(genres) WHERE value IN (28, 878, 14, 27))
    `).all();
  }

  // Médias classés en documentaires mais ayant des genres clairement incompatibles
  // (faux positifs genre 99 : films d'action, SF, fantastique, horreur mal taggués sur TMDB)
  getFalseDocumentaryCandidates() {
    return this.db.prepare(`
      SELECT imdb_id, name, type, genres
      FROM media
      WHERE catalog_type = 'documentaires'
        AND genres IS NOT NULL
        AND EXISTS (SELECT 1 FROM json_each(genres) WHERE value IN (28, 878, 14, 27))
    `).all();
  }

  // Séries classées en émissions mais ayant des genres incompatibles
  // (SF, Fantastique, SF&Fantasy TV, Animation, Horreur)
  getFalseEmissionCandidates() {
    return this.db.prepare(`
      SELECT imdb_id, name, type, genres
      FROM media
      WHERE catalog_type = 'emissions'
        AND genres IS NOT NULL
        AND EXISTS (SELECT 1 FROM json_each(genres) WHERE value IN (878, 14, 10765, 16, 27))
    `).all();
  }

  getAnimeCandidatesForReclassify() {
    return this.db.prepare(`
      SELECT imdb_id, tmdb_id, type, name
      FROM media
      WHERE catalog_type IN ('films', 'series')
        AND tmdb_id IS NOT NULL
        AND genres IS NOT NULL
        AND EXISTS (SELECT 1 FROM json_each(genres) WHERE value = 16)
    `).all();
  }

  reclassifyMediaCatalogType(imdbId, catalogType) {
    this.db.prepare(`UPDATE media SET catalog_type = ? WHERE imdb_id = ?`).run(catalogType, imdbId);
  }
  getItemByImdbId(imdbId) { return this.getMediaByImdbId(imdbId); }

  close() {
    this.db.close();
  }
}

module.exports = DatabaseManager;
