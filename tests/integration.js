const assert = require('assert/strict');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const os = require('os');
const path = require('path');
const SQLite = require('better-sqlite3');
const DatabaseManager = require('../src/database');
const PastebinParser = require('../src/pastebin-parser');
const TMDBMatcher = require('../src/tmdb-matcher');
const StremioAddon = require('../src/addon');
const StremioManifestParser = require('../src/stremio-manifest-parser');
const RSSParser = require('../src/rss-parser');
const WebUI = require('../src/webui');
const WaCustomParser = require('../src/wacustom-parser');
const MediaServerParser = require('../src/media-server-parser');
const StreamFusionParser = require('../src/streamfusion-parser');
const CometNetParser = require('../src/cometnet-parser');
const { signableBytes, publicKeyId } = require('../src/cometnet-parser');
const { WebSocketServer } = require('ws');
const { encode, decode } = require('@msgpack/msgpack');

const header = 'CAT;TMDB;TITLE;SAISON;GROUPES;CAST;DIRECTOR;NETWORK;YEAR;GENRES;RES;URLS=https://alldebrid.com/f/';
const movieRow = "film;123;Film Test;;[];[];[];[];2026;[28];['MULTI - 1080p'];['abc']";
const seriesRow = "serie;456;Série Test;1;[];[];[];[];2025;[18];MULTI - 1080p;1:'def'";

function verifyPublishedSchemaUpgrade() {
  const dbPath = path.join(os.tmpdir(), `stremio-rss-legacy-${process.pid}.db`);
  const backupDir = path.join(path.dirname(dbPath), 'backups');
  const backupsBefore = new Set(fs.existsSync(backupDir) ? fs.readdirSync(backupDir) : []);
  const legacy = new SQLite(dbPath);
  legacy.exec(`
    CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE sync_history (
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
    );
    CREATE TABLE media (
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
    );
    CREATE TABLE releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_imdb_id TEXT NOT NULL REFERENCES media(imdb_id) ON DELETE CASCADE,
      release_name TEXT NOT NULL,
      indexer_rlz_id TEXT NOT NULL UNIQUE,
      source_url TEXT,
      quality TEXT,
      hash TEXT,
      added_at INTEGER NOT NULL
    );
    CREATE TABLE feed_fetch_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_url TEXT NOT NULL,
      error_msg TEXT,
      http_status INTEGER,
      failed_at INTEGER NOT NULL
    );
    CREATE TABLE failed_releases (
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
    );
  `);
  legacy.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('tmdb_api_key', 'legacy-key');
  legacy.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(
    'newznab_sources',
    JSON.stringify([
      { id: 'default-cap', name: 'Défaut', maxItemsPerCategory: 100000 },
      { id: 'custom-cap', name: 'Personnalisé', maxItemsPerCategory: 424242 }
    ])
  );
  legacy.prepare(`
    INSERT INTO media (
      imdb_id, tmdb_id, type, catalog_type, name, year, genres,
      release_name, first_seen_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'tt7654321', '7654321', 'movie', 'films', 'Média existant',
    '2024', '[]', 'Media.Existant.2024.MULTi', 1000, 1000
  );
  legacy.prepare(`
    INSERT INTO releases (
      media_imdb_id, release_name, indexer_rlz_id, source_url, added_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run('tt7654321', 'Media.Existant.2024.MULTi', 'legacy-release', 'https://indexer.example/rss', 1000);
  legacy.close();

  const upgraded = new DatabaseManager(dbPath);
  try {
    const createdBackups = fs.readdirSync(backupDir).filter(name => !backupsBefore.has(name));
    assert.ok(createdBackups.some(name => /before-schema-v0-to-v6\.db$/.test(name)));
    assert.equal(upgraded.db.pragma('user_version', { simple: true }), 6);
    assert.equal(upgraded.getConfig('tmdb_api_key'), 'legacy-key');
    assert.equal(upgraded.getMediaByImdbId('tt7654321').name, 'Média existant');
    assert.equal(upgraded.db.prepare('SELECT COUNT(*) AS total FROM releases').get().total, 1);
    const sources = JSON.parse(upgraded.getConfig('newznab_sources'));
    assert.equal(sources.find(source => source.id === 'default-cap').maxItemsPerCategory, 10000000);
    assert.equal(sources.find(source => source.id === 'custom-cap').maxItemsPerCategory, 424242);
    const addon = new StremioAddon(upgraded);
    const manifest = addon.getManifest();
    clearTimeout(addon._warmTimer);
    assert.equal(manifest.id, 'community.useflowfr.catalog');
    assert.ok(manifest.catalogs.some(catalog => catalog.id === 'useflowfr_films'));
    assert.ok(manifest.catalogs.some(catalog => catalog.id === 'useflowfr_series'));
    const countsBeforeRestart = {
      media: upgraded.db.prepare('SELECT COUNT(*) AS total FROM media').get().total,
      releases: upgraded.db.prepare('SELECT COUNT(*) AS total FROM releases').get().total,
      catalogs: upgraded.db.prepare('SELECT COUNT(*) AS total FROM custom_catalogs').get().total
    };
    upgraded.initTables();
    upgraded.upgradeLegacySourceLimits();
    upgraded.upgradeSourceLimitsV3();
    assert.deepEqual({
      media: upgraded.db.prepare('SELECT COUNT(*) AS total FROM media').get().total,
      releases: upgraded.db.prepare('SELECT COUNT(*) AS total FROM releases').get().total,
      catalogs: upgraded.db.prepare('SELECT COUNT(*) AS total FROM custom_catalogs').get().total
    }, countsBeforeRestart);
  } finally {
    upgraded.close();
    for (const suffix of ['', '-shm', '-wal']) {
      try { fs.unlinkSync(dbPath + suffix); } catch {}
    }
  }
}

function streamFusionToken(secret, value) {
  const key = crypto.createHash('sha256').update(`sf-peer-cache-v1:${secret}`).digest();
  const iv = Buffer.alloc(16, 7);
  const cipher = crypto.createCipheriv('aes-128-cbc', key.subarray(16), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  const timestamp = Buffer.alloc(8);
  timestamp.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)));
  const signed = Buffer.concat([Buffer.from([0x80]), timestamp, iv, encrypted]);
  const signature = crypto.createHmac('sha256', key.subarray(0, 16)).update(signed).digest();
  return Buffer.concat([signed, signature]).toString('base64url');
}

function cometNetIdentity() {
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
  return { privateKey: pair.privateKey, publicKey, nodeId: publicKeyId(publicKey) };
}

function signedCometNetMessage(identity, fields) {
  const message = {
    version: '1.0',
    ...fields,
    timestamp: Date.now() / 1000,
    sender_id: identity.nodeId,
    signature: ''
  };
  message.signature = crypto.sign('sha256', signableBytes(message), identity.privateKey).toString('hex');
  return message;
}

function signedCometNetTorrent(identity, fields) {
  const torrent = {
    ...fields,
    contributor_id: identity.nodeId,
    contributor_public_key: identity.publicKey,
    contributor_signature: ''
  };
  torrent.contributor_signature = crypto.sign(
    'sha256',
    signableBytes(torrent, 'contributor_signature'),
    identity.privateKey
  ).toString('hex');
  return torrent;
}

