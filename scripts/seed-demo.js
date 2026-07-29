const fs = require('fs');
const path = require('path');
const DatabaseManager = require('../src/database');

const output = path.resolve(process.argv[2] || path.join(__dirname, '..', 'demo-data', 'addon.db'));
fs.mkdirSync(path.dirname(output), { recursive: true });
for (const suffix of ['', '-shm', '-wal']) {
  if (fs.existsSync(`${output}${suffix}`)) fs.unlinkSync(`${output}${suffix}`);
}

const db = new DatabaseManager(output);
const now = Date.now();
const sources = {
  rss: [
    { id: 'rss-main', name: 'Films francophones', url: 'https://rss.example.invalid/films.xml', force: 'films', paused: false, syncIntervalMinutes: 60 },
    { id: 'rss-series', name: 'Séries du soir', url: 'https://rss.example.invalid/series.xml', force: 'series', paused: false, syncIntervalMinutes: 90 },
    { id: 'rss-docs', name: 'Documentaires découverte', url: 'https://rss.example.invalid/documentaires.xml', force: 'documentaires', paused: true, syncIntervalMinutes: 180 }
  ],
  pastebin: {
    id: 'paste-demo', name: 'Index communautaire fictif',
    url: 'https://paste.example.invalid/raw/catalogues-demo', force: 'auto',
    paused: false, maxDepth: 5, maxPages: 1000, syncIntervalMinutes: 120
  },
  indexer: {
    id: 'indexer-demo', name: 'Newznab Démo', kind: 'newznab',
    url: 'https://newznab.example.invalid/api', apiKey: 'demo-api-key',
    categories: { movie: '2000', series: '5000' }, paused: false,
    maxItemsPerCategory: 1000, pageSize: 100, requestDelayMs: 250,
    syncIntervalMinutes: 60
  },
  webdav: {
    id: 'webdav-demo', name: 'Médiathèque familiale',
    url: 'https://dav.example.invalid/medias/', username: 'demo', password: 'demo',
    force: 'auto', paused: false, maxDepth: 6, maxItems: 10000,
    extensions: ['mkv', 'mp4'], syncIntervalMinutes: 240, useProxy: false
  },
  manifest: {
    id: 'manifest-demo', name: 'Addon vidéo fictif',
    url: 'https://addon.example.invalid/manifest.json?token=demo', paused: false,
    maxItems: 5000, syncIntervalMinutes: 180,
    catalogs: [
      { id: 'films_demo', type: 'movie', name: 'Sélection films', enabled: true },
      { id: 'youtube_demo', type: 'YouTube', name: 'Chaînes vidéo', enabled: true }
    ]
  },
  streamfusion: {
    id: 'streamfusion-demo', name: 'StreamFusion Maison',
    url: 'https://streamfusion.example.invalid', keyId: 'demo-peer-key-id',
    secret: 'demo-peer-secret', paused: true, maxItemsPerSync: 20000,
    pageSize: 1000, requestDelayMs: 100, syncIntervalMinutes: 180, useProxy: false
  }
};

db.setConfig('rss_films_name', sources.rss[0].name);
db.setConfig('rss_films_url', sources.rss[0].url);
db.setConfig('rss_films_force', sources.rss[0].force);
db.setConfig('rss_films_paused', 'false');
db.setConfig('rss_films_sync_interval', '60');
db.setConfig('rss_additional_urls', JSON.stringify(sources.rss.slice(1)));
db.setConfig('pastebin_sources', JSON.stringify([sources.pastebin]));
db.setConfig('newznab_sources', JSON.stringify([sources.indexer]));
db.setConfig('webdav_sources', JSON.stringify([sources.webdav]));
db.setConfig('stremio_manifest_sources', JSON.stringify([sources.manifest]));
db.setConfig('streamfusion_sources', JSON.stringify([sources.streamfusion]));
db.setConfig('auto_refresh_enabled', 'false');
db.setConfig('mdblist_guides', JSON.stringify([{
  id: 'guide-demo', name: 'Tendances fictives 2026', kind: 'mdblist',
  url: 'https://mdblist.com/lists/demo/catalogue-fictif', apiKey: 'demo-key',
  paused: true, maxItems: 5000, syncIntervalMinutes: 360
}]));

const categories = [
  ['films', 'movie', ['Aventure', 'Comédie']],
  ['series', 'series', ['Drame', 'Mystère']],
  ['documentaires', 'movie', ['Documentaire']],
  ['emissions', 'series', ['Actualité']],
  ['animés', 'series', ['Animation', 'Aventure']],
  ['concerts', 'movie', ['Musique']],
  ['spectacles', 'movie', ['Comédie']]
];
const names = [
  'L’Horizon des lucioles', 'La Cité des nuages', 'Opération Minuit',
  'Les Jardins du futur', 'Chroniques de Bellune', 'Le Dernier Phare',
  'Planète Corail', 'Dans les coulisses du temps', 'Studio 21',
  'Les Enquêtes de Montrose', 'Nébula Academy', 'Les Robots du dimanche',
  'Symphonie des étoiles', 'Rires au Grand Théâtre'
];

