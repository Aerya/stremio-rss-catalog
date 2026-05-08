<h1 align="center">
  <img src="src/public/logo.png" alt="Stremio RSS Catalog" width="120"><br>
  Stremio RSS Catalog
</h1>

<p align="center">
  <strong>Turn your RSS feeds into Stremio catalogs — Movies, Documentaries and Series</strong>
</p>

<p align="center">
  <a href="./README.md">🇫🇷 Français</a> · <a href="./README.de.md">🇩🇪 Deutsch</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Stremio-addon-purple?style=flat-square" alt="Stremio">
  <img src="https://img.shields.io/badge/Docker-ready-blue?style=flat-square&logo=docker" alt="Docker">
  <img src="https://img.shields.io/badge/TMDB%20%2B%20TVDB-matched-green?style=flat-square" alt="TMDB+TVDB">
  <img src="https://img.shields.io/badge/i18n-FR%20%7C%20EN%20%7C%20DE-orange?style=flat-square" alt="i18n">
</p>

---

<p align="center">
  💡 Use it? Like it? <a href="https://github.com/Aerya/stremio-rss-catalogs/stargazers">⭐ Star it!</a> — it only takes a second.
</p>

---

> A self-hosted Stremio addon that parses your RSS feeds, automatically identifies Movies, Documentaries and Series, matches them on TMDB/TVDB, and exposes them as catalogs in Stremio.

---

## ✨ What's New

- 🏗️ **New DB architecture**: media and releases are now separated — one record per IMDB ID, with all releases of the same movie/show tracked underneath
- 🔁 **Zero duplicates guaranteed**: deduplication by IMDB ID, regardless of feed source or sync date
- 🔍 **Improved TMDB matching**: up to 5 attempts per release (with/without year, FR then EN, simplified title) — significantly better match rate
- 📺 **TVDB fallback**: if TMDB fails on a series, TVDB is queried automatically — also improves documentary detection via its own genre (optional, free API key)
- 🎬 **5 catalogs**: Movies · Documentaries (films) · Documentaries (series) · Series · TV Shows — documentary series land in Documentaries, not Series
- 🔄 **Retry on failure**: unmatched releases are stored and can be retried from the WebUI or API
- #️⃣ **Hash extraction**: infohash is automatically extracted from magnet/torrent links found in RSS feeds
- 🏷️ **Quality tracking**: resolution and source (4K HDR, 1080p WEB-DL…) stored per release
- 📡 **Source tracking**: the originating RSS feed URL is recorded for each release
- 📺 **TV Shows**: dedicated catalog — auto-classified from TMDB genres (Reality, Talk, News, Soap) or forced per RSS feed
- ♾️ **Unlimited catalogs**: native Stremio pagination (100 items/page), no artificial cap
- ⚡ **In-memory cache**: catalog responses are cached between syncs — instant responses for concurrent users, automatically invalidated on each sync

---

## 🎬 Features

| | |
|---|---|
| 📁 **5 catalogs** | Movies · Documentaries (films) · Documentaries (series) · Series · TV Shows |
| 🔍 **Auto detection** | Type identified from release name, or forced per feed |
| 🎯 **TMDB matching** | Up to 5 attempts per release (FR/EN, with/without year) |
| 📺 **TVDB fallback** | Fallback for series not found on TMDB + documentary confirmation (optional) |
| 🎬 **Docu-series** | Detected via TMDB genre 99 or TVDB, placed in Documentaries (series) |
| 📺 **TV Shows** | Dedicated catalog — auto via TMDB genres or forced per feed |
| 🔁 **Deduplication** | By IMDB ID (media) + by RSS GUID + by torrent hash when available (releases) |
| #️⃣ **Hashes** | Automatic infohash extraction from magnet/torrent links |
| 🏷️ **Quality** | 4K, HDR, DV, 1080p, WEB-DL… detected per release |
| 🔄 **Retry** | Unmatched releases stored and retriable |
| ⚡ **Cache** | Catalog responses cached in memory, auto-invalidated on sync |
| 🖼️ **RPDB** | Rating posters (optional) |
| 🔔 **Discord** | Notifications with poster gallery on each sync |
| 🔄 **Auto sync** | Configurable scheduling |
| 🌐 **WebUI** | Full admin interface, 🇫🇷 🇬🇧 🇩🇪 |
| 🔒 **Proxy** | HTTP / HTTPS / SOCKS4 / SOCKS5 |
| 💾 **SQLite** | Persistent data, incremental content, optimized indexes |
| 🏷️ **Tag filtering** | Configurable required tags from the WebUI (FRENCH, MULTi, 1080p…) |
| 🐳 **Docker** | Multi-arch image `linux/amd64` + `linux/arm64` |

