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
      nzbhydra2_apikey: ''
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

  getMediaList({ catalog = null, search = '', page = 1, limit = 24 } = {}) {
    const offset = (Number(page) - 1) * Number(limit);
    const conditions = [];
    const params = [];

    if (catalog) { conditions.push('m.catalog_type = ?'); params.push(catalog); }
    if (search)  { conditions.push('(m.name LIKE ? OR m.release_name LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = this.db.prepare(`SELECT COUNT(*) as c FROM media m ${where}`).get(...params).c;

    const rows = this.db.prepare(`
      SELECT m.*, COUNT(r.id) as release_count
      FROM media m LEFT JOIN releases r ON r.media_imdb_id = m.imdb_id
      ${where}
      GROUP BY m.imdb_id
      ORDER BY m.first_seen_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(limit), offset);

    return {
      items: rows.map(r => ({ ...r, genres: r.genres ? JSON.parse(r.genres) : [] })),
      total, page: Number(page), limit: Number(limit),
      pages: Math.ceil(total / Number(limit))
    };
  }

  getSourceStats() {
    return this.db.prepare(`
      SELECT
        source_url,
        COUNT(*)                      AS release_count,
        COUNT(DISTINCT media_imdb_id) AS media_count,
        MIN(added_at)                 AS first_seen,
        MAX(added_at)                 AS last_seen
      FROM releases
      WHERE source_url IS NOT NULL AND source_url != ''
      GROUP BY source_url
      ORDER BY release_count DESC
    `).all();
  }

  // ─── Aliases backward-compat ──────────────────────────────────────────────

  getCatalogItems(catalogType, skip, limit) { return this.getMedia(catalogType, skip, limit); }
  getCatalogCount(catalogType) { return this.getMediaCount(catalogType); }
  searchCatalog(catalogType, query, skip, limit) { return this.searchMedia(catalogType, query, skip, limit); }
  getRecentCatalogAdditions(catalogType, limit) { return this.getRecentMediaAdditions(catalogType, limit); }
  getItemByImdbId(imdbId) { return this.getMediaByImdbId(imdbId); }

  close() {
    this.db.close();
  }
}

module.exports = DatabaseManager;
