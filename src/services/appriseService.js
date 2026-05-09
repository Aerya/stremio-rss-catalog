const axios = require('axios');

/**
 * Apprise — Notifications via l'API HTTP d'Apprise (mode stateless).
 * https://github.com/caronc/apprise-api
 *
 * Les URLs Apprise (ntfy://, tgram://, slack://...) sont passées directement
 * dans chaque requête — aucune configuration persistante côté serveur Apprise.
 *
 * Docker : docker run -p 8000:8000 caronc/apprise:latest
 */

const MAX_RETRIES = 2;

/**
 * Envoie une notification via l'API Apprise.
 * @param {string} serverUrl  URL de base du serveur Apprise (ex: "http://apprise:8000")
 * @param {string} urls       URLs Apprise séparées par des virgules
 * @param {object} opts       { title, body, type: 'info'|'success'|'warning'|'failure' }
 * @returns {Promise<boolean>}
 */
async function sendAppriseNotification(serverUrl, urls, { title, body, type = 'info' }) {
  if (!serverUrl || !serverUrl.trim()) return false;

  const endpoint = `${serverUrl.replace(/\/$/, '')}/notify/`;

  const payload = { title, body, type, format: 'markdown' };
  if (urls && urls.trim()) {
    payload.urls = urls.trim();
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await axios.post(endpoint, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      });
      // 200 = succès, 204 = aucun plugin configuré côté serveur (stateless OK quand même)
      if (res.status === 200 || res.status === 204) {
        console.log(`[Apprise] Notification envoyée : ${title}`);
        return true;
      }
      console.warn(`[Apprise] Réponse inattendue : HTTP ${res.status}`);
      return false;
    } catch (err) {
      const status = err.response?.status;
      // Erreur serveur transitoire → backoff et retry
      if (status && status >= 500 && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (!status && attempt < MAX_RETRIES) {
        // Erreur réseau
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      console.error(`[Apprise] Erreur${status ? ` HTTP ${status}` : ' réseau'} :`, err.response?.data ?? err.message);
      return false;
    }
  }
  return false;
}

module.exports = { sendAppriseNotification };
