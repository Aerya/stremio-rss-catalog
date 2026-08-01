const axios   = require('axios');
const sharp   = require('sharp');
const { getStrings } = require('./notifStrings');

const AVATAR_URL = 'https://raw.githubusercontent.com/Aerya/stremio-rss-catalog/main/src/public/logo.png';

function buildPostersPlusUrl(item, template) {
  const value = String(template || '').trim();
  if (!value || !/^tt\d+$/i.test(item?.imdb_id || '')) return null;
  let result = value;
  const values = {
    '{tmdb_id}': item.tmdb_id ? String(item.tmdb_id) : '',
    '{imdb_id}': String(item.imdb_id),
    '{type}': item.type === 'series' ? 'tv' : 'movie'
  };
  for (const [placeholder, replacement] of Object.entries(values)) {
    result = result.split(placeholder).join(encodeURIComponent(replacement));
  }
  try {
    const url = new URL(result);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function getPosterUrl(item, { postersPlusEnabled = false, postersPlusTemplate = '', rpdbEnabled = false, rpdbKey = '' } = {}) {
  if (postersPlusEnabled) {
    const postersPlusUrl = buildPostersPlusUrl(item, postersPlusTemplate);
    if (postersPlusUrl) return postersPlusUrl;
  }
  if (rpdbEnabled && rpdbKey && item.imdb_id) {
    return `https://api.ratingposterdb.com/${rpdbKey}/imdb/poster-default/${item.imdb_id}.jpg?fallback=true`;
  }
  return item.poster;
}

async function downloadImage(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  } catch (error) {
    console.error(`[Discord] Failed to download image from ${url}:`, error.message);
    return null;
  }
}

async function createCompositeImage(items, artworkConfig) {
  const posterWidth  = 200;
  const posterHeight = 300;
  const spacing      = 10;

  const posterBuffers = await Promise.all(
    items.map(item => downloadImage(getPosterUrl(item, artworkConfig)))
  );

  const validPosters = posterBuffers.filter(b => b !== null);
  if (validPosters.length === 0) return null;

  const resizedPosters = await Promise.all(
    validPosters.map(buffer =>
      sharp(buffer).resize(posterWidth, posterHeight, { fit: 'cover' }).toBuffer()
    )
  );

  const totalWidth = (posterWidth * resizedPosters.length) + (spacing * (resizedPosters.length - 1));

  const compositeInputs = resizedPosters.map((buffer, index) => ({
    input: buffer,
    left:  index * (posterWidth + spacing),
    top:   0
  }));

  return sharp({
    create: { width: totalWidth, height: posterHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite(compositeInputs)
    .png()
    .toBuffer();
}

async function sendGallery(webhookUrl, items, artworkConfig, title, color, filename) {
  if (!items || items.length === 0) return;

  const compositeImage = await createCompositeImage(items, artworkConfig);
  if (!compositeImage) return;

  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', compositeImage, filename);

  const payload = {
    username:   'Stremio RSS Catalog',
    avatar_url: AVATAR_URL,
    embeds: [{ title, color, image: { url: `attachment://${filename}` } }]
  };
  form.append('payload_json', JSON.stringify(payload));

  await axios.post(webhookUrl, form, { headers: form.getHeaders() });
}

/**
 * Envoie la notification Discord de fin de sync.
 * @param {string} webhookUrl
 * @param {object} syncStats
 * @param {string} [lang='fr']  Langue des textes ('fr'|'en'|'de')
 */
async function sendDiscordNotification(webhookUrl, syncStats, lang = 'fr') {
  if (!webhookUrl) return;

  const s = getStrings(lang);

  try {
    const isSuccess = syncStats.status === 'completed';
    const color     = isSuccess ? 0x48bb78 : 0xe53e3e;
    const title     = isSuccess ? `✅ ${s.syncSuccess}` : `❌ ${s.syncError}`;

    // ─── Description : résumé des ajouts (seulement les catégories > 0) ─────
    const addedParts = [
      syncStats.filmsAdded         > 0 ? `+${syncStats.filmsAdded} ${s.films}`         : null,
      syncStats.documentairesAdded > 0 ? `+${syncStats.documentairesAdded} ${s.documentaires}` : null,
      syncStats.seriesAdded        > 0 ? `+${syncStats.seriesAdded} ${s.series}`        : null,
      syncStats.emissionsAdded     > 0 ? `+${syncStats.emissionsAdded} ${s.emissions}`  : null,
      syncStats.animesAdded        > 0 ? `+${syncStats.animesAdded} ${s.animes}`        : null,
      syncStats.concertsAdded      > 0 ? `+${syncStats.concertsAdded} ${s.concerts}`   : null,
      syncStats.spectaclesAdded    > 0 ? `+${syncStats.spectaclesAdded} ${s.spectacles}` : null,
    ].filter(Boolean);

    const description = isSuccess
      ? (addedParts.length ? `**${addedParts.join(' · ')}**` : `*${s.noneAdded}*`)
      : null;

    // ─── Champ "Bibliothèque" : totaux sur deux lignes compactes ────────────
    const totalLine1 = `${s.films} : **${syncStats.totalFilms || 0}** · ${s.documentaires} : **${syncStats.totalDocs || 0}** · ${s.series} : **${syncStats.totalSeries || 0}**`;
    const totalLine2 = `${s.emissions} : **${syncStats.totalEmissions || 0}** · ${s.animes} : **${syncStats.totalAnimes || 0}** · ${s.concerts} : **${syncStats.totalConcerts || 0}** · ${s.spectacles} : **${syncStats.totalSpectacles || 0}**`;

    // ─── Champ "Détails" : tout sur une ligne ────────────────────────────────
    const detailsValue = `⏱️ **${syncStats.duration || 0}${s.seconds}** · ✓ **${syncStats.matched || 0}** ${s.matched} · ✗ **${syncStats.failed || 0}** ${s.failed}`;

    const mainEmbed = {
      title, color,
      description,
      fields: [
        { name: s.fieldTotals,  value: `${totalLine1}\n${totalLine2}`, inline: false },
        { name: s.fieldDetails, value: detailsValue,                   inline: false }
      ],
      timestamp: new Date().toISOString(),
      footer:    { text: 'Stremio RSS Catalog' }
    };

    if (!isSuccess && syncStats.errorMessage) {
      mainEmbed.fields.push({
        name:   `❌ ${s.fieldError}`,
        value:  syncStats.errorMessage.substring(0, 1024),
        inline: false
      });
    }

    if (syncStats.installUrl) {
      const webUIUrl = syncStats.installUrl.replace('/manifest.json', '/dashboard');
      mainEmbed.fields.push({
        name:   s.fieldWebUI,
        value:  `[${s.fieldWebUILink}](${webUIUrl})`,
        inline: false
      });
    }

    await axios.post(webhookUrl, {
      username:   'Stremio RSS Catalog',
      avatar_url: AVATAR_URL,
      embeds:     [mainEmbed]
    });

    // ─── Galeries d'affiches ─────────────────────────────────────────────────
    if (syncStats.recentAdditions) {
      const { rpdbEnabled, rpdbKey, postersPlusEnabled, postersPlusTemplate, recentAdditions } = syncStats;
      const artworkConfig = { rpdbEnabled, rpdbKey, postersPlusEnabled, postersPlusTemplate };

      await sendGallery(webhookUrl, recentAdditions.films,         artworkConfig, s.galleryFilms,      0x667eea, 'films.png');
      await sendGallery(webhookUrl, recentAdditions.documentaires, artworkConfig, s.galleryDocs,       0x48bb78, 'documentaires.png');
      await sendGallery(webhookUrl, recentAdditions.series,        artworkConfig, s.gallerySeries,     0xed8936, 'series.png');
      await sendGallery(webhookUrl, recentAdditions.emissions,     artworkConfig, s.galleryEmissions,  0xe91e63, 'emissions.png');
      await sendGallery(webhookUrl, recentAdditions.animes,        artworkConfig, s.galleryAnimes,     0xa855f7, 'animes.png');
      await sendGallery(webhookUrl, recentAdditions.concerts,      artworkConfig, s.galleryConcerts,   0xfb7185, 'concerts.png');
      await sendGallery(webhookUrl, recentAdditions.spectacles,    artworkConfig, s.gallerySpectacles, 0x2dd4bf, 'spectacles.png');
    }

    console.log('[Discord] Notification envoyée');
  } catch (error) {
    console.error('[Discord] Échec envoi notification:', error.message);
  }
}

async function sendDiscordSourceAlert(webhookUrl, alert) {
  if (!webhookUrl) return false;
  const isRecovery = alert.eventType === 'recovery';
  try {
    await axios.post(webhookUrl, {
      username: 'Stremio RSS Catalog',
      avatar_url: AVATAR_URL,
      embeds: [{
        title: isRecovery
          ? `✅ Source rétablie : ${alert.sourceName}`
          : `⚠️ Source indisponible : ${alert.sourceName}`,
        color: isRecovery ? 0x48bb78 : 0xe53e3e,
        description: alert.message || null,
        fields: [
          { name: 'Source', value: `\`${alert.sourceKey}\``, inline: false },
          ...(!isRecovery ? [{
            name: 'Échecs consécutifs',
            value: `${alert.consecutiveErrors} — seuil configuré : ${alert.threshold}`,
            inline: true
          }] : [])
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Stremio RSS Catalog · surveillance des sources' }
      }]
    }, { timeout: 10000 });
    console.log(`[Discord] Alerte source envoyée : ${alert.sourceKey}`);
    return true;
  } catch (error) {
    console.error('[Discord] Échec envoi alerte source:', error.message);
    return false;
  }
}

module.exports = { sendDiscordNotification, sendDiscordSourceAlert, buildPostersPlusUrl, getPosterUrl };
