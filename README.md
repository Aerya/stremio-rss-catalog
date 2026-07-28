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

> Addon Stremio auto-hébergé qui crée des catalogues à partir des contenus trouvés sur vos propres indexeurs **BitTorrent, Usenet ou autres**. L’objectif est que les sources de vos catalogues correspondent aux sources réellement utilisées par vos addons de stream. RSS, Pastebin, Newznab, Prowlarr, Jackett, NZBHydra2 et manifestes Stremio peuvent être combinés.

---

## Fonctionnalités

| | |
|---|---|
| **Catalogues gérés** | Les 9 catalogues historiques sont repris dans le gestionnaire et conservent leurs contenus ; créez ensuite autant de catalogues personnalisés que nécessaire |
| **Sources mixtes** | Un catalogue peut combiner RSS, Pastebin, Newznab, Prowlarr, Jackett/Torznab, NZBHydra2 et catalogues importés depuis des manifestes Stremio |
| **Filtres personnalisés** | Années incluses ou exclues, plage d'années, genres requis/exclus, mots-clés requis/exclus et sélection des sources |
| **Deux pauses distinctes** | Gel des nouveaux contenus indépendamment de la visibilité du catalogue dans le manifeste Stremio |
| **Pastebins imbriqués** | Pages directes, pointeurs JSON et index maîtres catégorisés avec récursion bornée, déduplication et protection des hôtes découverts |
| **Manifestes Stremio** | Découverte générique des catalogues d'un autre addon et import de leurs contenus |
| **Détection automatique** | Catégorie identifiée depuis le nom de release, l'URL du flux ou les genres TMDB/OMDb |
| **Détection par URL de flux** | La catégorie est devinée automatiquement depuis les mots-clés dans l'URL du flux RSS (`concert`, `anime`, `docu`, `serie`…) |
| **Animés** | Détectés via TMDB genre 16 + origine japonaise, OVA/OAV dans le titre, ou forcé par flux |
| **MAL** | MyAnimeList API v2 — normalisateur de titre EN pour améliorer le match TMDB des animés (optionnel, clé gratuite) |
| **AniList** 🆕 NEW | API GraphQL AniList — normalisateur complémentaire (titres romaji + natifs) + déduplication animés, entièrement gratuit et anonyme, sans inscription |
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
| **Cache** | Réponses catalog mises en cache, invalidation automatique post-sync |
| **RPDB** | Affiches avec notes intégrées (optionnel) |
| **Notifs Discord** 🆕 NEW | Notifications enrichies avec galerie d'affiches à chaque sync |
| **Notifs Apprise** 🆕 NEW | Notifications multi-services via serveur Apprise (optionnel) |
| **Langue des notifs** 🆕 NEW | Langue Discord/Apprise configurable indépendamment de la WebUI (FR/EN/DE) |
| **Sync auto explicite** | Sources actives → normalisation et matching → médiathèque → catalogues non gelés → contenu servi à Stremio |
| **WebUI moderne** | Sidebar, thème sombre/clair, multilingue FR/EN/DE |
| **Médiathèque** 🆕 NEW | Refonte : vue affiches/liste, tri, filtre année (raccourcis + saisie libre/plage), releases inline, affiches RPDB, pagination persistante |
| **Vue d'ensemble** | Derniers ajouts en tiroirs dépliables par catégorie (titre + année + lien IMDB) |
| **Suite de maintenance** | 8 actions de reclassification en base (animés, documentaires, faux docs, fausses émissions, concerts, faux concerts, spectacles, config flux) |
| **Sources** | Stats par flux RSS avec nommage personnalisé |
| **API d’indexeurs** | Sources multiples et renommables Newznab, Prowlarr, Jackett/Torznab et NZBHydra2, avec pagination, plafond et délai configurables |
| **Proxy** | HTTP / HTTPS / SOCKS4 / SOCKS5 + test de connexion intégré |
| **SQLite** | Données persistantes, contenu incrémental, index optimisés |
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
      - /home/aerya/docker/stremio-rss-catalog/:/data
    environment:
      - PORT=7000
      - NODE_ENV=production
      - TZ=Europe/Paris
      # À modifier
      - WEBUI_USERNAME=admin
      - WEBUI_PASSWORD=admin
      # Ne pas modifier
      - DB_PATH=/data/addon.db
      # Générer avec : openssl rand -hex 32
      - SESSION_SECRET=changeme
```

Puis ouvrir la WebUI sur `http://localhost:7973` :

1. Ajouter les sources dans **Sources** : RSS, Pastebin, Newznab, Prowlarr, Jackett, NZBHydra2 ou manifeste Stremio.
2. Ouvrir **Catalogues** pour gérer les catalogues historiques ou en créer de nouveaux avec des sources uniques ou mixtes.
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

À chaque synchronisation, l’addon :

