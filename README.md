<h1 align="center">
  <img src="src/public/logo.png" alt="Stremio RSS Catalog" width="120"><br>
  Stremio RSS Catalog
</h1>

<p align="center">
  <strong>Transformez vos flux RSS, Prowlarr et NZBHydra2 en catalogues Stremio — Films · Documentaires · Séries · Émissions TV · Animés · Concerts · Spectacles</strong>
</p>

> 🇬🇧 [English](./README.en.md) · 🇩🇪 [Deutsch](./README.de.md)

<p align="center">
  <img src="https://img.shields.io/github/actions/workflow/status/Aerya/stremio-rss-catalog/ghcr.yml?branch=main&label=build&style=flat-square" alt="Build">
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/multi--arch-amd64%20%7C%20arm64-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Multi-arch">
  <img src="https://img.shields.io/github/last-commit/Aerya/stremio-rss-catalog?style=flat-square" alt="Last commit">
  <img src="https://img.shields.io/badge/i18n-FR%20%7C%20EN%20%7C%20DE-orange?style=flat-square" alt="i18n">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Stremio-addon-purple?style=flat-square" alt="Stremio">
  <img src="https://img.shields.io/badge/RSS-compatible-F6A623?style=flat-square&logo=rss&logoColor=white" alt="RSS">
  <img src="https://img.shields.io/badge/Prowlarr-compatible-blue?style=flat-square" alt="Prowlarr">
  <img src="https://img.shields.io/badge/Jackett-Torznab-blue?style=flat-square" alt="Jackett">
  <img src="https://img.shields.io/badge/NZBHydra2-compatible-blue?style=flat-square" alt="NZBHydra2">
  <img src="https://img.shields.io/badge/TMDB%20%2B%20TVDB%20%2B%20OMDb-matched-green?style=flat-square" alt="TMDB+TVDB+OMDb">
  <img src="https://img.shields.io/badge/MyAnimeList-int%C3%A9gr%C3%A9-2E51A2?style=flat-square" alt="MAL">
  <img src="https://img.shields.io/badge/AniList-int%C3%A9gr%C3%A9-02A9FF?style=flat-square" alt="AniList">
</p>

