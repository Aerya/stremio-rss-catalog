/**
 * Chaînes de texte pour les notifications Discord et Apprise.
 * Indépendantes de la langue de la WebUI — configurable séparément.
 *
 * Langues supportées : 'fr' (défaut), 'en', 'de'
 */

const STRINGS = {
  fr: {
    // Titres principaux
    syncSuccess:      'Synchronisation terminée',
    syncError:        'Synchronisation échouée',
    syncTest:         'Test — Stremio RSS Catalog',

    // Champs Discord embed
    fieldAdded:       'Ajoutés',
    fieldTotals:      'Totaux',
    fieldDetails:     'En détails',
    fieldError:       'Erreur',
    fieldWebUI:       'WebUI',
    fieldWebUILink:   'Ouvrir la WebUI',

    // Détails
    duration:         'Durée',
    matched:          'Matchées',
    failed:           'Non traitées',
    seconds:          's',
    noneAdded:        'Aucun nouveau média ajouté',

    // Catégories (labels courts)
    films:            'Films',
    documentaires:    'Docs',
    series:           'Séries',
    emissions:        'Émissions',
    animes:           'Animés',
    concerts:         'Concerts',
    spectacles:       'Spectacles',

    // Titres galeries Discord
    galleryFilms:         'Derniers Films ajoutés',
    galleryDocs:          'Derniers Documentaires ajoutés',
    gallerySeries:        'Dernières Séries ajoutées',
    galleryEmissions:     'Dernières Émissions TV ajoutées',
    galleryAnimes:        'Derniers Animés ajoutés',
    galleryConcerts:      'Derniers Concerts ajoutés',
    gallerySpectacles:    'Derniers Spectacles ajoutés',

    // Apprise
    appriseAdded:     'Ajoutés',
    appriseTestBody:  'Apprise est correctement configuré et connecté !'
  },

  en: {
    syncSuccess:      'Sync completed',
    syncError:        'Sync failed',
    syncTest:         'Test — Stremio RSS Catalog',

    fieldAdded:       'Added',
    fieldTotals:      'Totals',
    fieldDetails:     'Details',
    fieldError:       'Error',
    fieldWebUI:       'WebUI',
    fieldWebUILink:   'Open WebUI',

    duration:         'Duration',
    matched:          'Matched',
    failed:           'Unmatched',
    seconds:          's',
    noneAdded:        'No new media added',

    films:            'Movies',
    documentaires:    'Docs',
    series:           'Series',
    emissions:        'TV Shows',
    animes:           'Anime',
    concerts:         'Concerts',
    spectacles:       'Live Shows',

    galleryFilms:         'Latest Movies added',
    galleryDocs:          'Latest Documentaries added',
    gallerySeries:        'Latest Series added',
    galleryEmissions:     'Latest TV Shows added',
    galleryAnimes:        'Latest Anime added',
    galleryConcerts:      'Latest Concerts added',
    gallerySpectacles:    'Latest Live Shows added',

    appriseAdded:     'Added',
    appriseTestBody:  'Apprise is correctly configured and connected!'
  },

  de: {
    syncSuccess:      'Synchronisierung abgeschlossen',
    syncError:        'Synchronisierung fehlgeschlagen',
    syncTest:         'Test — Stremio RSS Catalog',

    fieldAdded:       'Hinzugefügt',
    fieldTotals:      'Gesamt',
    fieldDetails:     'Details',
    fieldError:       'Fehler',
    fieldWebUI:       'WebUI',
    fieldWebUILink:   'WebUI öffnen',

    duration:         'Dauer',
    matched:          'Gefunden',
    failed:           'Nicht verarbeitet',
    seconds:          's',
    noneAdded:        'Keine neuen Medien hinzugefügt',

    films:            'Filme',
    documentaires:    'Dokus',
    series:           'Serien',
    emissions:        'TV-Sendungen',
    animes:           'Anime',
    concerts:         'Konzerte',
    spectacles:       'Aufführungen',

    galleryFilms:         'Neueste Filme hinzugefügt',
    galleryDocs:          'Neueste Dokumentarfilme hinzugefügt',
    gallerySeries:        'Neueste Serien hinzugefügt',
    galleryEmissions:     'Neueste TV-Sendungen hinzugefügt',
    galleryAnimes:        'Neueste Anime hinzugefügt',
    galleryConcerts:      'Neueste Konzerte hinzugefügt',
    gallerySpectacles:    'Neueste Aufführungen hinzugefügt',

    appriseAdded:     'Hinzugefügt',
    appriseTestBody:  'Apprise ist korrekt konfiguriert und verbunden!'
  }
};

/**
 * Retourne le dictionnaire pour la langue donnée.
 * Repli sur 'fr' si la langue est inconnue.
 * @param {string} lang
 * @returns {object}
 */
function getStrings(lang) {
  return STRINGS[lang] || STRINGS['fr'];
}

module.exports = { getStrings };
