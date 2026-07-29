const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DEFAULT_CATALOGS = [
  ['useflowfr_films', 'Films', 'movie', ['films']],
  ['useflowfr_documentaires', 'Documentaires', 'movie', ['documentaires']],
  ['useflowfr_documentaires_series', 'Documentaires', 'series', ['documentaires']],
  ['useflowfr_series', 'Séries', 'series', ['series']],
  ['useflowfr_emissions', 'Émissions TV', 'series', ['emissions']],
  ['useflowfr_animes_films', 'Animés (Films)', 'movie', ['animés']],
  ['useflowfr_animes_series', 'Animés (Séries)', 'series', ['animés']],
  ['useflowfr_concerts', 'Concerts', 'movie', ['concerts']],
  ['useflowfr_spectacles', 'Spectacles', 'movie', ['spectacles']]
];

class DatabaseManager {
  constructor(dbPath) {
    this.dbPath = dbPath;
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.initTables();
    this.upgradeLegacySourceLimits();
    this.upgradeSourceLimitsV3();
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
      CREATE INDEX IF NOT EXISTS idx_media_type_seen ON media(type, first_seen_at DESC);
      CREATE INDEX IF NOT EXISTS idx_media_tmdb_type ON media(tmdb_id, type);
      CREATE INDEX IF NOT EXISTS idx_releases_media ON releases(media_imdb_id);
      CREATE INDEX IF NOT EXISTS idx_releases_media_source_seen
        ON releases(media_imdb_id, source_url, added_at DESC);
      CREATE INDEX IF NOT EXISTS idx_releases_indexer ON releases(indexer_rlz_id);
      CREATE INDEX IF NOT EXISTS idx_failed_indexer ON failed_releases(indexer_rlz_id);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS custom_catalogs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        updates_enabled INTEGER NOT NULL DEFAULT 1,
        frozen_at INTEGER,
        source_urls TEXT NOT NULL DEFAULT '[]',
        filters TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS media_identities (
        namespace TEXT NOT NULL,
        external_id TEXT NOT NULL,
        media_imdb_id TEXT NOT NULL REFERENCES media(imdb_id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(namespace, external_id)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guide_items (
        guide_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        media_type TEXT NOT NULL,
        imdb_id TEXT,
        tmdb_id TEXT,
        title TEXT,
        year TEXT,
        PRIMARY KEY(guide_id, position)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS maintenance_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '{}',
        backup_path TEXT,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        error_message TEXT
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS source_sync_state (
        source_key TEXT PRIMARY KEY,
        source_kind TEXT NOT NULL,
        last_attempt_at INTEGER,
        last_success_at INTEGER,
        last_duration_ms INTEGER,
        last_items_fetched INTEGER NOT NULL DEFAULT 0,
        last_error_at INTEGER,
        last_error_message TEXT,
        last_http_status INTEGER,
        consecutive_errors INTEGER NOT NULL DEFAULT 0,
        quota_limit INTEGER,
        quota_used INTEGER,
        quota_status TEXT,
        cursor_json TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS source_health_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_key TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        event_type TEXT NOT NULL,
        consecutive_errors INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        http_status INTEGER,
        created_at INTEGER NOT NULL,
        processed_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS source_alert_state (
        source_key TEXT PRIMARY KEY,
        outage_notified INTEGER NOT NULL DEFAULT 0,
        last_alert_at INTEGER,
        last_recovery_at INTEGER,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS source_alert_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_key TEXT NOT NULL,
        source_name TEXT,
        event_type TEXT NOT NULL,
        threshold INTEGER NOT NULL,
        consecutive_errors INTEGER NOT NULL DEFAULT 0,
        message TEXT,
        channels_json TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_source_health_events_pending
        ON source_health_events(processed_at, id);
      CREATE INDEX IF NOT EXISTS idx_source_alert_history_created
        ON source_alert_history(created_at DESC);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS manifest_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        revision INTEGER NOT NULL,
        event TEXT NOT NULL,
        catalog_id TEXT,
        catalog_name TEXT,
        details TEXT NOT NULL DEFAULT '{}',
        snapshot TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_source_sync_success
        ON source_sync_state(last_success_at);
      CREATE INDEX IF NOT EXISTS idx_manifest_history_revision
        ON manifest_history(revision DESC);
      CREATE INDEX IF NOT EXISTS idx_media_identities_media
        ON media_identities(media_imdb_id);
      CREATE INDEX IF NOT EXISTS idx_guide_items_imdb
        ON guide_items(guide_id, imdb_id);
      CREATE INDEX IF NOT EXISTS idx_guide_items_tmdb
        ON guide_items(guide_id, tmdb_id);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cometnet_inbox (
        item_key TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        received_at INTEGER NOT NULL,
        processed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_cometnet_inbox_pending
        ON cometnet_inbox(source_id, processed_at, received_at);
    `);

    // Migration depuis l'ancien schéma catalog_items si nécessaire
    const alreadyMigrated = this.db.prepare("SELECT value FROM config WHERE key = 'schema_v2_migrated'").get();
    if (!alreadyMigrated) {
      const hasOldTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='catalog_items'").get();
      if (hasOldTable) {
        this._migrateFromV1();
      }
    }

    // Migration v3 : ajout colonnes concerts_added / spectacles_added dans sync_history
    this._migrateV3SyncHistory();
    this._migrateManagedCatalogPauses();
    this._migrateCatalogMediaTypes();

    this.initDefaultConfig();
    this.seedManagedCatalogs();
  }

  _migrateV3SyncHistory() {
    const cols = this.db.prepare("PRAGMA table_info(sync_history)").all().map(c => c.name);
    if (!cols.includes('concerts_added')) {
      this.db.prepare("ALTER TABLE sync_history ADD COLUMN concerts_added INTEGER DEFAULT 0").run();
      console.log('[DB] Migration v3 : colonne concerts_added ajoutée à sync_history');
    }
    if (!cols.includes('spectacles_added')) {
      this.db.prepare("ALTER TABLE sync_history ADD COLUMN spectacles_added INTEGER DEFAULT 0").run();
      console.log('[DB] Migration v3 : colonne spectacles_added ajoutée à sync_history');
    }
  }

  _migrateManagedCatalogPauses() {
    const cols = this.db.prepare("PRAGMA table_info(custom_catalogs)").all().map(c => c.name);
    if (!cols.includes('updates_enabled')) {
      this.db.prepare("ALTER TABLE custom_catalogs ADD COLUMN updates_enabled INTEGER NOT NULL DEFAULT 1").run();
      console.log('[DB] Migration catalogues : contrôle des mises à jour ajouté');
    }
    if (!cols.includes('frozen_at')) {
      this.db.prepare("ALTER TABLE custom_catalogs ADD COLUMN frozen_at INTEGER").run();
      console.log('[DB] Migration catalogues : date de gel ajoutée');
    }
  }

  _migrateCatalogMediaTypes() {
    const schema = this.db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'custom_catalogs'"
    ).get()?.sql || '';
    if (!/CHECK\s*\(\s*type\s+IN/i.test(schema)) return;
    const migrate = this.db.transaction(() => {
      this.db.exec('ALTER TABLE custom_catalogs RENAME TO custom_catalogs_legacy_types');
      this.db.exec(`
        CREATE TABLE custom_catalogs (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          updates_enabled INTEGER NOT NULL DEFAULT 1,
          frozen_at INTEGER,
          source_urls TEXT NOT NULL DEFAULT '[]',
          filters TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      this.db.exec(`
        INSERT INTO custom_catalogs
          (id, name, type, enabled, updates_enabled, frozen_at, source_urls, filters, created_at, updated_at)
        SELECT id, name, type, enabled, updates_enabled, frozen_at, source_urls, filters, created_at, updated_at
        FROM custom_catalogs_legacy_types
      `);
      this.db.exec('DROP TABLE custom_catalogs_legacy_types');
    });
    migrate();
    console.log('[DB] Migration catalogues : types Stremio étendus');
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
      rss_films_paused: 'false',
      rss_films_sync_interval: '',
      rss_additional_urls: '[]',
      pastebin_sources: '[]',
      stremio_manifest_sources: '[]',
      newznab_sources: '[]',
      wacustom_sources: '[]',
      media_server_sources: '[]',
      streamfusion_sources: '[]',
      mdblist_guides: '[]',
      manifest_revision: '0',
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
      last_catalog_refresh: '0',
      last_sync_films: '0',
      discord_webhook_url: '',
      discord_notifications_enabled: 'false',
      discord_enhanced_notifications_enabled: 'false',
      discord_rpdb_posters_enabled: 'false',
      rpdb_enabled: 'false',
      rpdb_api_key: '',
      postersplus_enabled: 'false',
      postersplus_url_template: '',
      required_tags: 'FRENCH,MULTi,TRUEFRENCH,VOF,VFF,VFI,VFQ',
      prowlarr_url: '',
      prowlarr_apikey: '',
      nzbhydra2_url: '',
      nzbhydra2_apikey: '',
      mal_client_id: '',
      anilist_enabled: 'true',
      kitsu_enabled: 'true',
      stremio_metadata_enabled: 'false',
      stremio_metadata_manifest_url: '',
      stremio_metadata_sources: '[]',
      apprise_enabled: 'false',
      apprise_server_url: '',
      apprise_urls: '',
      omdb_api_key: '',
      notification_language: 'fr',
      source_alerts_enabled: 'true',
      source_alert_default_threshold: '3',
      source_alert_thresholds: '{}',
      classification_migration_version: '0'
    };

    const stmt = this.db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(defaults)) {
      stmt.run(key, value);
    }
  }

  upgradeLegacySourceLimits() {
    if (this.getConfig('source_limit_defaults_v2') === 'true') return;
    const migrations = [
      ['stremio_manifest_sources', 'maxItemsPerCatalog', 5000, 10000000],
      ['newznab_sources', 'maxItemsPerCategory', 1000, 10000000],
      ['webdav_sources', 'maxItems', 5000, 10000000],
      ['wacustom_sources', 'maxItemsPerSync', 20000, 10000000],
      ['media_server_sources', 'maxItems', 20000, 10000000],
      ['streamfusion_sources', 'maxItemsPerSync', 20000, 10000000],
      ['cometnet_sources', 'maxItemsPerSync', 5000, 10000000],
      ['mdblist_guides', 'maxItems', 5000, 10000000]
    ];
    for (const [configKey, field, legacyDefault, nextDefault] of migrations) {
      let sources;
      try {
        sources = JSON.parse(this.getConfig(configKey) || '[]');
      } catch {
        continue;
      }
      if (!Array.isArray(sources)) continue;
      let changed = false;
      sources = sources.map(source => {
        if (Number(source?.[field]) !== legacyDefault) return source;
        changed = true;
        return { ...source, [field]: nextDefault };
      });
      if (changed) this.setConfig(configKey, JSON.stringify(sources));
    }
    this.setConfig('source_limit_defaults_v2', 'true');
  }

  upgradeSourceLimitsV3() {
    if (this.getConfig('source_limit_defaults_v3') === 'true') return;
    const migrations = [
      ['stremio_manifest_sources', 'maxItemsPerCatalog'],
      ['newznab_sources', 'maxItemsPerCategory'],
      ['webdav_sources', 'maxItems'],
      ['wacustom_sources', 'maxItemsPerSync'],
      ['media_server_sources', 'maxItems'],
      ['streamfusion_sources', 'maxItemsPerSync'],
      ['cometnet_sources', 'maxItemsPerSync'],
      ['mdblist_guides', 'maxItems']
    ];
    for (const [configKey, field] of migrations) {
      let sources;
      try {
        sources = JSON.parse(this.getConfig(configKey) || '[]');
      } catch {
        continue;
      }
      if (!Array.isArray(sources)) continue;
      let changed = false;
      sources = sources.map(source => {
        // Valeurs par défaut des versions précédentes. Les plafonds réellement
        // personnalisés à une autre valeur restent respectés.
        if (![100000, 1000000].includes(Number(source?.[field]))) return source;
        changed = true;
        return { ...source, [field]: 10000000 };
      });
      if (changed) this.setConfig(configKey, JSON.stringify(sources));
    }
    this.setConfig('source_limit_defaults_v3', 'true');
  }

  seedManagedCatalogs() {
    if (this.getConfig('managed_catalogs_seeded') === 'true') return;
    const now = Date.now();
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO custom_catalogs
        (id, name, type, enabled, source_urls, filters, created_at, updated_at)
      VALUES (?, ?, ?, 1, '[]', ?, ?, ?)
    `);
    const seed = this.db.transaction(() => {
      DEFAULT_CATALOGS.forEach(([id, name, type, catalogTypes], index) => {
        insert.run(id, name, type, JSON.stringify({ catalog_types: catalogTypes }), now + index, now);
      });
      this.setConfig('managed_catalogs_seeded', 'true');
    });
    seed();
    console.log('[DB] Catalogues historiques intégrés au gestionnaire');
  }

  // ─── Config ───────────────────────────────────────────────────────────────

  getConfig(key) {
    const row = this.db.prepare('SELECT value FROM config WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  setConfig(key, value) {
    this.db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value);
  }

  // ─── Maintenance ────────────────────────────────────────────────────────

  getMaintenanceAnalysis() {
    const counts = {
      anime_candidates: this.getAnimeCandidatesForReclassify().length,
      documentaries: this.getDocumentaryCandidatesForReclassify().length,
      false_documentaries: this.getFalseDocumentaryCandidates().length,
      false_emissions: this.getFalseEmissionCandidates().length,
      concerts: this.getConcertCandidatesFromGenre().length,
      false_concerts: this.getFalseConcertCandidates().length,
      spectacles: this.getSpectacleCandidatesFromTitle().length
    };
    return {
      media_count: this.db.prepare('SELECT COUNT(*) AS count FROM media').get().count,
      counts,
      database_only_count: counts.documentaries + counts.false_documentaries
        + counts.false_emissions + counts.concerts + counts.false_concerts + counts.spectacles,
      analyzed_at: Date.now()
    };
  }

  async createMaintenanceBackup(label = 'maintenance') {
    const dir = path.join(path.dirname(this.dbPath), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const safeLabel = String(label).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'maintenance';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destination = path.join(dir, `${stamp}-${safeLabel}.db`);
    await this.db.backup(destination);
    return destination;
  }

  startMaintenanceHistory(action, details = {}) {
    return this.db.prepare(`
      INSERT INTO maintenance_history (action, status, details, started_at)
      VALUES (?, 'running', ?, ?)
    `).run(action, JSON.stringify(details), Date.now()).lastInsertRowid;
  }

  finishMaintenanceHistory(id, { status = 'completed', details = {}, backupPath = null, error = null } = {}) {
    this.db.prepare(`
      UPDATE maintenance_history
      SET status = ?, details = ?, backup_path = ?, error_message = ?, finished_at = ?
      WHERE id = ?
    `).run(status, JSON.stringify(details), backupPath, error, Date.now(), id);
  }

  listMaintenanceHistory(limit = 20) {
    return this.db.prepare(`
      SELECT * FROM maintenance_history
      ORDER BY started_at DESC
      LIMIT ?
    `).all(Math.min(Math.max(Number(limit) || 20, 1), 100)).map(row => ({
      ...row,
      details: JSON.parse(row.details || '{}')
    }));
  }

  getAllConfig() {
    const rows = this.db.prepare('SELECT key, value FROM config').all();
    return rows.reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});
  }

  // ─── Catalogues personnalisés ────────────────────────────────────────────

  listCustomCatalogs(includeDisabled = true) {
    const rows = includeDisabled
      ? this.db.prepare("SELECT * FROM custom_catalogs ORDER BY CASE WHEN id LIKE 'useflowfr_%' THEN 0 ELSE 1 END, created_at ASC").all()
      : this.db.prepare("SELECT * FROM custom_catalogs WHERE enabled = 1 ORDER BY CASE WHEN id LIKE 'useflowfr_%' THEN 0 ELSE 1 END, created_at ASC").all();
    return rows.map(row => ({
      ...row,
      enabled: Boolean(row.enabled),
      updates_enabled: Boolean(row.updates_enabled),
      source_urls: JSON.parse(row.source_urls || '[]'),
      filters: JSON.parse(row.filters || '{}')
    }));
  }

  getCustomCatalog(id) {
    const row = this.db.prepare('SELECT * FROM custom_catalogs WHERE id = ?').get(id);
    if (!row) return null;
    return {
      ...row,
      enabled: Boolean(row.enabled),
      updates_enabled: Boolean(row.updates_enabled),
      source_urls: JSON.parse(row.source_urls || '[]'),
      filters: JSON.parse(row.filters || '{}')
    };
  }

  saveCustomCatalog(catalog) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO custom_catalogs
        (id, name, type, enabled, updates_enabled, frozen_at, source_urls, filters, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        enabled = excluded.enabled,
        updates_enabled = excluded.updates_enabled,
        frozen_at = excluded.frozen_at,
        source_urls = excluded.source_urls,
        filters = excluded.filters,
        updated_at = excluded.updated_at
    `).run(
      catalog.id, catalog.name, catalog.type, catalog.enabled === false ? 0 : 1,
      catalog.updates_enabled === false ? 0 : 1,
      catalog.updates_enabled === false ? (Number(catalog.frozen_at) || now) : null,
      JSON.stringify(catalog.source_urls || []), JSON.stringify(catalog.filters || {}),
      catalog.created_at || now, now
    );
    return this.getCustomCatalog(catalog.id);
  }

  deleteCustomCatalog(id) {
    return this.db.prepare('DELETE FROM custom_catalogs WHERE id = ?').run(id).changes > 0;
  }

  removeCustomCatalogReferences(id) {
    let changed = 0;
    for (const catalog of this.listCustomCatalogs()) {
      const current = Array.isArray(catalog.filters?.catalog_ids)
        ? catalog.filters.catalog_ids.map(String)
        : [];
      const next = current.filter(catalogId => catalogId !== String(id));
      if (next.length === current.length) continue;
      this.saveCustomCatalog({
        ...catalog,
        filters: { ...catalog.filters, catalog_ids: next }
      });
      changed++;
    }
    return changed;
  }

  replaceGuideItems(guideId, items) {
    const remove = this.db.prepare('DELETE FROM guide_items WHERE guide_id = ?');
    const insert = this.db.prepare(`
      INSERT INTO guide_items
        (guide_id, position, media_type, imdb_id, tmdb_id, title, year)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const replace = this.db.transaction(() => {
      remove.run(guideId);
      items.forEach((item, index) => {
        insert.run(
          guideId,
          Number.isInteger(item.position) ? item.position : index,
          item.media_type || 'unknown',
          item.imdb_id || null,
          item.tmdb_id === null || item.tmdb_id === undefined ? null : String(item.tmdb_id),
          item.title || null,
          item.year === null || item.year === undefined ? null : String(item.year)
        );
      });
    });
    replace();
    return this.getGuideItemStats(guideId);
  }

  deleteGuideItems(guideId) {
    return this.db.prepare('DELETE FROM guide_items WHERE guide_id = ?').run(guideId).changes;
  }

  getGuideItemStats(guideId) {
    return this.db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN media_type = 'movie' THEN 1 ELSE 0 END) AS movies,
        SUM(CASE WHEN media_type IN ('show', 'series') THEN 1 ELSE 0 END) AS shows
      FROM guide_items
      WHERE guide_id = ?
    `).get(guideId);
  }

  listGuideItems(guideId, limit = 20) {
    return this.db.prepare(`
      SELECT * FROM guide_items
      WHERE guide_id = ?
      ORDER BY position ASC
      LIMIT ?
    `).all(guideId, Math.min(Math.max(Number(limit) || 20, 1), 1000));
  }

  _customCatalogConditions(catalog, search = null, visitedCatalogIds = new Set()) {
    const catalogId = catalog.id ? String(catalog.id) : null;
    const visited = new Set(visitedCatalogIds);
    if (catalogId) visited.add(catalogId);
    const animeCatalog = String(catalog.type).toLowerCase() === 'anime';
    const conditions = [animeCatalog
      ? `(m.catalog_type = 'animés' OR EXISTS (
          SELECT 1 FROM media_identities anime_identity
          WHERE anime_identity.media_imdb_id = m.imdb_id
            AND anime_identity.namespace IN ('kitsu', 'mal', 'anilist', 'anidb')
        ))`
      : 'm.type = ?'];
    const params = animeCatalog ? [] : [catalog.type];
    const filters = catalog.filters || {};
    const frozenAt = catalog.updates_enabled === false && Number(catalog.frozen_at)
      ? Number(catalog.frozen_at)
      : null;

    if (frozenAt) {
      conditions.push('m.first_seen_at <= ?');
      params.push(frozenAt);
    }

    const selectorConditions = [];
    const selectorParams = [];
    if (catalog.source_urls?.length) {
      selectorConditions.push(`EXISTS (
        SELECT 1 FROM releases r
        WHERE r.media_imdb_id = m.imdb_id
          AND r.source_url IN (${catalog.source_urls.map(() => '?').join(',')})
          ${frozenAt ? 'AND r.added_at <= ?' : ''}
      )`);
      selectorParams.push(...catalog.source_urls);
      if (frozenAt) selectorParams.push(frozenAt);
    }

    const requestedCatalogIds = Array.isArray(filters.catalog_ids)
      ? [...new Set(filters.catalog_ids.map(String).filter(Boolean))]
      : [];
    let validIncludedCatalogs = 0;
    for (const includedId of requestedCatalogIds) {
      if (visited.has(includedId)) continue;
      const included = this.getCustomCatalog(includedId);
      if (!included || included.type !== catalog.type) continue;
      const nested = this._customCatalogConditions(included, null, visited);
      selectorConditions.push(`(${nested.conditions.join(' AND ')})`);
      selectorParams.push(...nested.params);
      validIncludedCatalogs++;
    }
    if (selectorConditions.length) {
      conditions.push(`(${selectorConditions.join(' OR ')})`);
      params.push(...selectorParams);
    } else if (requestedCatalogIds.length && validIncludedCatalogs === 0) {
      // Une composition dont toutes les références ont disparu ne doit jamais
      // se transformer silencieusement en « tous les médias ».
      conditions.push('0 = 1');
    }

    if (filters.guide_id) {
      conditions.push(`EXISTS (
        SELECT 1 FROM guide_items gi
        WHERE gi.guide_id = ?
          AND (
            gi.imdb_id = m.imdb_id
            OR (gi.tmdb_id IS NOT NULL AND CAST(gi.tmdb_id AS TEXT) = CAST(m.tmdb_id AS TEXT))
            OR EXISTS (
              SELECT 1 FROM media_identities mi
              WHERE mi.media_imdb_id = m.imdb_id
                AND mi.external_id = gi.imdb_id
            )
          )
      )`);
      params.push(String(filters.guide_id));
    }

    const years = Array.isArray(filters.years)
      ? filters.years.map(String).filter(year => /^\d{4}$/.test(year))
      : [];
    if (years.length) {
      conditions.push(`m.year ${filters.year_mode === 'exclude' ? 'NOT ' : ''}IN (${years.map(() => '?').join(',')})`);
      params.push(...years);
    }
    if (/^\d{4}$/.test(String(filters.year_min || ''))) {
      conditions.push('CAST(m.year AS INTEGER) >= ?');
      params.push(Number(filters.year_min));
    }
    if (/^\d{4}$/.test(String(filters.year_max || ''))) {
      conditions.push('CAST(m.year AS INTEGER) <= ?');
      params.push(Number(filters.year_max));
    }

    const baseCatalogs = Array.isArray(filters.catalog_types) ? filters.catalog_types.filter(Boolean) : [];
    if (baseCatalogs.length) {
      conditions.push(`m.catalog_type IN (${baseCatalogs.map(() => '?').join(',')})`);
      params.push(...baseCatalogs);
    }
    for (const [key, negate] of [['genres_include', false], ['genres_exclude', true]]) {
      const genres = Array.isArray(filters[key])
        ? filters[key].map(Number).filter(Number.isInteger)
        : [];
      if (genres.length) {
        conditions.push(`${negate ? 'NOT ' : ''}EXISTS (
          SELECT 1 FROM json_each(COALESCE(m.genres, '[]')) genre
          WHERE CAST(genre.value AS INTEGER) IN (${genres.map(() => '?').join(',')})
        )`);
        params.push(...genres);
      }
    }
    if (search) {
      conditions.push('(m.name LIKE ? OR m.release_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    for (const [key, negate] of [['keywords_include', false], ['keywords_exclude', true]]) {
      const words = Array.isArray(filters[key]) ? filters[key].map(String).filter(Boolean) : [];
      for (const word of words) {
        conditions.push(`${negate ? 'NOT ' : ''}(m.name LIKE ? OR m.release_name LIKE ?)`);
        params.push(`%${word}%`, `%${word}%`);
      }
    }

    return { conditions, params };
  }

  countCustomCatalogMedia(catalog, search = null) {
    const { conditions, params } = this._customCatalogConditions(catalog, search);
    return this.db.prepare(`
      SELECT COUNT(*) AS total
      FROM media m
      WHERE ${conditions.join(' AND ')}
    `).get(...params).total;
  }

  getCustomCatalogMedia(catalog, skip = 0, limit = 101, search = null) {
    const { conditions, params } = this._customCatalogConditions(catalog, search);
    const guideId = catalog.filters?.guide_id ? String(catalog.filters.guide_id) : null;
    const guideOrder = guideId
      ? `COALESCE((
          SELECT MIN(gi.position) FROM guide_items gi
          WHERE gi.guide_id = ?
            AND (
              gi.imdb_id = m.imdb_id
              OR (gi.tmdb_id IS NOT NULL AND CAST(gi.tmdb_id AS TEXT) = CAST(m.tmdb_id AS TEXT))
              OR EXISTS (
                SELECT 1 FROM media_identities mi
                WHERE mi.media_imdb_id = m.imdb_id
                  AND mi.external_id = gi.imdb_id
              )
            )
        ), 2147483647) ASC,`
      : '';
    if (guideId) params.push(guideId);
    params.push(Number(limit), Number(skip));
    const rows = this.db.prepare(`
      SELECT m.* FROM media m
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${guideOrder} m.first_seen_at DESC
      LIMIT ? OFFSET ?
    `).all(...params);
    return rows.map(row => ({ ...row, genres: row.genres ? JSON.parse(row.genres) : [] }));
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

  linkMediaIdentity(mediaId, externalId, namespace = null) {
    if (!mediaId || !externalId) return false;
    const value = String(externalId);
    const inferredNamespace = namespace || value.match(/^([^:]+):/)?.[1]
      || (/^tt\d+$/i.test(value) ? 'imdb' : 'stremio');
    this.db.prepare(`
      INSERT INTO media_identities (namespace, external_id, media_imdb_id, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(namespace, external_id) DO UPDATE SET
        media_imdb_id = excluded.media_imdb_id
    `).run(String(inferredNamespace).toLowerCase(), value, mediaId, Date.now());
    return true;
  }

  getMediaByExternalId(externalId, namespace = null) {
    if (!externalId) return null;
    const value = String(externalId);
    const inferredNamespace = namespace || value.match(/^([^:]+):/)?.[1]
      || (/^tt\d+$/i.test(value) ? 'imdb' : 'stremio');
    const row = this.db.prepare(`
      SELECT m.* FROM media_identities i
      JOIN media m ON m.imdb_id = i.media_imdb_id
      WHERE i.namespace = ? AND i.external_id = ?
      LIMIT 1
    `).get(String(inferredNamespace).toLowerCase(), value);
    if (row?.genres) row.genres = JSON.parse(row.genres);
    return row || null;
  }

  getMediaIdentities(mediaId) {
    return this.db.prepare(`
      SELECT namespace, external_id
      FROM media_identities
      WHERE media_imdb_id = ?
      ORDER BY namespace, external_id
    `).all(mediaId);
  }

  getMediaByTmdbId(tmdbId, type = null) {
    const row = type
      ? this.db.prepare('SELECT * FROM media WHERE tmdb_id = ? AND type = ? LIMIT 1').get(String(tmdbId), type)
      : this.db.prepare('SELECT * FROM media WHERE tmdb_id = ? LIMIT 1').get(String(tmdbId));
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
      matched_items:       'matched_items = ?',
      failed_items:        'failed_items = ?',
      already_in_db:       'already_in_db = ?',
      films_added:         'films_added = ?',
      documentaires_added: 'documentaires_added = ?',
      series_added:        'series_added = ?',
      concerts_added:      'concerts_added = ?',
      spectacles_added:    'spectacles_added = ?',
      status:              'status = ?',
      error_message:       'error_message = ?',
      finished_at:         'finished_at = ?'
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
      SELECT DATE(started_at / 1000, 'unixepoch', 'localtime') as date, COUNT(*) as count
      FROM sync_history GROUP BY date ORDER BY date DESC
    `).all();
  }

  getSyncHistoryByDate(date) {
    return this.db.prepare(`
      SELECT * FROM sync_history
      WHERE DATE(started_at / 1000, 'unixepoch', 'localtime') = ?
      ORDER BY started_at DESC
    `).all(date);
  }

  // ─── WebUI Listing ────────────────────────────────────────────────────────

  getMediaList({ catalog = null, search = '', page = 1, limit = 24, sort = 'date_desc', year = null, quality = null } = {}) {
    const offset = (Number(page) - 1) * Number(limit);
    const conditions = ["m.catalog_type <> 'youtube'"];
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
        ) as release_names_raw,
        (SELECT json_group_array(DISTINCT source_url)
         FROM releases
         WHERE media_imdb_id = m.imdb_id AND source_url IS NOT NULL AND source_url != ''
        ) as source_urls_raw
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
        release_names: r.release_names_raw ? r.release_names_raw.split('|||') : [],
        source_urls: r.source_urls_raw ? JSON.parse(r.source_urls_raw) : []
      })),
      total, page: Number(page), limit: Number(limit),
      pages: Math.ceil(total / Number(limit))
    };
  }

  getMediaYears() {
    return this.db.prepare(`
      SELECT DISTINCT year FROM media
      WHERE catalog_type <> 'youtube' AND year IS NOT NULL AND year != ''
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

  beginSourceSync(sourceKey, sourceKind) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO source_sync_state
        (source_key, source_kind, last_attempt_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(source_key) DO UPDATE SET
        source_kind = excluded.source_kind,
        last_attempt_at = excluded.last_attempt_at,
        updated_at = excluded.updated_at
    `).run(sourceKey, sourceKind, now, now);
    return now;
  }

  finishSourceSync(sourceKey, {
    sourceKind = 'unknown',
    startedAt = Date.now(),
    itemsFetched = 0,
    quotaLimit = null,
    quotaUsed = null,
    quotaStatus = null,
    cursor = undefined
  } = {}) {
    const now = Date.now();
    const current = this.getSourceSyncState(sourceKey);
    this.db.prepare(`
      INSERT INTO source_sync_state (
        source_key, source_kind, last_attempt_at, last_success_at,
        last_duration_ms, last_items_fetched, last_error_at,
        last_error_message, last_http_status, consecutive_errors,
        quota_limit, quota_used, quota_status, cursor_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, ?, ?, ?, ?, ?)
      ON CONFLICT(source_key) DO UPDATE SET
        source_kind = excluded.source_kind,
        last_success_at = excluded.last_success_at,
        last_duration_ms = excluded.last_duration_ms,
        last_items_fetched = excluded.last_items_fetched,
        last_error_at = NULL,
        last_error_message = NULL,
        last_http_status = NULL,
        consecutive_errors = 0,
        quota_limit = excluded.quota_limit,
        quota_used = excluded.quota_used,
        quota_status = excluded.quota_status,
        cursor_json = excluded.cursor_json,
        updated_at = excluded.updated_at
    `).run(
      sourceKey, sourceKind, Number(startedAt) || now, now,
      Math.max(0, now - (Number(startedAt) || now)),
      Math.max(0, Number(itemsFetched) || 0),
      quotaLimit === null ? current?.quota_limit ?? null : Number(quotaLimit),
      quotaUsed === null ? current?.quota_used ?? null : Number(quotaUsed),
      quotaStatus === null ? current?.quota_status ?? null : String(quotaStatus),
      JSON.stringify(cursor === undefined ? (current?.cursor || {}) : cursor),
      now
    );
    this.recordFeedSuccess(sourceKey);
    if (Number(current?.consecutive_errors) > 0) {
      this.recordSourceHealthEvent({
        sourceKey,
        sourceKind,
        eventType: 'recovery',
        consecutiveErrors: 0
      });
    }
  }

  failSourceSync(sourceKey, {
    sourceKind = 'unknown',
    startedAt = Date.now(),
    errorMessage = null,
    httpStatus = null
  } = {}) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO source_sync_state (
        source_key, source_kind, last_attempt_at, last_duration_ms,
        last_error_at, last_error_message, last_http_status,
        consecutive_errors, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(source_key) DO UPDATE SET
        source_kind = excluded.source_kind,
        last_attempt_at = excluded.last_attempt_at,
        last_duration_ms = excluded.last_duration_ms,
        last_error_at = excluded.last_error_at,
        last_error_message = excluded.last_error_message,
        last_http_status = excluded.last_http_status,
        consecutive_errors = source_sync_state.consecutive_errors + 1,
        updated_at = excluded.updated_at
    `).run(
      sourceKey, sourceKind, Number(startedAt) || now,
      Math.max(0, now - (Number(startedAt) || now)),
      now, errorMessage || null, httpStatus || null, now
    );
    const state = this.getSourceSyncState(sourceKey);
    this.recordSourceHealthEvent({
      sourceKey,
      sourceKind,
      eventType: 'failure',
      consecutiveErrors: state?.consecutive_errors || 1,
      errorMessage,
      httpStatus
    });
  }

  getSourceSyncState(sourceKey) {
    const row = this.db.prepare('SELECT * FROM source_sync_state WHERE source_key = ?').get(sourceKey);
    if (!row) return null;
    return { ...row, cursor: JSON.parse(row.cursor_json || '{}') };
  }

  recordSourceHealthEvent({
    sourceKey,
    sourceKind = 'unknown',
    eventType,
    consecutiveErrors = 0,
    errorMessage = null,
    httpStatus = null
  }) {
    return this.db.prepare(`
      INSERT INTO source_health_events (
        source_key, source_kind, event_type, consecutive_errors,
        error_message, http_status, created_at, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      sourceKey,
      sourceKind,
      eventType,
      Math.max(0, Number(consecutiveErrors) || 0),
      errorMessage || null,
      httpStatus || null,
      Date.now()
    ).lastInsertRowid;
  }

  getPendingSourceHealthEvents(limit = 200) {
    return this.db.prepare(`
      SELECT * FROM source_health_events
      WHERE processed_at IS NULL
      ORDER BY id ASC
      LIMIT ?
    `).all(Math.min(Math.max(Number(limit) || 200, 1), 1000));
  }

  markSourceHealthEventsProcessed(ids) {
    const values = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
    if (!values.length) return 0;
    const statement = this.db.prepare(`
      UPDATE source_health_events SET processed_at = ?
      WHERE id = ? AND processed_at IS NULL
    `);
    return this.db.transaction(eventIds => eventIds.reduce(
      (count, id) => count + statement.run(Date.now(), id).changes,
      0
    ))(values);
  }

  getSourceAlertState(sourceKey) {
    return this.db.prepare('SELECT * FROM source_alert_state WHERE source_key = ?').get(sourceKey)
      || { source_key: sourceKey, outage_notified: 0, last_alert_at: null, last_recovery_at: null };
  }

  setSourceAlertState(sourceKey, { outageNotified, lastAlertAt = null, lastRecoveryAt = null }) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO source_alert_state (
        source_key, outage_notified, last_alert_at, last_recovery_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(source_key) DO UPDATE SET
        outage_notified = excluded.outage_notified,
        last_alert_at = COALESCE(excluded.last_alert_at, source_alert_state.last_alert_at),
        last_recovery_at = COALESCE(excluded.last_recovery_at, source_alert_state.last_recovery_at),
        updated_at = excluded.updated_at
    `).run(sourceKey, outageNotified ? 1 : 0, lastAlertAt, lastRecoveryAt, now);
  }

  recordSourceAlert({
    sourceKey,
    sourceName = null,
    eventType,
    threshold,
    consecutiveErrors = 0,
    message = null,
    channels = []
  }) {
    return this.db.prepare(`
      INSERT INTO source_alert_history (
        source_key, source_name, event_type, threshold,
        consecutive_errors, message, channels_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sourceKey,
      sourceName,
      eventType,
      threshold,
      consecutiveErrors,
      message,
      JSON.stringify(channels),
      Date.now()
    ).lastInsertRowid;
  }

  listSourceAlerts(limit = 100) {
    return this.db.prepare(`
      SELECT * FROM source_alert_history ORDER BY created_at DESC, id DESC LIMIT ?
    `).all(Math.min(Math.max(Number(limit) || 100, 1), 500)).map(row => ({
      ...row,
      channels: JSON.parse(row.channels_json || '[]')
    }));
  }

  enqueueCometNetItem(sourceId, itemKey, payload) {
    const now = Date.now();
    return this.db.prepare(`
      INSERT OR IGNORE INTO cometnet_inbox
        (item_key, source_id, payload_json, received_at, processed_at)
      VALUES (?, ?, ?, ?, NULL)
    `).run(itemKey, sourceId, JSON.stringify(payload), now).changes > 0;
  }

  getPendingCometNetItems(sourceId, limit = 5000) {
    return this.db.prepare(`
      SELECT item_key, payload_json, received_at
      FROM cometnet_inbox
      WHERE source_id = ? AND processed_at IS NULL
      ORDER BY received_at ASC
      LIMIT ?
    `).all(sourceId, Math.min(Math.max(Number(limit) || 5000, 1), 50000)).map(row => ({
      item_key: row.item_key,
      payload: JSON.parse(row.payload_json),
      received_at: row.received_at
    }));
  }

  markCometNetItemsProcessed(itemKeys) {
    const keys = [...new Set((itemKeys || []).filter(Boolean))];
    if (!keys.length) return 0;
    const statement = this.db.prepare(`
      UPDATE cometnet_inbox SET processed_at = ?, payload_json = '{}'
      WHERE item_key = ? AND processed_at IS NULL
    `);
    const transaction = this.db.transaction(values => values.reduce(
      (count, key) => count + statement.run(Date.now(), key).changes,
      0
    ));
    return transaction(keys);
  }

  getCometNetInboxStats(sourceId) {
    return this.db.prepare(`
      SELECT
        COUNT(*) AS received,
        SUM(CASE WHEN processed_at IS NULL THEN 1 ELSE 0 END) AS pending,
        MAX(received_at) AS last_received_at
      FROM cometnet_inbox
      WHERE source_id = ?
    `).get(sourceId) || { received: 0, pending: 0, last_received_at: null };
  }

  deleteCometNetInbox(sourceId) {
    return this.db.prepare('DELETE FROM cometnet_inbox WHERE source_id = ?').run(sourceId).changes;
  }

  compactCometNetInbox(retentionDays = 30) {
    const compacted = this.db.prepare(`
      UPDATE cometnet_inbox SET payload_json = '{}'
      WHERE processed_at IS NOT NULL AND payload_json != '{}'
    `).run().changes;
    const cutoff = Date.now() - Math.min(Math.max(Number(retentionDays) || 30, 1), 365) * 86400000;
    const deleted = this.db.prepare(`
      DELETE FROM cometnet_inbox WHERE processed_at IS NOT NULL AND processed_at < ?
    `).run(cutoff).changes;
    return { compacted, deleted };
  }

  listSourceSyncStates() {
    return this.db.prepare('SELECT * FROM source_sync_state ORDER BY updated_at DESC').all().map(row => ({
      ...row,
      cursor: JSON.parse(row.cursor_json || '{}')
    }));
  }

  isSourceDue(sourceKey, intervalMinutes, now = Date.now()) {
    const state = this.getSourceSyncState(sourceKey);
    if (!state?.last_attempt_at) return true;
    return now - state.last_attempt_at >= Math.max(1, Number(intervalMinutes) || 1) * 60 * 1000;
  }

  deleteSourceSyncState(sourceKey) {
    return this.db.prepare('DELETE FROM source_sync_state WHERE source_key = ?').run(sourceKey).changes > 0;
  }

  deleteSourceSyncStates(sourceKeys) {
    const keys = [...new Set((sourceKeys || []).filter(Boolean))];
    if (!keys.length) return 0;
    return this.db.prepare(`
      DELETE FROM source_sync_state WHERE source_key IN (${keys.map(() => '?').join(',')})
    `).run(...keys).changes;
  }

  clearSourceSyncStates() {
    return this.db.prepare('DELETE FROM source_sync_state').run().changes;
  }

  commitPendingSourceCursors(sourceKeys = null) {
    const keys = Array.isArray(sourceKeys) ? [...new Set(sourceKeys.filter(Boolean))] : null;
    if (keys && !keys.length) return 0;
    const rows = this.db.prepare(`
      SELECT source_key, cursor_json
      FROM source_sync_state
      WHERE cursor_json LIKE '%"pending"%'
      ${keys ? `AND source_key IN (${keys.map(() => '?').join(',')})` : ''}
    `).all(...(keys || []));
    const update = this.db.prepare(`
      UPDATE source_sync_state SET cursor_json = ?, updated_at = ? WHERE source_key = ?
    `);
    let committed = 0;
    const commit = this.db.transaction(() => {
      for (const row of rows) {
        let cursor;
        try { cursor = JSON.parse(row.cursor_json || '{}'); } catch { continue; }
        if (!cursor.pending || typeof cursor.pending !== 'object') continue;
        update.run(JSON.stringify({ committed: cursor.pending }), Date.now(), row.source_key);
        committed++;
      }
    });
    commit();
    return committed;
  }

  recordManifestHistory({ revision, event, catalog = null, details = {} }) {
    const snapshot = this.listCustomCatalogs().map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      enabled: item.enabled,
      updates_enabled: item.updates_enabled
    }));
    this.db.prepare(`
      INSERT INTO manifest_history
        (revision, event, catalog_id, catalog_name, details, snapshot, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(revision), String(event), catalog?.id || null, catalog?.name || null,
      JSON.stringify(details || {}), JSON.stringify(snapshot), Date.now()
    );
  }

  listManifestHistory(limit = 50) {
    return this.db.prepare(`
      SELECT * FROM manifest_history ORDER BY revision DESC, id DESC LIMIT ?
    `).all(Math.min(Math.max(Number(limit) || 50, 1), 200)).map(row => ({
      ...row,
      details: JSON.parse(row.details || '{}'),
      snapshot: JSON.parse(row.snapshot || '[]')
    }));
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
        SUM(CASE WHEN m.catalog_type = 'animés'        THEN 1 ELSE 0 END) AS animes_count,
        SUM(CASE WHEN m.catalog_type = 'concerts'      THEN 1 ELSE 0 END) AS concerts_count,
        SUM(CASE WHEN m.catalog_type = 'spectacles'    THEN 1 ELSE 0 END) AS spectacles_count
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

  // ─── Maintenance concerts ─────────────────────────────────────────────────

  // Médias avec genre Music TMDB (10402) non encore classés en concerts.
  // Exclut les genres narratifs disqualifiants (Drama=18, Comédie=35, Romance=10749,
  // Action=28, Horreur=27, SF=878, Fantastique=14, Thriller=53).
  getConcertCandidatesFromGenre() {
    return this.db.prepare(`
      SELECT imdb_id, name, catalog_type, genres
      FROM media
      WHERE catalog_type NOT IN ('concerts', 'animés')
        AND genres IS NOT NULL
        AND EXISTS     (SELECT 1 FROM json_each(genres) WHERE value = 10402)
        AND NOT EXISTS (SELECT 1 FROM json_each(genres) WHERE value IN (18, 35, 10749, 28, 27, 878, 14, 53))
    `).all();
  }

  // Médias classés en concerts mais ayant des genres narratifs disqualifiants
  getFalseConcertCandidates() {
    return this.db.prepare(`
      SELECT imdb_id, name, type, genres
      FROM media
      WHERE catalog_type = 'concerts'
        AND genres IS NOT NULL
        AND EXISTS (SELECT 1 FROM json_each(genres) WHERE value IN (18, 35, 10749, 28, 27, 878, 14, 53))
    `).all();
  }

  // ─── Maintenance spectacles ───────────────────────────────────────────────

  // Pas de genre TMDB dédié pour les spectacles → pas de candidats via genre seul.
  // La reclassification spectacles repose sur les mots-clés titre (cf. webui.js).
  getSpectacleCandidatesFromTitle() {
    return this.db.prepare(`
      SELECT imdb_id, name, catalog_type, release_name
      FROM media
      WHERE catalog_type NOT IN ('spectacles', 'animés', 'concerts')
        AND release_name IS NOT NULL
        AND (
          release_name LIKE '%STAND UP%' OR release_name LIKE '%STAND-UP%'
          OR release_name LIKE '%ONE MAN SHOW%' OR release_name LIKE '%ONE-MAN-SHOW%'
          OR release_name LIKE '%ONE WOMAN SHOW%'
          OR release_name LIKE '%SPECTACLE%'
          OR release_name LIKE '%THEATRE%' OR release_name LIKE '%THÉÂTRE%'
          OR release_name LIKE '%CIRQUE%'
          OR release_name LIKE '%MAGIC SHOW%'
          OR release_name LIKE '%HUMORISTE%'
          OR release_name LIKE '%HUMORISTE%'
        )
    `).all();
  }

  close() {
    this.db.close();
  }
}

module.exports = DatabaseManager;
