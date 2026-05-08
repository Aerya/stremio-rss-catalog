<h1 align="center">
  <img src="src/public/logo.png" alt="Stremio RSS Catalog" width="120"><br>
  Stremio RSS Catalog
</h1>

<p align="center">
  <strong>Transformez vos flux RSS en catalogues Stremio — Films, Documentaires et Séries</strong>
</p>

<p align="center">
  <a href="./README.en.md">🇬🇧 English</a> · <a href="./README.de.md">🇩🇪 Deutsch</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Stremio-addon-purple?style=flat-square" alt="Stremio">
  <img src="https://img.shields.io/badge/Docker-ready-blue?style=flat-square&logo=docker" alt="Docker">
  <img src="https://img.shields.io/badge/TMDB%20%2B%20TVDB-matched-green?style=flat-square" alt="TMDB+TVDB">
  <img src="https://img.shields.io/badge/i18n-FR%20%7C%20EN%20%7C%20DE-orange?style=flat-square" alt="i18n">
</p>

---

<p align="center">
  💡 Vous l'utilisez ? Vous l'aimez ? <a href="https://github.com/Aerya/stremio-rss-catalogs/stargazers">⭐ Mettez une étoile !</a> — ça prend une seconde.
</p>

---

> Addon Stremio auto-hébergé qui parse vos flux RSS, identifie automatiquement Films, Documentaires et Séries, les matche sur TMDB/TVDB et les expose comme catalogues dans Stremio.

---

## ✨ Nouveautés

- 🏗️ **Nouvelle architecture DB** : séparation médias / releases — un seul enregistrement par IMDB ID, toutes les releases d'un même film/série sont liées en sous-couche
- 🔁 **Zéro doublon garanti** : déduplication par IMDB ID (pas par release), quel que soit le flux ou la date de synchro
- 🔍 **Matching TMDB amélioré** : jusqu'à 5 tentatives par release (avec/sans année, FR puis EN, titre simplifié) — taux de match significativement amélioré
- 📺 **Fallback TVDB** : si TMDB échoue sur une série, TVDB est interrogé automatiquement — améliore aussi la détection des documentaires via son propre genre (optionnel, clé API gratuite)
- 🎬 **5 catalogues** : Films · Documentaires (films) · Documentaires (séries) · Séries · Émissions TV — les docu-séries vont bien en Documentaires, pas en Séries
- 🔄 **Retry des échecs** : les releases non matchées sont conservées et relançables depuis la WebUI ou l'API
- #️⃣ **Extraction des hashes** : l'infohash est extrait automatiquement des liens magnet/torrents présents dans les flux RSS
- 🏷️ **Qualité extraite** : résolution et source (4K HDR, 1080p WEB-DL…) stockées par release
- 📡 **Source trackée** : l'URL du flux RSS d'origine est enregistrée pour chaque release
- 📺 **Émissions TV** : catalogue dédié — reclassification automatique depuis TMDB (Reality, Talk, News, Soap) ou forçable par flux RSS
- ♾️ **Catalogues sans limite** : pagination native Stremio (100 items/page), plus de cap artificielle
- ⚡ **Cache in-memory** : les réponses catalog sont mises en cache entre les syncs — réponses instantanées pour tous les utilisateurs simultanés, invalidation automatique à chaque sync

---

## 🎬 Fonctionnalités

| | |
|---|---|
| 📁 **5 catalogues** | Films · Documentaires (films) · Documentaires (séries) · Séries · Émissions TV |
| 🔍 **Détection automatique** | Type identifié depuis le nom de release, ou forcé par flux |
| 🎯 **Matching TMDB** | 5 tentatives par release (FR/EN, avec/sans année) |
| 📺 **Fallback TVDB** | Fallback pour séries non trouvées sur TMDB + confirmation documentaires (optionnel) |
| 🎬 **Docu-séries** | Détectées via genre TMDB 99 ou TVDB, placées en Documentaires (séries) |
| 📺 **Émissions TV** | Catalogue dédié — auto via genres TMDB ou forcé par flux |
| 🔁 **Déduplication** | Par IMDB ID (médias) + par GUID RSS + par hash torrent quand disponible (releases) |
| #️⃣ **Hashes** | Extraction automatique de l'infohash magnet/torrent |
| 🏷️ **Qualité** | 4K, HDR, DV, 1080p, WEB-DL… détecté par release |
| 🔄 **Retry** | Releases non matchées conservées et relançables |
| ⚡ **Cache** | Réponses catalog mises en cache, invalidation automatique post-sync |
| 🖼️ **RPDB** | Affiches avec notes intégrées (optionnel) |
| 🔔 **Discord** | Notifications avec galerie d'affiches à chaque sync |
| 🔄 **Sync auto** | Planification configurable |
| 🌐 **WebUI** | Interface d'administration complète, 🇫🇷 🇬🇧 🇩🇪 |
| 🔒 **Proxy** | HTTP / HTTPS / SOCKS4 / SOCKS5 |
| 💾 **SQLite** | Données persistantes, contenu incrémental, index optimisés |
| 🏷️ **Filtrage par tags** | Tags requis configurables depuis la WebUI (FRENCH, MULTi, 1080p…) |
| 🐳 **Docker** | Image multi-arch `linux/amd64` + `linux/arm64` |