> **Tu l'utilises ? Tu l'aimes ? [⭐ Mets une étoile !](https://github.com/Aerya/stremio-rss-catalog/stargazers)** — ça prend deux secondes.

---

> Addon Stremio auto-hébergé qui transforme les contenus réellement repérés dans
> vos propres sources **BitTorrent, Usenet, WebDAV ou autres** en catalogues
> Stremio. RSS, Pastebin, Newznab, Prowlarr, Jackett, NZBHydra2,
> WaStream/WaCustom, StreamFusion, CometNet et manifestes Stremio peuvent être
> combinés.

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

Ici, « disponible » signifie **repéré dans une source que vous avez configurée**.
L’addon ne teste pas à chaque affichage les seeders, le cache d’un débrideur ou
la validité instantanée d’un lien, et ne fournit pas lui-même les flux de lecture.

## Exemple d’installation et de statistiques

> Les noms et chiffres ci-dessous sont entièrement fictifs. Ils illustrent ce
> que la WebUI peut afficher après plusieurs synchronisations ; ils ne constituent
> ni un benchmark ni une promesse de résultat.

Une installation peut, par exemple, réunir **18 flux RSS**, **3 API
Newznab/Torznab**, **2 Pastebins**, **1 dossier WebDAV** et **1 manifeste
Stremio**. Après déduplication et matching, son tableau de bord pourrait afficher :

| Indicateur | Exemple |
|---|---:|
| Releases lues depuis les sources | 286 450 |
| Médias uniques identifiés | 74 820 |
| Matching automatique réussi | 97,8 % |
| Releases déjà connues ou dédupliquées | 201 140 |
| Releases restant à vérifier | 1 630 |
| Catalogues publiés dans le manifeste | 12 |
| Dernière synchronisation complète | 8 min 42 s |

Exemples de données traitées :

| Donnée reçue | Détection | Matching et destination |
|---|---|---|
| `Le.Film.Exemple.2026.FRENCH.1080p.WEB-DL` | Film · 2026 · 1080p · FRENCH | IMDb/TMDB → **Films 2026** |
| `La.Serie.Exemple.S02E04.MULTi.2160p` | Série · saison 2 · épisode 4 · 2160p | IMDb/TMDB → **Séries disponibles** |
| `Artiste.Exemple.Live.A.Paris.2025.FRENCH` | Concert · 2025 | TMDB + OMDb → **Concerts** |
| `Anime.Exemple.S01E08.VOSTFR.1080p` | Anime · saison 1 · épisode 8 | MAL/AniList/Kitsu/TMDB → **Animés** |

Un guide ne rend jamais disponible un média absent des sources. Ainsi, une
liste MDBList de 1 000 films peut produire un catalogue **Sélection du mois**
de 386 films si seuls ces 386 titres existent dans la médiathèque locale.
Un autre catalogue peut réunir, par exemple, **Films 2025**, **Films 2026** et
**Comédies**, puis être décomposé ultérieurement sans supprimer les catalogues
d’origine.

## Fonctionnalités

| | |
|---|---|
| **Catalogues gérés** | Les 9 catalogues historiques sont repris dans le gestionnaire et conservent leurs contenus ; créez ensuite autant de catalogues personnalisés que nécessaire |
| **Composition de catalogues** | Plusieurs catalogues du même type peuvent être réunis par union, puis séparés ultérieurement en modifiant leur composition |
| **Sources mixtes** | Un catalogue peut combiner RSS, Pastebin, WebDAV, Plex, Jellyfin, Newznab, Prowlarr, Jackett/Torznab, NZBHydra2, WaStream/WaCustom, StreamFusion et catalogues importés depuis des manifestes Stremio |
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
| **AniList** 🆕 NEW | API GraphQL AniList — normalisateur complémentaire (titres romaji + natifs) + déduplication animés, entièrement gratuit et anonyme, sans inscription |
| **Kitsu** | Fallback anime natif sans clé : un contenu reconnu reste indexable avec son identifiant `kitsu:` même s'il n'existe pas dans TMDB |
| **Addons de métadonnées Stremio** | Plusieurs fallbacks renommables, ordonnables, testables et désactivables via leur `manifest.json` de recherche, par exemple [AIOMetadata](https://github.com/cedya77/aiometadata) |
| **Concerts** 🆕 NEW | Détectés via TMDB genre 10402 (Music) + confirmation OMDb, sans genres narratifs (Drama, Action…) |
| **Spectacles** 🆕 NEW | Détectés via mots-clés titre (Stand-up, One Man Show, Théâtre, Cirque…) + confirmation OMDb |
| **OMDb** | API OMDb interrogée après chaque match TMDB pour confirmer la classification concerts et spectacles |
| **Matching TMDB** | 5 tentatives par release (FR/EN, avec/sans année, titre simplifié) |
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
| **Cache préchauffé** | Les cinq premières pages de chaque catalogue sont préparées au démarrage et après chaque invalidation post-sync |
| **RPDB** | Affiches avec notes intégrées (optionnel) |
| **PostersPlus** | Template d’affiche compatible AIOMetadata, rempli directement avec les identifiants IMDb/TMDB ; repli RPDB puis affiche d’origine |
| **Notifs Discord** 🆕 NEW | Notifications enrichies avec galerie d'affiches à chaque sync |
| **Notifs Apprise** 🆕 NEW | Notifications multi-services via serveur Apprise (optionnel) |
| **Langue des notifs** 🆕 NEW | Langue Discord/Apprise configurable indépendamment de la WebUI (FR/EN/DE) |
| **Sync auto explicite** | Collecte des sources dues selon leur fréquence → normalisation et matching → catalogues non gelés → cache Stremio invalidé |
| **WebUI moderne** | Sidebar, thème sombre/clair, multilingue FR/EN/DE |
| **Médiathèque** 🆕 NEW | Refonte : vue affiches/liste, tri, filtre année (raccourcis + saisie libre/plage), releases inline, affiches RPDB, pagination persistante |
| **Vue d'ensemble** | Derniers ajouts en tiroirs dépliables par catégorie (titre + année + lien IMDB) |
| **Migration et réparation** | Analyse en lecture seule, sauvegarde SQLite, corrections groupées, historique et migrations uniques versionnées |
| **Gestion des sources** | Onglets, recherche, groupes repliables, modification complète et fréquence propre à chaque source |
| **Suivi par source** | Dernier succès, prochaine collecte, durée, éléments du lot, rattrapage, erreurs consécutives et limite de sécurité |
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

| | |
|---|---|
| ![Médiathèque](screens/Mediatheque.png) | ![Vue d'ensemble](screens/Vue.d.Ensemble.png) |
| ![Configuration](screens/Configuration.png) | ![Échecs](screens/Echecs.png) |
| ![Sources](screens/Sources.png) | ![Synchronisation](screens/Synchronisation.png) |

![Notification Discord](screens/DiscordNotif.png)

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

Toutes les sources se configurent au même endroit, dans **Sources**. Les flux RSS
standards restent acceptés, mais Prowlarr, Jackett, Newznab et NZBHydra2 sont
désormais de vraies sources d’API paginées plutôt que de simples raccourcis RSS.

Pour Prowlarr, utilisez l’URL Torznab/Newznab d’un indexeur, par exemple
`http://prowlarr:9696/1/api`. Pour Jackett, utilisez l’endpoint Torznab copié
depuis l’interface, par exemple
`http://jackett:9117/api/v2.0/indexers/mon-indexeur/results/torznab/api`.
Ajouter chaque indexeur séparément permet de le renommer et d’identifier son
origine dans la médiathèque.

Lors de la première collecte d’un indexeur, l’addon :

1. interroge `t=caps` pour connaître les capacités et la taille maximale d’une page ;
2. appelle `t=search` par pages avec `offset` ;
3. s’arrête au plafond configuré **par catégorie** ;
4. attend le délai configuré entre les pages pour ménager l’indexeur.

La limite de sécurité peut atteindre **10 000 000** d’éléments par catégorie.
Cette valeur sert de mode quasi illimité : elle borne uniquement un lot en
mémoire, pas la taille totale indexable. Un vrai infini serait dangereux si une
source ne termine jamais sa pagination. Les pages restent limitées par le
serveur et espacées de 750 ms par défaut.

Les collectes suivantes repartent du début, puis s’arrêtent dès le curseur
mémorisé ou la fin de la fenêtre de recouvrement. Le curseur n’est validé
qu’après le traitement réussi du lot : un arrêt pendant le matching provoque
une relecture sûre, pas une perte d’éléments.

La fréquence globale sert de valeur par défaut. Chaque source peut définir sa
propre fréquence depuis **Sources**. Le planificateur vérifie les échéances
chaque minute et collecte uniquement les sources dues. Dès qu’un lot est
disponible, le traitement et l’invalidation du cache des catalogues sont
immédiats : il n’existe pas de second envoi différé vers Stremio.

## Sources Pastebin et manifestes Stremio

Les sources Pastebin acceptent :

- une page de contenu directe au format `CAT;TMDB;TITLE;...` ;
- un document JSON pointant vers un index maître ;
- un index maître utilisant des sections telles que `#FILMS`, `#SERIES` ou `#DOCUMENTAIRES`, suivies de codes ou d'URLs enfants.

Les manifestes Stremio sont ajoutés avec leur URL `manifest.json`. L'addon découvre les catalogues déclarés et les expose comme sources sélectionnables dans le gestionnaire de catalogues.

Ce mécanisme importe aussi les catalogues Films/Séries d’addons compatibles tels
que Plexio ou Stremio Jellyfin, ainsi que les catalogues anime de Kitsu.
Il ne donne pas accès à la base interne d’un addon `stream` qui
n’expose aucun catalogue : un manifeste `stream` seul, comme celui de Comet, ne
permet pas d’énumérer tous ses médias.

### CometNet : portée exacte

La source CometNet connecte Stremio RSS Catalog comme pair récepteur au WebSocket
d’un Comet ciblé. Chaque annonce valide est signée, enregistrée dans une boîte
locale persistante, filtrée par tags, puis traitée lors de la synchronisation.

CometNet fonctionne toutefois par **gossip avec fanout** : le pair reçoit les
annonces nouvelles que le réseau lui route. Le protocole déclare des types
`sync_request` et `sync_response`, mais Comet ne les implémente pas actuellement.
Il n’existe donc ni export complet de la base du pair ciblé, ni garantie
d’historique exhaustif. Une rafale après connexion peut contenir beaucoup
d’annonces en circulation sans constituer une copie certifiée de son cache.
Les pools CometNet sont des groupes de confiance qui filtrent les contributeurs :
créer une pool avec le pair ciblé ne force ni la rediffusion de son cache
existant ni un rattrapage historique.

> **À retenir :** CometNet complète progressivement la médiathèque, mais ne doit
> pas être utilisé comme source exhaustive. Pour un import initial complet,
> préférez une API paginée, un manifeste catalogue, un flux RSS ou un export de
> cache.

Une source [WaCustom](https://github.com/dydy13014/wacustom) utilise l’URL de
l’instance et son mot de passe administrateur. L’addon lit l’API WASource
paginée, conserve les identifiants et métadonnées utiles au catalogue, mais ne
copie pas les liens de lecture. Un parcours volumineux reprend à la
synchronisation suivante jusqu’à son achèvement.

Une source WebDAV pointe vers un dossier racine. L’addon parcourt ses
sous-dossiers avec `PROPFIND`, retient les extensions vidéo configurées, puis
applique le même nettoyage de titre et le même matching TMDB que pour un flux
RSS. Il n’effectue aucune lecture : installez séparément
[Davio](https://github.com/arvida42/davio) dans Stremio pour résoudre les
fichiers du même WebDAV. Les WebDAV locaux contournent le proxy global par
défaut ; son utilisation reste activable source par source.

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

Un guide ne devient jamais une nouvelle source de contenu. Il fournit une liste
ordonnée d’identifiants, puis Stremio RSS Catalog calcule son intersection avec
la médiathèque locale :

```text
liste externe ordonnée ∩ médias déjà indexés = contenu du catalogue
```

- **MDBList** : URL ou identifiant de liste, pagination jusqu’au plafond choisi ;
- **ListSync** : URL de l’instance, type et identifiant de liste ; l’endpoint
  actuel de ListSync limite une liste à 100 éléments ;
- **SuggestArr** : URL, compte local et statuts de recommandations ; le jeton JWT
  est obtenu automatiquement et les pages sont lues par lots de 100.
- **Agregarr** : URL et clé API, détection des collections puis récupération de
  leur aperçu ordonné avec les identifiants TMDB. Une collection déjà créée
  dans Plex peut aussi être sélectionnée directement dans la source Plex.

Les identifiants et mots de passe restent masqués, sont exclus des exports par
défaut et ne sont inclus qu’après confirmation explicite.

L’intégration [Agregarr](https://github.com/agregarr/agregarr) utilise son API
officielle `api/v1`, l’authentification `X-Api-Key` et les endpoints d’aperçu
asynchrone. Elle ne scrape pas l’interface HTML.

---

## Fonctionnement

### Filtrage en amont

Avant tout traitement, chaque release est filtrée par les **tags requis** configurés dans la WebUI (ex. : `FRENCH,MULTi,TRUEFRENCH`). Une release sans ces tags est ignorée immédiatement.

### Parsing des releases

Chaque titre de release est analysé pour en extraire :
- Le **nom propre** (suppression des tags : résolution, codec, langue, équipe…)
- L'**année** de sortie
- Le **type** : film ou série — avec priorité : animé > concert > spectacle > documentaire > émission > série > film
- L'**infohash** : extrait des liens magnet/torrent présents dans le flux RSS

### Détection de la catégorie

La catégorie finale résulte de trois sources combinées dans l'ordre de priorité :

1. **Force explicite par flux** — l'utilisateur configure manuellement la catégorie d'un flux (ex. : ce flux est "animés", ce flux est "concerts")
2. **Détection depuis l'URL du flux** — en mode auto, des mots-clés dans l'URL du flux RSS permettent de deviner la catégorie (`concert`, `anime`, `docu`, `serie`, `film`…)
3. **Mots-clés dans le titre de la release** — `OVA`, `STAND UP`, `CONCERT`, `LIVE AT`, `DOCU`…
4. **Genres TMDB + confirmation OMDb** — après le match TMDB, les genres de l'œuvre peuvent déclencher une reclassification

### Pipeline de matching

```
Release RSS
  → Filtre tags requis
  → Parsing (type + catégorie depuis titre + URL flux)
  → Animé détecté ?
      oui → MAL (si configuré) + AniList (si activé) → titres normalisés → TMDB → OMDb → DB
      non → TMDB (5 tentatives FR/EN) → OMDb → Reclassification genres → DB
                ↓ échec (série)
            TVDB fallback → DB
  → Échec total → failed_releases (retry manuel ou automatique)
```

**Identification des animés (MAL + AniList + Kitsu) :**

MAL, AniList et Kitsu sont combinés pour obtenir les titres canoniques avant de chercher sur TMDB. Si TMDB échoue, les addons Stremio de métadonnées configurés sont interrogés par ordre de priorité, puis l'identifiant anime natif Kitsu, MAL ou AniList est conservé. L'addon de métadonnées correspondant doit aussi être installé dans Stremio pour afficher la fiche complète.

**TMDB — 5 tentatives dans l'ordre (hors animés) :**
1. Titre exact + année, français
2. Titre exact sans année, français
3. Titre exact sans année, anglais
4. Titre simplifié (3 premiers mots) + année, anglais
5. Titre simplifié sans année, anglais

**Reclassification automatique après match TMDB :**
- Genre 99 (Documentary) sans genres contradictoires (Action/SF/Fantastique/Horreur) → **Documentaires**
- Genre 16 (Animation) + origine japonaise → **Animés** *(si source en mode auto)*
- Genres Reality/Talk/News/Soap + pas de genres contradictoires → **Émissions TV** *(si source en mode auto)*
- Genre 10402 (Music) sans genres narratifs (Drama/Comédie/Romance/Action) + OMDb confirme "Music" → **Concerts**
- Mots-clés titre stand-up/théâtre/cirque + OMDb confirme comédie non-narrative → **Spectacles**

**Hiérarchie de spécificité** — une reclassification automatique ne peut pas faire descendre une catégorie plus précise :
- Films (1) < Séries (2) < Émissions/Documentaires/Concerts/Spectacles (3) < Animés (4)

### Architecture base de données

```
media           → 1 ligne par film/série (clé : imdb_id)
releases        → N releases par média (qualité, hash, source, date)
failed_releases → releases sans match (pour retry)
```

### Cache

Les réponses catalog sont mises en cache entre les synchronisations et
invalidées automatiquement après chaque modification. Les cinq premières pages
de chaque catalogue publié sont immédiatement recalculées en arrière-plan afin
que Stremio, Nuvio ou un intermédiaire tel qu’AIOMetadata obtienne rapidement
une réponse à jour. Les réponses JSON sont compressées et disposent en plus
d’un cache HTTP revalidable de 30 secondes, réglable avec
`CATALOG_HTTP_CACHE_SECONDS` (`0` pour le désactiver, maximum `300`). Les
recherches libres ne sont pas mises en cache.

### Affiches et AIOMetadata

Chaque élément de catalogue contient déjà une URL d’affiche. L’ordre appliqué
par Stremio RSS Catalog est **PostersPlus → RPDB → affiche issue des
métadonnées → placeholder**. Cela permet un affichage direct et cohérent dans
Stremio, y compris sans addon de métadonnées supplémentaire.

Si les catalogues transitent ensuite par
[AIOMetadata](https://github.com/cedya77/aiometadata), celui-ci peut conserver
ou remplacer cette affiche selon ses propres fournisseurs d’illustrations.
Choisissez donc où gérer l’apparence finale :

- dans Stremio RSS Catalog pour fournir des catalogues déjà illustrés ;
- dans AIOMetadata pour centraliser toutes les illustrations et leur cache ;
- ou avec le même template dans les deux, en gardant à l’esprit qu’AIOMetadata
  reste libre d’appliquer sa priorité configurée.

Traiter l’affiche ici évite le travail d’illustration pour un usage direct, mais
ne désactive pas automatiquement les fournisseurs d’illustrations
d’AIOMetadata.

### Persistance

Tout est stocké dans une base SQLite (`data/addon.db`) en mode WAL. Les contenus
s'**accumulent** — une synchronisation ne remplace jamais les données existantes.
Plusieurs lectures de catalogues peuvent se dérouler pendant une écriture et
plusieurs centaines de milliers de médias restent un usage réaliste pour cette
instance mono-processus correctement indexée.

### Compatibilité des mises à niveau

La mise à niveau est conçue pour les installations existantes :

- même volume `/data` et même fichier `addon.db` ;
- même identifiant d’addon `community.useflowfr.catalog` ;
- mêmes URLs `manifest.json` et `catalog/...` ;
- mêmes identifiants pour les neuf catalogues historiques ;
- paramètres, médias et releases existants conservés ;
- nouvelles tables, colonnes, index et valeurs par défaut ajoutés par migrations
  idempotentes au démarrage.

Il n’est donc pas nécessaire de supprimer puis réinstaller l’addon dans Stremio.
Une sauvegarde du volume `/data` reste recommandée avant toute mise à niveau,
comme pour toute migration de base de données.

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

La section avancée **Configuration → Migration et réparation** remplace les
anciens boutons de reclassement :

1. **Analyser la médiathèque** effectue un diagnostic en lecture seule et affiche
   le nombre de corrections proposées par catégorie.
2. **Sauvegarder puis appliquer** crée d’abord une copie SQLite dans
   `/data/backups`, puis applique les corrections locales.
3. La vérification des animations via TMDB est facultative, car elle nécessite
   un appel distant par candidat et peut durer plusieurs minutes.
4. Chaque opération est enregistrée avec son état, son résultat et le nom de la
   sauvegarde.

La reclassification selon les règles de sources reste une action séparée et
manuelle, car elle peut déplacer une grande partie de la médiathèque. Aucun cron
de correction destructive n’est créé. Les migrations introduites par de futures
versions sont numérotées, sauvegardées si nécessaire et exécutées une seule fois.

---

## Connexion WebUI

- **Identifiants** : définis dans le `docker-compose.yml`
- **Session secret** : générer avec `openssl rand -hex 32`

---

## Migration depuis UseFlow-FR

Vous utilisez l'[ancienne version (UseFlow-FR)](https://github.com/Aerya/UseFlow-FR) ? La migration est transparente — votre base de données est entièrement compatible.

**1. Arrêter l'ancien conteneur**
```bash
docker compose down
```

**2. Mettre à jour le `docker-compose.yml`**

```yaml
# Avant
image: ghcr.io/aerya/useflow-fr:latest

# Après
image: ghcr.io/aerya/stremio-rss-catalog:latest
```

> Le chemin du volume (`/data`) et la variable `DB_PATH` ne changent pas.

**3. Démarrer le nouveau conteneur**
```bash
docker compose up -d
```

La migration de la base de données s'effectue automatiquement si nécessaire. Toute votre configuration existante est conservée.

**4. (Optionnel) Configurer les nouvelles fonctionnalités**

- **Clé API TVDB** — améliore la détection des docu-séries (gratuit sur [thetvdb.com](https://thetvdb.com))
- **Client ID MAL** — améliore le matching des animés (gratuit sur [myanimelist.net/apiconfig](https://myanimelist.net/apiconfig))
- **AniList** — activé par défaut, aucune clé requise
- **Kitsu** — activé par défaut, aucune clé requise
- **Addon de métadonnées Stremio** — fallback optionnel via l'URL configurée d'un `manifest.json`, par exemple AIOMetadata
- **Clé API OMDb** — active la détection des concerts et spectacles (gratuit sur [omdbapi.com](https://www.omdbapi.com/apikey.aspx), 1000 req/jour)

**5. Réinstaller l'addon dans Stremio** si vous avez changé de port.

---

## Notes

- La 1ère synchronisation peut prendre plusieurs minutes selon la taille du flux RSS — à faire **avant** d'installer l'addon dans Stremio
- Les catalogues sont paginés par pages de 100 médias — Stremio les charge au fil du scroll, sans limite
- Les identifiants IMDb sont privilégiés ; les identifiants anime natifs pris en charge restent possibles
- La détection concerts et spectacles nécessite une clé OMDb (gratuite, 1000 req/jour sur omdbapi.com)
- AniList est activé par défaut et ne nécessite aucune clé — il peut être désactivé dans la config
- Les médias déjà indexés avant l'ajout des nouvelles catégories restent dans leur ancienne catégorie — utilisez l’analyse puis la réparation groupée

### Limites inhérentes aux APIs tierces

Toute la classification repose sur des bases de données communautaires et des APIs tierces — **IMDB**, **TMDB**, **OMDb**, **TVDB**, **MyAnimeList** et **AniList**. Ces sources sont imparfaites par nature :

- Un média peut être **absent** d'une ou plusieurs bases et rester non matché (il atterrit alors dans `failed_releases`)
- Les **genres et métadonnées** sont saisis par la communauté : un documentaire peut ne pas avoir le genre 99, un animé peut manquer le genre 16, un concert peut être tagué comme film dramatique
- La **langue d'origine** (utilisée pour la détection des animés) peut être manquante ou incorrecte dans TMDB
- OMDb peut renvoyer des genres différents de TMDB pour le même titre, ou ne pas avoir la fiche du tout
- MAL et AniList peuvent retourner des titres anglais différents pour le même animé, ou ne pas avoir l'œuvre du tout
- Un **mauvais match TMDB** (homonyme, titre approximatif) peut entraîner une classification incorrecte
- Les concerts filmés, les spectacles télévisés et les documentaires musicaux partagent des caractéristiques proches — des **faux positifs ou faux négatifs** sont possibles dans ces catégories

Les outils de maintenance (reclassification manuelle, correction des faux positifs) et le changement de catégorie depuis le panneau détail permettent de corriger manuellement les cas problématiques.

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