async function main() {
  verifyPublishedSchemaUpgrade();
    console.log('✓ Mise à niveau du schéma publié sans perte de données ni de configuration');
  let baseUrl;
  let catalogRequestKeptSecret = false;
  let newznabKeyReceived = false;
  let webdavAuthReceived = false;
  let waCustomCookieReceived = false;
  let mdblistKeyReceived = false;
  let suggestArrAuthenticated = false;
  let agregarrKeyReceived = false;
  let streamFusionAuthenticated = false;
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    if (req.method === 'PROPFIND' && (req.url === '/dav/' || req.url === '/dav/Films/')) {
      webdavAuthReceived = req.headers.authorization === `Basic ${Buffer.from('dav-user:dav-pass').toString('base64')}`;
      res.statusCode = 207;
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      const children = req.url === '/dav/'
        ? `<d:response>
            <d:href>/dav/Films/</d:href>
            <d:propstat><d:status>HTTP/1.1 200 OK</d:status><d:prop>
              <d:displayname>Films</d:displayname><d:resourcetype><d:collection/></d:resourcetype>
            </d:prop></d:propstat>
          </d:response>`
        : `<d:response>
            <d:href>/dav/Films/WebDAV.Movie.2026.FRENCH.1080p.mkv</d:href>
            <d:propstat><d:status>HTTP/1.1 200 OK</d:status><d:prop>
              <d:displayname>WebDAV.Movie.2026.FRENCH.1080p.mkv</d:displayname>
              <d:resourcetype/><d:getlastmodified>Tue, 28 Jul 2026 10:00:00 GMT</d:getlastmodified>
            </d:prop></d:propstat>
          </d:response>
          <d:response>
            <d:href>/dav/Films/ignore.txt</d:href>
            <d:propstat><d:status>HTTP/1.1 200 OK</d:status><d:prop>
              <d:displayname>ignore.txt</d:displayname><d:resourcetype/>
            </d:prop></d:propstat>
          </d:response>`;
      return res.end(`<?xml version="1.0" encoding="utf-8"?>
        <d:multistatus xmlns:d="DAV:">
          <d:response>
            <d:href>${req.url}</d:href>
            <d:propstat><d:status>HTTP/1.1 200 OK</d:status><d:prop>
              <d:displayname>Racine</d:displayname><d:resourcetype><d:collection/></d:resourcetype>
            </d:prop></d:propstat>
          </d:response>
          ${children}
        </d:multistatus>`);
    }
    if (req.url === '/pointer') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ pasteMasterIndexUrl: `${baseUrl}/master` }));
    }
    if (req.url === '/image-source.png') {
      res.setHeader('Content-Type', 'image/png');
      return res.end(Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
    }
    if (req.url === '/master') return res.end('#FILMS\nmovie\n#SERIES\nseries\n');
    if (req.url === '/movie') return res.end(`${header}\n${movieRow}\n`);
    if (req.url === '/series') return res.end(`${header}\n${seriesRow}\n`);
    if (req.url.startsWith('/addon/manifest.json')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        id: 'test.remote', version: '1.0.0', name: 'Source distante de test',
        catalogs: [{ type: 'movie', id: 'remote_movies', name: 'Sélection distante' }]
      }));
    }
    if (req.url.startsWith('/addon/catalog/movie/remote_movies.json')) {
      catalogRequestKeptSecret = req.url.includes('token=secret-test');
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        metas: [{
          id: 'tt0000789', type: 'movie', name: 'Film distant',
          releaseInfo: '2026', poster: 'https://images.invalid/poster.jpg'
        }],
        hasMore: false
      }));
    }
    if (req.url.startsWith('/exotic/manifest.json')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        id: 'test.exotic', version: '1.0.0', name: 'Source non IMDb',
        idPrefixes: ['kitsu:', 'yt_id:'],
        catalogs: [
          { type: 'anime', id: 'anime_list', name: 'Liste anime' },
          { type: 'YouTube', id: 'youtube_list', name: 'Playlist vidéo' }
        ]
      }));
    }
    if (req.url.startsWith('/exotic/catalog/anime/anime_list.json')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        metas: [{
          id: 'kitsu:42', kitsu_id: 42, type: 'series', name: 'Anime sans IMDb',
          releaseInfo: '2026', genres: ['Animation', 'Adventure'],
          poster: 'https://images.invalid/anime.jpg'
        }],
        hasMore: false
      }));
    }
    if (req.url.startsWith('/exotic/catalog/YouTube/youtube_list.json')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        metas: [{
          id: 'yt_id:abcdefghijk', type: 'YouTube', name: 'Vidéo de test',
          releaseInfo: '2026', genres: ['Technology'],
          poster: 'https://images.invalid/youtube.jpg'
        }],
        hasMore: false
      }));
    }
    if (req.url.startsWith('/metadata/manifest.json')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        id: 'test.metadata', version: '1.0.0', name: 'Métadonnées de test',
        catalogs: [{
          type: 'movie', id: 'search.movie', name: 'Recherche films',
          extra: [{ name: 'search', isRequired: true }]
        }]
      }));
    }
    if (req.url.startsWith('/metadata/catalog/movie/search.movie/search=Film%20Fallback.json')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        metas: [{
          id: 'tt0000999', type: 'movie', name: 'Film Fallback',
          releaseInfo: '2026', poster: 'https://images.invalid/fallback.jpg'
        }]
      }));
    }
    if (req.url.startsWith('/metadata-empty/manifest.json')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        id: 'test.metadata.empty', version: '1.0.0', name: 'Métadonnées vides',
        catalogs: [{
          type: 'movie', id: 'search.movie', name: 'Recherche films',
          extra: [{ name: 'search', isRequired: true }]
        }]
      }));
    }
    if (req.url.startsWith('/metadata-empty/catalog/movie/search.movie/')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ metas: [] }));
    }
    if (req.url.startsWith('/mdblist/items')) {
      const requestUrl = new URL(req.url, baseUrl);
      mdblistKeyReceived = requestUrl.searchParams.get('apikey') === 'mdblist-test-key';
      res.setHeader('Content-Type', 'application/json');
      if (!requestUrl.searchParams.get('cursor')) {
        res.setHeader('X-Has-More', 'true');
        return res.end(JSON.stringify({
          movies: [{
            rank: 2, title: 'Film Test', imdb_id: 'tt0000123',
            ids: { imdb: 'tt0000123', tmdb: 123 }, mediatype: 'movie', release_year: 2026
          }],
          shows: [{
            rank: 1, title: 'Série Test', imdb_id: 'tt0000456',
            ids: { imdb: 'tt0000456', tmdb: 456 }, mediatype: 'show', release_year: 2025
          }],
          pagination: { next_cursor: 'page-2' }
        }));
      }
      return res.end(JSON.stringify({
        movies: [{
          rank: 3, title: 'Titre absent', imdb_id: 'tt9999999',
          ids: { imdb: 'tt9999999', tmdb: 9999999 }, mediatype: 'movie', release_year: 2026
        }],
        shows: [],
        pagination: {}
      }));
    }
    if (req.url.startsWith('/api/lists/imdb/top/items')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        items: [
          { id: 1, title: 'Film Test', media_type: 'movie', year: 2026, imdb_id: 'tt0000123', tmdb_id: 123 },
          { id: 2, title: 'Série Test', media_type: 'tv', year: 2025, imdb_id: 'tt0000456', tmdb_id: 456 }
        ],
        total: 2, limit: 100, has_more: false
      }));
    }
    if (req.url === '/api/auth/login' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      return req.on('end', () => {
        const credentials = JSON.parse(body || '{}');
        res.setHeader('Content-Type', 'application/json');
        if (credentials.username !== 'demo' || credentials.password !== 'secret') {
          res.statusCode = 401;
          return res.end(JSON.stringify({ error: 'Invalid credentials' }));
        }
        res.end(JSON.stringify({ access_token: 'suggestarr-test-token' }));
      });
    }
    if (req.url.startsWith('/api/jobs/suggestions')) {
      suggestArrAuthenticated = req.headers.authorization === 'Bearer suggestarr-test-token';
      const requestUrl = new URL(req.url, baseUrl);
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        status: 'success',
        items: requestUrl.searchParams.get('status') === 'submitted'
          ? [{ tmdb_id: 789, media_type: 'movie', title: 'Film distant', release_date: '2026-03-04' }]
          : [{ tmdb_id: 456, media_type: 'tv', title: 'Série Test', release_date: '2025-01-01' }],
        total: 1, page: 1, pages: 1
      }));
    }
    if (req.url === '/agregarr/api/v1/collections') {
      agregarrKeyReceived = req.headers['x-api-key'] === 'agregarr-test-key';
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        collectionConfigs: [{
          id: 'collection-fr', name: 'Tendances France', type: 'mdblist',
          mediaType: 'both', libraryId: 'library-test', maxItems: 500
        }]
      }));
    }
    if (req.url === '/agregarr/api/v1/collections/preview' && req.method === 'POST') {
      agregarrKeyReceived = req.headers['x-api-key'] === 'agregarr-test-key';
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ sessionId: 'preview-test' }));
    }
    if (req.url === '/agregarr/api/v1/collections/preview/status/preview-test') {
      agregarrKeyReceived = req.headers['x-api-key'] === 'agregarr-test-key';
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        running: false,
        completed: true,
        result: {
          items: [
            { title: 'Film Test', year: 2026, tmdbId: 123, mediaType: 'movie', inLibrary: true },
            { title: 'Série Test', year: 2025, tmdbId: 456, mediaType: 'tv', inLibrary: true }
          ],
          totalItems: 2,
          matchedCount: 2,
          missingCount: 0
        }
      }));
    }
    if (req.url === '/streamfusion/api/peer/private/export' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      return req.on('end', () => {
        const secret = 'streamfusion-test-secret';
        const bodyHash = crypto.createHash('sha256').update(body).digest();
        const message = Buffer.concat([Buffer.from(`${req.headers['x-peer-timestamp']}.`), bodyHash]);
        const expected = crypto.createHmac('sha256', secret).update(message).digest('hex');
        streamFusionAuthenticated =
          req.headers['x-peer-key-id'] === 'streamfusion-test-key'
          && req.headers['x-peer-signature'] === expected;
        const request = JSON.parse(body);
        const rows = [
          {
            info_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            raw_title: 'Film StreamFusion 2026 FRENCH 1080p', size: 1000,
            type: 'movie', imdb_id: 'tt0000940', tmdb_id: 940,
            parsed_data: { title: 'Film StreamFusion', year: 2026, resolution: '1080p' },
            created_at: 1
          },
          {
            info_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            raw_title: 'Série StreamFusion S01E01 2025 FRENCH', size: 2000,
            type: 'series', imdb_id: 'tt0000941', tmdb_id: 941,
            parsed_data: { title: 'Série StreamFusion', year: 2025, season: 1 },
            created_at: 2
          }
        ];
        const start = request.cursor ? rows.findIndex(row => row.info_hash === request.cursor) + 1 : 0;
        const items = rows.slice(start, start + request.limit);
        const nextCursor = start + items.length < rows.length ? items.at(-1).info_hash : null;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          payload: streamFusionToken(secret, {
            items, next_cursor: nextCursor, count: items.length
          })
        }));
      });
    }
    if (req.url.startsWith('/newznab/api')) {
      const requestUrl = new URL(req.url, baseUrl);
      newznabKeyReceived = requestUrl.searchParams.get('apikey') === 'newznab-test-key';
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      if (requestUrl.searchParams.get('t') === 'caps') {
        return res.end(`<?xml version="1.0"?>
          <caps>
            <limits max="2" default="2"/>
            <categories>
              <category id="2000" name="Movies"/>
              <category id="5000" name="TV"/>
            </categories>
          </caps>`);
      }
      const category = requestUrl.searchParams.get('cat');
      const offset = Number(requestUrl.searchParams.get('offset') || 0);
      const movieItems = [
        ['api-film-1', 'API Film One 2026 FRENCH 1080p', '0000901'],
        ['api-film-2', 'API Film Two 2025 FRENCH 2160p', '0000902'],
        ['api-film-3', 'API Film Three 2024 FRENCH WEB-DL', '0000903']
      ];
      const seriesItems = [['api-series-1', 'API Series S01E01 2026 FRENCH 1080p', '0000910']];
      const all = category === '5000' ? seriesItems : movieItems;
      const limit = Number(requestUrl.searchParams.get('limit') || 2);
      const items = all.slice(offset, offset + limit).map(([guid, title, imdb]) => `
        <item>
          <title>${title}</title>
          <guid isPermaLink="false">${guid}</guid>
          <link>${baseUrl}/nzb/${guid}</link>
          <pubDate>Mon, 27 Jul 2026 12:00:00 GMT</pubDate>
          <newznab:attr name="category" value="${category}"/>
          <newznab:attr name="imdb" value="${imdb}"/>
        </item>`).join('');
      return res.end(`<?xml version="1.0"?>
        <rss xmlns:newznab="http://www.newznab.com/DTD/2010/feeds/attributes/" version="2.0">
          <channel>
            <newznab:response offset="${offset}" total="${all.length}"/>
            ${items}
          </channel>
        </rss>`);
    }
    if (req.url === '/wacustom/admin/login' && req.method === 'POST') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Set-Cookie', 'admin_token=test-session; HttpOnly; SameSite=Strict');
      return res.end(JSON.stringify({ success: true }));
    }
    if (req.url.startsWith('/wacustom/admin/api/wasource')) {
      waCustomCookieReceived = req.headers.cookie === 'admin_token=test-session';
      const requestUrl = new URL(req.url, baseUrl);
      const offset = Number(requestUrl.searchParams.get('offset') || 0);
      const limit = Number(requestUrl.searchParams.get('limit') || 1000);
      const contents = [
        {
          id: 1, imdb_id: 'tt0000920', tmdb_id: '920', title: 'WaCustom Film',
          year: 2026, season: null, episode: null,
          releases: [{ release_name: 'WaCustom.Film.2026.FRENCH.1080p' }],
          created_at: 1, updated_at: 2
        },
        {
          id: 2, imdb_id: 'tt0000921', tmdb_id: '921', title: 'WaCustom Série',
          year: 2025, season: 1, episode: 1,
          releases: [{ release_name: 'WaCustom.Serie.S01E01.FRENCH.1080p' }],
          created_at: 1, updated_at: 2
        }
      ].slice(offset, offset + limit);
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ total: 2, limit, offset, contents }));
    }
    if (req.url === '/plex/library/sections') {
      res.setHeader('Content-Type', 'application/xml');
      return res.end('<MediaContainer friendlyName="Plex Test"><Directory key="1" type="movie" title="Films"/><Directory key="2" type="show" title="Séries"/></MediaContainer>');
    }
    if (req.url.startsWith('/plex/library/sections/1/collections')) {
      res.setHeader('Content-Type', 'application/xml');
      return res.end('<MediaContainer><Metadata ratingKey="50" title="Classiques"/></MediaContainer>');
    }
    if (req.url.startsWith('/plex/library/sections/2/collections')) {
      res.setHeader('Content-Type', 'application/xml');
      return res.end('<MediaContainer/>');
    }
    if (req.url.startsWith('/plex/library/sections/1/all')) {
      const requestUrl = new URL(req.url, baseUrl);
      const offset = Number(requestUrl.searchParams.get('X-Plex-Container-Start') || 0);
      const rows = [
        '<Metadata ratingKey="101" type="movie" title="Film Plex" year="2026"><Guid id="imdb://tt0000930"/><Guid id="tmdb://930"/></Metadata>',
        '<Metadata ratingKey="102" type="movie" title="Second Film Plex" year="2025"><Guid id="imdb://tt0000932"/></Metadata>'
      ];
      const page = rows.slice(offset, offset + 1).join('');
      res.setHeader('Content-Type', 'application/xml');
      return res.end(`<MediaContainer totalSize="2" size="${page ? 1 : 0}" offset="${offset}">${page}</MediaContainer>`);
    }
    if (req.url.startsWith('/plex/library/collections/50/children')) {
      res.setHeader('Content-Type', 'application/xml');
      return res.end('<MediaContainer totalSize="1" size="1"><Video ratingKey="101" type="movie" title="Film Plex" year="2026"><Guid id="imdb://tt0000930"/><Guid id="tmdb://930"/></Video></MediaContainer>');
    }
    if (req.url === '/jellyfin/Library/VirtualFolders') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify([{ Name: 'Séries Jellyfin', ItemId: 'lib-tv', CollectionType: 'tvshows' }]));
    }
    if (req.url.startsWith('/jellyfin/Items')) {
      const requestUrl = new URL(req.url, baseUrl);
      res.setHeader('Content-Type', 'application/json');
      if (requestUrl.searchParams.get('IncludeItemTypes') === 'BoxSet') {
        return res.end(JSON.stringify({
          Items: [{ Id: 'jf-collection-1', Name: 'Favoris' }],
          TotalRecordCount: 1
        }));
      }
      const rows = [
        {
          Id: 'jf-1', Name: 'Série Jellyfin', Type: 'Series', ProductionYear: 2025,
          ProviderIds: { Imdb: 'tt0000931', Tmdb: '931' }, Genres: ['Drama'], CommunityRating: 8.2
        },
        {
          Id: 'jf-2', Name: 'Film Jellyfin', Type: 'Movie', ProductionYear: 2026,
          ProviderIds: { Imdb: 'tt0000933', Tmdb: '933' }, Genres: ['Adventure'], CommunityRating: 7.4
        }
      ];
      const offset = Number(requestUrl.searchParams.get('StartIndex') || 0);
      const limit = Number(requestUrl.searchParams.get('Limit') || 100);
      return res.end(JSON.stringify({
        Items: rows.slice(offset, offset + limit),
        TotalRecordCount: rows.length
      }));
    }

    if (req.url.startsWith('/3/search/movie')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        results: [
          {
            id: 901, title: 'Un titre sans rapport', original_title: 'Unrelated title',
            release_date: '1998-01-01', popularity: 500, genre_ids: [28]
          },
          {
            id: 9902, title: 'Spectacle Test', original_title: 'Spectacle Test',
            release_date: '2026-04-01', popularity: 10, genre_ids: [35]
          }
        ]
      }));
    }
    if (req.url.startsWith('/3/search/tv')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        results: [{
          id: 9903, name: 'Le Talk Test', original_name: 'Le Talk Test',
          first_air_date: '2026-02-01', popularity: 5, genre_ids: [10767]
        }]
      }));
    }
    if (req.url.startsWith('/3/movie/9902')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        id: 9902, imdb_id: 'tt0999902', title: 'Spectacle Test', release_date: '2026-04-01',
        poster_path: '/show.jpg', backdrop_path: '/show-bg.jpg', overview: 'Spectacle de test',
        genres: [{ id: 35 }], vote_average: 7.8, original_language: 'fr',
        external_ids: { imdb_id: 'tt0999902' },
        keywords: { keywords: [{ id: 1, name: 'stand-up comedy' }] }
      }));
    }
    if (req.url.startsWith('/3/tv/9903')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        id: 9903, name: 'Le Talk Test', first_air_date: '2026-02-01', type: 'Talk Show',
        genres: [{ id: 10767 }], vote_average: 7, original_language: 'fr', origin_country: ['FR'],
        external_ids: { imdb_id: 'tt0999903' },
        keywords: { results: [{ id: 2, name: 'talk show' }] }
      }));
    }
    if (req.url.startsWith('/3/movie/123')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        id: 123, imdb_id: 'tt0000123', title: 'Film Test', release_date: '2026-03-01',
        poster_path: '/film.jpg', backdrop_path: '/film-bg.jpg', overview: 'Film de test',
        genres: [{ id: 28 }], vote_average: 7.2, original_language: 'fr',
        external_ids: { imdb_id: 'tt0000123' }
      }));
    }
    if (req.url.startsWith('/3/tv/456')) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        id: 456, name: 'Série Test', first_air_date: '2025-02-01',
        poster_path: '/series.jpg', backdrop_path: '/series-bg.jpg', overview: 'Série de test',
        genres: [{ id: 18 }], vote_average: 8, original_language: 'fr', origin_country: ['FR'],
        external_ids: { imdb_id: 'tt0000456' }
      }));
    }
    res.statusCode = 404;
    res.end('not found');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const dbPath = path.join(os.tmpdir(), `stremio-rss-test-${process.pid}.db`);
  const db = new DatabaseManager(dbPath);
  try {
    db.setConfig('tmdb_api_key', 'test-key');
    const parser = new PastebinParser(db);
    const discovery = await parser.discover(`${baseUrl}/pointer`);
    assert.equal(discovery.visited, 4);
    assert.equal(discovery.items.length, 2);
    assert.deepEqual(
      discovery.items.map(item => [item.tmdb_id, item.catalog_type, item.type]),
      [['123', 'films', 'movie'], ['456', 'series', 'series']]
    );
    assert.ok(discovery.items.every(item => item.source_url === `${baseUrl}/pointer`));
    const directOnlyDiscovery = await parser.discover(`${baseUrl}/pointer`, { maxDepth: 0 });
    assert.equal(directOnlyDiscovery.visited, 1);
    assert.equal(directOnlyDiscovery.items.length, 0);

    const matcher = new TMDBMatcher(db);
    matcher.baseUrl = `${baseUrl}/3`;
    const pttRssParser = new RSSParser({}, db);
    pttRssParser.releaseParser.parseMany = () => [{
      title: 'Le Bureau des Légendes',
      year: 2015,
      seasons: [1],
      episodes: [1],
      languages: ['fr'],
      resolution: '1080p'
    }];
    const pttParsed = pttRssParser._parseItems([{
      title: 'Le.Bureau.des.Legendes.S01E01.2015.FRENCH.1080p.WEB-DL.x264-GROUP',
      guid: 'ptt-test'
    }], 'auto', `${baseUrl}/rss`);
    assert.equal(pttParsed[0].cleanName, 'Le Bureau des Légendes');
    assert.equal(pttParsed[0].type, 'series');
    assert.equal(pttParsed[0].year, '2015');
    assert.equal(pttParsed[0].parsed_release.resolution, '1080p');
    const legacyEpisode = pttRssParser.parseReleaseName(
      'Emission.Speciale.2x03.FRENCH.HDTV.2026'
    );
    assert.equal(legacyEpisode.cleanName, 'Emission Speciale');
    assert.equal(legacyEpisode.isSeries, true);
    assert.equal(legacyEpisode.year, '2026');
    assert.equal(legacyEpisode.typeConfidence, 'high');
    console.log('✓ Parsing PTT structuré avec repli historique');

    const rankedMovie = await matcher.searchMovie('Spectacle Test', '2026');
    assert.equal(rankedMovie.imdb_id, 'tt0999902');
    assert.ok(rankedMovie.match_confidence >= 90);
    assert.deepEqual(rankedMovie.keywords, ['stand-up comedy']);
    const rankedTv = await matcher.searchTVShow('Le Talk Test', '2026');
    assert.equal(rankedTv.tv_type, 'Talk Show');
    assert.deepEqual(rankedTv.keywords, ['talk show']);
    assert.equal(
      matcher.scoreCandidate(
        { title: 'Sans rapport', release_date: '1990-01-01' },
        'Spectacle Test', '2026', 'movie'
      ).score < 30,
      true
    );
    console.log('✓ Classement multi-candidats et enrichissement TMDB');

    const match = await matcher.matchBatch(discovery.items);
    assert.equal(match.matched, 2);
    assert.equal(match.failed, 0);
    assert.equal(db.getMediaByImdbId('tt0000123').year, '2026');
    assert.equal(db.getMediaByImdbId('tt0000456').type, 'series');
    const enrichedMatch = await matcher.matchBatch([
      {
        release_name: 'Spectacle.Test.2026.FRENCH.1080p',
        indexer_rlz_id: 'tmdb-ranked-spectacle',
        cleanName: 'Spectacle Test',
        year: '2026',
        catalog_type: 'films',
        type: 'movie',
        source_force: 'auto',
        source_url: 'rss:test'
      },
      {
        release_name: 'Le.Talk.Test.S01.2026.FRENCH.1080p',
        indexer_rlz_id: 'tmdb-ranked-emission',
        cleanName: 'Le Talk Test',
        year: '2026',
        catalog_type: 'films',
        type: 'movie',
        type_confidence: 'low',
        source_force: 'auto',
        source_url: 'rss:test'
      }
    ]);
    assert.equal(enrichedMatch.matched, 2);
    assert.equal(db.getMediaByImdbId('tt0999902').catalog_type, 'spectacles');
    assert.equal(db.getMediaByImdbId('tt0999903').catalog_type, 'emissions');
    assert.deepEqual(db.getMediaByImdbId('tt0999902').keywords, ['stand-up comedy']);
    console.log('✓ Classification TMDB par détails, type et mots-clés');
    db.db.prepare("DELETE FROM media WHERE imdb_id IN ('tt0999902', 'tt0999903')").run();

    db.addMedia({
      imdb_id: 'tt0999910', type: 'movie', catalog_type: 'films',
      name: 'Disponibilité Test', year: '2026', genres: [], keywords: [],
      release_name: 'Disponibilite.Test.2026'
    });
    db.addRelease({
      media_imdb_id: 'tt0999910',
      release_name: 'Disponibilite.Test.2026',
      indexer_rlz_id: 'availability-release',
      source_url: 'inventory:test',
      scan_token: 'scan-initial'
    });
    db.finalizeAvailabilityScan('scan-missing-1', {
      missingScans: 2, sourceUrls: ['inventory:test']
    });
    assert.equal(db.getMediaByImdbId('tt0999910').availability_hidden, 0);
    const hiddenAvailability = db.finalizeAvailabilityScan('scan-missing-2', {
      missingScans: 2, sourceUrls: ['inventory:test']
    });
    assert.equal(hiddenAvailability.mediaHidden, 1);
    assert.equal(db.getMediaByImdbId('tt0999910').availability_hidden, 1);
    assert.ok(!db.getMedia('films', 0, 100).some(item => item.imdb_id === 'tt0999910'));
    db.addRelease({
      media_imdb_id: 'tt0999910',
      release_name: 'Disponibilite.Test.2026',
      indexer_rlz_id: 'availability-release',
      source_url: 'inventory:test',
      scan_token: 'scan-returned'
    });
    assert.equal(db.getMediaByImdbId('tt0999910').availability_hidden, 0);
    db.db.prepare("DELETE FROM media WHERE imdb_id = 'tt0999910'").run();
    console.log('✓ Fraîcheur, masquage après scans absents et restauration');

    const originalOmdbConfigured = matcher.omdb.isConfigured;
    const originalOmdbFetch = matcher.omdb.fetch;
    let directExistingOmdbCalls = 0;
    matcher.omdb.isConfigured = () => true;
    matcher.omdb.fetch = async () => {
      directExistingOmdbCalls++;
      throw new Error('OMDb ne doit pas être appelé pour un média direct déjà connu');
    };
    const directExisting = await matcher.matchBatch([{
      release_name: 'Film.Test.2026.FRENCH.1080p',
      indexer_rlz_id: 'direct-existing-release',
      cleanName: 'Film Test',
      catalog_type: 'films',
      type: 'movie',
      source_url: 'structured:test',
      direct_meta: { imdb_id: 'tt0000123', name: 'Film Test' }
    }]);
    assert.equal(directExisting.matched, 1);
    assert.equal(directExisting.alreadyInDb, 1);
    assert.equal(directExistingOmdbCalls, 0);
    matcher.omdb.isConfigured = originalOmdbConfigured;
    matcher.omdb.fetch = originalOmdbFetch;

    matcher.anilist.search = async () => null;
    matcher.kitsu.search = async () => ({
      kitsu_id: '777', title: 'Anime Natif', year: '2026',
      stremio_type: 'series', score: 8.1, poster: 'https://images.invalid/kitsu.jpg'
    });
    matcher.matchItem = async () => null;
    matcher.stremioMetadata.search = async () => null;
    const nativeAnime = await matcher.matchAnimeItem({
      cleanName: 'Anime Natif', year: '2026', type: 'series', catalog_type: 'animés'
    });
    assert.equal(nativeAnime.imdb_id, 'kitsu:777');

    db.setConfig('stremio_metadata_enabled', 'true');
    db.setConfig('stremio_metadata_manifest_url', `${baseUrl}/metadata/manifest.json?token=test`);
    const metadataMatch = await new (require('../src/services/stremioMetadataService'))(
      db, () => ({ timeout: 2000 })
    ).search({
      cleanName: 'Film Fallback', year: '2026', type: 'movie'
    });
    assert.equal(metadataMatch.imdb_id, 'tt0000999');
    db.setConfig('stremio_metadata_sources', JSON.stringify([
      {
        id: 'metadata-empty', name: 'Vide', url: `${baseUrl}/metadata-empty/manifest.json`,
        priority: 10, paused: false, useProxy: false
      },
      {
        id: 'metadata-good', name: 'Second service', url: `${baseUrl}/metadata/manifest.json?token=test`,
        priority: 20, paused: false, useProxy: false
      }
    ]));
    const multipleMetadata = new (require('../src/services/stremioMetadataService'))(
      db, () => ({ timeout: 2000 })
    );
    const metadataInspection = await multipleMetadata.inspect(multipleMetadata.getSources()[1]);
    assert.equal(metadataInspection.catalogs.length, 1);
    const multipleMetadataMatch = await multipleMetadata.search({
      cleanName: 'Film Fallback', year: '2026', type: 'movie'
    });
    assert.equal(multipleMetadataMatch.imdb_id, 'tt0000999');
    assert.equal(multipleMetadataMatch.identification_provider, 'Second service');
    console.log('✓ Plusieurs addons de métadonnées ordonnés, testables et désactivables');

    const mediaServerParser = new MediaServerParser(db, () => ({ timeout: 2000 }));
    const plexSource = {
      id: 'plex-test', kind: 'plex', name: 'Plex Test', url: `${baseUrl}/plex`,
      apiKey: 'plex-token', targets: ['library:1', 'collection:50'], maxItems: 100, pageSize: 1
    };
    const plexInspection = await mediaServerParser.inspect(plexSource);
    assert.deepEqual(plexInspection.targets.map(target => target.id), ['library:1', 'library:2', 'collection:50']);
    const plexItems = await mediaServerParser.fetchSource(plexSource);
    assert.equal(plexItems.length, 2);
    assert.equal(plexItems[0].direct_meta.imdb_id, 'tt0000930');
    assert.equal(plexItems[1].direct_meta.imdb_id, 'tt0000932');

    const jellyfinSource = {
      id: 'jellyfin-test', kind: 'jellyfin', name: 'Jellyfin Test', url: `${baseUrl}/jellyfin`,
      apiKey: 'jellyfin-token', targets: ['library:lib-tv', 'collection:jf-collection-1'], maxItems: 100, pageSize: 1
    };
    const jellyfinInspection = await mediaServerParser.inspect(jellyfinSource);
    assert.equal(jellyfinInspection.targets[0].type, 'series');
    assert.deepEqual(
      jellyfinInspection.targets.map(target => target.id),
      ['library:lib-tv', 'collection:jf-collection-1']
    );
    const jellyfinItems = await mediaServerParser.fetchSource(jellyfinSource);
    assert.equal(jellyfinItems.length, 2);
    assert.equal(jellyfinItems[0].direct_meta.imdb_id, 'tt0000931');
    assert.equal(jellyfinItems[1].direct_meta.imdb_id, 'tt0000933');
    console.log('✓ Bibliothèques et collections Plex/Jellyfin indexées avec identifiants directs');

    const rssParser = new RSSParser({}, db);
    rssParser.mdblistGuideParser.itemsUrl = () => `${baseUrl}/mdblist/items`;
    const mdblistResult = await rssParser.mdblistGuideParser.fetchItems({
      id: 'mdblist-parser-test',
      url: 'https://mdblist.com/lists/demo/list',
      apiKey: 'mdblist-test-key',
      maxItems: 100
    });
    assert.equal(mdblistKeyReceived, true);
    assert.deepEqual(mdblistResult.items.map(item => item.imdb_id), [
      'tt0000456', 'tt0000123', 'tt9999999'
    ]);
    const listSyncResult = await rssParser.mdblistGuideParser.fetchItems({
      kind: 'listsync', url: baseUrl, listType: 'imdb', listId: 'top', maxItems: 100
    });
    assert.deepEqual(listSyncResult.items.map(item => item.imdb_id), ['tt0000123', 'tt0000456']);
    const suggestArrResult = await rssParser.mdblistGuideParser.fetchItems({
      kind: 'suggestarr', url: baseUrl, username: 'demo', password: 'secret',
      statuses: ['awaiting_approval', 'submitted'], maxItems: 100
    });
    assert.equal(suggestArrAuthenticated, true);
    assert.deepEqual(suggestArrResult.items.map(item => item.tmdb_id), [456, 789]);
    const agregarrSource = {
      kind: 'agregarr',
      url: `${baseUrl}/agregarr`,
      apiKey: 'agregarr-test-key',
      listId: 'collection-fr',
      maxItems: 100
    };
    const agregarrCollections = await rssParser.mdblistGuideParser.listAgregarrCollections(agregarrSource);
    assert.deepEqual(agregarrCollections.map(collection => collection.id), ['collection-fr']);
    const agregarrResult = await rssParser.mdblistGuideParser.fetchItems(agregarrSource);
    assert.equal(agregarrKeyReceived, true);
    assert.deepEqual(agregarrResult.items.map(item => item.tmdb_id), [123, 456]);
    assert.equal(rssParser.safeUrl('https://example.test/rss?passkey=secret'), 'https://example.test/rss?…');
    const tmdbEnriched = rssParser.newznabParser.enrichParsedItems(
      [{ guid: 'tmdb-release', 'newznab:attr': { $: { name: 'tmdbid', value: '123' } } }],
      [{
        indexer_rlz_id: 'tmdb-release', release_name: 'Film Test FRENCH 2026',
        cleanName: 'Film Test', year: '2026', type: 'movie',
        catalog_type: 'films', source_url: 'newznab:tmdb-fast-test:movie'
      }]
    );
    assert.equal(tmdbEnriched[0].tmdb_id, '123');
    const knownTmdbMatch = await matcher.matchBatch(tmdbEnriched);
    assert.equal(knownTmdbMatch.alreadyInDb, 1);

    const webdavSource = {
      id: 'webdav-test',
      name: 'WebDAV de test',
      url: `${baseUrl}/dav/`,
      username: 'dav-user',
      password: 'dav-pass',
      force: 'films',
      maxDepth: 4,
      maxItems: 100,
      extensions: ['mkv'],
      useProxy: false
    };
    const webdavInspection = await rssParser.webdavParser.inspect(webdavSource);
    assert.equal(webdavInspection.directories, 2);
    assert.equal(webdavInspection.items, 1);
    assert.deepEqual(webdavInspection.sample, ['WebDAV.Movie.2026.FRENCH.1080p.mkv']);
    assert.ok(webdavAuthReceived);
    db.setConfig('webdav_sources', JSON.stringify([webdavSource]));
    const webdavItems = await rssParser.webdavParser.parseAll({ forceAll: true });
    assert.equal(webdavItems.length, 1);
    assert.equal(webdavItems[0].source_url, 'webdav:webdav-test');
    assert.equal(webdavItems[0].catalog_type, 'films');

    const waCustomParser = new WaCustomParser(db);
    const waCustomSource = {
      id: 'wacustom-test',
      name: 'WaCustom de test',
      url: `${baseUrl}/wacustom`,
      adminPassword: 'admin-test',
      maxItemsPerSync: 1,
      pageSize: 1,
      requestDelayMs: 0
    };
    const waCustomInspection = await waCustomParser.inspect(waCustomSource);
    assert.equal(waCustomInspection.total, 2);
    const waCustomFirst = await waCustomParser.fetchSource(waCustomSource);
    assert.equal(waCustomFirst.length, 1);
    assert.equal(waCustomFirst[0].direct_meta.imdb_id, 'tt0000920');
    assert.equal(waCustomFirst[0].source_url, 'wacustom:wacustom-test');
    assert.ok(waCustomCookieReceived);
    assert.equal(db.commitPendingSourceCursors(['wacustom:wacustom-test']), 1);
    const waCustomSecond = await waCustomParser.fetchSource(waCustomSource);
    assert.equal(waCustomSecond.length, 1);
    assert.equal(waCustomSecond[0].direct_meta.imdb_id, 'tt0000921');
    assert.equal(db.commitPendingSourceCursors(['wacustom:wacustom-test']), 1);
    assert.equal(
      db.getSourceSyncState('wacustom:wacustom-test').cursor.committed.backfill_complete,
      true
    );
    const waCustomMatch = await matcher.matchBatch([...waCustomFirst, ...waCustomSecond]);
    assert.equal(waCustomMatch.matched, 2);
    const filteredWaCustom = new WaCustomParser(db, null, title => title.includes('FRENCH'));
    assert.equal(filteredWaCustom.rowToItem(waCustomSource, {
      id: 3, imdb_id: 'tt0000922', title: 'Film VO', year: 2026,
      releases: [{ release_name: 'Film.VO.2026.ENGLISH.1080p' }]
    }), null);
    assert.equal(filteredWaCustom.rowToItem(waCustomSource, {
      id: 4, imdb_id: 'tt0000923', title: 'Film mixte', year: 2026,
      releases: [
        { release_name: 'Film.Mixte.2026.ENGLISH.1080p' },
        { release_name: 'Film.Mixte.2026.FRENCH.1080p' }
      ]
    }).release_name, 'Film.Mixte.2026.FRENCH.1080p');

    const streamFusionParser = new StreamFusionParser(db, () => ({ timeout: 2000 }));
    const streamFusionSource = {
      id: 'streamfusion-test',
      name: 'StreamFusion de test',
      url: `${baseUrl}/streamfusion`,
      keyId: 'streamfusion-test-key',
      secret: 'streamfusion-test-secret',
      maxItemsPerSync: 1,
      pageSize: 1,
      requestDelayMs: 0,
      useProxy: false
    };
    const streamFusionInspection = await streamFusionParser.inspect(streamFusionSource);
    assert.equal(streamFusionInspection.has_more, true);
    const streamFusionFirst = await streamFusionParser.fetchSource(streamFusionSource);
    assert.equal(streamFusionFirst.length, 1);
    assert.equal(streamFusionFirst[0].direct_meta.imdb_id, 'tt0000940');
    assert.equal(streamFusionFirst[0].source_url, 'streamfusion:streamfusion-test');
    assert.equal(streamFusionAuthenticated, true);
    assert.equal(db.commitPendingSourceCursors(['streamfusion:streamfusion-test']), 1);
    const streamFusionSecond = await streamFusionParser.fetchSource(streamFusionSource);
    assert.equal(streamFusionSecond.length, 1);
    assert.equal(streamFusionSecond[0].direct_meta.imdb_id, 'tt0000941');
    assert.equal(db.commitPendingSourceCursors(['streamfusion:streamfusion-test']), 1);
    assert.equal(
      db.getSourceSyncState('streamfusion:streamfusion-test').cursor.committed.backfill_complete,
      true
    );
    const filteredStreamFusion = new StreamFusionParser(db, null, title => title.includes('FRENCH'));
    assert.equal(filteredStreamFusion.rowToItem(streamFusionSource, {
      info_hash: 'cccccccccccccccccccccccccccccccccccccccc',
      raw_title: 'Film.StreamFusion.2026.ENGLISH.1080p',
      imdb_id: 'tt0000942', type: 'movie'
    }), null);
    console.log('✓ Import StreamFusion chiffré, signé, paginé et incrémental via l’API Peer');

    const filteredPastebin = new PastebinParser(db, null, title => title.includes('FRENCH'));
    db.setConfig('pastebin_sources', JSON.stringify([{
      id: 'pastebin-tags-test', name: 'Pastebin tags test', url: `${baseUrl}/pointer`,
      assumeRequiredTags: false, maxPages: 10
    }]));
    assert.equal((await filteredPastebin.parseAll({ forceAll: true })).length, 0);
    db.setConfig('pastebin_sources', JSON.stringify([{
      id: 'pastebin-tags-test', name: 'Pastebin tags test', url: `${baseUrl}/pointer`,
      assumeRequiredTags: true, maxPages: 10
    }]));
    assert.equal((await filteredPastebin.parseAll({ forceAll: true })).length, 2);
    db.setConfig('pastebin_sources', '[]');
    console.log('✓ Filtrage global WaCustom/StreamFusion et conformité déclarée Pastebin');

    const alertWebUi = Object.create(WebUI.prototype);
    alertWebUi.db = db;
    alertWebUi.getSourceAlertSources = () => [{
      source_key: 'test:alert-source', name: 'Source alerte test', kind: 'test', paused: false
    }];
    db.setConfig('discord_notifications_enabled', 'false');
    db.setConfig('apprise_enabled', 'false');
    db.setConfig('source_alerts_enabled', 'true');
    db.setConfig('source_alert_default_threshold', '3');
    db.setConfig('source_alert_thresholds', JSON.stringify({ 'test:alert-source': 2 }));
    db.failSourceSync('test:alert-source', {
      sourceKind: 'test', errorMessage: 'Indisponible pour le test'
    });
    await alertWebUi.processSourceHealthAlerts();
    assert.equal(db.listSourceAlerts().filter(alert => alert.source_key === 'test:alert-source').length, 0);
    db.failSourceSync('test:alert-source', {
      sourceKind: 'test', errorMessage: 'Toujours indisponible'
    });
    await alertWebUi.processSourceHealthAlerts();
    assert.equal(
      db.listSourceAlerts().find(alert => alert.source_key === 'test:alert-source').event_type,
      'failure'
    );
    db.finishSourceSync('test:alert-source', { sourceKind: 'test', itemsFetched: 1 });
    await alertWebUi.processSourceHealthAlerts();
    assert.deepEqual(
      db.listSourceAlerts().filter(alert => alert.source_key === 'test:alert-source')
        .map(alert => alert.event_type),
      ['recovery', 'failure']
    );
    console.log('✓ Alertes par source avec seuil consécutif et rétablissement');

    const cometPeer = cometNetIdentity();
    const cometContributor = cometNetIdentity();
    const cometServer = new WebSocketServer({ port: 0 });
    await new Promise(resolve => cometServer.once('listening', resolve));
    let cometPongReceived = false;
    cometServer.on('connection', socket => {
      socket.once('message', raw => {
        const clientHandshake = decode(Buffer.from(raw));
        assert.equal(clientHandshake.type, 'handshake');
        socket.send(encode(signedCometNetMessage(cometPeer, {
          type: 'handshake',
          public_key: cometPeer.publicKey,
          listen_port: 8765,
          public_url: null,
          alias: 'Pair CometNet de test',
          capabilities: [],
          network_token: null
        })));
        socket.send(encode(signedCometNetMessage(cometPeer, {
          type: 'ping',
          nonce: 'integration-ping'
        })));
        const torrent = signedCometNetTorrent(cometContributor, {
          info_hash: '1234567890abcdef1234567890abcdef12345678',
          title: 'CometNet.Movie.2026.FRENCH.1080p',
          size: 123456789,
          seeders: 42,
          tracker: 'test',
          imdb_id: 'tt0000950',
          file_index: 0,
          season: null,
          episode: null,
          sources: [],
          parsed: { title: 'CometNet Movie', year: 2026, resolution: '1080p' },
          updated_at: Date.now() / 1000,
          pool_id: null
        });
        const tampered = { ...torrent, info_hash: 'abcdef1234567890abcdef1234567890abcdef12' };
        socket.send(encode(signedCometNetMessage(cometPeer, {
          type: 'torrent_announce',
          torrents: [torrent, tampered],
          ttl: 5,
          visited_nodes: [cometPeer.nodeId]
        })));
      });
      socket.on('message', raw => {
        const message = decode(Buffer.from(raw));
        if (message.type === 'pong' && message.nonce === 'integration-ping') cometPongReceived = true;
      });
    });
    const cometNetParser = new CometNetParser(db, title => title.includes('1080p') ? '1080p' : null);
    const cometNetSource = {
      id: 'cometnet-test',
      name: 'CometNet de test',
      url: `ws://127.0.0.1:${cometServer.address().port}`,
      maxItemsPerSync: 100
    };
    db.setConfig('cometnet_sources', JSON.stringify([cometNetSource]));
    try {
      const inspected = await cometNetParser.inspect(cometNetSource);
      assert.equal(inspected.peer_node_id, cometPeer.nodeId);
      assert.equal(inspected.peer_alias, 'Pair CometNet de test');
      cometNetParser.start();
      const waitUntil = async predicate => {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          if (predicate()) return;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        throw new Error('Délai du test CometNet dépassé');
      };
      await waitUntil(() => db.getCometNetInboxStats(cometNetSource.id).pending === 1);
      await waitUntil(() => cometPongReceived);
      assert.equal(cometNetParser.getState(cometNetSource.id).status, 'connected');
      assert.equal(cometNetParser.getState(cometNetSource.id).invalid_session, 1);
      const cometItems = await cometNetParser.parseAll();
      assert.equal(cometItems.length, 1);
      assert.equal(cometItems[0].direct_meta.imdb_id, 'tt0000950');
      assert.equal(cometItems[0].source_url, 'cometnet:cometnet-test');
      assert.equal(db.markCometNetItemsProcessed(cometNetParser.lastPendingInboxKeys), 1);
      assert.equal(db.getCometNetInboxStats(cometNetSource.id).pending, 0);
    } finally {
      cometNetParser.stop();
      await new Promise(resolve => cometServer.close(resolve));
      try { fs.unlinkSync(cometNetParser.identityPath('cometnet-test')); } catch {}
      try { fs.unlinkSync(cometNetParser.identityPath('test-cometnet-test')); } catch {}
    }
    console.log('✓ Réception CometNet ciblée, passive, signée et persistante');

    const newznabSource = {
      id: 'newznab-test',
      name: 'API de test',
      url: `${baseUrl}/newznab/api`,
      apiKey: 'newznab-test-key',
      categories: { movie: '2000', series: '5000' },
      maxItemsPerCategory: 3,
      requestDelayMs: 250
    };
    const capabilities = await rssParser.newznabParser.inspect(newznabSource);
    assert.equal(capabilities.serverMax, 2);
    assert.deepEqual(capabilities.categories.map(category => category.id), ['2000', '5000']);
    const newznabMovies = await rssParser.newznabParser.fetchCategory(
      newznabSource, 'movie', '2000', capabilities
    );
    assert.equal(newznabMovies.length, 3);
    assert.ok(newznabMovies.every(item => item.source_url === 'newznab:newznab-test:movie'));
    assert.deepEqual(
      newznabMovies.map(item => item.direct_meta.imdb_id),
      ['tt0000901', 'tt0000902', 'tt0000903']
    );
    const newznabState = db.getSourceSyncState('newznab:newznab-test:movie');
    assert.equal(newznabState.last_items_fetched, 3);
    assert.equal(newznabState.quota_status, 'limit_reached');
    assert.equal(newznabState.cursor.pending.recent_ids.length, 3);
    assert.deepEqual(newznabState.cursor.committed, {});
    assert.equal(db.commitPendingSourceCursors(), 1);
    assert.equal(db.getSourceSyncState('newznab:newznab-test:movie').cursor.committed.recent_ids.length, 3);
    const incrementalMovies = await rssParser.newznabParser.fetchCategory(
      newznabSource, 'movie', '2000', capabilities
    );
    assert.equal(incrementalMovies.length, 0);
    assert.equal(db.getSourceSyncState('newznab:newznab-test:movie').quota_status, 'cursor_reached');
    assert.ok(newznabKeyReceived);
    const newznabMatch = await matcher.matchBatch(newznabMovies);
    assert.equal(newznabMatch.matched, 3);
    assert.ok(db.getMediaByImdbId('tt0000901'));

    const stremioParser = new StremioManifestParser(db);
    const remoteUrl = `${baseUrl}/addon/manifest.json?token=secret-test`;
    const inspected = await stremioParser.inspect(remoteUrl);
    assert.deepEqual(inspected.catalogs.map(catalog => catalog.id), ['remote_movies']);
    assert.ok(!stremioParser.maskUrl(remoteUrl).includes('secret-test'));
    assert.ok(!stremioParser.maskUrl(remoteUrl).includes('127.0.0.1'));
    const anonymous = stremioParser.anonymizeInspection(inspected);
    assert.equal(anonymous.name, 'Manifeste Stremio');
    assert.deepEqual(anonymous.catalogs.map(catalog => catalog.name), ['Films importés']);
    const remoteSource = {
      id: 'remote-test',
      name: inspected.name,
      url: remoteUrl,
      catalogs: inspected.catalogs
    };
    const remoteItems = await stremioParser.fetchCatalog(remoteSource, inspected.catalogs[0]);
    assert.equal(remoteItems.length, 1);
    assert.equal(remoteItems[0].direct_meta.imdb_id, 'tt0000789');
    assert.equal(remoteItems[0].source_url, 'stremio-manifest:remote-test:movie:remote_movies');
    assert.ok(catalogRequestKeptSecret);
    const remoteMatch = await matcher.matchBatch(remoteItems);
    assert.equal(remoteMatch.matched, 1);
    assert.equal(db.getMediaByImdbId('tt0000789').name, 'Film distant');

    const exoticInspection = await stremioParser.inspect(`${baseUrl}/exotic/manifest.json`);
    assert.deepEqual(
      exoticInspection.catalogs.map(catalog => [catalog.type, catalog.supported]),
      [['anime', true], ['YouTube', false]]
    );
    const exoticSource = {
      id: 'exotic-test',
      name: 'Source non IMDb',
      url: `${baseUrl}/exotic/manifest.json`,
      catalogs: exoticInspection.catalogs,
      maxItemsPerCatalog: 100
    };
    const animeItems = await stremioParser.fetchCatalog(exoticSource, exoticInspection.catalogs[0]);
    assert.equal(animeItems[0].direct_meta.imdb_id, 'kitsu:42');
    assert.equal(animeItems[0].catalog_type, 'animés');
    assert.equal(animeItems[0].type, 'series');
    const exoticMatch = await matcher.matchBatch(animeItems);
    assert.equal(exoticMatch.matched, 1);
    assert.equal(db.getMediaByExternalId('kitsu:42').name, 'Anime sans IMDb');

    db.setConfig('newznab_sources', JSON.stringify([
      newznabSource,
      { ...newznabSource, id: 'newznab-second', name: 'Jackett secondaire', kind: 'jackett', url: `${baseUrl}/newznab-2/api` }
    ]));
    db.setConfig('stremio_manifest_sources', JSON.stringify([
      remoteSource,
      { ...remoteSource, id: 'remote-second', name: 'Manifeste secondaire' }
    ]));
    db.setConfig('wacustom_sources', JSON.stringify([waCustomSource]));
    const webuiForNames = Object.create(WebUI.prototype);
    webuiForNames.db = db;
    webuiForNames.rssParser = rssParser;
    const sourceNames = webuiForNames.getSourceNameMap();
    assert.equal(sourceNames['newznab:newznab-test:movie'], 'API de test — Films');
    assert.equal(sourceNames['jackett:newznab-second:series'], 'Jackett secondaire — Séries');
    assert.equal(sourceNames['stremio-manifest:remote-test:movie:remote_movies'], 'Source distante de test — Sélection distante');
    assert.equal(sourceNames['stremio-manifest:remote-second:movie:remote_movies'], 'Manifeste secondaire — Sélection distante');
    assert.equal(sourceNames['webdav:webdav-test'], 'WebDAV de test');
    assert.equal(sourceNames['wacustom:wacustom-test'], 'WaCustom de test');
    db.setConfig('rss_additional_urls', JSON.stringify([
      { id: 'rss-legacy-duplicate', name: 'Même source Films', url: `${baseUrl}/shared-rss`, force: 'films' },
      { id: 'rss-legacy-duplicate', name: 'Même source Séries', url: `${baseUrl}/shared-rss`, force: 'series' },
      { id: 'rss-legacy-duplicate', name: 'Même source Docs', url: `${baseUrl}/shared-rss`, force: 'documentaires' }
    ]));
    const legacyRssSources = webuiForNames.getAdditionalRssSources();
    assert.equal(new Set(legacyRssSources.map(source => source.id)).size, 3);
    assert.deepEqual(
      webuiForNames.getAdditionalRssSources().map(source => source.id),
      legacyRssSources.map(source => source.id)
    );
    assert.equal(stremioParser.normalizeMaxItems(100000), 100000);
    assert.equal(stremioParser.normalizeMaxItems(200000), 200000);
    assert.equal(stremioParser.normalizeMaxItems(20000000), 10000000);
    db.setConfig('required_tags', 'GERMAN,SWEDISH,C++');
    assert.equal(rssParser.filterByRequiredTags('Film.2026.GERMAN.1080p'), true);
    assert.equal(rssParser.filterByRequiredTags('Film.2026.FRENCH.1080p'), false);
    assert.equal(rssParser.filterByRequiredTags('Tutoriel.C++.2026'), true);
    db.setConfig('required_tags', '');
    assert.equal(rssParser.filterByRequiredTags('Film.2026.VO.1080p'), true);
    const apiMedia = db.getMediaList({ search: 'API Film One' }).items[0];
    assert.ok(apiMedia.source_urls.includes('newznab:newznab-test:movie'));

    const catalog = db.saveCustomCatalog({
      id: 'custom_films_2026',
      name: 'Films 2026',
      type: 'movie',
      source_urls: [`${baseUrl}/pointer`],
      filters: { year_mode: 'include', years: ['2026'], genres_include: [28] }
    });
    assert.deepEqual(db.getCustomCatalogMedia(catalog).map(item => item.imdb_id), ['tt0000123']);
    assert.equal(db.countCustomCatalogMedia(catalog), 1);
    const mixedCatalog = db.saveCustomCatalog({
      id: 'custom_mixed',
      name: 'Sources mixtes',
      type: 'movie',
      source_urls: [`${baseUrl}/pointer`, remoteItems[0].source_url],
      filters: { year_mode: 'include', years: ['2026'] }
    });
    assert.deepEqual(
      new Set(db.getCustomCatalogMedia(mixedCatalog).map(item => item.imdb_id)),
      new Set(['tt0000123', 'tt0000789'])
    );
    const apiCatalog = db.saveCustomCatalog({
      id: 'custom_api_movies',
      name: 'Films API',
      type: 'movie',
      source_urls: ['newznab:newznab-test:movie'],
      filters: { year_mode: 'include', years: ['2026'] }
    });
    assert.deepEqual(db.getCustomCatalogMedia(apiCatalog).map(item => item.imdb_id), ['tt0000901']);
    let composedCatalog = db.saveCustomCatalog({
      id: 'custom_composed',
      name: 'Films 2026 et API',
      type: 'movie',
      source_urls: [],
      filters: { catalog_ids: [catalog.id, apiCatalog.id] }
    });
    assert.deepEqual(
      new Set(db.getCustomCatalogMedia(composedCatalog).map(item => item.imdb_id)),
      new Set(['tt0000123', 'tt0000901'])
    );
    composedCatalog = db.saveCustomCatalog({
      ...composedCatalog,
      filters: { catalog_ids: [apiCatalog.id] }
    });
    assert.deepEqual(db.getCustomCatalogMedia(composedCatalog).map(item => item.imdb_id), ['tt0000901']);
    const animeCatalog = db.saveCustomCatalog({
      id: 'custom_anime_native',
      name: 'Anime natif',
      type: 'anime',
      source_urls: ['stremio-manifest:exotic-test:anime:anime_list'],
      filters: {}
    });
    assert.deepEqual(
      db.getCustomCatalogMedia(animeCatalog).map(item => item.imdb_id),
      ['kitsu:42']
    );
    db.replaceGuideItems('guide-test', [
      { media_type: 'movie', imdb_id: 'tt0000789', tmdb_id: '789', title: 'Film distant', position: 0 },
      { media_type: 'movie', imdb_id: 'tt0000123', tmdb_id: '123', title: 'Film Test', position: 1 },
      { media_type: 'movie', imdb_id: 'tt9999999', tmdb_id: '9999999', title: 'Absent', position: 2 }
    ]);
    const guidedCatalog = db.saveCustomCatalog({
      id: 'custom_guided',
      name: 'Guide local uniquement',
      type: 'movie',
      source_urls: [],
      filters: { guide_id: 'guide-test' }
    });
    assert.equal(db.getGuideItemStats('guide-test').total, 3);
    assert.deepEqual(
      db.getCustomCatalogMedia(guidedCatalog).map(item => item.imdb_id),
      ['tt0000789', 'tt0000123']
    );
    assert.equal(db.countCustomCatalogMedia(guidedCatalog), 2);

    const addon = new StremioAddon(db);
    db.setConfig('image_cache_enabled', 'true');
    db.setConfig('image_cache_ttl_hours', '24');
    db.setConfig('image_cache_max_mb', '10');
    const proxiedPoster = addon.applyImageCache({
      metas: [{ id: 'tt-image', poster: `${baseUrl}/image-source.png` }]
    }, 'http://catalog.local').metas[0].poster;
    assert.match(proxiedPoster, /^http:\/\/catalog\.local\/image-cache\/[a-f0-9]{64}$/);
    const imageCacheKey = proxiedPoster.split('/').pop();
    await addon.imageCache.fetch(imageCacheKey, `${baseUrl}/image-source.png`);
    const imageCacheEntry = db.getImageCacheEntry(imageCacheKey);
    assert.equal(imageCacheEntry.content_type, 'image/png');
    assert.ok(imageCacheEntry.file_size > 0);
    assert.ok(fs.existsSync(addon.imageCache.filePath(imageCacheKey)));
    fs.unlinkSync(addon.imageCache.filePath(imageCacheKey));
    db.deleteImageCacheEntries([imageCacheKey]);
    db.setConfig('image_cache_enabled', 'false');
    console.log('✓ Proxy/cache local des fichiers d’affiches');

    db.setConfig('manifest_revision', '1');
    const manifest = addon.getManifest();
    assert.ok(manifest.catalogs.some(item => item.id === 'useflowfr_films'));
    assert.ok(manifest.catalogs.some(item => item.id === 'custom_films_2026'));
    assert.ok(manifest.catalogs.some(item => item.id === 'custom_composed'));
    assert.ok(!manifest.types.includes('YouTube'));
    assert.ok(manifest.types.includes('anime'));
    assert.ok(manifest.idPrefixes.includes('kitsu'));
    assert.ok(!manifest.idPrefixes.includes('yt_id:'));
    assert.equal(
      addon.buildPostersPlusUrl(
        { imdb_id: 'tt0000123', tmdb_id: '123', type: 'movie' },
        'https://posters.example/poster?tmdb_id={tmdb_id}&imdb_id={imdb_id}&type={type}'
      ),
      'https://posters.example/poster?tmdb_id=123&imdb_id=tt0000123&type=movie'
    );
    assert.equal(
      addon.buildPostersPlusUrl(
        { imdb_id: 'tt0000456', tmdb_id: null, type: 'series' },
        'https://posters.example/poster?tmdb_id={tmdb_id}&imdb_id={imdb_id}&type={type}&fallback_to_imdb=true'
      ),
      'https://posters.example/poster?tmdb_id=&imdb_id=tt0000456&type=tv&fallback_to_imdb=true'
    );
    const historical = await addon.handleCatalog({ type: 'movie', id: 'useflowfr_films', extra: {} });
    assert.equal(addon.isCatalogCached('useflowfr_films', {}), true);
    assert.equal(addon.isCatalogCached('useflowfr_films', { search: 'Film' }), false);
    assert.deepEqual(
      new Set(historical.metas.map(item => item.id)),
      new Set(['tt0000123', 'tt0000789', 'tt0000901', 'tt0000902', 'tt0000903', 'tt0000920'])
    );
    const response = await addon.handleCatalog({ type: 'movie', id: 'custom_films_2026', extra: {} });
    assert.deepEqual(response.metas.map(item => item.id), ['tt0000123']);

    const frozenCatalog = db.saveCustomCatalog({
      ...mixedCatalog,
      updates_enabled: false,
      frozen_at: Date.now() - 1000
    });
    assert.equal(frozenCatalog.updates_enabled, false);
    assert.equal(db.getCustomCatalogMedia(frozenCatalog).length, 0);
    assert.ok(addon.getManifest().catalogs.some(item => item.id === 'custom_mixed'));

    db.saveCustomCatalog({ ...catalog, enabled: false });
    assert.ok(!addon.getManifest().catalogs.some(item => item.id === 'custom_films_2026'));
    assert.ok(db.deleteCustomCatalog('useflowfr_films'));
    db.seedManagedCatalogs();
    assert.equal(db.getCustomCatalog('useflowfr_films'), null);
    assert.ok(db.getMediaByImdbId('tt0000123'));
    db.recordManifestHistory({
      revision: 2,
      event: 'catalog_deleted',
      catalog: { id: 'useflowfr_films', name: 'Films' }
    });
    assert.equal(db.listManifestHistory(1)[0].event, 'catalog_deleted');
    const maintenanceAnalysis = db.getMaintenanceAnalysis();
    assert.equal(maintenanceAnalysis.media_count, 9);
    const backupPath = await db.createMaintenanceBackup('integration-test');
    assert.ok(fs.existsSync(backupPath));
    const maintenanceId = db.startMaintenanceHistory('integration_test', maintenanceAnalysis);
    db.finishMaintenanceHistory(maintenanceId, {
      details: { changed: 0 },
      backupPath
    });
    assert.equal(db.listMaintenanceHistory(1)[0].backup_path, backupPath);
    fs.unlinkSync(backupPath);
    db.addMedia({
      imdb_id: 'tt0000999',
      tmdb_id: '999',
      type: 'movie',
      catalog_type: 'films',
      name: 'Documentaire à réparer',
      year: '2024',
      genres: [99],
      release_name: 'Documentaire.Test.2024',
      first_seen_at: Date.now()
    });
    const maintenanceRunner = Object.create(WebUI.prototype);
    maintenanceRunner.db = db;
    maintenanceRunner.stremioAddon = addon;
    const repaired = await maintenanceRunner.applyMaintenanceRepairs({ includeAnime: false });
    assert.equal(repaired.changed, 1);
    assert.equal(db.getMediaByImdbId('tt0000999').catalog_type, 'documentaires');
    assert.ok(fs.existsSync(repaired.backup_path));
    fs.unlinkSync(repaired.backup_path);
    console.log('✓ Pastebin direct, pointeur JSON et index catégorisé');
    console.log('✓ Import TMDB direct films/séries');
    console.log('✓ Filtres source, année et genre');
    console.log('✓ Pauses indépendantes des mises à jour et de l’exposition Stremio');
    console.log('✓ Reprise des catalogues historiques et de leurs contenus');
    console.log('✓ Suppression durable sans suppression des médias');
    console.log('✓ Import générique de manifestes Stremio avec inspection anonymisée');
    console.log('✓ Identifiants RSS historiques uniques, plafond manifeste et tags libres');
    console.log('✓ Identifiants anime natifs, composition réversible et exclusion de YouTube');
    console.log('✓ Guide MDBList limité aux médias locaux et ordre de liste conservé');
    console.log('✓ Guides ListSync, SuggestArr et Agregarr normalisés sans importer les médias absents');
    console.log('✓ API Newznab/Torznab paginée avec types Prowlarr et Jackett');
    console.log('✓ Parcours WebDAV récursif, authentifié et filtré par extension');
    console.log('✓ Import WaCustom paginé avec reprise du parcours et identifiants IMDb directs');
    console.log('✓ Curseur Newznab incrémental, états de collecte et test à blanc exact');
    console.log('✓ Historique versionné du manifeste');
    console.log('✓ Analyse, sauvegarde, réparation groupée et historique de maintenance');
  } finally {
    db.close();
    await new Promise(resolve => server.close(resolve));
    for (const suffix of ['', '-shm', '-wal']) {
      try { fs.unlinkSync(dbPath + suffix); } catch {}
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
