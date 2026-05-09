const axios   = require('axios');
const sharp   = require('sharp');
const { getStrings } = require('./notifStrings');

const AVATAR_URL = 'https://raw.githubusercontent.com/Aerya/stremio-rss-catalogs/main/src/public/logo.png';

function getPosterUrl(item, rpdbEnabled, rpdbKey) {
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

async function createCompositeImage(items, rpdbEnabled, rpdbKey) {
  const posterWidth  = 200;
  const posterHeight = 300;
  const spacing      = 10;

  const posterBuffers = await Promise.all(
    items.map(item => downloadImage(getPosterUrl(item, rpdbEnabled, rpdbKey)))
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

async function sendGallery(webhookUrl, items, rpdbEnabled, rpdbKey, title, color, filename) {
  if (!items || items.length === 0) return;

  const compositeImage = await createCompositeImage(items, rpdbEnabled, rpdbKey);
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

    // ─── Champ "Ajoutés" ────────────────────────────────────────────────────
    const addedLines = [
      `${s.films}         : **${syncStats.filmsAdded         || 0}**`,
      `${s.documentaires} : **${syncStats.documentairesAdded || 0}**`,
      `${s.series}        : **${syncStats.seriesAdded        || 0}**`,
      `${s.emissions}     : **${syncStats.emissionsAdded     || 0}**`,
      `${s.animes}        : **${syncStats.animesAdded        || 0}**`,
      `${s.concerts}      : **${syncStats.concertsAdded      || 0}**`,
      `${s.spectacles}    : **${syncStats.spectaclesAdded    || 0}**`
    ].join('\n');

    // ─── Champ "Totaux" ──────────────────────────────────────────────────────
    const totalLines = [
      `${s.films}         : **${syncStats.totalFilms      || 0}**`,
      `${s.documentaires} : **${syncStats.totalDocs       || 0}**`,
      `${s.series}        : **${syncStats.totalSeries     || 0}**`,
      `${s.emissions}     : **${syncStats.totalEmissions  || 0}**`,
      `${s.animes}        : **${syncStats.totalAnimes     || 0}**`,
      `${s.concerts}      : **${syncStats.totalConcerts   || 0}**`,
      `${s.spectacles}    : **${syncStats.totalSpectacles || 0}**`
    ].join('\n');

    const mainEmbed = {
      title, color,
      fields: [
        { name: s.fieldAdded,   value: addedLines, inline: true },
        { name: s.fieldTotals,  value: totalLines, inline: true },
        {
          name:   s.fieldDetails,
          value:  `${s.duration}: **${syncStats.duration || 0}${s.seconds}** · ${s.matched}: **${syncStats.matched || 0}** · ${s.failed}: **${syncStats.failed || 0}**`,
          inline: false
        }
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
      const { rpdbEnabled, rpdbKey, recentAdditions } = syncStats;

      await sendGallery(webhookUrl, recentAdditions.films,         rpdbEnabled, rpdbKey, s.galleryFilms,      0x667eea, 'films.png');
      await sendGallery(webhookUrl, recentAdditions.documentaires, rpdbEnabled, rpdbKey, s.galleryDocs,       0x48bb78, 'documentaires.png');
      await sendGallery(webhookUrl, recentAdditions.series,        rpdbEnabled, rpdbKey, s.gallerySeries,     0xed8936, 'series.png');
      await sendGallery(webhookUrl, recentAdditions.emissions,     rpdbEnabled, rpdbKey, s.galleryEmissions,  0xe91e63, 'emissions.png');
      await sendGallery(webhookUrl, recentAdditions.animes,        rpdbEnabled, rpdbKey, s.galleryAnimes,     0xa855f7, 'animes.png');
      await sendGallery(webhookUrl, recentAdditions.concerts,      rpdbEnabled, rpdbKey, s.galleryConcerts,   0xfb7185, 'concerts.png');
      await sendGallery(webhookUrl, recentAdditions.spectacles,    rpdbEnabled, rpdbKey, s.gallerySpectacles, 0x2dd4bf, 'spectacles.png');
    }

    console.log('[Discord] Notification envoyée');
  } catch (error) {
    console.error('[Discord] Échec envoi notification:', error.message);
  }
}

module.exports = { sendDiscordNotification };
