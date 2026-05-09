<h1 align="center">
  <img src="src/public/logo.png" alt="Stremio RSS Catalog" width="120"><br>
  Stremio RSS Catalog
</h1>

<p align="center">
  <strong>Transformez vos flux RSS, Prowlarr et NZBHydra2 en catalogues Stremio — Films · Documentaires · Séries · Émissions TV · Animés · Concerts · Spectacles</strong>
</p>

<p align="center">
  <a href="./README.en.md">🇬🇧 English</a> · <a href="./README.de.md">🇩🇪 Deutsch</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Stremio-addon-purple?style=flat-square" alt="Stremio">
  <img src="https://img.shields.io/badge/Docker-ready-blue?style=flat-square&logo=docker" alt="Docker">
  <img src="https://img.shields.io/badge/TMDB%20%2B%20TVDB%20%2B%20OMDb-matched-green?style=flat-square" alt="TMDB+TVDB+OMDb">
  <img src="https://img.shields.io/badge/Prowlarr-compatible-blue?style=flat-square" alt="Prowlarr">
  <img src="https://img.shields.io/badge/NZBHydra2-compatible-blue?style=flat-square" alt="NZBHydra2">
  <img src="https://img.shields.io/badge/i18n-FR%20%7C%20EN%20%7C%20DE-orange?style=flat-square" alt="i18n">
  <img src="https://img.shields.io/badge/MyAnimeList-intégré-blue?style=flat-square" alt="MAL">
  <img src="https://img.shields.io/badge/AniList-intégré-teal?style=flat-square" alt="AniList">
</p>

---

<p align="center">
  Vous l'utilisez ? Vous l'aimez ? <a href="https://github.com/Aerya/stremio-rss-catalogs/stargazers">Mettez une étoile !</a> — ça prend une seconde.
</p>

---

> Addon Stremio auto-hébergé qui agrège vos flux RSS, Prowlarr et NZBHydra2, identifie automatiquement **9 catégories de contenu** (Films, Documentaires, Séries, Émissions TV, Animés, Concerts, Spectacles), les matche sur TMDB/TVDB/OMDb (et MAL + AniList pour les animés) et les expose comme catalogues dans Stremio.

---

## Fonctionnalités

| | |
|---|---|
| **9 catalogues** | Films · Documentaires (films) · Documentaires (séries) · Séries · Émissions TV · Animés (films) · Animés (séries) · Concerts · Spectacles |
| **Détection automatique** | Catégorie identifiée depuis le nom de release, l'URL du flux ou les genres TMDB/OMDb |
| **Détection par URL de flux** | La catégorie est devinée automatiquement depuis les mots-clés dans l'URL du flux RSS (`concert`, `anime`, `docu`, `serie`…) |
| **Animés** | Détectés via TMDB genre 16 + origine japonaise, OVA/OAV dans le titre, ou forcé par flux |
| **MAL** | MyAnimeList API v2 — normalisateur de titre EN pour améliorer le match TMDB des animés (optionnel, clé gratuite) |
| **AniList** | API GraphQL AniList — normalisateur complémentaire (titres romaji + natifs), entièrement gratuit et anonyme, sans inscription |
| **Concerts** | Détectés via TMDB genre 10402 (Music) + confirmation OMDb, sans genres narratifs (Drama, Action…) |
| **Spectacles** | Détectés via mots-clés titre (Stand-up, One Man Show, Théâtre, Cirque…) + confirmation OMDb |
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
| **Qualité** | 4K, HDR, DV, 1080p, WEB-DL, TVRip, DVDRip, CAM… détecté par release |
| **Retry** | Releases non matchées conservées et relançables |
| **Cache** | Réponses catalog mises en cache, invalidation automatique post-sync |
| **RPDB** | Affiches avec notes intégrées (optionnel) |
| **Discord** | Notifications enrichies avec galerie d'affiches à chaque sync |
| **Apprise** | Notifications multi-services via serveur Apprise (optionnel) |
| **Langue des notifs** | Langue Discord/Apprise configurable indépendamment de la WebUI (FR/EN/DE) |
| **Sync auto** | Planification configurable — déclenchement uniquement au démarrage et sur minuterie |
| **WebUI moderne** | Sidebar, thème sombre/clair, multilingue FR/EN/DE |
| **Médiathèque** | Vue affiches/liste, tri, filtre année (raccourcis + saisie libre/plage), releases inline, affiches RPDB, pagination persistante |
| **Vue d'ensemble** | Derniers ajouts en tiroirs dépliables par catégorie (titre + année + lien IMDB) |
| **Suite de maintenance** | 8 actions de reclassification en base (animés, documentaires, faux docs, fausses émissions, concerts, faux concerts, spectacles, config flux) |
| **Sources** | Stats par flux RSS avec nommage personnalisé |
| **Intégrations** | Prowlarr + NZBHydra2 en un clic depuis la WebUI |
| **Proxy** | HTTP / HTTPS / SOCKS4 / SOCKS5 + test de connexion intégré |
| **SQLite** | Données persistantes, contenu incrémental, index optimisés |
| **Filtrage par tags** | Tags requis configurables depuis la WebUI (FRENCH, MULTi, 1080p…) |
| **Docker** | Image multi-arch `linux/amd64` + `linux/arm64` |

