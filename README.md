<h1 align="center">
  <img src="src/public/logo.png" alt="Stremio RSS Catalog" width="120"><br>
  Stremio RSS Catalog
</h1>

<p align="center">
  <strong>Créez des catalogues Stremio à partir des contenus réellement disponibles dans vos propres sources</strong>
</p>

> 🇬🇧 [English](./README.en.md) · 🇩🇪 [Deutsch](./README.de.md)

<p align="center">
  <img src="https://img.shields.io/github/actions/workflow/status/Aerya/stremio-rss-catalog/ghcr.yml?branch=main&label=build&style=flat-square" alt="Build">
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/multi--arch-amd64%20%7C%20arm64-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Multi-arch">
  <img src="https://img.shields.io/badge/i18n-FR%20%7C%20EN%20%7C%20DE-orange?style=flat-square" alt="i18n">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Stremio-addon-purple?style=flat-square" alt="Stremio">
  <img src="https://img.shields.io/badge/TMDB%20%2B%20TVDB%20%2B%20OMDb-matched-green?style=flat-square" alt="TMDB+TVDB+OMDb">
  <img src="https://img.shields.io/badge/MyAnimeList-int%C3%A9gr%C3%A9-2E51A2?style=flat-square" alt="MAL">
  <img src="https://img.shields.io/badge/AniList-int%C3%A9gr%C3%A9-02A9FF?style=flat-square" alt="AniList">
</p>

