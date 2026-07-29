const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { encode, decode } = require('@msgpack/msgpack');

const PROTOCOL_VERSION = '1.0';
const MAX_CLOCK_SKEW_SECONDS = 300;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function withoutField(value, field) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
}

function signableBytes(message, excludedField = 'signature') {
  return Buffer.from(encode(canonicalize(withoutField(message, excludedField))));
}

function publicKeyFromHex(value) {
  return crypto.createPublicKey({
    key: Buffer.from(String(value || ''), 'hex'),
    format: 'der',
    type: 'spki'
  });
}

function publicKeyId(publicKeyHex) {
  return crypto.createHash('sha256').update(Buffer.from(publicKeyHex, 'hex')).digest('hex');
}

function verifyHexSignature(publicKeyHex, data, signatureHex) {
  try {
    return crypto.verify(
      'sha256',
      data,
      publicKeyFromHex(publicKeyHex),
      Buffer.from(String(signatureHex || ''), 'hex')
    );
  } catch {
    return false;
  }
}

class CometNetParser {
  constructor(db, extractQuality = () => null, filterTitle = () => true) {
    this.db = db;
    this.extractQuality = extractQuality;
    this.filterTitle = filterTitle;
    this.connections = new Map();
    this.states = new Map();
    this.stopped = true;
    this.lastPendingInboxKeys = [];
  }

  getSources() {
    try {
      const sources = JSON.parse(this.db.getConfig('cometnet_sources') || '[]');
      return Array.isArray(sources) ? sources : [];
    } catch {
      return [];
    }
  }

  saveSources(sources) {
    this.db.setConfig('cometnet_sources', JSON.stringify(sources));
  }

  sourceKey(id) {
    return `cometnet:${id}`;
  }

  normalizeUrl(value) {
    const url = new URL(String(value || '').trim());
    if (!['ws:', 'wss:'].includes(url.protocol)) {
      throw new Error('URL WebSocket ws:// ou wss:// requise');
    }
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }

  identityPath(sourceId) {
    const safeId = crypto.createHash('sha256').update(String(sourceId)).digest('hex');
    return path.join(path.dirname(this.db.dbPath), 'cometnet-identities', `${safeId}.pem`);
  }

