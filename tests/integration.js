const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const DatabaseManager = require('../src/database');
const PastebinParser = require('../src/pastebin-parser');
const TMDBMatcher = require('../src/tmdb-matcher');
const StremioAddon = require('../src/addon');
const StremioManifestParser = require('../src/stremio-manifest-parser');
const RSSParser = require('../src/rss-parser');
const WebUI = require('../src/webui');
const WaCustomParser = require('../src/wacustom-parser');
const MediaServerParser = require('../src/media-server-parser');

const header = 'CAT;TMDB;TITLE;SAISON;GROUPES;CAST;DIRECTOR;NETWORK;YEAR;GENRES;RES;URLS=https://alldebrid.com/f/';
const movieRow = "film;123;Film Test;;[];[];[];[];2026;[28];['MULTI - 1080p'];['abc']";
const seriesRow = "serie;456;Série Test;1;[];[];[];[];2025;[18];MULTI - 1080p;1:'def'";

async function main() {
  let baseUrl;
  let catalogRequestKeptSecret = false;
  let newznabKeyReceived = false;
  let webdavAuthReceived = false;
  let waCustomCookieReceived = false;
  let mdblistKeyReceived = false;
  let suggestArrAuthenticated = false;
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
      return res.end('<MediaContainer><Directory ratingKey="50" title="Classiques"/></MediaContainer>');
    }
    if (req.url.startsWith('/plex/library/sections/2/collections')) {
      res.setHeader('Content-Type', 'application/xml');
      return res.end('<MediaContainer/>');
    }
    if (req.url.startsWith('/plex/library/sections/1/all')) {
      res.setHeader('Content-Type', 'application/xml');
      return res.end('<MediaContainer totalSize="1" size="1"><Video ratingKey="101" type="movie" title="Film Plex" year="2026"><Guid id="imdb://tt0000930"/><Guid id="tmdb://930"/></Video></MediaContainer>');
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
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        Items: [{
          Id: 'jf-1', Name: 'Série Jellyfin', Type: 'Series', ProductionYear: 2025,
          ProviderIds: { Imdb: 'tt0000931', Tmdb: '931' }, Genres: ['Drama'], CommunityRating: 8.2
        }],
        TotalRecordCount: 1
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

    const matcher = new TMDBMatcher(db);
    matcher.baseUrl = `${baseUrl}/3`;
    const match = await matcher.matchBatch(discovery.items);
    assert.equal(match.matched, 2);
    assert.equal(match.failed, 0);
    assert.equal(db.getMediaByImdbId('tt0000123').year, '2026');
    assert.equal(db.getMediaByImdbId('tt0000456').type, 'series');

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

    const mediaServerParser = new MediaServerParser(db, () => ({ timeout: 2000 }));
    const plexSource = {
      id: 'plex-test', kind: 'plex', name: 'Plex Test', url: `${baseUrl}/plex`,
      apiKey: 'plex-token', targets: ['library:1', 'collection:50'], maxItems: 100
    };
    const plexInspection = await mediaServerParser.inspect(plexSource);
    assert.deepEqual(plexInspection.targets.map(target => target.id), ['library:1', 'library:2', 'collection:50']);
    const plexItems = await mediaServerParser.fetchSource(plexSource);
    assert.equal(plexItems.length, 1);
    assert.equal(plexItems[0].direct_meta.imdb_id, 'tt0000930');

    const jellyfinSource = {
      id: 'jellyfin-test', kind: 'jellyfin', name: 'Jellyfin Test', url: `${baseUrl}/jellyfin`,
      apiKey: 'jellyfin-token', targets: ['library:lib-tv'], maxItems: 100
    };
    const jellyfinInspection = await mediaServerParser.inspect(jellyfinSource);
    assert.equal(jellyfinInspection.targets[0].type, 'series');
    const jellyfinItems = await mediaServerParser.fetchSource(jellyfinSource);
    assert.equal(jellyfinItems[0].direct_meta.imdb_id, 'tt0000931');
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
      [['anime', true], ['YouTube', true]]
    );
    const exoticSource = {
      id: 'exotic-test',
      name: 'Source non IMDb',
      url: `${baseUrl}/exotic/manifest.json`,
      catalogs: exoticInspection.catalogs,
      maxItemsPerCatalog: 100
    };
    const animeItems = await stremioParser.fetchCatalog(exoticSource, exoticInspection.catalogs[0]);
    const youtubeItems = await stremioParser.fetchCatalog(exoticSource, exoticInspection.catalogs[1]);
    assert.equal(animeItems[0].direct_meta.imdb_id, 'kitsu:42');
    assert.equal(animeItems[0].catalog_type, 'animés');
    assert.equal(animeItems[0].type, 'series');
    assert.equal(youtubeItems[0].direct_meta.imdb_id, 'yt_id:abcdefghijk');
    assert.equal(youtubeItems[0].catalog_type, 'youtube');
    assert.equal(youtubeItems[0].type, 'YouTube');
    const exoticMatch = await matcher.matchBatch([...animeItems, ...youtubeItems]);
    assert.equal(exoticMatch.matched, 2);
    assert.equal(db.getMediaByExternalId('kitsu:42').name, 'Anime sans IMDb');
    assert.equal(db.getMediaByExternalId('yt_id:abcdefghijk').name, 'Vidéo de test');

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
    const youtubeCatalog = db.saveCustomCatalog({
      id: 'custom_youtube',
      name: 'Mes vidéos',
      type: 'YouTube',
      source_urls: ['stremio-manifest:exotic-test:YouTube:youtube_list'],
      filters: {}
    });
    assert.deepEqual(
      db.getCustomCatalogMedia(youtubeCatalog).map(item => item.imdb_id),
      ['yt_id:abcdefghijk']
    );
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
    db.setConfig('manifest_revision', '1');
    const manifest = addon.getManifest();
    assert.equal(manifest.catalogs.length, 15);
    assert.ok(manifest.catalogs.some(item => item.id === 'useflowfr_films'));
    assert.ok(manifest.catalogs.some(item => item.id === 'custom_films_2026'));
    assert.ok(manifest.catalogs.some(item => item.id === 'custom_youtube' && item.type === 'YouTube'));
    assert.ok(manifest.types.includes('YouTube'));
    assert.ok(manifest.types.includes('anime'));
    assert.ok(manifest.idPrefixes.includes('kitsu'));
    assert.ok(manifest.idPrefixes.includes('yt_id:'));
    const historical = await addon.handleCatalog({ type: 'movie', id: 'useflowfr_films', extra: {} });
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
    assert.equal(maintenanceAnalysis.media_count, 10);
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
    console.log('✓ Identifiants Kitsu/YouTubio natifs et catalogue YouTube sans conversion en film');
    console.log('✓ Guide MDBList limité aux médias locaux et ordre de liste conservé');
    console.log('✓ Guides ListSync et SuggestArr normalisés sans importer les médias absents');
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
