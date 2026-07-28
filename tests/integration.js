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

const header = 'CAT;TMDB;TITLE;SAISON;GROUPES;CAST;DIRECTOR;NETWORK;YEAR;GENRES;RES;URLS=https://alldebrid.com/f/';
const movieRow = "film;123;Film Test;;[];[];[];[];2026;[28];['MULTI - 1080p'];['abc']";
const seriesRow = "serie;456;Série Test;1;[];[];[];[];2025;[18];MULTI - 1080p;1:'def'";

async function main() {
  let baseUrl;
  let catalogRequestKeptSecret = false;
  let newznabKeyReceived = false;
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
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

    const rssParser = new RSSParser({}, db);
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

    db.setConfig('newznab_sources', JSON.stringify([
      newznabSource,
      { ...newznabSource, id: 'newznab-second', name: 'Jackett secondaire', kind: 'jackett', url: `${baseUrl}/newznab-2/api` }
    ]));
    db.setConfig('stremio_manifest_sources', JSON.stringify([
      remoteSource,
      { ...remoteSource, id: 'remote-second', name: 'Manifeste secondaire' }
    ]));
    const webuiForNames = Object.create(WebUI.prototype);
    webuiForNames.db = db;
    webuiForNames.rssParser = rssParser;
    const sourceNames = webuiForNames.getSourceNameMap();
    assert.equal(sourceNames['newznab:newznab-test:movie'], 'API de test — Films');
    assert.equal(sourceNames['jackett:newznab-second:series'], 'Jackett secondaire — Séries');
    assert.equal(sourceNames['stremio-manifest:remote-test:movie:remote_movies'], 'Source distante de test — Sélection distante');
    assert.equal(sourceNames['stremio-manifest:remote-second:movie:remote_movies'], 'Manifeste secondaire — Sélection distante');
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

    const addon = new StremioAddon(db);
    db.setConfig('manifest_revision', '1');
    const manifest = addon.getManifest();
    assert.equal(manifest.catalogs.length, 12);
    assert.ok(manifest.catalogs.some(item => item.id === 'useflowfr_films'));
    assert.ok(manifest.catalogs.some(item => item.id === 'custom_films_2026'));
    const historical = await addon.handleCatalog({ type: 'movie', id: 'useflowfr_films', extra: {} });
    assert.deepEqual(
      new Set(historical.metas.map(item => item.id)),
      new Set(['tt0000123', 'tt0000789', 'tt0000901', 'tt0000902', 'tt0000903'])
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
    assert.equal(maintenanceAnalysis.media_count, 6);
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
    console.log('✓ API Newznab/Torznab paginée avec types Prowlarr et Jackett');
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