> Defaults to French-language content (FRENCH / MULTi / TRUEFRENCH / VOF / VFF / VFI / VFQ) — configurable from the WebUI

---

## 🚀 Quick Start

Copy or create [docker-compose.yml](./docker-compose.yml):

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
      - WEBUI_USERNAME=admin        # Change this
      - WEBUI_PASSWORD=admin        # Change this
      - DB_PATH=/data/addon.db
      - SESSION_SECRET=changeme     # openssl rand -hex 32
    labels:
      - com.centurylinklabs.watchtower.enable=true
```

Then open the WebUI at `http://localhost:7973`, configure your RSS feed(s) + TMDB API key (and optionally TVDB), run a first sync, and install the addon in Stremio using the provided URL.

---

## 📡 Compatible RSS Sources

The tool accepts any standard RSS feed. In addition to your trackers' native feeds, it is compatible with **Prowlarr** and **NZBHydra2**:

### Prowlarr (BitTorrent)

- **Per indexer**: each indexer configured in Prowlarr exposes its own RSS feed
  `http://prowlarr:9696/{id}/api?apikey=XXXX&t=rss`
- **Aggregated**: a single feed combining all indexers
  `http://prowlarr:9696/api/v1/indexer/all/newznab?apikey=XXXX&t=rss`
- **Aggregated — Movies only** (Newznab category 2000):
  `http://prowlarr:9696/api/v1/indexer/all/newznab?apikey=XXXX&t=rss&cat=2000`
- **Aggregated — Series only** (Newznab category 5000):
  `http://prowlarr:9696/api/v1/indexer/all/newznab?apikey=XXXX&t=rss&cat=5000`

### NZBHydra2 (Usenet)

- **All content**:
  `http://nzbhydra2:5076/api?t=rss&apikey=XXXX`
- **Movies only** (Newznab category 2000):
  `http://nzbhydra2:5076/api?t=rss&apikey=XXXX&cat=2000`
- **Series only** (Newznab category 5000):
  `http://nzbhydra2:5076/api?t=rss&apikey=XXXX&cat=5000`

> 💡 The WebUI provides **quick integrations** in the Configuration section: enter the base URL and API key for Prowlarr or NZBHydra2, then click *All*, *Movies* or *Series* to automatically generate and add the corresponding RSS feed.

---

## 🔄 Migrating from UseFlow-FR