> Par défaut limité aux contenus disponibles en VF (FRENCH / MULTi / TRUEFRENCH / VOF / VFF / VFI / VFQ) — modifiable depuis la WebUI

---

## 🚀 Démarrage rapide

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
      - WEBUI_USERNAME=admin        # À changer
      - WEBUI_PASSWORD=admin        # À changer
      - DB_PATH=/data/addon.db
      - SESSION_SECRET=changeme     # openssl rand -hex 32
    labels:
      - com.centurylinklabs.watchtower.enable=true
```

Puis ouvrir la WebUI sur `http://localhost:7973`, configurer le(s) flux RSS + la clé TMDB (et optionnellement TVDB), lancer une première synchronisation, et installer l'addon dans Stremio avec l'URL fournie.

---

## 📡 Sources RSS compatibles

L'outil accepte tout flux RSS standard. En plus des flux natifs de vos trackers, il est compatible avec **Prowlarr** et **NZBHydra2** :

### Prowlarr (BitTorrent)

- **Par indexeur** : chaque indexeur configuré dans Prowlarr expose son propre flux RSS
  `http://prowlarr:9696/{id}/api?apikey=XXXX&t=rss`
- **Agrégé** : un flux unique combinant tous les indexeurs
  `http://prowlarr:9696/api/v1/indexer/all/newznab?apikey=XXXX&t=rss`
- **Agrégé — Films uniquement** (catégorie Newznab 2000) :
  `http://prowlarr:9696/api/v1/indexer/all/newznab?apikey=XXXX&t=rss&cat=2000`
- **Agrégé — Séries uniquement** (catégorie Newznab 5000) :
  `http://prowlarr:9696/api/v1/indexer/all/newznab?apikey=XXXX&t=rss&cat=5000`

### NZBHydra2 (Usenet)

- **Tous contenus** :
  `http://nzbhydra2:5076/api?t=rss&apikey=XXXX`
- **Films uniquement** (catégorie Newznab 2000) :
  `http://nzbhydra2:5076/api?t=rss&apikey=XXXX&cat=2000`
- **Séries uniquement** (catégorie Newznab 5000) :
  `http://nzbhydra2:5076/api?t=rss&apikey=XXXX&cat=5000`

> 💡 La WebUI propose des **intégrations rapides** dans la section Configuration : renseignez l'URL de base et la clé API de Prowlarr ou NZBHydra2, puis cliquez sur *Tout*, *Films* ou *Séries* pour générer et ajouter automatiquement le flux RSS correspondant.

---

## 🔄 Migration depuis UseFlow-FR

Vous utilisez l'[ancienne version (UseFlow-FR)](https://github.com/Aerya/UseFlow-FR) ? La migration est transparente — votre base de données est entièrement compatible.

**1. Arrêter l'ancien conteneur**
```bash
docker compose down
```

**2. Mettre à jour le `docker-compose.yml`**

Deux choses à changer (tout le reste reste identique — même port, même volume, mêmes variables) :

```yaml
# Avant
image: ghcr.io/aerya/useflow-fr:latest
container_name: useflow-fr

# Après
image: ghcr.io/aerya/stremio-rss-catalogs:latest
container_name: stremio-rss-catalogs
```

> ⚠️ Le chemin du volume (`/data`) et la variable `DB_PATH` ne changent pas — pointez toujours vers le même dossier.

**3. Démarrer le nouveau conteneur**
```bash
docker compose up -d
```

Au premier démarrage, la migration de la base de données s'effectue automatiquement si nécessaire (ancien schéma → nouveau schéma). Toute votre configuration existante (clés API, flux RSS, Discord…) est conservée.

**4. (Optionnel) Configurer les nouvelles fonctionnalités**