> Par défaut limité aux contenus disponibles en VF (FRENCH / MULTi / TRUEFRENCH / VOF / VFF / VFI / VFQ) — modifiable depuis la WebUI

---

## Démarrage rapide

Copier ou créer [le docker-compose.yml](./docker-compose.yml) :

```yaml
services:
  useflow-fr:
    image: ghcr.io/aerya/stremio-rss-catalogs:latest
    container_name: useflow-fr
    restart: always
    ports:
      - "7973:7000"
    volumes:
      - /home/aerya/docker/useflow-fr/:/data
    environment:
      - PORT=7000
      - NODE_ENV=production
      - TZ=Europe/Paris
      - WEBUI_USERNAME=admin        # A changer
      - WEBUI_PASSWORD=admin        # A changer
      - DB_PATH=/data/addon.db
      - SESSION_SECRET=changeme     # openssl rand -hex 32
    labels:
      - com.centurylinklabs.watchtower.enable=true
```

Puis ouvrir la WebUI sur `http://localhost:7973`, configurer le(s) flux RSS + la clé TMDB, lancer une première synchronisation, et installer l'addon dans Stremio avec l'URL fournie.

> **`TZ=Europe/Paris`** est recommandé pour un affichage correct des dates dans la WebUI et un regroupement juste de l'historique des syncs.

---

## Sources RSS compatibles

L'outil accepte tout flux RSS standard. En plus des flux natifs de vos trackers, il est compatible avec **Prowlarr** et **NZBHydra2** :

### Prowlarr (BitTorrent)

- **Par indexeur** : `http://prowlarr:9696/{id}/api?apikey=XXXX&t=rss`
- **Agrégé** : `http://prowlarr:9696/api/v1/indexer/all/newznab?apikey=XXXX&t=rss`
- **Films uniquement** (catégorie 2000) : `http://prowlarr:9696/api/v1/indexer/all/newznab?apikey=XXXX&t=rss&cat=2000`
- **Séries uniquement** (catégorie 5000) : `http://prowlarr:9696/api/v1/indexer/all/newznab?apikey=XXXX&t=rss&cat=5000`

### NZBHydra2 (Usenet)

- **Tous contenus** : `http://nzbhydra2:5076/api?t=rss&apikey=XXXX`
- **Films uniquement** : `http://nzbhydra2:5076/api?t=rss&apikey=XXXX&cat=2000`
- **Séries uniquement** : `http://nzbhydra2:5076/api?t=rss&apikey=XXXX&cat=5000`

> La WebUI propose des **intégrations rapides** dans la section Configuration : renseignez l'URL de base et la clé API, puis cliquez sur *Tout*, *Films* ou *Séries* pour générer et ajouter automatiquement le flux RSS correspondant.

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
image: ghcr.io/aerya/stremio-rss-catalogs:latest
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

## Fonctionnement

### Filtrage en amont

Avant tout traitement, chaque release est filtrée par les **tags requis** configurés dans la WebUI (ex. : `FRENCH,MULTi,TRUEFRENCH`). Une release sans ces tags est ignorée immédiatement.

### Parsing des releases

Chaque titre de release est analysé pour en extraire :
- Le **nom propre** (suppression des tags : résolution, codec, langue, équipe…)
- L'**année** de sortie
- Le **type** : film ou série — avec priorité : animé > concert > spectacle > documentaire > émission > série > film
- La **qualité** : 4K, HDR, DV, 1080p, WEB-DL, BluRay…
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

## Notes

- La 1ère synchronisation peut prendre plusieurs minutes selon la taille du flux RSS — à faire **avant** d'installer l'addon dans Stremio
- Les catalogues sont paginés par pages de 100 médias — Stremio les charge au fil du scroll, sans limite
- Seuls les contenus avec un ID IMDB sont indexés
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

## Article de blog

[Stremio RSS Catalog : mon addon de conversion de RSS en catalogues Stremio](https://upandclear.org/2025/11/20/useflow-fr-mon-addon-de-conversion-de-rss-en-catalogures-stremio/)

---

## Licence

GNU GPL v3 — Merci de citer la source.

**Bon streaming**