for (let index = 0; index < 42; index++) {
  const [catalogType, type, genres] = categories[index % categories.length];
  const name = `${names[index % names.length]}${index >= names.length ? ` ${Math.floor(index / names.length) + 1}` : ''}`;
  const imdbId = `tt99${String(index + 1).padStart(5, '0')}`;
  const sourcePool = [
    sources.rss[index % sources.rss.length].url,
    `newznab:${sources.indexer.id}:${type === 'series' ? 'series' : 'movie'}`,
    `webdav:${sources.webdav.id}`,
    `streamfusion:${sources.streamfusion.id}`
  ];
  const sourceUrl = sourcePool[index % sourcePool.length];
  const year = String(2022 + (index % 5));
  db.addMedia({
    imdb_id: imdbId,
    tmdb_id: String(900000 + index),
    type,
    catalog_type: catalogType,
    name,
    year,
    poster: `https://placehold.co/300x450/172033/f2f5f9?text=${encodeURIComponent(name)}`,
    background: null,
    description: 'Contenu entièrement fictif créé pour les captures de démonstration.',
    genres,
    vote_average: 6.5 + (index % 25) / 10,
    release_name: `${name.replaceAll(' ', '.')}.${year}.FRENCH.1080p.WEB-DL`,
    first_seen_at: now - index * 3600000
  });
  db.addRelease({
    media_imdb_id: imdbId,
    release_name: `${name.replaceAll(' ', '.')}.${year}.FRENCH.1080p.WEB-DL`,
    indexer_rlz_id: `demo-release-${index}`,
    source_url: sourceUrl,
    quality: index % 4 === 0 ? '4K HDR' : '1080p WEB-DL',
    hash: cryptoHash(index),
    added_at: now - index * 3600000
  });
}

db.replaceGuideItems('guide-demo', Array.from({ length: 12 }, (_, index) => ({
  media_type: index % 3 === 0 ? 'show' : 'movie',
  imdb_id: `tt99${String(index + 1).padStart(5, '0')}`,
  tmdb_id: String(900000 + index),
  title: names[index % names.length],
  year: String(2022 + (index % 5)),
  position: index
})));

db.saveCustomCatalog({
  id: 'demo_films_2026', name: 'Films 2026', type: 'movie',
  source_urls: [], filters: { year_mode: 'include', years: ['2026'] }
});
db.saveCustomCatalog({
  id: 'demo_hors_2026', name: 'Tout sauf 2026', type: 'movie',
  source_urls: [], filters: { year_mode: 'exclude', years: ['2026'] }
});
db.saveCustomCatalog({
  id: 'demo_tendances', name: 'Tendances de la semaine', type: 'movie',
  source_urls: [], filters: { guide_id: 'guide-demo' }
});
db.saveCustomCatalog({
  id: 'demo_series_pause', name: 'Séries à reprendre', type: 'series',
  enabled: false, updates_enabled: true, source_urls: [], filters: {}
});
db.seedManagedCatalogs();

for (const [key, kind, count] of [
  [sources.rss[0].url, 'rss', 38],
  [sources.rss[1].url, 'rss', 24],
  [`newznab:${sources.indexer.id}:movie`, 'newznab', 1000],
  [`newznab:${sources.indexer.id}:series`, 'newznab', 640],
  [`webdav:${sources.webdav.id}`, 'webdav', 312]
]) {
  const startedAt = db.beginSourceSync(key, kind);
  db.finishSourceSync(key, {
    sourceKind: kind,
    startedAt: startedAt - 1200,
    itemsFetched: count,
    quotaLimit: kind === 'newznab' ? 1000 : null,
    quotaUsed: kind === 'newznab' ? count : null,
    quotaStatus: kind === 'newznab' && count >= 1000 ? 'limit_reached' : 'available'
  });
}

db.addFailedRelease({
  release_name: 'Titre.Inconnu.2026.FRENCH.1080p',
  clean_name: 'Titre Inconnu',
  indexer_rlz_id: 'demo-failed-1',
  source_url: sources.rss[0].url,
  catalog_type: 'films',
  type: 'movie',
  year: '2026',
  fail_reason: 'Aucun résultat suffisamment fiable'
});
db.setConfig('last_catalog_refresh', String(now));
db.close();
console.log(`Base de démonstration créée : ${output}`);

function cryptoHash(index) {
  return String(index + 1).padStart(40, '0');
}
