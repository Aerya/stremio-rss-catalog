<h1 align="center">
  <img src="src/public/logo.png" alt="Stremio RSS Catalog" width="120"><br>
  Stremio RSS Catalog
</h1>

<p align="center">
  <strong>Turn your RSS feeds, Prowlarr and NZBHydra2 into Stremio catalogs — Movies · Documentaries · Series · TV Shows · Anime · Concerts · Live Shows</strong>
</p>

<p align="center">
  <a href="./README.md">🇫🇷 Français</a> · <a href="./README.de.md">🇩🇪 Deutsch</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Stremio-addon-purple?style=flat-square" alt="Stremio">
  <img src="https://img.shields.io/badge/Docker-ready-blue?style=flat-square&logo=docker" alt="Docker">
  <img src="https://img.shields.io/badge/TMDB%20%2B%20TVDB%20%2B%20OMDb-matched-green?style=flat-square" alt="TMDB+TVDB+OMDb">
  <img src="https://img.shields.io/badge/Prowlarr-compatible-blue?style=flat-square" alt="Prowlarr">
  <img src="https://img.shields.io/badge/NZBHydra2-compatible-blue?style=flat-square" alt="NZBHydra2">
  <img src="https://img.shields.io/badge/i18n-FR%20%7C%20EN%20%7C%20DE-orange?style=flat-square" alt="i18n">
  <img src="https://img.shields.io/badge/MyAnimeList-integrated-blue?style=flat-square" alt="MAL">
  <img src="https://img.shields.io/badge/AniList-integrated-teal?style=flat-square" alt="AniList">
</p>

---

<p align="center">
  Use it? Like it? <a href="https://github.com/Aerya/stremio-rss-catalogs/stargazers">Star it!</a> — it only takes a second.
</p>

---

> A self-hosted Stremio addon that aggregates your RSS feeds, Prowlarr and NZBHydra2, automatically identifies **9 content categories** (Movies, Documentaries, Series, TV Shows, Anime, Concerts, Live Shows), matches them on TMDB/TVDB/OMDb (and MAL + AniList for anime), and exposes them as catalogs in Stremio.

---

## Features

| | |
|---|---|
| **9 catalogs** | Movies · Documentaries (films) · Documentaries (series) · Series · TV Shows · Anime (films) · Anime (series) · Concerts · Live Shows |
| **Auto detection** | Category identified from release name, feed URL keywords, or TMDB/OMDb genres |
| **Feed URL detection** | Category automatically guessed from keywords in the RSS feed URL (`concert`, `anime`, `docu`, `serie`, `film`…) |
| **Anime** | Detected via TMDB genre 16 + Japanese origin, OVA/OAV in title, or forced per feed |
| **MAL** | MyAnimeList API v2 — EN title normalizer to improve TMDB matching for anime (optional, free key) |
| **AniList** | AniList GraphQL API — complementary title normalizer (romaji + native titles), fully free and anonymous, no sign-up required |
| **Concerts** | Detected via TMDB genre 10402 (Music) + OMDb confirmation, without narrative genres (Drama, Action…) |
| **Live Shows** | Detected via title keywords (Stand-up, One Man Show, Theatre, Circus…) + OMDb confirmation |
| **OMDb** | OMDb API queried after each TMDB match to confirm concert and live show classification |
| **TMDB matching** | Up to 5 attempts per release (FR/EN, with/without year, simplified title) |
| **TVDB fallback** | Fallback for series not found on TMDB + documentary confirmation (optional) |
| **Docu-series** | Detected via TMDB genre 99 or TVDB, placed in Documentaries (series) |
| **TV Shows** | Dedicated catalog — auto via TMDB Reality/Talk/News/Soap genres or forced per feed |
| **False positive protection** | Contradicting genres disable documentary detection (Action, Sci-Fi, Fantasy, Horror), TV show detection (Sci-Fi, Fantasy, Animation) and concert detection (Drama, Comedy, Romance) |
| **Specificity hierarchy** | Auto-reclassification can never downgrade a more specific category — anime (4) > docs/shows/concerts/live (3) > series (2) > movies (1) |
| **Manual category change** | From the media detail panel in the library |
| **Manual release override** | Force IMDB/TMDB/TVDB ID on a failed release directly from the WebUI |
| **Deduplication** | By IMDB ID (media) + by RSS GUID + by torrent hash when available (releases) |
| **Hashes** | Automatic infohash extraction from magnet/torrent links |
| **Retry** | Unmatched releases stored and retriable |
| **Cache** | Catalog responses cached in memory, auto-invalidated on sync |
| **RPDB** | Rating posters (optional) |
| **Discord** | Enhanced notifications with poster gallery on each sync |
| **Apprise** | Multi-service notifications via Apprise server (optional) |
| **Notification language** | Discord/Apprise language configurable independently from the WebUI (FR/EN/DE) |
| **Auto sync** | Configurable scheduling — triggers only at startup and on timer, never on config save |
| **Modern WebUI** | Sidebar, dark/light theme, multilingual FR/EN/DE |
| **Media Library** | Poster/list view, sort, year filter (shortcuts + free input/range), inline releases, RPDB posters, persistent pagination |
| **Overview** | Latest additions in collapsible per-category accordions (title + year + IMDB link) |
| **Maintenance suite** | 8 reclassification actions (anime, docs, false docs, false shows, concerts, false concerts, live shows, feed config) |
| **Sources** | Per-feed stats with custom naming |
| **Integrations** | Prowlarr + NZBHydra2 one-click setup from WebUI |
| **Proxy** | HTTP / HTTPS / SOCKS4 / SOCKS5 + built-in connection test |
| **SQLite** | Persistent data, incremental content, optimized indexes |
| **Tag filtering** | Configurable required tags from the WebUI (FRENCH, MULTi, 1080p…) |
| **Docker** | Multi-arch image `linux/amd64` + `linux/arm64` |

