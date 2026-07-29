const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

class ImageCacheService {
  constructor(db) {
    this.db = db;
    this.cacheDir = path.join(path.dirname(db.dbPath), 'image-cache');
    this.pending = new Map();
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  isEnabled() {
    return this.db.getConfig('image_cache_enabled') === 'true';
  }

  getTtlMs() {
    const hours = Math.min(Math.max(
      Number(this.db.getConfig('image_cache_ttl_hours')) || 168,
      1
    ), 8760);
    return hours * 3600000;
  }

  getMaxBytes() {
    const megabytes = Math.min(Math.max(
      Number(this.db.getConfig('image_cache_max_mb')) || 1024,
      10
    ), 102400);
    return megabytes * 1024 * 1024;
  }

  register(sourceUrl, baseUrl) {
    if (!this.isEnabled() || !baseUrl) return sourceUrl;
    let parsed;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      return sourceUrl;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) return sourceUrl;
    const cacheKey = crypto.createHash('sha256').update(parsed.href).digest('hex');
    this.db.registerImageCacheEntry(cacheKey, parsed.href);
    return `${String(baseUrl).replace(/\/+$/, '')}/image-cache/${cacheKey}`;
  }

  filePath(cacheKey) {
    return path.join(this.cacheDir, `${cacheKey}.img`);
  }

  async serve(cacheKey, res) {
    if (!this.isEnabled() || !/^[a-f0-9]{64}$/.test(cacheKey)) {
      res.status(404).end();
      return;
    }
    const entry = this.db.getImageCacheEntry(cacheKey);
    if (!entry) {
      res.status(404).end();
      return;
    }

    const file = this.filePath(cacheKey);
    const fresh = entry.fetched_at
      && Date.now() - Number(entry.fetched_at) < this.getTtlMs()
      && fs.existsSync(file);
    if (!fresh) {
      try {
        await this.fetch(cacheKey, entry.source_url);
      } catch (error) {
        if (!fs.existsSync(file)) {
          res.status(502).json({ error: `Affiche indisponible : ${error.message}` });
          return;
        }
        console.warn(`[Images] Repli sur le cache expiré pour ${cacheKey.slice(0, 12)} : ${error.message}`);
      }
    }

    const current = this.db.getImageCacheEntry(cacheKey) || entry;
    this.db.touchImageCacheEntry(cacheKey);
    res.setHeader('Content-Type', current.content_type || 'application/octet-stream');
    res.setHeader('Content-Length', String(fs.statSync(file).size));
    res.setHeader('Cache-Control', `public, max-age=${Math.max(60, Math.floor(this.getTtlMs() / 1000))}`);
    res.setHeader('X-Image-Cache', fresh ? 'HIT' : 'MISS');
    fs.createReadStream(file)
      .on('error', error => {
        if (!res.headersSent) res.status(500).json({ error: error.message });
        else res.destroy(error);
      })
      .pipe(res);
  }

  async fetch(cacheKey, sourceUrl) {
    if (this.pending.has(cacheKey)) return this.pending.get(cacheKey);
    const operation = this.download(cacheKey, sourceUrl)
      .finally(() => this.pending.delete(cacheKey));
    this.pending.set(cacheKey, operation);
    return operation;
  }

  async download(cacheKey, sourceUrl) {
    try {
      const response = await axios.get(sourceUrl, {
        responseType: 'arraybuffer',
        timeout: 20000,
        maxContentLength: MAX_DOWNLOAD_BYTES,
        maxBodyLength: MAX_DOWNLOAD_BYTES,
        validateStatus: status => status >= 200 && status < 300
      });
      const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!contentType.startsWith('image/')) throw new Error(`type MIME invalide (${contentType || 'absent'})`);
      const buffer = Buffer.from(response.data);
      if (!buffer.length || buffer.length > MAX_DOWNLOAD_BYTES) {
        throw new Error(`taille invalide (${buffer.length} octets)`);
      }
      const destination = this.filePath(cacheKey);
      const temporary = `${destination}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, buffer);
      fs.renameSync(temporary, destination);
      this.db.updateImageCacheEntry(cacheKey, {
        contentType,
        fileSize: buffer.length,
        fetchedAt: Date.now(),
        accessedAt: Date.now()
      });
      this.enforceSizeLimit(cacheKey);
    } catch (error) {
      const current = this.db.getImageCacheEntry(cacheKey);
      this.db.updateImageCacheEntry(cacheKey, {
        contentType: current?.content_type,
        fileSize: current?.file_size,
        fetchedAt: current?.fetched_at,
        accessedAt: Date.now(),
        lastError: error.message
      });
      throw error;
    }
  }

  enforceSizeLimit(protectedKey = null) {
    const entries = this.db.listImageCacheEntries();
    let total = entries.reduce((sum, entry) => sum + (Number(entry.file_size) || 0), 0);
    const removed = [];
    for (const entry of entries) {
      if (total <= this.getMaxBytes()) break;
      if (entry.cache_key === protectedKey) continue;
      const file = this.filePath(entry.cache_key);
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch (error) {
        console.warn(`[Images] Suppression impossible ${entry.cache_key.slice(0, 12)} : ${error.message}`);
        continue;
      }
      total -= Number(entry.file_size) || 0;
      removed.push(entry.cache_key);
    }
    if (removed.length) this.db.deleteImageCacheEntries(removed);
  }
}

module.exports = ImageCacheService;