Coming from the [old version (UseFlow-FR)](https://github.com/Aerya/UseFlow-FR)? Migration is seamless — your database is fully compatible.

**1. Stop the old container**
```bash
docker compose down
```

**2. Update `docker-compose.yml`**

Only two things change (everything else stays identical — same port, same volume, same variables):

```yaml
# Before
image: ghcr.io/aerya/useflow-fr:latest
container_name: useflow-fr

# After
image: ghcr.io/aerya/stremio-rss-catalogs:latest
container_name: stremio-rss-catalogs
```

> ⚠️ The volume path (`/data`) and `DB_PATH` variable do not change — keep pointing to the same folder.

**3. Start the new container**
```bash
docker compose up -d
```

On first startup, the database migration runs automatically if needed (old schema → new schema). All your existing configuration (API keys, RSS feeds, Discord…) is preserved.

**4. (Optional) Configure new features**

New options are available in the WebUI:
- **TVDB API key** — improves documentary series detection and acts as a fallback for series not found on TMDB (free at [thetvdb.com](https://thetvdb.com))

**5. Reinstall the addon in Stremio**

The addon URL has not changed if you kept the same port. If you changed the port, reinstall the addon using the new URL shown in the WebUI.

---

## ⚙️ How It Works

### Upstream Filtering

Before any processing, each release is filtered against the **required tags** configured in the WebUI (e.g. `FRENCH,MULTi,TRUEFRENCH`). A release without these tags is immediately ignored.

### Release Parsing

Each release title is analyzed to extract:
- The **clean name** (technical tags stripped: resolution, codec, language, team…)
- The **year** of release
- The **type**: movie, documentary or series — the documentary tag (`docu`, `documentary`…) takes priority over series format (`S01E01`)
- The **quality**: 4K, HDR, DV, 1080p, WEB-DL, BluRay…
- The **infohash**: extracted from magnet/torrent links in the RSS feed

### Matching Pipeline — TMDB + TVDB

```
RSS Release  →  Tag filter  →  Parsing  →  TMDB (5 attempts)  →  Reclassification  →  DB
                                                   ↓ fail (series)
                                               TVDB fallback  →  Reclassification  →  DB
```

**TMDB — 5 attempts in order:**

1. Exact title + year, French
2. Exact title without year, French
3. Exact title without year, English
4. Simplified title (first 3 words) + year, English
5. Simplified title without year, English

**Automatic reclassification after match (auto-detected sources only):**
- TMDB genre 99 (Documentary) → **Documentaries**
- TMDB genre Reality/Talk/News/Soap → **TV Shows**
- None of the above, TVDB configured → TVDB check for documentary confirmation

**TVDB fallback (when TMDB fails on a series):**
- 2 TVDB attempts (with and without year)
- If IMDB ID found → indexed in Series or Documentaries based on TVDB genre

If all attempts fail, the release is stored in `failed_releases` for manual or automatic retry.

### Database Architecture

```
media           → 1 row per movie/show (key: imdb_id)
releases        → N releases per media (quality, hash, source, date)
failed_releases → unmatched releases (for retry)
```

This separation guarantees:
- **Zero duplicates** in catalogs, regardless of how many versions or source feeds exist
- **Full history** of all known releases for a media
- **Retry** of unmatched releases without reprocessing the entire feed

### Cache

Catalog responses are cached in memory between syncs. The cache is automatically invalidated after each successful sync — no stale data possible. Searches are not cached.

### Persistence

Everything is stored in a SQLite database (`data/addon.db`). Content **accumulates** — a sync never replaces existing data. Migration from the old schema runs automatically on first startup.

---

## 🔐 WebUI Login

- **Credentials**: defined in `docker-compose.yml`
- **Session secret**: generate with `openssl rand -hex 32`

---

## 📝 Notes

- The first sync may take several minutes depending on feed size — do it **before** installing the addon in Stremio
- Catalogs are paginated in pages of 100 media — Stremio loads them as you scroll, with no limit
- Only content with a valid IMDB ID is indexed
- Some inconsistencies may appear between the **Documentaries** and **Series** catalogs: reclassification relies on TMDB genre 99 and TVDB's Documentary genre, both community-tagged and not always consistent — a documentary not tagged as such may end up in Series

---

## 💡 Ideas Under Consideration

- **Enriched WebUI**: listing of media, releases, sources and hashes
- **Genre filtering** — to refine catalogs
- **Advanced statistics** — charts and visualizations

---

## 📖 Blog Post

[Stremio RSS Catalog: my RSS-to-Stremio-catalogs addon](https://upandclear.org/2025/11/20/useflow-fr-mon-addon-de-conversion-de-rss-en-catalogues-stremio/) (French)

---

## 📄 License

GNU GPL v3 — Please credit the source.

**Happy streaming 🍿**