> Defaults to French-language content (FRENCH / MULTi / TRUEFRENCH / VOF / VFF / VFI / VFQ) — configurable from the WebUI

---

## Screenshots

| | |
|---|---|
| ![Media Library](screens/Mediatheque.png) | ![Overview](screens/Vue.d.Ensemble.png) |
| ![Sync history](screens/Synchronisation.png) | ![Failed releases](screens/Echecs.png) |
| ![Sources](screens/Sources.png) | ![Configuration](screens/Configuration.png) |

![Discord notification](screens/DiscordNotif.png)

---

## Quick Start

Copy or create [docker-compose.yml](./docker-compose.yml):

```yaml
services:
  stremio-rss-catalog:
    image: ghcr.io/aerya/stremio-rss-catalog:latest
    container_name: stremio-rss-catalog
    restart: always
    ports:
      - "7973:7000"
    volumes:
    # Adapt to your setup: /path/to/your/data/:/data
      - /home/aerya/docker/stremio-rss-catalog/:/data
    environment:
      - PORT=7000
      - NODE_ENV=production
      - TZ=Europe/Paris
      # Change these
      - WEBUI_USERNAME=admin
      - WEBUI_PASSWORD=admin
      # Do not change
      - DB_PATH=/data/addon.db
      # Generate with: openssl rand -hex 32
      - SESSION_SECRET=changeme
```

Then open the WebUI at `http://localhost:7973`, configure your RSS feed(s) + TMDB API key, run a first sync, and install the addon in Stremio using the provided URL.

> **`TZ`** sets the container timezone. Adjust to your own timezone (e.g. `America/New_York`) for correct date display in the WebUI and proper sync history grouping.

---

## Compatible RSS Sources

The tool accepts any standard RSS feed. In addition to your trackers' native feeds, it is compatible with **Prowlarr** and **NZBHydra2**:

### Prowlarr (BitTorrent)

The quick integration buttons generate **aggregated** feeds (all your indexers):

| Button | Generated URL |
|---|---|
| All | `/api/v1/indexer/all/newznab?apikey=XXXX&t=rss` |
| Movies | `/api/v1/indexer/all/newznab?apikey=XXXX&t=rss&cat=2000` |
| Series | `/api/v1/indexer/all/newznab?apikey=XXXX&t=rss&cat=5000` |