> **Tu l'utilises ? Tu l'aimes ? [⭐ Mets une étoile !](https://github.com/Aerya/stremio-rss-catalog/stargazers)** — ça prend deux secondes.

---

> Addon auto-hébergé qui identifie, déduplique et classe les médias trouvés dans
> vos **flux RSS**, **Pastebins**, **dossiers WebDAV**, **bibliothèques et
> collections Plex/Jellyfin**, **API Newznab/Torznab directes ou fournies par
> Prowlarr, Jackett et NZBHydra2**, **addons de flux Stremio WaStream/WaCustom
> et StreamFusion**, **annonces CometNet**, ainsi que dans les **catalogues
> exposés par les manifestes d’autres addons Stremio**. Toutes ces sources
> BitTorrent, Usenet ou média peuvent être combinées dans vos catalogues.

---

## Le principe : partir de ce qui est disponible chez vous

Stremio RSS Catalog n’est pas un générateur de listes théoriques. Il collecte vos
sources, identifie et déduplique les médias qu’elles annoncent, puis construit une
médiathèque locale. Les catalogues sont créés à partir de cette médiathèque.

Les guides MDBList, ListSync, SuggestArr ou Agregarr servent uniquement à
**sélectionner et ordonner** ces médias : un titre absent de vos sources reste
absent du catalogue final. Vous pouvez ainsi afficher dans Stremio des tendances,
sélections ou collections composées uniquement de contenus réellement indexés
dans votre propre écosystème.

Ici, « disponible » signifie **repéré dans une source configurée** : l’addon ne
vérifie pas en temps réel les seeders, le cache d’un débrideur ou un lien de
lecture, et ne fournit pas lui-même de streams.

> **Mise à jour sans breaking change :** mettez à jour l’image Docker et
> recréez le conteneur en conservant le même volume `/data`. La configuration,
> la base, les médias, les releases, l’identifiant de l’addon et les URLs
> Stremio existants sont conservés. Une sauvegarde SQLite est créée
> automatiquement avant toute migration de schéma.

## Fonctionnalités

| | |
|---|---|
| **Types de catalogues** | Films, documentaires (films), documentaires (séries), séries, émissions TV, animés (films), animés (séries), concerts et spectacles, plus un nombre illimité de catalogues personnalisés |
| **Composition de catalogues** | Plusieurs catalogues du même type peuvent être réunis par union, puis séparés ultérieurement en modifiant leur composition |
| **Sources mixtes** | Un catalogue peut combiner RSS, Pastebin, WebDAV, Plex, Jellyfin, Newznab, Prowlarr, Jackett/Torznab, NZBHydra2, WaStream/WaCustom, StreamFusion, CometNet et catalogues importés depuis des manifestes Stremio |
| **Plex et Jellyfin directs** | Détection des bibliothèques et collections, import paginé des films/séries et conservation des identifiants IMDb/TMDB |
| **Dossiers WebDAV** | Parcours récursif authentifié, filtrage des extensions, profondeur et plafond configurables ; les noms de fichiers alimentent les catalogues et [Davio](https://github.com/arvida42/davio) peut assurer leur lecture dans Stremio |
| **Filtres personnalisés** | Années incluses ou exclues, plage d'années, genres requis/exclus, mots-clés requis/exclus et sélection des sources |
| **Deux pauses distinctes** | Gel des nouveaux contenus indépendamment de la visibilité du catalogue dans le manifeste Stremio |
| **Pastebins imbriqués** | Pages directes, pointeurs JSON et index maîtres catégorisés avec récursion bornée, déduplication et protection des hôtes découverts |
| **Manifestes Stremio** | Découverte générique des catalogues d'un autre addon et import de leurs contenus |
| **Anime natif** | Conservation du type `anime` et des identifiants Kitsu/MAL/AniList/AniDB sans conversion silencieuse en film |
| **Guides de catalogues** | MDBList, ListSync, SuggestArr et Agregarr fournissent une sélection et un ordre ; seuls les médias déjà indexés localement sont exposés |
| **Test à blanc** | Compte exact des médias qui alimenteraient un catalogue avant sa création |
| **Historique du manifeste** | Révisions et événements de création, renommage, gel, visibilité et suppression des catalogues |
| **Détection automatique** | Catégorie identifiée depuis le nom de release, l'URL du flux ou les genres TMDB/OMDb |
| **Détection par URL de flux** | La catégorie est devinée automatiquement depuis les mots-clés dans l'URL du flux RSS (`concert`, `anime`, `docu`, `serie`…) |
| **Animés** | Détectés via TMDB genre 16 + origine japonaise, OVA/OAV dans le titre, ou forcé par flux |
| **MAL** | MyAnimeList API v2 — normalisateur de titre EN pour améliorer le match TMDB des animés (optionnel, clé gratuite) |
| **AniList** | API GraphQL AniList — normalisateur complémentaire (titres romaji + natifs) + déduplication animés, entièrement gratuit et anonyme, sans inscription |
| **Kitsu** | Fallback anime natif sans clé : un contenu reconnu reste indexable avec son identifiant `kitsu:` même s'il n'existe pas dans TMDB |
| **Addons de métadonnées Stremio** | Plusieurs fallbacks renommables, ordonnables, testables et désactivables via leur `manifest.json` de recherche, par exemple [AIOMetadata](https://github.com/cedya77/aiometadata) |
| **Concerts** | Détectés via TMDB genre 10402 (Music) + confirmation OMDb, sans genres narratifs (Drama, Action…) |
| **Spectacles** | Détectés via mots-clés titre (Stand-up, One Man Show, Théâtre, Cirque…) + confirmation OMDb |
| **OMDb** | API OMDb interrogée après chaque match TMDB pour confirmer la classification concerts et spectacles |
| **Matching automatique** | Parsing PTT/Parsett avec repli interne, comparaison multi-candidats TMDB, variantes de titres et correction automatique film/série |
| **Fallback TVDB** | Fallback pour séries non trouvées sur TMDB + confirmation documentaires (optionnel) |
| **Docu-séries** | Détectées via genre TMDB 99 ou TVDB, placées en Documentaires (séries) |
| **Émissions TV** | Catalogue dédié — auto via genres TMDB Reality/Talk/News/Soap ou forcé par flux |
| **Protection faux positifs** | Genres contradictoires désactivent la détection documentaire (Action, SF, Fantastique, Horreur), émission (SF, Fantastique, Animation) et concert (Drama, Comédie, Romance) |
| **Hiérarchie de spécificité** | La reclassification automatique ne peut jamais dégrader une catégorie précise — animés (4) > docs/émissions/concerts/spectacles (3) > séries (2) > films (1) |
| **Changement de catégorie manuel** | Depuis le panneau détail d'un média dans la médiathèque |
| **Override manuel releases** | Forcer IMDB/TMDB/TVDB ID sur une release en échec directement dans la WebUI |
| **Déduplication** | Par IMDB ID (médias) + par GUID RSS + par hash torrent quand disponible (releases) |
| **Hashes** | Extraction automatique de l'infohash magnet/torrent |
| **Retry** | Releases non matchées conservées et relançables |
| **Fraîcheur** | `last_seen_at`, expiration facultative, masquage après plusieurs scans exhaustifs sans retrouver une release et restauration si elle réapparaît |
| **Cache préchauffé** | Les cinq premières pages de chaque catalogue sont préparées au démarrage et après chaque invalidation post-sync |
| **Cache d’affiches** | Proxy/cache local facultatif des fichiers image avec TTL, taille maximale, rafraîchissement et éviction |
| **RPDB** | Affiches avec notes intégrées (optionnel) |
| **PostersPlus** | Template d’affiche compatible AIOMetadata, rempli directement avec les identifiants IMDb/TMDB ; repli RPDB puis affiche d’origine |
| **Notifs Discord** | Notifications enrichies avec galerie d'affiches à chaque sync |
| **Notifs Apprise** | Notifications multi-services via serveur Apprise (optionnel) |
| **Langue des notifs** | Langue Discord/Apprise configurable indépendamment de la WebUI (FR/EN/DE) |
| **Sync auto explicite** | Collecte des sources dues selon leur fréquence → normalisation et matching → catalogues non gelés → cache Stremio invalidé |
| **WebUI moderne** | Sidebar, thème sombre/clair, multilingue FR/EN/DE |
| **Médiathèque** | Refonte : vue affiches/liste, tri, filtre année (raccourcis + saisie libre/plage), releases inline, affiches RPDB, pagination persistante |
| **Vue d'ensemble** | Derniers ajouts en tiroirs dépliables par catégorie (titre + année + lien IMDB) |
| **Migration et réparation** | Analyse en lecture seule, corrections groupées, historique, migrations versionnées et sauvegarde SQLite automatique avant changement de schéma |
| **Gestion des sources** | Onglets, recherche, groupes repliables, modification complète et fréquence propre à chaque source |
| **Suivi par source** | Dernier succès, prochaine collecte, durée, éléments du lot, rattrapage, erreurs consécutives et limite de sécurité |
| **Sonde de disponibilité** | Vérification légère configurable entre les collectes, sans import de contenu ni déplacement du curseur ; les alertes peuvent arriver avant la prochaine collecte |
| **API d’indexeurs** | Sources multiples et renommables Newznab, Prowlarr, Jackett/Torznab et NZBHydra2, avec pagination, curseur incrémental, limite de lot et délai configurables |
| **WaStream/WaCustom** | Plusieurs instances renommables ; import paginé des contenus WASource avec IMDb/TMDB, reprise prioritaire du parcours, fréquence, pause et limite de lot propres |
| **StreamFusion Reborn** | Plusieurs instances renommables ; import signé et chiffré du cache privé via l’API Peer officielle, pagination et curseur incrémental sans accès direct aux bases |
| **CometNet** | Source d’appoint non exhaustive : pair récepteur signé et persistant pour les nouvelles annonces gossip qui lui sont routées, sans import garanti de l’historique |
| **Sauvegarde de configuration** | Export/import versionné ; clés et URLs sensibles exclues sauf demande explicite |
| **Proxy** | HTTP / HTTPS / SOCKS4 / SOCKS5 + test de connexion intégré |
| **SQLite WAL** | Données persistantes, lectures concurrentes, index optimisés, contraintes étrangères et attente en cas d’écriture occupée |
| **Filtrage par tags** | Tags requis configurables depuis la WebUI (FRENCH, MULTi, 1080p…) |
| **Docker** | Image multi-arch `linux/amd64` + `linux/arm64` |

> Par défaut limité aux contenus disponibles en VF (FRENCH / MULTi / TRUEFRENCH / VOF / VFF / VFI / VFQ) — modifiable depuis la WebUI

---

## Captures d'écran

Captures de la nouvelle interface à venir.

---

## Démarrage rapide

Copier ou créer [le docker-compose.yml](./docker-compose.yml) :

```yaml
services:
  stremio-rss-catalog:
    image: ghcr.io/aerya/stremio-rss-catalog:latest
    container_name: stremio-rss-catalog
    restart: always
    ports:
      - "7973:7000"
    volumes:
    # À adapter à votre configuration : /chemin/vers/vos/données/:/data
      - /chemin/vers/stremio-rss-catalog/:/data
    environment:
      - PORT=7000
      - NODE_ENV=production
      - TZ=Europe/Paris
      # Cache HTTP court des catalogues (0 pour le désactiver)
      - CATALOG_HTTP_CACHE_SECONDS=30
      # À modifier
      - WEBUI_USERNAME=admin
      - WEBUI_PASSWORD=admin
      # Ne pas modifier
      - DB_PATH=/data/addon.db
      # Générer avec : openssl rand -hex 32
      - SESSION_SECRET=changeme
```

Puis ouvrir la WebUI sur `http://localhost:7973` :

1. Ajouter les sources dans **Sources** : RSS, Pastebin, WebDAV, Newznab, Prowlarr, Jackett, NZBHydra2, WaCustom ou manifeste Stremio.
2. Ouvrir **Catalogues** pour gérer les catalogues historiques, créer des catalogues à sources uniques ou mixtes et, si besoin, leur appliquer un guide MDBList, ListSync ou SuggestArr.
3. Configurer la clé TMDB si des sources RSS ou Pastebin sont utilisées.
4. Lancer une première synchronisation, puis installer l'addon dans Stremio avec l'URL fournie.

> **`TZ=Europe/Paris`** est recommandé pour un affichage correct des dates dans la WebUI et un regroupement juste de l'historique des syncs.

---

## Sources de contenu

Tout se configure dans **Sources** :

| Source | Collecte |
|---|---|
| RSS | Flux standards, catégorie automatique ou forcée |
| Pastebin | Page directe, pointeur JSON ou index maître catégorisé et récursif |
| Newznab/Torznab | API directe ou issue de Prowlarr, Jackett ou NZBHydra2 |
| WebDAV | Parcours récursif des fichiers vidéo ; lecture possible avec [Davio](https://github.com/arvida42/davio) |
| Plex/Jellyfin | Bibliothèques et collections films/séries |
| WaStream/WaCustom | API WASource paginée |
| StreamFusion Reborn | API Peer signée et chiffrée |
| CometNet | Nouvelles annonces gossip reçues par un pair persistant |
| Manifeste Stremio | Catalogues `movie`, `series` ou `anime` déclarés par un autre addon |

Les API paginées utilisent capacités, curseur incrémental et délai configurable.
La limite de sécurité, jusqu’à **10 000 000** par catégorie, borne un lot et non
la médiathèque cumulée. Chaque source peut avoir sa fréquence ; le planificateur
vérifie les échéances chaque minute.

Un manifeste `stream` sans ressource `catalog` ne peut pas énumérer ses médias
et n’est donc pas une source importable. Les Pastebins peuvent déclarer leur
contenu déjà conforme aux tags requis lorsque leurs titres ne portent pas les
marqueurs de langue.

### CometNet : portée exacte

CometNet reçoit uniquement les nouvelles annonces que le fanout lui route.
`sync_request` et `sync_response` ne sont pas implémentés par Comet : aucune
pool ne garantit la copie du cache ni le rattrapage historique. Utilisez-le
comme complément, pas comme inventaire exhaustif.

### Alertes et sonde de disponibilité

Les alertes comptent les échecs consécutifs de chaque collecte. La **sonde légère**
optionnelle vérifie aussi périodiquement que l’URL d’une source répond, sans lire
son catalogue, importer de contenu ou modifier son curseur. Elle permet donc
d’être averti d’une panne avant la prochaine collecte prévue. Les erreurs de sonde
sont conservées séparément des erreurs de collecte et reprennent le même seuil par
source ; CometNet est vérifié par l’état de sa connexion persistante.

La page **Sources** masque les URLs et clés sensibles dans les cartes. Leur
révélation ou leur copie exige une action explicite. L’export de configuration
fonctionne de la même façon : sans secrets par défaut, avec confirmation
spécifique pour les inclure. Une sauvegarde SQLite précède tout import.

> L’URL `manifest.json` ne change jamais. Les contenus des catalogues déjà connus
> sont dynamiques. En revanche, Stremio conserve le manifeste dans le profil :
> après création, suppression, renommage ou changement de visibilité, utilisez
> **Installer / mettre à niveau** pour actualiser ce manifeste sans désinstaller
> l’addon.

## Guides de catalogues

Un guide fournit un ordre, jamais de nouveaux médias :

```text
liste externe ordonnée ∩ médias déjà indexés = contenu du catalogue
```

- **MDBList** : listes paginées ;
- **ListSync** : listes exposées par l’instance ;
- **SuggestArr** : recommandations authentifiées ;
- **Agregarr** : collections via l’API officielle `api/v1` ;
- **Plex** : collections déjà présentes sur le serveur.

URLs, clés et mots de passe sont masqués et exclus des exports par défaut.

---

## Fonctionnement

```text
source → tags requis → parsing PTT/Parsett → détection du type et de la catégorie
       → matching TMDB/TVDB/OMDb ou MAL/AniList/Kitsu
       → déduplication → médiathèque SQLite → catalogues → cache Stremio
```

Les **tags requis** filtrent les contenus de toutes les sources avant parsing et
matching. Le parseur extrait titre, année, saison/épisode, qualité, langue,
équipe et infohash. La catégorie vient de la règle de source, de l’URL, du
titre puis des métadonnées ; les genres contradictoires limitent les faux
positifs. Les échecs restent relançables et les correspondances peuvent être
corrigées manuellement.

MAL, AniList et Kitsu normalisent les animés ; TMDB, TVDB et OMDb identifient et
reclassent films, séries, documentaires, émissions, concerts et spectacles.
Les addons de métadonnées Stremio configurés servent de fallbacks ordonnés.

### Données et cache

```text
media           → 1 ligne par film/série (clé : imdb_id)
releases        → N releases par média (qualité, hash, source, date)
failed_releases → releases sans match (pour retry)
```

SQLite fonctionne en WAL pour permettre les lectures pendant les écritures.
Les catalogues sont compressés, mis en cache et préchauffés après chaque
modification. `CATALOG_HTTP_CACHE_SECONDS` règle le cache HTTP (`30` par défaut,
`0` pour le désactiver). Le proxy/cache d’affiches facultatif possède son propre
TTL et sa propre limite de taille.

### Affiches et AIOMetadata

Ordre : **PostersPlus → RPDB → métadonnées → placeholder**. Si
[AIOMetadata](https://github.com/cedya77/aiometadata) est aussi utilisé,
choisissez lequel des deux doit faire autorité : AIOMetadata peut conserver ou
remplacer l’affiche déjà fournie par ce catalogue.

### Périmètre

Ce projet reste volontairement un addon de **catalogues**, sans fonction de
lecture de flux. Le chemin recommandé est :

```text
Stremio RSS Catalog → catalogues
AIOMetadata          → métadonnées et illustrations
AIOStreams           → agrégation des addons de streams
Stremio / Nuvio      → clients
```

---

## Migration et réparation

**Configuration → Migration et réparation** analyse sans écrire, sauvegarde
SQLite dans `/data/backups`, applique les corrections choisies et conserve leur
historique. Les reclassements restent manuels ; les migrations de schéma sont
versionnées, précédées d’une sauvegarde et exécutées une seule fois.

---

## Connexion WebUI

- **Identifiants** : définis dans le `docker-compose.yml`
- **Session secret** : générer avec `openssl rand -hex 32`

---

## Migration depuis UseFlow-FR

Vous utilisez l'[ancienne version (UseFlow-FR)](https://github.com/Aerya/UseFlow-FR) ? La migration est transparente — votre base de données est entièrement compatible.

```bash
docker compose down
```

```yaml
image: ghcr.io/aerya/stremio-rss-catalog:latest
```

```bash
docker compose up -d
```

Conservez le volume `/data` et `DB_PATH`. La base et la configuration sont
migrées automatiquement. Une réinstallation Stremio n’est nécessaire que si
l’URL de l’addon change.

---

## Notes

- Faites la première synchronisation avant d’installer l’addon dans Stremio.
- Les catalogues sont paginés par 100 médias et chargés au fil du défilement.
- IMDb est privilégié ; les identifiants anime natifs restent acceptés.
- OMDb améliore concerts/spectacles ; AniList et Kitsu fonctionnent sans clé.
- Utilisez la réparation groupée pour reclasser les médias déjà indexés.

### Limites inhérentes aux APIs tierces

IMDb, TMDB, OMDb, TVDB, MAL, AniList et Kitsu sont des bases tierces
imparfaites : œuvres absentes, métadonnées incomplètes, homonymes et catégories
proches peuvent produire des échecs ou faux positifs. Les échecs, overrides,
changements de catégorie et outils de réparation permettent les corrections.

---

## Crédits

- Successeur de [UseFlow-FR](https://github.com/Aerya/UseFlow-FR) — base de code historique, base de données compatible
- Bâti sur le [Stremio Addon SDK](https://github.com/Stremio/stremio-addon-sdk)
- Métadonnées : [TMDB](https://www.themoviedb.org/), [TVDB](https://thetvdb.com/), [OMDb](https://www.omdbapi.com/), [MyAnimeList](https://myanimelist.net/), [AniList](https://anilist.co/), [Kitsu](https://kitsu.io/) et [AIOMetadata](https://github.com/cedya77/aiometadata)
- Intégrations : [Prowlarr](https://prowlarr.com/), [NZBHydra2](https://github.com/theotherp/nzbhydra2), [Comet](https://github.com/g0ldyy/comet), [PostersPlus](https://github.com/UmbraProjects/PostersPlus), [Apprise](https://github.com/caronc/apprise) et [RPDB](https://ratingposterdb.com/)

---

## Licence

[GNU GPL v3](./LICENSE) — Merci de citer la source.

**Bon streaming**
