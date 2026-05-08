const axios = require('axios');
const sharp = require('sharp');

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
    const posterWidth = 200;
    const posterHeight = 300;
    const spacing = 10;

    const posterBuffers = await Promise.all(
        items.map(async (item) => {
            const posterUrl = getPosterUrl(item, rpdbEnabled, rpdbKey);
            return await downloadImage(posterUrl);
        })
    );

    const validPosters = posterBuffers.filter(buffer => buffer !== null);

    if (validPosters.length === 0) {
        return null;
    }

    const resizedPosters = await Promise.all(
        validPosters.map(buffer =>
            sharp(buffer)
                .resize(posterWidth, posterHeight, { fit: 'cover' })
                .toBuffer()
        )
    );

    const totalWidth = (posterWidth * resizedPosters.length) + (spacing * (resizedPosters.length - 1));
    const totalHeight = posterHeight;

    const compositeInputs = resizedPosters.map((buffer, index) => ({
        input: buffer,
        left: index * (posterWidth + spacing),
        top: 0
    }));

    const composite = await sharp({
        create: {
            width: totalWidth,
            height: totalHeight,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
        .composite(compositeInputs)
        .png()
        .toBuffer();

    return composite;
}

async function sendGallery(webhookUrl, items, rpdbEnabled, rpdbKey, title, color, filename) {
    if (!items || items.length === 0) return;

    const compositeImage = await createCompositeImage(items, rpdbEnabled, rpdbKey);
    if (!compositeImage) return;

    const FormData = require('form-data');
    const form = new FormData();

    form.append('file', compositeImage, filename);

    const payload = {
        username: 'Stremio RSS Catalog',
        avatar_url: AVATAR_URL,
        embeds: [{
            title,
            color,
            image: { url: `attachment://${filename}` }
        }]
    };

    form.append('payload_json', JSON.stringify(payload));

    await axios.post(webhookUrl, form, { headers: form.getHeaders() });
}

async function sendDiscordNotification(webhookUrl, syncStats) {
    if (!webhookUrl) {
        return;
    }

    try {
        const isSuccess = syncStats.status === 'completed';
        const color = isSuccess ? 0x48bb78 : 0xe53e3e;
        const title = isSuccess ? '✅ Synchronisation terminée' : '❌ Synchronisation échouée';

        const mainEmbed = {
            title,
            color,
            fields: [
                {
                    name: 'Ajoutés',
                    value: [
                        `Films : **${syncStats.filmsAdded || 0}**`,
                        `Docs : **${syncStats.documentairesAdded || 0}**`,
                        `Séries : **${syncStats.seriesAdded || 0}**`,
                        `Émissions : **${syncStats.emissionsAdded || 0}**`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: 'Totaux',
                    value: [
                        `Films: **${syncStats.totalFilms || 0}**`,
                        `Docs: **${syncStats.totalDocs || 0}**`,
                        `Séries: **${syncStats.totalSeries || 0}**`,
                        `Émissions: **${syncStats.totalEmissions || 0}**`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: 'En détails',
                    value: `Durée: **${syncStats.duration || 0}s**\nMatchées: **${syncStats.matched || 0}**\nNon traitées: **${syncStats.failed || 0}**`,
                    inline: false
                }
            ],
            timestamp: new Date().toISOString(),
            footer: { text: 'Stremio RSS Catalog' }
        };

        if (!isSuccess && syncStats.errorMessage) {
            mainEmbed.fields.push({
                name: '❌ Erreur',
                value: syncStats.errorMessage.substring(0, 1024),
                inline: false
            });
        }

        if (syncStats.installUrl) {
            const webUIUrl = syncStats.installUrl.replace('/manifest.json', '/dashboard');
            mainEmbed.fields.push({
                name: 'WebUI',
                value: `[Aller sur la WebUI](${webUIUrl})`,
                inline: false
            });
        }

        await axios.post(webhookUrl, {
            username: 'Stremio RSS Catalog',
            avatar_url: AVATAR_URL,
            embeds: [mainEmbed]
        });

        if (syncStats.recentAdditions) {
            const { rpdbEnabled, rpdbKey, recentAdditions } = syncStats;

            await sendGallery(webhookUrl, recentAdditions.films, rpdbEnabled, rpdbKey,
                'Derniers Films ajoutés', 0x667eea, 'films.png');

            await sendGallery(webhookUrl, recentAdditions.documentaires, rpdbEnabled, rpdbKey,
                'Derniers Documentaires ajoutés', 0x48bb78, 'documentaires.png');

            await sendGallery(webhookUrl, recentAdditions.series, rpdbEnabled, rpdbKey,
                'Dernières Séries ajoutées', 0xed8936, 'series.png');

            await sendGallery(webhookUrl, recentAdditions.emissions, rpdbEnabled, rpdbKey,
                'Dernières Émissions TV ajoutées', 0xe91e63, 'emissions.png');
        }

        console.log('[Discord] Notification sent successfully');
    } catch (error) {
        console.error('[Discord] Failed to send notification:', error.message);
    }
}

module.exports = {
    sendDiscordNotification
};