  getIdentity(sourceId) {
    const identityPath = this.identityPath(sourceId);
    fs.mkdirSync(path.dirname(identityPath), { recursive: true, mode: 0o700 });
    let privateKey;
    if (fs.existsSync(identityPath)) {
      privateKey = crypto.createPrivateKey(fs.readFileSync(identityPath));
    } else {
      const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
      privateKey = pair.privateKey;
      fs.writeFileSync(identityPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
        mode: 0o600,
        flag: 'wx'
      });
    }
    const publicDer = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
    const publicKey = publicDer.toString('hex');
    return {
      privateKey,
      publicKey,
      nodeId: publicKeyId(publicKey)
    };
  }

  signedMessage(identity, fields) {
    const message = {
      version: PROTOCOL_VERSION,
      ...fields,
      timestamp: Date.now() / 1000,
      sender_id: identity.nodeId,
      signature: ''
    };
    message.signature = crypto.sign(
      'sha256',
      signableBytes(message),
      identity.privateKey
    ).toString('hex');
    return message;
  }

  validateTimestamp(message) {
    return Number.isFinite(message?.timestamp)
      && Math.abs(Date.now() / 1000 - message.timestamp) <= MAX_CLOCK_SKEW_SECONDS;
  }

  validateSignedMessage(message, publicKeyHex, expectedNodeId = null) {
    return message?.version === PROTOCOL_VERSION
      && this.validateTimestamp(message)
      && (!expectedNodeId || message.sender_id === expectedNodeId)
      && publicKeyId(publicKeyHex) === message.sender_id
      && verifyHexSignature(publicKeyHex, signableBytes(message), message.signature);
  }

  validateTorrent(torrent) {
    if (!torrent || !/^[a-f0-9]{40}$/i.test(String(torrent.info_hash || ''))) return false;
    if (!String(torrent.title || '').trim() || !/^tt\d{5,12}$/i.test(String(torrent.imdb_id || ''))) {
      return false;
    }
    if (!Number.isInteger(torrent.size) || torrent.size <= 0) return false;
    if (!torrent.contributor_id || !torrent.contributor_public_key || !torrent.contributor_signature) {
      return false;
    }
    if (publicKeyId(torrent.contributor_public_key) !== torrent.contributor_id) return false;
    return verifyHexSignature(
      torrent.contributor_public_key,
      signableBytes(torrent, 'contributor_signature'),
      torrent.contributor_signature
    );
  }

  stateFor(sourceId) {
    return {
      status: 'disconnected',
      connected_at: null,
      last_message_at: null,
      received_session: 0,
      invalid_session: 0,
      last_error: null,
      peer_node_id: null,
      peer_alias: null,
      ...(this.states.get(sourceId) || {})
    };
  }

  setState(sourceId, values) {
    this.states.set(sourceId, { ...this.stateFor(sourceId), ...values });
  }

  getState(sourceId) {
    return this.stateFor(sourceId);
  }

  start() {
    this.stopped = false;
    this.reconcile();
  }

  stop() {
    this.stopped = true;
    for (const sourceId of [...this.connections.keys()]) this.disconnect(sourceId, false);
  }

  reconcile() {
    const sources = this.getSources();
    const configured = new Set(sources.map(source => source.id));
    for (const sourceId of this.connections.keys()) {
      if (!configured.has(sourceId)) this.disconnect(sourceId, false);
    }
    for (const source of sources) {
      if (source.paused) {
        this.disconnect(source.id, false);
        this.setState(source.id, { status: 'paused', connected_at: null });
      } else if (!this.connections.has(source.id)) {
        this.connect(source);
      }
    }
  }

  refreshSource(sourceId) {
    this.disconnect(sourceId, false);
    const source = this.getSources().find(item => item.id === sourceId);
    if (!this.stopped && source && !source.paused) this.connect(source);
    else if (source?.paused) this.setState(sourceId, { status: 'paused', connected_at: null });
  }

  disconnect(sourceId, reconnect = false) {
    const connection = this.connections.get(sourceId);
    if (!connection) return;
    connection.allowReconnect = reconnect;
    if (connection.reconnectTimer) clearTimeout(connection.reconnectTimer);
    connection.ws.removeAllListeners();
    try {
      connection.ws.close(1000, 'Configuration actualisée');
    } catch {}
    this.connections.delete(sourceId);
  }

  scheduleReconnect(source, connection) {
    if (this.stopped || !connection.allowReconnect || this.connections.get(source.id) !== connection) return;
    const delay = Math.min(connection.retryDelay || 5000, 60000);
    connection.retryDelay = Math.min(delay * 2, 60000);
    connection.reconnectTimer = setTimeout(() => {
      if (this.connections.get(source.id) !== connection) return;
      this.connections.delete(source.id);
      const current = this.getSources().find(item => item.id === source.id);
      if (!this.stopped && current && !current.paused) this.connect(current);
    }, delay);
    connection.reconnectTimer.unref?.();
  }

  connect(source) {
    let url;
    try {
      url = this.normalizeUrl(source.url);
    } catch (error) {
      this.setState(source.id, { status: 'error', last_error: error.message });
      return;
    }
    const identity = this.getIdentity(source.id);
    const startedAt = this.db.beginSourceSync(this.sourceKey(source.id), 'cometnet');
    const ws = new WebSocket(url, { handshakeTimeout: 15000, maxPayload: 16 * 1024 * 1024 });
    const connection = {
      ws,
      identity,
      source,
      startedAt,
      authenticated: false,
      peerPublicKey: null,
      allowReconnect: true,
      failureRecorded: false,
      retryDelay: 5000,
      reconnectTimer: null
    };
    this.connections.set(source.id, connection);
    this.setState(source.id, { status: 'connecting', last_error: null });

    ws.on('open', () => {
      ws.send(encode(this.signedMessage(identity, {
        type: 'handshake',
        public_key: identity.publicKey,
        listen_port: 0,
        public_url: null,
        alias: 'Stremio RSS Catalog',
        capabilities: [],
        network_token: null
      })));
    });
    ws.on('message', data => this.handleMessage(source, connection, data));
    ws.on('error', error => {
      this.setState(source.id, { status: 'error', last_error: error.message });
    });
    ws.on('close', (code, reason) => {
      if (this.connections.get(source.id) !== connection) return;
      const closeReason = Buffer.from(reason || '').toString().trim();
      const errorMessage = code === 1000 && !closeReason
        ? 'Connexion fermée avant identification : pair indisponible, saturé ou limite de pairs atteinte'
        : `Connexion fermée (${code})${closeReason ? ` : ${closeReason}` : ''}`;
      if (!connection.failureRecorded) {
        connection.failureRecorded = true;
        this.db.failSourceSync(this.sourceKey(source.id), {
          sourceKind: 'cometnet',
          startedAt: connection.startedAt,
          errorMessage
        });
      }
      this.setState(source.id, {
        status: this.stopped ? 'disconnected' : 'reconnecting',
        connected_at: null,
        last_error: errorMessage
      });
      this.scheduleReconnect(source, connection);
    });
  }

  handleMessage(source, connection, data) {
    let message;
    try {
      message = decode(Buffer.from(data));
    } catch {
      this.rejectMessage(source, connection, 'Message MsgPack invalide');
      return;
    }

    if (!connection.authenticated) {
      if (message?.type !== 'handshake' || !message.public_key
          || !this.validateSignedMessage(message, message.public_key)) {
        this.rejectMessage(source, connection, 'Identité CometNet invalide', true);
        return;
      }
      if (source.peerNodeId && source.peerNodeId !== message.sender_id) {
        this.rejectMessage(source, connection, 'L’identité du pair ciblé a changé', true);
        return;
      }
      connection.authenticated = true;
      connection.peerPublicKey = message.public_key;
      connection.retryDelay = 5000;
      if (!source.peerNodeId) {
        const sources = this.getSources();
        const index = sources.findIndex(item => item.id === source.id);
        if (index >= 0) {
          sources[index] = {
            ...sources[index],
            peerNodeId: message.sender_id,
            peerAlias: message.alias || null
          };
          this.saveSources(sources);
          connection.source = sources[index];
        }
      }
      this.db.finishSourceSync(this.sourceKey(source.id), {
        sourceKind: 'cometnet',
        startedAt: connection.startedAt,
        itemsFetched: 0
      });
      this.setState(source.id, {
        status: 'connected',
        connected_at: Date.now(),
        last_message_at: Date.now(),
        last_error: null,
        peer_node_id: message.sender_id,
        peer_alias: message.alias || null,
        received_session: 0,
        invalid_session: 0
      });
      return;
    }

    if (!this.validateSignedMessage(message, connection.peerPublicKey, connection.source.peerNodeId)) {
      this.rejectMessage(source, connection, 'Signature CometNet invalide');
      return;
    }
    this.setState(source.id, { last_message_at: Date.now() });

    if (message.type === 'ping') {
      connection.ws.send(encode(this.signedMessage(connection.identity, {
        type: 'pong',
        nonce: String(message.nonce || '')
      })));
      return;
    }
    if (message.type !== 'torrent_announce' || !Array.isArray(message.torrents)) return;

    let accepted = 0;
    let invalid = 0;
    for (const torrent of message.torrents.slice(0, 1000)) {
      if (!this.validateTorrent(torrent)) {
        invalid++;
        continue;
      }
      const identity = [
        source.id,
        String(torrent.info_hash).toLowerCase(),
        torrent.file_index ?? '',
        torrent.season ?? '',
        torrent.episode ?? ''
      ].join('|');
      const itemKey = crypto.createHash('sha256').update(identity).digest('hex');
      if (this.db.enqueueCometNetItem(source.id, itemKey, torrent)) accepted++;
    }
    const state = this.getState(source.id);
    this.setState(source.id, {
      received_session: state.received_session + accepted,
      invalid_session: state.invalid_session + invalid
    });
  }

  rejectMessage(source, connection, reason, close = false) {
    const state = this.getState(source.id);
    this.setState(source.id, {
      last_error: reason,
      invalid_session: state.invalid_session + 1
    });
    if (close) {
      if (!connection.failureRecorded) {
        connection.failureRecorded = true;
        this.db.failSourceSync(this.sourceKey(source.id), {
          sourceKind: 'cometnet',
          startedAt: connection.startedAt,
          errorMessage: reason
        });
      }
      connection.ws.close(1008, reason);
    }
  }

  async inspect(source, timeoutMs = 12000) {
    const url = this.normalizeUrl(source.url);
    const ephemeralIdentity = !source.id;
    const sourceId = source.id || `test-${crypto.randomUUID()}`;
    const identity = this.getIdentity(sourceId);
    const inspection = new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { handshakeTimeout: timeoutMs, maxPayload: 1024 * 1024 });
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error('Délai de connexion CometNet dépassé'));
      }, timeoutMs);
      const finish = (error, result = null) => {
        clearTimeout(timer);
        ws.removeAllListeners();
        try { ws.close(); } catch {}
        if (error) reject(error);
        else resolve(result);
      };
      ws.on('open', () => {
        ws.send(encode(this.signedMessage(identity, {
          type: 'handshake',
          public_key: identity.publicKey,
          listen_port: 0,
          public_url: null,
          alias: 'Stremio RSS Catalog',
          capabilities: [],
          network_token: null
        })));
      });
      ws.on('message', data => {
        try {
          const message = decode(Buffer.from(data));
          if (message?.type !== 'handshake' || !message.public_key
              || !this.validateSignedMessage(message, message.public_key)) {
            throw new Error('Réponse d’identité CometNet invalide');
          }
          if (source.peerNodeId && source.peerNodeId !== message.sender_id) {
            throw new Error('L’identité du pair ciblé a changé');
          }
          finish(null, {
            peer_node_id: message.sender_id,
            peer_alias: message.alias || null,
            protocol_version: message.version
          });
        } catch (error) {
          finish(error);
        }
      });
      ws.on('error', error => finish(error));
      ws.on('close', (code, reason) => {
        const detail = Buffer.from(reason || '').toString().trim();
        finish(new Error(code === 1000 && !detail
          ? 'Connexion CometNet refusée : pair indisponible, saturé ou limite de pairs atteinte'
          : `Connexion CometNet fermée avant l’identification (${code})${detail ? ` : ${detail}` : ''}`));
      });
    });
    return inspection.finally(() => {
      if (!ephemeralIdentity) return;
      try { fs.unlinkSync(this.identityPath(sourceId)); } catch {}
    });
  }

  torrentToItem(source, row) {
    const title = String(row.title || '').trim();
    const imdbId = String(row.imdb_id || '').match(/tt\d{5,12}/i)?.[0]?.toLowerCase();
    if (!title || !imdbId || !this.filterTitle(title)) return null;
    const isSeries = row.season !== null && row.season !== undefined
      || row.episode !== null && row.episode !== undefined;
    const year = String(row.parsed?.year || title).match(/\b(19|20)\d{2}\b/)?.[0] || null;
    return {
      release_name: title,
      indexer_rlz_id: `cometnet:${row.info_hash}:${row.file_index ?? ''}`,
      cleanName: row.parsed?.title || title,
      year,
      catalog_type: isSeries ? 'series' : 'films',
      type: isSeries ? 'series' : 'movie',
      source_url: this.sourceKey(source.id),
      source_force: isSeries ? 'series' : 'films',
      quality: row.parsed?.quality || row.parsed?.resolution || this.extractQuality(title),
      hash: row.info_hash,
      direct_meta: {
        imdb_id: imdbId,
        tmdb_id: null,
        name: row.parsed?.title || title,
        year,
        poster: null,
        background: null,
        description: null,
        genres: [],
        vote_average: null,
        original_language: null,
        origin_country: []
      }
    };
  }

  async parseAll() {
    this.lastPendingInboxKeys = [];
    this.db.compactCometNetInbox(30);
    const items = [];
    for (const source of this.getSources()) {
      if (source.paused) continue;
      const pending = this.db.getPendingCometNetItems(source.id, source.maxItemsPerSync || 100000);
      for (const entry of pending) {
        this.lastPendingInboxKeys.push(entry.item_key);
        const item = this.torrentToItem(source, entry.payload);
        if (!item) continue;
        items.push(item);
      }
    }
    return items;
  }
}

module.exports = CometNetParser;
module.exports.canonicalize = canonicalize;
module.exports.signableBytes = signableBytes;
module.exports.publicKeyId = publicKeyId;
