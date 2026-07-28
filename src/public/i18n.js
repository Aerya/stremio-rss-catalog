/**
 * Stremio RSS Catalog i18n System
 * Supports: FR (default), EN, DE
 */

const translations = {
  fr: {
    // Login page
    login_subtitle: "Connexion à l'interface d'administration",
    login_username: "Nom d'utilisateur",
    login_password: "Mot de passe",
    login_submit: "Se connecter",
    login_error_credentials: "Identifiants incorrects",
    login_error_network: "Erreur réseau",
    login_error_generic: "Erreur de connexion",

    // Header
    logout: "Déconnexion",

    // Description
    description_text: 'Stremio RSS Catalog est un addon de création de catalogues Stremio à partir de flux RSS. Il ne permet pas de lire du contenu, il faut pour cela utiliser des addons de stream tels que <a href="https://github.com/LimeHubs/stream-fusion-reborn" target="_blank">StreamFusion (BitTorrent)</a>, <a href="https://baguettio.org" target="_blank">Baguettio</a> ou <a href="https://github.com/Sanket9225/UsenetStreamer" target="_blank">Usenet-Streamer</a> avec <a href="https://github.com/nzbdav-dev/nzbdav" target="_blank">NZBdav (Usenet)</a>.<br>Tutoriels sur <a href="https://upandclear.org" target="_blank">mon blog</a>, <a href="https://stremiofr.me/" target="_blank">instances</a> mises à disposition par la communauté StremioFR et auto-hébergement simplifié avec le projet <a href="https://ssd.lastharo.eu/" target="_blank">S.S.D.v2</a>.',

    // Stats
    stat_films: "Films",
    stat_documentaires: "Documentaires",
    stat_series: "Séries",
    stat_emissions: "Émissions TV",
    stat_animes: "Animés",
    stat_concerts: "Concerts",
    stat_spectacles: "Spectacles",
    stat_indexed: "Médias indexés",
    ov_last_sync: "Dernière sync",
    ov_failed: "Releases non matchées",
    ov_failed_hint: "cliquer pour voir",
    ov_sources: "Sources RSS",
    ov_sources_hint: "flux actifs",
    ov_recent: "Derniers ajouts",

    // Sync history
    sync_history_title: "Historique des synchronisations",
    sync_history_desc: "Pour chaque release, Stremio RSS Catalog va chercher le média correspondant sur TMDB et l'attribue ensuite à un catalogue Films ou Documentaires.<br>L'écart entre les releases sources dans un flux RSS et les médias ajoutés dans les catalogues vient des releases qui n'ont pas matché sur TMDB (nom erroné/différent de la fiche, pas de fiche, timeout TMDB, plusieurs médias du même nom etc) et de celles qui se réfèrent à un même média (rlz SD, HD, HDR, SDR, DV, UHD etc d'un même film par exemple) et ne comptent donc pas. Si une nouvelle release concerne des média déjà rattaché à un catalogue, ce media n'est alors pas remis en avant dans les derniers ajouts du catalogue.",
    sync_browse: "Parcourir :",
    sync_last_3: "Les 3 dernières",
    sync_loading: "Chargement...",
    sync_none: "Aucune synchronisation effectuée pour le moment.",
    sync_none_date: "Aucune synchronisation pour cette date.",
    sync_duration: "Durée",
    sync_status: "Statut",
    sync_completed: "Terminée",
    sync_error: "Erreur",
    sync_running: "En cours",
    sync_error_label: "Erreur",
    sync_releases: "Releases sources",
    sync_matched: "Matchées sur TMDB",
    sync_match_rate: "Réussite",
    sync_already_in_db: "Déjà en base",
    sync_new: "Nouvelles",
    sync_films: "Films",
    sync_docs: "Docs",
    sync_series: "Séries",
    sync_emissions: "Émissions",
    sync_failed: "Non traitées",

    // Config
    config_title: "Configuration",
    config_rss_films: "Flux RSS",
    config_rss_main_label: "Flux principal",
    config_rss_films_hint: "Incluant votre clé API ou passkey",
    config_rss_additional_title: "Flux RSS additionnels",
    config_rss_additional_hint: "Même fonctionnement que le flux principal : Films, Documentaires et Séries détectés automatiquement.",
    config_rss_add_btn: "➕ Ajouter un flux RSS",
    config_rss_remove_btn: "Supprimer",
    config_tmdb_key: "Clé API TMDB",
    config_tvdb_key: "Clé API TVDB (optionnel)",
    config_tvdb_hint: "Optionnel. Source complémentaire à TMDB pour la détection des documentaires et fallback pour les séries non trouvées. Clé gratuite sur thetvdb.com.",
    config_mal_key: "Client ID MyAnimeList (optionnel)",
    config_mal_hint: "Optionnel. Améliore le matching des animés via MyAnimeList avant de chercher sur TMDB. Client ID gratuit sur myanimelist.net/apiconfig.",
    config_anilist_enable: "Activer AniList (complément MAL, sans clé API)",
    config_anilist_hint: "AniList est utilisé en complément de MAL pour normaliser les titres d'animés. Gratuit et anonyme — aucune inscription requise.",
    config_omdb_key: "Clé API OMDb (concerts & spectacles)",
    config_omdb_hint: "Utilisé conjointement avec TMDB pour classifier les concerts (genre Music) et les spectacles. Clé gratuite sur omdbapi.com (1000 req/jour).",
    config_rpdb_title: "Rating Poster DataBase aka RPDB",
    config_rpdb_enable: "Activer",
    config_rpdb_examples: "exemples",
    config_rpdb_get_key: "Obtenir une clé gratuite en créant un compte",
    config_rpdb_placeholder: "Votre clé API RPDB",
    config_proxy_title: "Proxy",
    config_proxy_enable: "Activer",
    config_proxy_protocol: "Protocole",
    config_proxy_host: "Hôte",
    config_proxy_port: "Port",
    config_proxy_username: "Utilisateur (optionnel)",
    config_proxy_password: "Mot de passe (optionnel)",
    config_auto_sync_title: "Synchronisation automatique",
    config_auto_sync_enable: "Activer",
    config_refresh_interval: "Intervalle de rafraîchissement (minutes)",
    config_refresh_hint: "Minimum : 15 minutes | Maximum : 1440 minutes (24h) | Par défaut : 180 minutes (3h)",
    config_discord_title: "Notifications Discord à la suite d'une synchronisation",
    config_discord_enable: "Activer",
    config_discord_webhook: "Webhook",
    config_discord_webhook_hint: "Créer un webhook dans Paramètres du serveur > Intégrations > Webhooks",
    config_discord_enhanced: "Afficher les 5 derniers ajouts de chaque catalogue",
    config_discord_enhanced_hint: "Affiche les 5 dernières affiches",
    config_discord_rpdb: "Utiliser les affiches RPDB pour Discord",
    config_discord_rpdb_hint: "Nécessite une clé API RPDB configurée",
    config_notif_lang_title: "Langue des notifications",
    config_notif_lang: "Langue (Discord & Apprise)",
    config_notif_lang_hint: "Indépendante de la langue de la WebUI",
    config_apprise_title: "Apprise",
    config_apprise_enable: "Activer les notifications Apprise",
    config_apprise_server: "URL du serveur Apprise",
    config_apprise_server_hint: "Ex : http://apprise:8000 — déployez Apprise via Docker (caronc/apprise)",
    config_apprise_urls: "URLs de notification",
    config_apprise_urls_hint: "URLs séparées par des virgules : ntfy://ntfy.sh/topic, tgram://token/chatid, slack://...",
    config_apprise_test: "Tester Apprise",
    config_apprise_test_ok: "Notification envoyée avec succès",
    config_apprise_test_fail: "Échec de l'envoi",
    config_save: "Enregistrer",
    config_saved: "✓ Configuration sauvegardée",
    config_error_network: "✗ Erreur réseau",

    // Sync section
    sync_title: "Synchronisation",
    sync_auto_label: "Synchronisation automatique :",
    sync_auto_enabled: "✓ Activée (toutes les {interval} minutes)",
    sync_auto_disabled: "✗ Désactivée (synchronisation manuelle uniquement)",
    sync_start_btn: "▶️ Lancer manuellement la récupération des sources et le matching avec TMDB",
    sync_in_progress: "En cours...",
    sync_waiting: "En attente",
    sync_progress: "Progression",
    sync_matched_label: "Matchées",
    sync_unprocessed: "Non traitées",

    // Reclassification
    reclassify_title: "🔍 Reclassification des médias",
    reclassify_desc: "Reclassifie tous les médias déjà indexés selon la configuration actuelle des flux (force manuel + détection automatique depuis l'URL). Utile après avoir modifié la catégorie d'un flux.",
    reclassify_btn: "🔍 Reclassifier maintenant",

    // Install
    install_title: "Installation dans Stremio",
    install_desc: "Une fois la 1ère synchronisation terminée OU à chaque modification apportée sur la WebUI, (ré)installer l'addon dans Stremio avec cette URL :",
    install_loading: "Chargement...",
    install_copy: "Copier",
    install_copied: "URL copiée !",
    install_copy_error: "Erreur lors de la copie",

    // Navigation
    nav_overview: "Vue d'ensemble",
    nav_library: "Médiathèque",
    nav_sources: "Sources",
    nav_catalogs: "Catalogues",
    nav_sync: "Synchronisation",
    nav_failures: "Échecs",
    nav_config: "Configuration",

    // Library
    library_search_placeholder: "Rechercher un titre...",
    library_all: "Tous",
    library_no_results: "Aucun résultat",
    library_releases_none: "Aucune release enregistrée",
    library_col_name: "Nom de release",
    library_col_quality: "Qualité",
    library_col_hash: "Hash",
    library_col_date: "Date",
    lib_sort_date_desc: "Ajout ↓",
    lib_sort_date_asc: "Ajout ↑",
    lib_sort_year_desc: "Année ↓",
    lib_sort_year_asc: "Année ↑",
    lib_sort_name: "Titre A-Z",
    lib_year_all: "Toute année",
    lib_releases_tab: "Releases",

    // Sources
    sources_url: "Flux RSS",
    sources_by_cat: "Par catégorie",
    sources_releases: "Releases",
    sources_media: "Médias",
    sources_last_seen: "Dernier ajout",
    sources_errors: "Fetch",
    sources_none: "Aucune source détectée — lancez une synchronisation d'abord",
    sources_rss_title: "Sources RSS",
    sources_pastebin_title: "Sources Pastebin",
    sources_pastebin_desc: "URL directe, pointeur JSON ou index maître catégorisé.",
    sources_newznab_title: "API Newznab",
    sources_newznab_desc: "Interroge directement un indexeur Newznab, sans passer par Prowlarr.",
    sources_name: "Nom",
    sources_newznab_url: "URL de l’API",
    sources_newznab_key: "Clé API",
    sources_newznab_movie_categories: "Catégories Films",
    sources_newznab_series_categories: "Catégories Séries",
    sources_newznab_max_items: "Maximum par catégorie et synchronisation",
    sources_newznab_delay: "Délai entre les pages (ms)",
    sources_test: "Tester",
    sources_newznab_none: "Aucune API Newznab.",
    sources_newznab_testing: "Test de connexion…",
    sources_newznab_connection_ok: "Connexion réussie",
    sources_newznab_server_limit: "limite serveur par page :",
    sources_newznab_categories_available: "catégories disponibles",
    sources_newznab_categories_short: "Catégories",
    sources_newznab_items_per_category: "éléments/catégorie",
    sources_newznab_page_size: "page",
    sources_newznab_delete_confirm: "Supprimer cette source Newznab ? Les médias déjà indexés sont conservés.",
    sources_stremio_title: "Manifestes Stremio",
    sources_stremio_desc: "Importe les catalogues déclarés par un autre addon.",
    sources_name_placeholder: "Nom de la source",
    sources_preview: "Prévisualiser",
    sources_add: "Ajouter",
    sources_catalog_action: "Catalogue",
    sources_pause: "Pause",
    sources_resume: "Reprendre",
    sources_delete: "Supprimer",
    sources_rename: "Renommer",
    sources_rename_prompt: "Nouveau nom de la source",
    sources_rss_none: "Aucune source RSS.",
    sources_pastebin_none: "Aucune source Pastebin.",
    sources_stremio_none: "Aucun manifeste Stremio.",
    catalogs_create: "Créer un catalogue",
    catalogs_configured: "Catalogues configurés",
    catalogs_none: "Aucun catalogue configuré.",
    catalogs_name: "Nom affiché dans Stremio",
    catalogs_type: "Type Stremio",
    catalogs_year_filter: "Filtre année",
    catalogs_year_include: "Uniquement les années",
    catalogs_year_exclude: "Tout sauf les années",
    catalogs_years: "Années, séparées par des virgules",
    catalogs_year_min: "Année minimale",
    catalogs_year_max: "Année maximale",
    catalogs_keywords_include: "Mots requis, séparés par des virgules",
    catalogs_keywords_exclude: "Mots exclus, séparés par des virgules",
    catalogs_genres_include: "Genres à inclure",
    catalogs_genres_exclude: "Genres à exclure",
    catalogs_sources: "Sources utilisées — aucune sélection signifie toutes les sources",
    catalogs_save: "Enregistrer",
    catalogs_cancel: "Annuler",
    catalogs_edit: "Modifier",
    catalogs_all_years: "toutes années",
    catalogs_all_sources: "toutes les sources",
    catalogs_source_count: "source(s)",

    // Sync extras
    sync_auto_enabled: "Activée",
    sync_auto_disabled: "Désactivée",

    // Failed
    failed_retry_btn: "♻️ Retry tout",
    failed_clear_btn: "🗑 Vider",
    failed_none: "Aucune release échouée. 🎉",

    // Config extras
    config_save_btn: "💾 Enregistrer",
    config_saved_ok: "Configuration enregistrée",
    config_saved_err: "Erreur lors de l'enregistrement",
    config_discord_title: "Discord",
    config_discord_enable: "Activer les notifications",
    config_discord_webhook: "URL du webhook Discord",
    config_discord_enhanced: "Notifications enrichies (galerie d'affiches)",
    config_discord_rpdb: "Affiches RPDB dans Discord",

    // Proxy test
    config_proxy_test_btn: "🔌 Tester la connexion",
    config_proxy_test_ok: "Connexion réussie",
    config_proxy_test_fail: "Connexion échouée",

    // Integrations
    integrations_title: "Intégrations rapides",
    integrations_hint: "Entrez l'URL de base et la clé API pour générer automatiquement les flux RSS et les ajouter à la liste.",
    integrations_url_placeholder: "http://localhost:...",
    integrations_add_all: "Tout",
    integrations_add_films: "Films",
    integrations_add_series: "Séries",
    integrations_missing_fields: "Veuillez renseigner l'URL et la clé API.",

    // Misc
    by: "Par",
    donate: "M'offrir des Dragibus :-)",
  },

  en: {
    // Login page
    login_subtitle: "Login to the administration interface",
    login_username: "Username",
    login_password: "Password",
    login_submit: "Log in",
    login_error_credentials: "Invalid credentials",
    login_error_network: "Network error",
    login_error_generic: "Login error",

    // Header
    logout: "Logout",

    // Description
    description_text: 'Stremio RSS Catalog is a Stremio catalog creation addon from RSS feeds. It does not play content; for that, use streaming addons such as <a href="https://github.com/LimeHubs/stream-fusion-reborn" target="_blank">StreamFusion (BitTorrent)</a>, <a href="https://baguettio.org" target="_blank">Baguettio</a> or <a href="https://github.com/Sanket9225/UsenetStreamer" target="_blank">Usenet-Streamer</a> with <a href="https://github.com/nzbdav-dev/nzbdav" target="_blank">NZBdav (Usenet)</a>.<br>Tutorials on <a href="https://upandclear.org" target="_blank">my blog</a>, <a href="https://stremiofr.me/" target="_blank">instances</a> shared by the StremioFR community and easy self-hosting with the <a href="https://ssd.lastharo.eu/" target="_blank">S.S.D.v2</a> project.',

    // Stats
    stat_films: "Movies",
    stat_documentaires: "Documentaries",
    stat_series: "Series",
    stat_emissions: "TV Shows",
    stat_animes: "Anime",
    stat_concerts: "Concerts",
    stat_spectacles: "Live Shows",
    stat_indexed: "Indexed media",
    ov_last_sync: "Last sync",
    ov_failed: "Unmatched releases",
    ov_failed_hint: "click to view",
    ov_sources: "RSS Sources",
    ov_sources_hint: "active feeds",
    ov_recent: "Recent additions",

    // Sync history
    sync_history_title: "Synchronization history",
    sync_history_desc: "For each release, Stremio RSS Catalog searches for the corresponding media on TMDB and assigns it to a Movies or Documentaries catalog.<br>The gap between source releases in an RSS feed and media added to catalogs comes from releases that didn't match on TMDB (wrong/different name, no listing, TMDB timeout, multiple media with same name, etc.) and those referring to the same media (SD, HD, HDR, SDR, DV, UHD releases of the same movie for example) which are not counted. If a new release concerns media already in a catalog, it won't be pushed to the top of recent additions.",
    sync_browse: "Browse:",
    sync_last_3: "Last 3",
    sync_loading: "Loading...",
    sync_none: "No synchronization performed yet.",
    sync_none_date: "No synchronization for this date.",
    sync_duration: "Duration",
    sync_status: "Status",
    sync_completed: "Completed",
    sync_error: "Error",
    sync_running: "Running",
    sync_error_label: "Error",
    sync_releases: "Source releases",
    sync_matched: "Matched on TMDB",
    sync_match_rate: "Success rate",
    sync_already_in_db: "Already in DB",
    sync_new: "New",
    sync_films: "Movies",
    sync_docs: "Docs",
    sync_series: "Series",
    sync_emissions: "TV Shows",
    sync_failed: "Unprocessed",

    // Config
    config_title: "Configuration",
    config_rss_films: "RSS Feed",
    config_rss_main_label: "Main feed",
    config_rss_films_hint: "Including your API key or passkey",
    config_rss_additional_title: "Additional RSS Feeds",
    config_rss_additional_hint: "Same behavior as the main feed: Movies, Documentaries and Series detected automatically.",
    config_rss_add_btn: "➕ Add an RSS feed",
    config_rss_remove_btn: "Remove",
    config_tmdb_key: "TMDB API Key",
    config_tvdb_key: "TVDB API Key (optional)",
    config_tvdb_hint: "Optional. Used alongside TMDB to improve documentary detection and as a fallback for unmatched series. Free key at thetvdb.com.",
    config_mal_key: "MyAnimeList Client ID (optional)",
    config_mal_hint: "Optional. Improves anime matching by querying MyAnimeList for the canonical English title before searching TMDB. Free client ID at myanimelist.net/apiconfig.",
    config_anilist_enable: "Enable AniList (MAL complement, no API key)",
    config_anilist_hint: "AniList is used alongside MAL to normalize anime titles. Free and anonymous — no registration required.",
    config_omdb_key: "OMDb API Key (concerts & shows)",
    config_omdb_hint: "Used alongside TMDB to classify concerts (Music genre) and live shows. Free key at omdbapi.com (1000 req/day).",
    config_rpdb_title: "Rating Poster DataBase aka RPDB",
    config_rpdb_enable: "Enable",
    config_rpdb_examples: "examples",
    config_rpdb_get_key: "Get a free key by creating an account",
    config_rpdb_placeholder: "Your RPDB API key",
    config_proxy_title: "Proxy",
    config_proxy_enable: "Enable",
    config_proxy_protocol: "Protocol",
    config_proxy_host: "Host",
    config_proxy_port: "Port",
    config_proxy_username: "Username (optional)",
    config_proxy_password: "Password (optional)",
    config_auto_sync_title: "Automatic synchronization",
    config_auto_sync_enable: "Enable",
    config_refresh_interval: "Refresh interval (minutes)",
    config_refresh_hint: "Minimum: 15 minutes | Maximum: 1440 minutes (24h) | Default: 180 minutes (3h)",
    config_discord_title: "Discord notifications after synchronization",
    config_discord_enable: "Enable",
    config_discord_webhook: "Webhook",
    config_discord_webhook_hint: "Create a webhook in Server Settings > Integrations > Webhooks",
    config_discord_enhanced: "Show the 5 latest additions of each catalog",
    config_discord_enhanced_hint: "Displays the 5 latest posters",
    config_discord_rpdb: "Use RPDB posters for Discord",
    config_discord_rpdb_hint: "Requires a configured RPDB API key",
    config_notif_lang_title: "Notification language",
    config_notif_lang: "Language (Discord & Apprise)",
    config_notif_lang_hint: "Independent from the WebUI language",
    config_apprise_title: "Apprise",
    config_apprise_enable: "Enable Apprise notifications",
    config_apprise_server: "Apprise server URL",
    config_apprise_server_hint: "e.g. http://apprise:8000 — deploy Apprise via Docker (caronc/apprise)",
    config_apprise_urls: "Notification URLs",
    config_apprise_urls_hint: "Comma-separated Apprise URLs: ntfy://ntfy.sh/topic, tgram://token/chatid, slack://...",
    config_apprise_test: "Test Apprise",
    config_apprise_test_ok: "Notification sent successfully",
    config_apprise_test_fail: "Failed to send notification",
    config_save: "Save",
    config_saved: "✓ Configuration saved",
    config_error_network: "✗ Network error",

    // Sync section
    sync_title: "Synchronization",
    sync_auto_label: "Automatic synchronization:",
    sync_auto_enabled: "✓ Enabled (every {interval} minutes)",
    sync_auto_disabled: "✗ Disabled (manual sync only)",
    sync_start_btn: "▶️ Manually retrieve all sources and run TMDB matching",
    sync_in_progress: "In progress...",
    sync_waiting: "Waiting",
    sync_progress: "Progress",
    sync_matched_label: "Matched",
    sync_unprocessed: "Unprocessed",

    // Reclassification
    reclassify_title: "🔍 Media Reclassification",
    reclassify_desc: "Reclassifies all already-indexed media according to the current feed configuration (manual force + automatic URL detection). Useful after changing a feed's category.",
    reclassify_btn: "🔍 Reclassify now",

    // Install
    install_title: "Install in Stremio",
    install_desc: "Once the first synchronization is complete OR after any WebUI change, (re)install the addon in Stremio with this URL:",
    install_loading: "Loading...",
    install_copy: "Copy",
    install_copied: "URL copied!",
    install_copy_error: "Copy error",

    // Navigation
    nav_overview: "Overview",
    nav_library: "Media Library",
    nav_sources: "Sources",
    nav_catalogs: "Catalogs",
    nav_sync: "Synchronization",
    nav_failures: "Failures",
    nav_config: "Configuration",

    // Library
    library_search_placeholder: "Search a title...",
    library_all: "All",
    library_no_results: "No results",
    library_releases_none: "No releases recorded",
    library_col_name: "Release name",
    library_col_quality: "Quality",
    library_col_hash: "Hash",
    library_col_date: "Date",
    lib_sort_date_desc: "Added ↓",
    lib_sort_date_asc: "Added ↑",
    lib_sort_year_desc: "Year ↓",
    lib_sort_year_asc: "Year ↑",
    lib_sort_name: "Title A-Z",
    lib_year_all: "All years",
    lib_releases_tab: "Releases",

    // Sources
    sources_url: "RSS Feed",
    sources_by_cat: "By category",
    sources_releases: "Releases",
    sources_media: "Media",
    sources_last_seen: "Last added",
    sources_errors: "Fetch",
    sources_none: "No source detected — run a sync first",
    sources_rss_title: "RSS sources",
    sources_pastebin_title: "Pastebin sources",
    sources_pastebin_desc: "Direct URL, JSON pointer, or categorized master index.",
    sources_newznab_title: "Newznab APIs",
    sources_newznab_desc: "Queries a Newznab indexer directly, without going through Prowlarr.",
    sources_name: "Name",
    sources_newznab_url: "API URL",
    sources_newznab_key: "API key",
    sources_newznab_movie_categories: "Movie categories",
    sources_newznab_series_categories: "Series categories",
    sources_newznab_max_items: "Maximum per category and synchronization",
    sources_newznab_delay: "Delay between pages (ms)",
    sources_test: "Test",
    sources_newznab_none: "No Newznab API.",
    sources_newznab_testing: "Testing connection…",
    sources_newznab_connection_ok: "Connection successful",
    sources_newznab_server_limit: "server page limit:",
    sources_newznab_categories_available: "available categories",
    sources_newznab_categories_short: "Categories",
    sources_newznab_items_per_category: "items/category",
    sources_newznab_page_size: "page",
    sources_newznab_delete_confirm: "Delete this Newznab source? Already indexed media will be preserved.",
    sources_stremio_title: "Stremio manifests",
    sources_stremio_desc: "Imports catalogs declared by another addon.",
    sources_name_placeholder: "Source name",
    sources_preview: "Preview",
    sources_add: "Add",
    sources_catalog_action: "Catalog",
    sources_pause: "Pause",
    sources_resume: "Resume",
    sources_delete: "Delete",
    sources_rename: "Rename",
    sources_rename_prompt: "New source name",
    sources_rss_none: "No RSS source.",
    sources_pastebin_none: "No Pastebin source.",
    sources_stremio_none: "No Stremio manifest.",
    catalogs_create: "Create a catalog",
    catalogs_configured: "Configured catalogs",
    catalogs_none: "No configured catalog.",
    catalogs_name: "Name displayed in Stremio",
    catalogs_type: "Stremio type",
    catalogs_year_filter: "Year filter",
    catalogs_year_include: "Only these years",
    catalogs_year_exclude: "All except these years",
    catalogs_years: "Years, comma separated",
    catalogs_year_min: "Minimum year",
    catalogs_year_max: "Maximum year",
    catalogs_keywords_include: "Required words, comma separated",
    catalogs_keywords_exclude: "Excluded words, comma separated",
    catalogs_genres_include: "Genres to include",
    catalogs_genres_exclude: "Genres to exclude",
    catalogs_sources: "Sources used — no selection means all sources",
    catalogs_save: "Save",
    catalogs_cancel: "Cancel",
    catalogs_edit: "Edit",
    catalogs_all_years: "all years",
    catalogs_all_sources: "all sources",
    catalogs_source_count: "source(s)",

    // Sync extras
    sync_auto_enabled: "Enabled",
    sync_auto_disabled: "Disabled",

    // Failed
    failed_retry_btn: "♻️ Retry all",
    failed_clear_btn: "🗑 Clear",
    failed_none: "No failed releases. 🎉",

    // Config extras
    config_save_btn: "💾 Save",
    config_saved_ok: "Configuration saved",
    config_saved_err: "Error saving configuration",
    config_discord_title: "Discord",
    config_discord_enable: "Enable notifications",
    config_discord_webhook: "Discord webhook URL",
    config_discord_enhanced: "Enhanced notifications (poster gallery)",
    config_discord_rpdb: "RPDB posters in Discord",

    // Proxy test
    config_proxy_test_btn: "🔌 Test connection",
    config_proxy_test_ok: "Connection successful",
    config_proxy_test_fail: "Connection failed",

    // Integrations
    integrations_title: "Quick integrations",
    integrations_hint: "Enter the base URL and API key to automatically generate RSS feeds and add them to the list.",
    integrations_url_placeholder: "http://localhost:...",
    integrations_add_all: "All",
    integrations_add_films: "Movies",
    integrations_add_series: "Series",
    integrations_missing_fields: "Please fill in the URL and API key.",

    // Misc
    by: "By",
    donate: "Buy me some Dragibus :-)",
  },

  de: {
    // Login page
    login_subtitle: "Anmeldung zur Administrationsoberfläche",
    login_username: "Benutzername",
    login_password: "Passwort",
    login_submit: "Anmelden",
    login_error_credentials: "Ungültige Anmeldedaten",
    login_error_network: "Netzwerkfehler",
    login_error_generic: "Anmeldefehler",

    // Header
    logout: "Abmelden",

    // Description
    description_text: 'Stremio RSS Catalog ist ein Stremio-Addon zur Erstellung von Katalogen aus RSS-Feeds. Es spielt keine Inhalte ab; dafür verwenden Sie Streaming-Addons wie <a href="https://github.com/LimeHubs/stream-fusion-reborn" target="_blank">StreamFusion (BitTorrent)</a>, <a href="https://baguettio.org" target="_blank">Baguettio</a> oder <a href="https://github.com/Sanket9225/UsenetStreamer" target="_blank">Usenet-Streamer</a> mit <a href="https://github.com/nzbdav-dev/nzbdav" target="_blank">NZBdav (Usenet)</a>.<br>Anleitungen auf <a href="https://upandclear.org" target="_blank">meinem Blog</a>, <a href="https://stremiofr.me/" target="_blank">Instanzen</a> von der StremioFR-Community bereitgestellt und einfaches Self-Hosting mit dem <a href="https://ssd.lastharo.eu/" target="_blank">S.S.D.v2</a>-Projekt.',

    // Stats
    stat_films: "Filme",
    stat_documentaires: "Dokumentarfilme",
    stat_series: "Serien",
    stat_emissions: "TV-Sendungen",
    stat_animes: "Anime",
    stat_concerts: "Konzerte",
    stat_spectacles: "Aufführungen",
    stat_indexed: "Indexierte Medien",
    ov_last_sync: "Letzte Sync",
    ov_failed: "Nicht gematchte Releases",
    ov_failed_hint: "klicken zum Anzeigen",
    ov_sources: "RSS-Quellen",
    ov_sources_hint: "aktive Feeds",
    ov_recent: "Letzte Ergänzungen",

    // Sync history
    sync_history_title: "Synchronisierungsverlauf",
    sync_history_desc: "Für jede Veröffentlichung sucht Stremio RSS Catalog das entsprechende Medium auf TMDB und ordnet es einem Filme- oder Dokumentarfilm-Katalog zu.<br>Die Differenz zwischen den Quell-Veröffentlichungen im RSS-Feed und den hinzugefügten Medien ergibt sich aus Veröffentlichungen, die nicht auf TMDB übereinstimmen (falscher/anderer Name, kein Eintrag, TMDB-Timeout, mehrere Medien mit gleichem Namen usw.) und solchen, die sich auf dasselbe Medium beziehen (SD, HD, HDR, SDR, DV, UHD-Versionen desselben Films), die nicht gezählt werden.",
    sync_browse: "Durchsuchen:",
    sync_last_3: "Die letzten 3",
    sync_loading: "Laden...",
    sync_none: "Bisher keine Synchronisierung durchgeführt.",
    sync_none_date: "Keine Synchronisierung für dieses Datum.",
    sync_duration: "Dauer",
    sync_status: "Status",
    sync_completed: "Abgeschlossen",
    sync_error: "Fehler",
    sync_running: "Läuft",
    sync_error_label: "Fehler",
    sync_releases: "Quell-Releases",
    sync_matched: "Auf TMDB gefunden",
    sync_match_rate: "Erfolgsrate",
    sync_already_in_db: "Bereits in DB",
    sync_new: "Neu",
    sync_films: "Filme",
    sync_docs: "Dokus",
    sync_series: "Serien",
    sync_emissions: "Sendungen",
    sync_failed: "Nicht verarbeitet",

    // Config
    config_title: "Konfiguration",
    config_rss_films: "RSS-Feed",
    config_rss_main_label: "Haupt-Feed",
    config_rss_films_hint: "Einschließlich Ihres API-Schlüssels oder Passkeys",
    config_rss_additional_title: "Zusätzliche RSS-Feeds",
    config_rss_additional_hint: "Gleiche Funktionsweise wie der Haupt-Feed: Filme, Dokumentarfilme und Serien werden automatisch erkannt.",
    config_rss_add_btn: "➕ RSS-Feed hinzufügen",
    config_rss_remove_btn: "Entfernen",
    config_tmdb_key: "TMDB API-Schlüssel",
    config_tvdb_key: "TVDB API-Schlüssel (optional)",
    config_tvdb_hint: "Optional. Ergänzt TMDB zur Verbesserung der Dokumentarfilm-Erkennung und als Fallback für nicht gefundene Serien. Kostenloser Schlüssel auf thetvdb.com.",
    config_mal_key: "MyAnimeList Client ID (optional)",
    config_mal_hint: "Optional. Verbessert das Anime-Matching durch Abfrage des kanonischen englischen Titels bei MyAnimeList vor der TMDB-Suche. Kostenlose Client-ID auf myanimelist.net/apiconfig.",
    config_anilist_enable: "AniList aktivieren (MAL-Ergänzung, kein API-Schlüssel)",
    config_anilist_hint: "AniList wird zusammen mit MAL verwendet, um Anime-Titel zu normalisieren. Kostenlos und anonym — keine Registrierung erforderlich.",
    config_omdb_key: "OMDb API-Schlüssel (Konzerte & Aufführungen)",
    config_omdb_hint: "Wird zusammen mit TMDB verwendet, um Konzerte (Music-Genre) und Live-Aufführungen zu klassifizieren. Kostenloser Schlüssel auf omdbapi.com (1000 Anfragen/Tag).",
    config_rpdb_title: "Rating Poster DataBase aka RPDB",
    config_rpdb_enable: "Aktivieren",
    config_rpdb_examples: "Beispiele",
    config_rpdb_get_key: "Kostenlosen Schlüssel durch Kontoerstellung erhalten",
    config_rpdb_placeholder: "Ihr RPDB API-Schlüssel",
    config_proxy_title: "Proxy",
    config_proxy_enable: "Aktivieren",
    config_proxy_protocol: "Protokoll",
    config_proxy_host: "Host",
    config_proxy_port: "Port",
    config_proxy_username: "Benutzername (optional)",
    config_proxy_password: "Passwort (optional)",
    config_auto_sync_title: "Automatische Synchronisierung",
    config_auto_sync_enable: "Aktivieren",
    config_refresh_interval: "Aktualisierungsintervall (Minuten)",
    config_refresh_hint: "Minimum: 15 Minuten | Maximum: 1440 Minuten (24h) | Standard: 180 Minuten (3h)",
    config_discord_title: "Discord-Benachrichtigungen nach einer Synchronisierung",
    config_discord_enable: "Aktivieren",
    config_discord_webhook: "Webhook",
    config_discord_webhook_hint: "Webhook erstellen unter Servereinstellungen > Integrationen > Webhooks",
    config_discord_enhanced: "Die 5 letzten Ergänzungen jedes Katalogs anzeigen",
    config_discord_enhanced_hint: "Zeigt die 5 letzten Poster an",
    config_discord_rpdb: "RPDB-Poster für Discord verwenden",
    config_discord_rpdb_hint: "Erfordert einen konfigurierten RPDB API-Schlüssel",
    config_notif_lang_title: "Benachrichtigungssprache",
    config_notif_lang: "Sprache (Discord & Apprise)",
    config_notif_lang_hint: "Unabhängig von der WebUI-Sprache",
    config_apprise_title: "Apprise",
    config_apprise_enable: "Apprise-Benachrichtigungen aktivieren",
    config_apprise_server: "Apprise-Server-URL",
    config_apprise_server_hint: "z. B. http://apprise:8000 — Apprise via Docker bereitstellen (caronc/apprise)",
    config_apprise_urls: "Benachrichtigungs-URLs",
    config_apprise_urls_hint: "Kommagetrennte Apprise-URLs: ntfy://ntfy.sh/topic, tgram://token/chatid, slack://...",
    config_apprise_test: "Apprise testen",
    config_apprise_test_ok: "Benachrichtigung erfolgreich gesendet",
    config_apprise_test_fail: "Senden fehlgeschlagen",
    config_save: "Speichern",
    config_saved: "✓ Konfiguration gespeichert",
    config_error_network: "✗ Netzwerkfehler",

    // Sync section
    sync_title: "Synchronisierung",
    sync_auto_label: "Automatische Synchronisierung:",
    sync_auto_enabled: "✓ Aktiviert (alle {interval} Minuten)",
    sync_auto_disabled: "✗ Deaktiviert (nur manuelle Synchronisierung)",
    sync_start_btn: "▶️ Alle Quellen abrufen und den TMDB-Abgleich manuell starten",
    sync_in_progress: "Läuft...",
    sync_waiting: "Wartet",
    sync_progress: "Fortschritt",
    sync_matched_label: "Übereinstimmend",
    sync_unprocessed: "Nicht verarbeitet",

    // Reclassification
    reclassify_title: "🔍 Medien-Reklassifizierung",
    reclassify_desc: "Klassifiziert alle bereits indizierten Medien gemäß der aktuellen Feed-Konfiguration neu (manuelle Erzwingung + automatische URL-Erkennung). Nützlich nach Änderung der Kategorie eines Feeds.",
    reclassify_btn: "🔍 Jetzt reklassifizieren",

    // Install
    install_title: "In Stremio installieren",
    install_desc: "Sobald die erste Synchronisierung abgeschlossen ist ODER nach jeder WebUI-Änderung, das Addon in Stremio mit dieser URL (neu) installieren:",
    install_loading: "Laden...",
    install_copy: "Kopieren",
    install_copied: "URL kopiert!",
    install_copy_error: "Kopierfehler",

    // Navigation
    nav_overview: "Übersicht",
    nav_library: "Mediathek",
    nav_sources: "Quellen",
    nav_catalogs: "Kataloge",
    nav_sync: "Synchronisierung",
    nav_failures: "Fehler",
    nav_config: "Konfiguration",

    // Library
    library_search_placeholder: "Titel suchen...",
    library_all: "Alle",
    library_no_results: "Keine Ergebnisse",
    library_releases_none: "Keine Releases gespeichert",
    library_col_name: "Release-Name",
    library_col_quality: "Qualität",
    library_col_hash: "Hash",
    library_col_date: "Datum",
    lib_sort_date_desc: "Hinzugefügt ↓",
    lib_sort_date_asc: "Hinzugefügt ↑",
    lib_sort_year_desc: "Jahr ↓",
    lib_sort_year_asc: "Jahr ↑",
    lib_sort_name: "Titel A-Z",
    lib_year_all: "Alle Jahre",
    lib_releases_tab: "Releases",

    // Sources
    sources_url: "RSS-Feed",
    sources_by_cat: "Nach Kategorie",
    sources_releases: "Releases",
    sources_media: "Medien",
    sources_last_seen: "Zuletzt hinzugefügt",
    sources_errors: "Fetch",
    sources_none: "Keine Quelle erkannt — starten Sie zuerst eine Synchronisierung",
    sources_rss_title: "RSS-Quellen",
    sources_pastebin_title: "Pastebin-Quellen",
    sources_pastebin_desc: "Direkte URL, JSON-Verweis oder kategorisierter Hauptindex.",
    sources_newznab_title: "Newznab-APIs",
    sources_newznab_desc: "Fragt einen Newznab-Indexer direkt ab, ohne Prowlarr zu verwenden.",
    sources_name: "Name",
    sources_newznab_url: "API-URL",
    sources_newznab_key: "API-Schlüssel",
    sources_newznab_movie_categories: "Film-Kategorien",
    sources_newznab_series_categories: "Serien-Kategorien",
    sources_newznab_max_items: "Maximum pro Kategorie und Synchronisierung",
    sources_newznab_delay: "Verzögerung zwischen Seiten (ms)",
    sources_test: "Testen",
    sources_newznab_none: "Keine Newznab-API.",
    sources_newznab_testing: "Verbindung wird getestet…",
    sources_newznab_connection_ok: "Verbindung erfolgreich",
    sources_newznab_server_limit: "Serverlimit pro Seite:",
    sources_newznab_categories_available: "verfügbare Kategorien",
    sources_newznab_categories_short: "Kategorien",
    sources_newznab_items_per_category: "Elemente/Kategorie",
    sources_newznab_page_size: "Seite",
    sources_newznab_delete_confirm: "Diese Newznab-Quelle löschen? Bereits indexierte Medien bleiben erhalten.",
    sources_stremio_title: "Stremio-Manifeste",
    sources_stremio_desc: "Importiert Kataloge eines anderen Addons.",
    sources_name_placeholder: "Quellenname",
    sources_preview: "Vorschau",
    sources_add: "Hinzufügen",
    sources_catalog_action: "Katalog",
    sources_pause: "Pausieren",
    sources_resume: "Fortsetzen",
    sources_delete: "Löschen",
    sources_rename: "Umbenennen",
    sources_rename_prompt: "Neuer Quellenname",
    sources_rss_none: "Keine RSS-Quelle.",
    sources_pastebin_none: "Keine Pastebin-Quelle.",
    sources_stremio_none: "Kein Stremio-Manifest.",
    catalogs_create: "Katalog erstellen",
    catalogs_configured: "Konfigurierte Kataloge",
    catalogs_none: "Kein Katalog konfiguriert.",
    catalogs_name: "In Stremio angezeigter Name",
    catalogs_type: "Stremio-Typ",
    catalogs_year_filter: "Jahresfilter",
    catalogs_year_include: "Nur diese Jahre",
    catalogs_year_exclude: "Alle außer diesen Jahren",
    catalogs_years: "Jahre, durch Kommas getrennt",
    catalogs_year_min: "Mindestjahr",
    catalogs_year_max: "Höchstjahr",
    catalogs_keywords_include: "Erforderliche Wörter, durch Kommas getrennt",
    catalogs_keywords_exclude: "Ausgeschlossene Wörter, durch Kommas getrennt",
    catalogs_genres_include: "Einzuschließende Genres",
    catalogs_genres_exclude: "Auszuschließende Genres",
    catalogs_sources: "Verwendete Quellen — keine Auswahl bedeutet alle Quellen",
    catalogs_save: "Speichern",
    catalogs_cancel: "Abbrechen",
    catalogs_edit: "Bearbeiten",
    catalogs_all_years: "alle Jahre",
    catalogs_all_sources: "alle Quellen",
    catalogs_source_count: "Quelle(n)",

    // Sync extras
    sync_auto_enabled: "Aktiviert",
    sync_auto_disabled: "Deaktiviert",

    // Failed
    failed_retry_btn: "♻️ Alle wiederholen",
    failed_clear_btn: "🗑 Leeren",
    failed_none: "Keine fehlgeschlagenen Releases. 🎉",

    // Config extras
    config_save_btn: "💾 Speichern",
    config_saved_ok: "Konfiguration gespeichert",
    config_saved_err: "Fehler beim Speichern der Konfiguration",
    config_discord_title: "Discord",
    config_discord_enable: "Benachrichtigungen aktivieren",
    config_discord_webhook: "Discord Webhook URL",
    config_discord_enhanced: "Erweiterte Benachrichtigungen (Poster-Galerie)",
    config_discord_rpdb: "RPDB-Poster in Discord",

    // Proxy test
    config_proxy_test_btn: "🔌 Verbindung testen",
    config_proxy_test_ok: "Verbindung erfolgreich",
    config_proxy_test_fail: "Verbindung fehlgeschlagen",

    // Integrations
    integrations_title: "Schnellintegrationen",
    integrations_hint: "Geben Sie die Basis-URL und den API-Schlüssel ein, um RSS-Feeds automatisch zu generieren und zur Liste hinzuzufügen.",
    integrations_url_placeholder: "http://localhost:...",
    integrations_add_all: "Alle",
    integrations_add_films: "Filme",
    integrations_add_series: "Serien",
    integrations_missing_fields: "Bitte URL und API-Schlüssel eingeben.",

    // Misc
    by: "Von",
    donate: "Spendier mir ein paar Dragibus :-)",
  }
};