1. interroge `t=caps` pour connaître les capacités et la taille maximale d’une page ;
2. appelle `t=search` par pages avec `offset` ;
3. s’arrête au plafond configuré **par catégorie et par synchronisation** ;
4. attend le délai configuré entre les pages pour ménager l’indexeur.

Par défaut, le plafond est de 1 000 résultats par catégorie, avec des pages
limitées par le serveur et 750 ms entre deux pages.

## Sources Pastebin et manifestes Stremio

Les sources Pastebin acceptent :

- une page de contenu directe au format `CAT;TMDB;TITLE;...` ;
- un document JSON pointant vers un index maître ;
- un index maître utilisant des sections telles que `#FILMS`, `#SERIES` ou `#DOCUMENTAIRES`, suivies de codes ou d'URLs enfants.

Les manifestes Stremio sont ajoutés avec leur URL `manifest.json`. L'addon découvre les catalogues déclarés et les expose comme sources sélectionnables dans le gestionnaire de catalogues.

> L’URL `manifest.json` ne change jamais. Les contenus des catalogues déjà connus
> sont dynamiques. En revanche, Stremio conserve le manifeste dans le profil :
> après création, suppression, renommage ou changement de visibilité, utilisez
> **Installer / mettre à niveau** pour actualiser ce manifeste sans désinstaller
> l’addon.

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

**Normalisation du titre animé (MAL + AniList) :**

MAL et AniList sont utilisés en combinaison pour obtenir le titre anglais canonique avant de chercher sur TMDB. MAL est prioritaire quand une clé est configurée, AniList intervient en complément (ou seul si MAL n'est pas configuré). Les tentatives TMDB sont construites à partir des titres des deux sources, dédupliqués et ordonnés par pertinence (titre EN, romaji, natif, cleanName de fallback).

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

Les réponses catalog sont mises en cache entre les syncs et invalidées automatiquement à chaque sync réussie. Les recherches ne sont pas mises en cache.

### Persistance

Tout est stocké dans une base SQLite (`data/addon.db`). Les contenus s'**accumulent** — une sync ne remplace jamais les données existantes.

---

## Suite de maintenance

Depuis la section **Configuration → Maintenance** de la WebUI, 8 actions sont disponibles :

| Action | Description |
|---|---|
| Reclassifier les animés | Détecte films/séries avec genre Animation TMDB + origine japonaise. Nécessite une clé TMDB. |
| Reclassifier les documentaires | Détecte médias avec genre 99 TMDB déjà stocké. Sans appel API. |
| Corriger les faux documentaires | Retire de Documentaires les médias avec genres contradictoires (Action, SF…). Sans appel API. |
| Corriger les fausses émissions | Retire d'Émissions les séries avec genres incompatibles (SF, Animation…). Sans appel API. |
| Reclassifier les concerts | Détecte médias avec genre Music TMDB (10402) sans genres narratifs. Sans appel API. |
| Corriger les faux concerts | Retire de Concerts les médias avec genres narratifs (Drama, Action…). Sans appel API. |
| Reclassifier les spectacles | Détecte médias avec mots-clés spectacle dans le titre (Stand-up, Théâtre, Cirque…). Sans appel API. |
| Reclassifier par config flux | Reclassifie selon la force configurée + détection URL flux. Respecte la hiérarchie de spécificité. Sans appel API. |

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
- **Clé API OMDb** — active la détection des concerts et spectacles (gratuit sur [omdbapi.com](https://www.omdbapi.com/apikey.aspx), 1000 req/jour)

**5. Réinstaller l'addon dans Stremio** si vous avez changé de port.

---

## Notes

- La 1ère synchronisation peut prendre plusieurs minutes selon la taille du flux RSS — à faire **avant** d'installer l'addon dans Stremio
- Les catalogues sont paginés par pages de 100 médias — Stremio les charge au fil du scroll, sans limite
- Seuls les contenus avec un ID IMDB valide sont indexés — Stremio n'accepte que les IDs IMDB
- La détection concerts et spectacles nécessite une clé OMDb (gratuite, 1000 req/jour sur omdbapi.com)
- AniList est activé par défaut et ne nécessite aucune clé — il peut être désactivé dans la config
- Les médias déjà indexés avant l'ajout des nouvelles catégories restent dans leur ancienne catégorie — utilisez les boutons de maintenance pour les reclassifier

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
- Métadonnées : [TMDB](https://www.themoviedb.org/), [TVDB](https://thetvdb.com/), [OMDb](https://www.omdbapi.com/), [MyAnimeList](https://myanimelist.net/), [AniList](https://anilist.co/)
- Intégrations : [Prowlarr](https://prowlarr.com/), [NZBHydra2](https://github.com/theotherp/nzbhydra2), [Apprise](https://github.com/caronc/apprise), [RPDB](https://ratingposterdb.com/)

---

## Licence

[GNU GPL v3](./LICENSE) — Merci de citer la source.

**Bon streaming**