To target a **specific indexer**, add its URL directly in the RSS feeds list:
```
http://prowlarr:9696/{id}/api?apikey=XXXX&t=rss
```
*(replace `{id}` with the numeric indexer ID in Prowlarr)*

### NZBHydra2 (Usenet)

The buttons generate **aggregated** feeds (all your sources):

| Button | Generated URL |
|---|---|
| All | `/api?t=rss&apikey=XXXX` |
| Movies | `/api?t=rss&apikey=XXXX&cat=2000` |
| Series | `/api?t=rss&apikey=XXXX&cat=5000` |

> Each button adds a **new row** to the RSS feeds list — you can click several to have Movies and Series as separate feeds. The saved base URL is only used by the quick integration, it is not an RSS feed by itself.

---

## Migrating from UseFlow-FR

Coming from the [old version (UseFlow-FR)](https://github.com/Aerya/UseFlow-FR)? Migration is seamless — your database is fully compatible.

**1. Stop the old container**
```bash
docker compose down
```

**2. Update `docker-compose.yml`**

```yaml
# Before
image: ghcr.io/aerya/useflow-fr:latest

# After
image: ghcr.io/aerya/stremio-rss-catalogs:latest
```

> The volume path (`/data`) and `DB_PATH` variable do not change.

**3. Start the new container**
```bash
docker compose up -d
```

Database migration runs automatically on first startup. All your existing configuration is preserved.

**4. (Optional) Configure new features**

- **TVDB API key** — improves documentary series detection (free at [thetvdb.com](https://thetvdb.com))
- **MAL Client ID** — improves anime matching (free at [myanimelist.net/apiconfig](https://myanimelist.net/apiconfig))
- **AniList** — enabled by default, no key required
- **OMDb API key** — enables concert and live show detection (free at [omdbapi.com](https://www.omdbapi.com/apikey.aspx), 1000 req/day)

**5. Reinstall the addon in Stremio** if you changed ports.

---

## How It Works

### Upstream Filtering

Before any processing, each release is filtered against the **required tags** configured in the WebUI (e.g. `FRENCH,MULTi,TRUEFRENCH`). A release without these tags is immediately ignored.

### Release Parsing

Each release title is analyzed to extract:
- The **clean name** (technical tags stripped: resolution, codec, language, team…)
- The **year** of release
- The **type**: movie or series — with priority: anime > concert > live show > documentary > TV show > series > movie
- The **infohash**: extracted from magnet/torrent links in the RSS feed

### Category Detection

The final category comes from three sources, combined in priority order:

1. **Explicit per-feed force** — the user manually sets the category for a feed (e.g. this feed is "anime", this feed is "concerts")
2. **Feed URL auto-detection** — in auto mode, keywords in the RSS feed URL hint at the category (`concert`, `anime`, `docu`, `serie`, `film`…)
3. **Release title keywords** — `OVA`, `STAND UP`, `CONCERT`, `LIVE AT`, `DOCU`…
4. **TMDB genres + OMDb confirmation** — after TMDB match, the title's genres may trigger reclassification

### Matching Pipeline

```
RSS Release
  → Required tag filter
  → Parsing (type + category from title + feed URL)
  → Anime detected?
      yes → MAL (if configured) + AniList (if enabled) → normalized titles → TMDB → OMDb → DB
      no  → TMDB (5 attempts FR/EN) → OMDb → Genre reclassification → DB
                ↓ fail (series)
            TVDB fallback → DB
  → Total failure → failed_releases (manual or auto retry)
```

**Anime title normalization (MAL + AniList):**

MAL and AniList are used in combination to obtain the canonical English title before searching TMDB. MAL takes priority when a key is configured; AniList complements it (or acts alone when MAL is not configured). TMDB search attempts are built from both sources' titles, deduplicated and ordered by relevance (EN title, romaji, native, cleanName fallback).

**TMDB — 5 attempts in order (non-anime):**
1. Exact title + year, French
2. Exact title without year, French
3. Exact title without year, English
4. Simplified title (first 3 words) + year, English
5. Simplified title without year, English

**Automatic reclassification after TMDB match:**
- Genre 99 (Documentary) without contradicting genres (Action/Sci-Fi/Fantasy/Horror) → **Documentaries**
- Genre 16 (Animation) + Japanese origin → **Anime** *(auto-mode sources only)*
- Reality/Talk/News/Soap genres without contradicting genres → **TV Shows** *(auto-mode sources only)*
- Genre 10402 (Music) without narrative genres (Drama/Comedy/Romance/Action) + OMDb confirms "Music" → **Concerts**
- Stand-up/theatre/circus title keywords + OMDb confirms non-narrative comedy → **Live Shows**

**Specificity hierarchy** — auto-reclassification can never downgrade a more specific category:
- Movies (1) < Series (2) < TV Shows/Documentaries/Concerts/Live Shows (3) < Anime (4)

### Database Architecture

```
media           → 1 row per movie/show (key: imdb_id)
releases        → N releases per media (quality, hash, source, date)
failed_releases → unmatched releases (for retry)
```

### Cache

Catalog responses are cached in memory between syncs and automatically invalidated after each successful sync. Searches are not cached.

### Persistence

Everything is stored in a SQLite database (`data/addon.db`). Content **accumulates** — a sync never replaces existing data.

---

## Maintenance Suite

From **Configuration → Maintenance** in the WebUI, 8 actions are available:

| Action | Description |
|---|---|
| Reclassify anime | Detects movies/series with TMDB Animation genre + Japanese origin. Requires TMDB key. |
| Reclassify documentaries | Detects media with TMDB genre 99 already stored in DB. No API call. |
| Fix false documentaries | Removes from Documentaries any media with contradicting genres (Action, Sci-Fi…). No API call. |
| Fix false TV shows | Removes from TV Shows any series with incompatible genres (Sci-Fi, Animation…). No API call. |
| Reclassify concerts | Detects media with TMDB Music genre (10402) without narrative genres. No API call. |
| Fix false concerts | Removes from Concerts any media with narrative genres (Drama, Action…). No API call. |
| Reclassify live shows | Detects media with live show keywords in the release name (Stand-up, Theatre, Circus…). No API call. |
| Reclassify by feed config | Reclassifies all media based on current feed force settings + URL auto-detection. Respects specificity hierarchy. No API call. |

---

## WebUI Login

- **Credentials**: defined in `docker-compose.yml`
- **Session secret**: generate with `openssl rand -hex 32`

---

## Notes

- The first sync may take several minutes depending on feed size — do it **before** installing the addon in Stremio
- Catalogs are paginated in pages of 100 media — Stremio loads them as you scroll, with no limit
- Only content with a valid IMDB ID is indexed — Stremio only accepts IMDB IDs
- Concert and live show detection requires an OMDb API key (free, 1000 req/day at omdbapi.com)
- AniList is enabled by default and requires no key — it can be disabled from the config
- Media indexed before the new categories were added will remain in their old category — use the maintenance buttons to reclassify them

### Inherent limitations of third-party APIs

All classification relies on community databases and third-party APIs — **IMDB**, **TMDB**, **OMDb**, **TVDB**, **MyAnimeList** and **AniList**. These sources are imperfect by nature:

- A title may be **missing** from one or more databases and remain unmatched (it ends up in `failed_releases`)
- **Genres and metadata** are community-submitted: a documentary may lack genre 99, an anime may lack genre 16, a concert film may be tagged as a drama
- The **original language** (used for anime detection) may be missing or incorrect in TMDB
- OMDb may return different genres from TMDB for the same title, or have no entry at all
- MAL and AniList may return different English titles for the same anime, or not have the title at all
- A **wrong TMDB match** (homonym, approximate title) can lead to incorrect classification
- Filmed concerts, TV specials and music documentaries share overlapping characteristics — **false positives or false negatives** are possible in these categories

The maintenance tools (manual reclassification, false positive correction) and the category change in the media detail panel allow you to manually correct any problematic cases.

---


## License

GNU GPL v3 — Please credit the source.

**Happy streaming**