De nouvelles options sont disponibles dans la WebUI :
- **Clé API TVDB** — améliore la détection des docu-séries et sert de fallback pour les séries non trouvées sur TMDB (gratuit sur [thetvdb.com](https://thetvdb.com))

**5. Réinstaller l'addon dans Stremio**

L'URL de l'addon n'a pas changé si vous gardez le même port. Si vous avez changé le port, réinstallez l'addon avec la nouvelle URL affichée dans la WebUI.

---

## ⚙️ Fonctionnement

### Filtrage en amont

Avant tout traitement, chaque release est filtrée par les **tags requis** configurés dans la WebUI (ex. : `FRENCH,MULTi,TRUEFRENCH`). Une release sans ces tags est ignorée immédiatement.

### Parsing des releases

Chaque titre de release est analysé pour en extraire :
- Le **nom propre** (suppression des tags : résolution, codec, langue, équipe…)
- L'**année** de sortie
- Le **type** : film, documentaire ou série — le tag documentaire (`docu`, `documentary`…) prime sur le format série (`S01E01`)
- La **qualité** : 4K, HDR, DV, 1080p, WEB-DL, BluRay…
- L'**infohash** : extrait des liens magnet/torrent présents dans le flux RSS

### Pipeline de matching — TMDB + TVDB

```
Release RSS  →  Filtre tags  →  Parsing  →  TMDB (5 tentatives)  →  Reclassification  →  DB
                                                      ↓ échec (série)
                                                  TVDB fallback  →  Reclassification  →  DB
```

**TMDB — 5 tentatives dans l'ordre :**

1. Titre exact + année, français
2. Titre exact sans année, français
3. Titre exact sans année, anglais
4. Titre simplifié (3 premiers mots) + année, anglais
5. Titre simplifié sans année, anglais

**Reclassification automatique après match (source non forcée) :**
- Genre TMDB 99 (Documentary) → **Documentaires**
- Genre TMDB Reality/Talk/News/Soap → **Émissions TV**
- Aucun de ces genres, mais TVDB configuré → vérification TVDB pour confirmation documentaire

**Fallback TVDB (si TMDB échoue sur une série) :**
- 2 tentatives TVDB (avec et sans année)
- Si IMDB ID trouvé → indexé dans Séries ou Documentaires selon genre TVDB

Si tout échoue, la release est stockée dans `failed_releases` pour être relancée manuellement ou automatiquement.

### Architecture base de données

```
media           → 1 ligne par film/série (clé : imdb_id)
releases        → N releases par média (qualité, hash, source, date)
failed_releases → releases sans match TMDB/TVDB (pour retry)
```

Cette séparation garantit :
- **Zéro doublon** dans les catalogues, quel que soit le nombre de versions ou de flux sources
- **Historique complet** de toutes les releases connues pour un média
- **Retry** des releases non matchées sans repasser sur tout le flux

### Cache

Les réponses catalog sont mises en cache en mémoire entre les syncs. Le cache est invalidé automatiquement à chaque sync réussie — aucune donnée périmée possible. Les recherches ne sont pas mises en cache.

### Persistance

Tout est stocké dans une base SQLite (`data/addon.db`). Les contenus s'**accumulent** — une sync ne remplace jamais les données existantes. La migration depuis l'ancienne structure est automatique au premier démarrage.

---

## 🔐 Connexion WebUI

- **Identifiants** : définis dans le `docker-compose.yml`
- **Session secret** : générer avec `openssl rand -hex 32`

---

## 📝 Notes

- La 1ère synchronisation peut prendre plusieurs minutes selon la taille du flux RSS — à faire **avant** d'installer l'addon dans Stremio
- Les catalogues sont paginés par pages de 100 médias — Stremio les charge au fil du scroll, sans limite
- Seuls les contenus avec un ID IMDB sont indexés
- Des incohérences peuvent apparaître entre les catalogues **Documentaires** et **Séries** : la reclassification repose sur le genre 99 (Documentary) de TMDB et le genre Documentary de TVDB, dont le tagging est fait par la communauté et n'est pas toujours homogène — un documentaire non tagué comme tel peut se retrouver en Séries

---

## 💡 Idées en réflexion

- **WebUI enrichie** : listing des médias, des releases, des sources et des hashes
- **Filtrage par genres** — pour affiner les catalogues
- **Statistiques avancées** — graphiques et visualisations

---

## 📖 Article de blog

[Stremio RSS Catalog : mon addon de conversion de RSS en catalogues Stremio](https://upandclear.org/2025/11/20/useflow-fr-mon-addon-de-conversion-de-rss-en-catalogures-stremio/)

---

## 📄 Licence

GNU GPL v3 — Merci de citer la source.

**Bon streaming 🍿**
