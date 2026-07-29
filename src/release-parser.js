const path = require('path');
const { spawnSync } = require('child_process');

const PARSER_VERSION = 'parsett-1.8.5+r1';
const MAX_BATCH_SIZE = 5000;

class ReleaseParser {
  constructor(db, { python = process.env.PYTHON_BIN || 'python3' } = {}) {
    this.db = db;
    this.python = python;
    this.bridge = path.join(__dirname, '..', 'scripts', 'ptt_bridge.py');
    this.unavailableReason = null;
  }

  parseMany(releaseNames) {
    const names = (releaseNames || []).map(value => String(value || ''));
    if (!names.length) return [];

    const cached = this.db.getReleaseParseCache(names, PARSER_VERSION);
    const missing = [...new Set(names.filter(name => name && !cached.has(name)))];

    if (missing.length && !this.unavailableReason) {
      for (let offset = 0; offset < missing.length; offset += MAX_BATCH_SIZE) {
        const chunk = missing.slice(offset, offset + MAX_BATCH_SIZE);
        const parsed = this.runBridge(chunk);
        if (!parsed) break;
        const entries = chunk.map((name, index) => [name, parsed[index] || {}]);
        this.db.setReleaseParseCache(entries, PARSER_VERSION);
        for (const [name, result] of entries) cached.set(name, result);
      }
    }

    return names.map(name => cached.get(name) || null);
  }

  runBridge(titles) {
    const result = spawnSync(this.python, [this.bridge], {
      input: JSON.stringify(titles),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120000,
      windowsHide: true
    });

    if (result.error || result.status !== 0) {
      const message = result.error?.message || String(result.stderr || '').trim()
        || `code de sortie ${result.status}`;
      this.unavailableReason = message;
      console.warn(`[PTT] Indisponible, repli sur le parseur historique : ${message}`);
      return null;
    }

    try {
      const parsed = JSON.parse(result.stdout);
      if (!Array.isArray(parsed) || parsed.length !== titles.length) {
        throw new Error('réponse de taille incohérente');
      }
      return parsed;
    } catch (error) {
      this.unavailableReason = error.message;
      console.warn(`[PTT] Réponse invalide, repli sur le parseur historique : ${error.message}`);
      return null;
    }
  }
}

module.exports = ReleaseParser;
module.exports.PARSER_VERSION = PARSER_VERSION;
