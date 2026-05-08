require('dotenv').config();
const path = require('path');

const DatabaseManager = require('./database');
const RSSParser = require('./rss-parser');
const TMDBMatcher = require('./tmdb-matcher');
const StremioAddon = require('./addon');
const WebUI = require('./webui');

// Configuration
const PORT = process.env.PORT || 7000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'addon.db');

console.log('Stremio RSS Catalog - Démarrage...');
console.log(`Database: ${DB_PATH}`);

// Initialiser la base de données
const db = new DatabaseManager(DB_PATH);
console.log('✓ Base de données initialisée');

// Créer les instances
const rssParser = new RSSParser({}, db);
const tmdbMatcher = new TMDBMatcher(db);
const stremioAddon = new StremioAddon(db);
const webui = new WebUI(db, rssParser, tmdbMatcher, stremioAddon);

// Démarrer le serveur
webui.listen(PORT);

// Empêcher les erreurs non catchées de tuer le process (et donc l'auto-refresh)
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
});

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
  console.log('\n\n🛑 Arrêt en cours...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Arrêt en cours...');
  db.close();
  process.exit(0);
});