// Current language (default: FR)
let currentLang = 'fr';

/**
 * Get a translation by key
 */
function t(key) {
  const lang = translations[currentLang] || translations.fr;
  return lang[key] || translations.fr[key] || key;
}

/**
 * Set the active language and apply translations
 */
function setLanguage(lang) {
  if (!translations[lang]) lang = 'fr';
  currentLang = lang;
  localStorage.setItem('useflow_lang', lang);
  applyTranslations();

  // Update select if it exists
  const select = document.getElementById('langSelect');
  if (select) select.value = lang;
}

/**
 * Apply translations to all elements with data-i18n attribute
 */
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const value = t(key);
    if (value) {
      // For elements that contain HTML (like descriptions), use innerHTML
      if (el.hasAttribute('data-i18n-html')) {
        el.innerHTML = value;
      } else if (el.tagName === 'INPUT' && el.type !== 'checkbox') {
        // For inputs, set placeholder
        if (el.hasAttribute('data-i18n-placeholder')) {
          el.placeholder = value;
        }
      } else {
        el.textContent = value;
      }
    }
  });
}

/**
 * Initialize i18n - call this on page load
 */
function initI18n() {
  const saved = localStorage.getItem('useflow_lang');
  if (saved && translations[saved]) {
    currentLang = saved;
  } else {
    // Try to detect from browser
    const browserLang = navigator.language?.substring(0, 2);
    if (translations[browserLang]) {
      currentLang = browserLang;
    }
  }

  // Set select value
  const select = document.getElementById('langSelect');
  if (select) select.value = currentLang;

  applyTranslations();
}
