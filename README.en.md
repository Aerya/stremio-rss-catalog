<h1 align="center">
  <img src="src/public/logo.png" alt="Stremio RSS Catalog" width="120"><br>
  Stremio RSS Catalog
</h1>

<p align="center">
  <strong>Turn your RSS feeds, Prowlarr and NZBHydra2 into Stremio catalogs — Movies · Documentaries · Series · TV Shows · Anime · Concerts · Live Shows</strong>
</p>

> 🇫🇷 [Français](./README.md) · 🇩🇪 [Deutsch](./README.de.md)

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
  <img src="https://img.shields.io/badge/MyAnimeList-integrated-2E51A2?style=flat-square" alt="MAL">
  <img src="https://img.shields.io/badge/AniList-integrated-02A9FF?style=flat-square" alt="AniList">
</p>

> **Using it? Liking it? [⭐ Drop a star!](https://github.com/Aerya/stremio-rss-catalog/stargazers)** — takes two seconds.

---

> A self-hosted Stremio addon that turns content actually discovered in your own
> **BitTorrent, Usenet, WebDAV, or other sources** into Stremio catalogs. RSS,
> Pastebin, Newznab, Prowlarr, Jackett, NZBHydra2, WaStream/WaCustom,
> StreamFusion, CometNet, and Stremio manifests can be combined.

---

## The principle: start with what is available to you

Stremio RSS Catalog is not a generator of theoretical recommendation lists. It
collects your sources, identifies and deduplicates the media they announce, and
builds a local library. Catalogs are created from that library.

MDBList, ListSync, SuggestArr, and Agregarr guides only **select and order**
those media. A title absent from your sources remains absent from the final
catalog. This makes it possible to expose trends, selections, and collections
made only from content actually indexed in your own ecosystem.

Here, “available” means **discovered in a source you configured**. The addon
does not recheck seeders, debrid cache status, or link validity on every catalog
request, and it does not provide playback streams itself.

## Example setup and statistics

> The names and figures below are entirely fictional. They illustrate what the
> WebUI may display after several synchronizations; they are neither a benchmark
> nor a performance guarantee.

For example, one installation may combine **18 RSS feeds**, **3
Newznab/Torznab APIs**, **2 Pastebins**, **1 WebDAV folder**, and **1 Stremio
manifest**. After deduplication and matching, its dashboard could display:

| Metric | Example |
|---|---:|
| Releases read from sources | 286,450 |
| Unique media identified | 74,820 |
| Successful automatic matching | 97.8% |
| Known or deduplicated releases | 201,140 |
| Releases awaiting review | 1,630 |
| Catalogs published in the manifest | 12 |
| Last full synchronization | 8 min 42 sec |

Examples of processed data:

| Received data | Detection | Matching and destination |
|---|---|---|
| `Example.Movie.2026.ENGLISH.1080p.WEB-DL` | Movie · 2026 · 1080p · ENGLISH | IMDb/TMDB → **2026 Movies** |
| `Example.Series.S02E04.MULTi.2160p` | Series · season 2 · episode 4 · 2160p | IMDb/TMDB → **Available Series** |
| `Example.Artist.Live.In.Paris.2025` | Concert · 2025 | TMDB + OMDb → **Concerts** |
| `Example.Anime.S01E08.VOSTFR.1080p` | Anime · season 1 · episode 8 | MAL/AniList/Kitsu/TMDB → **Anime** |

A guide never makes media absent from the sources available. Therefore, an
MDBList guide containing 1,000 movies may produce a **Monthly Selection**
catalog of 386 movies when only those 386 titles exist in the local library.
Another catalog may combine **2025 Movies**, **2026 Movies**, and **Comedies**,
then be split again later without deleting the original catalogs.

## Features

| | |
|---|---|
| **Managed catalogs** | The 9 historical catalogs are migrated into the manager with their existing content preserved; create any number of custom catalogs |
| **Catalog composition** | Merge catalogs of the same type by union and remove them from the composition later |
| **Mixed sources** | A catalog may combine RSS, Pastebin, WebDAV, Plex, Jellyfin, Newznab, Prowlarr, Jackett/Torznab, NZBHydra2, WaStream/WaCustom, StreamFusion, and catalogs imported from Stremio manifests |
| **Direct Plex and Jellyfin** | Library and collection discovery, paginated movie/series imports, and preserved IMDb/TMDB identifiers |
| **WebDAV folders** | Authenticated recursive scan with configurable extensions, depth, and cap; filenames feed catalogs and [Davio](https://github.com/arvida42/davio) can handle playback in Stremio |
| **Custom filters** | Included or excluded years, year ranges, included/excluded genres and keywords, and source selection |
| **Two separate pauses** | Freeze new catalog content independently from catalog visibility in the Stremio manifest |
| **Nested Pastebins** | Direct pages, JSON pointers, and categorized master indexes with bounded recursion and deduplication |
| **Stremio manifests** | Generic remote catalog discovery and content import |
| **Native anime** | Preserve `anime` and Kitsu/MAL/AniList/AniDB identifiers without silently converting them to movies |
| **Catalog guides** | MDBList, ListSync, SuggestArr, and Agregarr provide selection and ordering; only media already indexed locally is exposed |
| **Dry run** | Exact media count before creating a catalog |
| **Manifest history** | Revisions and create, rename, freeze, visibility, and delete events |
| **Auto detection** | Category identified from release name, feed URL keywords, or TMDB/OMDb genres |
| **Feed URL detection** | Category automatically guessed from keywords in the RSS feed URL (`concert`, `anime`, `docu`, `serie`, `film`…) |
| **Anime** | Detected via TMDB genre 16 + Japanese origin, OVA/OAV in title, or forced per feed |
| **MAL** | MyAnimeList API v2 — EN title normalizer to improve TMDB matching for anime (optional, free key) |
| **AniList** 🆕 NEW | AniList GraphQL API — complementary title normalizer (romaji + native titles) + anime dedup, fully free and anonymous, no sign-up required |
| **Kitsu** | Keyless native anime fallback: recognized content remains indexable with its `kitsu:` identifier even when TMDB has no match |
| **Stremio metadata addons** | Multiple renameable, ordered, testable, and pausable fallbacks through search-enabled `manifest.json` files, such as [AIOMetadata](https://github.com/cedya77/aiometadata) |
| **Concerts** 🆕 NEW | Detected via TMDB genre 10402 (Music) + OMDb confirmation, without narrative genres (Drama, Action…) |
| **Live Shows** 🆕 NEW | Detected via title keywords (Stand-up, One Man Show, Theatre, Circus…) + OMDb confirmation |
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
| **Pre-warmed cache** | The first five pages of every published catalog are rebuilt after startup and each invalidation |
| **RPDB** | Rating posters (optional) |
| **PostersPlus** | Direct support for AIOMetadata-compatible URL templates, with RPDB and original-art fallbacks |
| **Discord notifs** 🆕 NEW | Enhanced notifications with poster gallery on each sync |
| **Apprise notifs** 🆕 NEW | Multi-service notifications via Apprise server (optional) |
| **Notification language** 🆕 NEW | Discord/Apprise language configurable independently from the WebUI (FR/EN/DE) |
| **Explicit auto sync** | Collect due sources on their own schedules → normalize and match → unfrozen catalogs → invalidate the Stremio cache |
| **Modern WebUI** | Sidebar, dark/light theme, multilingual FR/EN/DE |
| **Media Library** 🆕 NEW | Redesign: poster/list view, sort, year filter (shortcuts + free input/range), inline releases, RPDB posters, persistent pagination |
| **Overview** | Latest additions in collapsible per-category accordions (title + year + IMDB link) |
| **Migration and repair** | Read-only analysis, SQLite backup, grouped corrections, history, and one-time versioned migrations |
| **Source management** | Tabs, search, collapsible groups, complete editing, and a schedule per source |
| **Per-source status** | Last success, next collection, duration, fetched items, consecutive errors, and cap usage |
| **Indexer APIs** | Multiple renameable Newznab, Prowlarr, Jackett/Torznab, and NZBHydra2 sources with pagination, an incremental cursor, cap, and delay |
| **WaStream/WaCustom** | Multiple renameable instances; paginated WASource content import with IMDb/TMDB IDs, resumable traversal, per-source frequency, pause, and cap |
| **StreamFusion Reborn** | Multiple renameable instances; signed and encrypted private-cache import through the official Peer API, with pagination and an incremental cursor |
| **CometNet** | Non-exhaustive supplemental source: signed persistent receiver for newly routed gossip announcements, with no guaranteed historical import |
| **Configuration backup** | Versioned export/import; sensitive keys and URLs are excluded unless explicitly requested |
| **Proxy** | HTTP / HTTPS / SOCKS4 / SOCKS5 + built-in connection test |
| **SQLite WAL** | Persistent data, concurrent reads, optimized indexes, foreign keys, and busy-write waiting |
| **Tag filtering** | Configurable required tags from the WebUI (FRENCH, MULTi, 1080p…) |
| **Docker** | Multi-arch image `linux/amd64` + `linux/arm64` |

> Defaults to French-language content (FRENCH / MULTi / TRUEFRENCH / VOF / VFF / VFI / VFQ) — configurable from the WebUI

---

## Screenshots

| | |
|---|---|
| ![Media Library](screens/Mediatheque.png) | ![Overview](screens/Vue.d.Ensemble.png) |
| ![Configuration](screens/Configuration.png) | ![Failures](screens/Echecs.png) |
| ![Sources](screens/Sources.png) | ![Sync](screens/Synchronisation.png) |

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
      - /path/to/stremio-rss-catalog/:/data
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

Then open the WebUI at `http://localhost:7973`, add content sources under
**Sources**, manage historical and custom catalogs under **Catalogs**, optionally
apply an MDBList, ListSync, or SuggestArr guide, run a first sync, and install
the addon in Stremio using the provided URL. A TMDB key is required for sources
whose titles still need matching.

> **`TZ`** sets the container timezone. Adjust to your own timezone (e.g. `America/New_York`) for correct date display in the WebUI and proper sync history grouping.

---

## Content sources

All sources are configured under **Sources**. Standard RSS feeds remain supported,
while Newznab, Prowlarr, Jackett, and NZBHydra2 are first-class paginated API
sources rather than RSS shortcuts.

For Prowlarr, use an indexer's Torznab/Newznab URL, for example
`http://prowlarr:9696/1/api`. For Jackett, use the Torznab endpoint copied from
its UI, for example
`http://jackett:9117/api/v2.0/indexers/my-indexer/results/torznab/api`.
Adding indexers separately lets you rename them and see their origin in the
media library.

An indexer's first collection reads `t=caps`, then fetches `t=search` pages with
`offset` until the configured cap **per category** is reached. The safety limit
can be raised to **10,000,000**, which acts as a quasi-unlimited mode. A true
infinite value would be unsafe for a source whose pagination never ends. Page
sizes remain server-limited, and the default delay is 750 ms between pages.
This is a batch-memory guard, not a limit on the accumulated library.

Later collections start at the newest page and stop at the persisted cursor or
the end of the overlap window. The cursor is committed only after the batch was
processed successfully, so an interruption causes a safe replay rather than
lost items.

The global frequency is the default. Each source can override it under
**Sources**. The scheduler checks due times every minute and collects only due
sources. Once a batch exists, catalog processing and cache invalidation happen
immediately; there is no second delayed push to Stremio.

Pastebin sources support direct content, JSON pointers, and categorized master
indexes. Stremio manifest sources discover remote catalogs and make them
selectable in the catalog manager.

This also imports movie/series catalogs from compatible addons such as Plexio
or Stremio Jellyfin, and anime catalogs from Kitsu. A
stream-only manifest does not expose an addon's internal database: for example,
a Comet manifest cannot enumerate every media item without a dedicated export
API.

### Exact CometNet scope

Stremio RSS Catalog connects as a signed receiving peer and persists valid
announcements before processing them. CometNet is a fanout-based gossip
protocol: the receiver gets new announcements routed to it, not a guaranteed
copy of the target peer's database. `sync_request` and `sync_response` message
names exist in the protocol but are not implemented by Comet, so exhaustive
historical backfill is currently unavailable.
CometNet pools are contributor trust filters. Creating a pool with the target
peer does not force its existing cache to be replayed and therefore does not
provide historical backfill.

> **In short:** CometNet can progressively supplement the library, but it is
> not an exhaustive source. Prefer a paginated API, catalog manifest, RSS feed,
> or cache export for a complete initial import.

A WebDAV source points to a root folder. The addon scans subfolders with
`PROPFIND`, keeps configured video extensions, then applies the same title
cleanup and TMDB matching used for RSS. It does not play files: install
[Davio](https://github.com/arvida42/davio) separately in Stremio to resolve the
same WebDAV. Local WebDAV sources bypass the global proxy by default, with an
opt-in switch per source.

A [WaCustom](https://github.com/dydy13014/wacustom) source uses the instance URL
and its administrator password. The addon reads the paginated WASource API and
stores only identifiers and catalog metadata, not playback links. Large initial
imports resume on subsequent synchronizations until the traversal is complete.

Source cards mask sensitive URLs and keys; revealing or copying them requires
an explicit action. Configuration exports follow the same rule: secrets are
excluded by default and require a dedicated confirmation. A SQLite backup is
created before every import.

> The `manifest.json` URL never changes. Existing catalog content is dynamic,
> but Stremio stores the manifest in the user profile. After creating, deleting,
> renaming, or changing catalog visibility, use **Install / upgrade** to refresh
> it without uninstalling the addon.

## Catalog guides

A guide is never a content source. It provides an ordered identifier list and
the addon intersects it with its local library:

```text
ordered external list ∩ already indexed media = catalog content
```

- **MDBList**: list URL or identifier with pagination up to the chosen cap;
- **ListSync**: instance URL, list type, and list identifier; ListSync's current
  per-list endpoint is limited to 100 items;
- **SuggestArr**: instance URL, local account, and recommendation statuses; JWT
  login and 100-item pagination are handled automatically.
- **Agregarr**: instance URL and API key, collection discovery, then ordered
  preview import using TMDB identifiers. A collection already synchronized to
  Plex can also be selected directly from the Plex source.

Credentials remain masked and are excluded from configuration exports unless
the user explicitly includes secrets.

The [Agregarr](https://github.com/agregarr/agregarr) integration uses its
official `api/v1`, `X-Api-Key` authentication, and asynchronous preview
endpoints. It does not scrape the HTML interface.

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

**Anime identification (MAL + AniList + Kitsu):**

MAL, AniList, and Kitsu provide canonical titles before TMDB is searched. If TMDB fails, configured Stremio metadata addons are queried by priority, then the native Kitsu, MAL, or AniList identifier is preserved. The corresponding metadata addon must also be installed in Stremio to display the full metadata page.

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

Catalog responses are cached in memory and automatically invalidated after
updates. The first five pages of each published catalog are then pre-warmed in
the background. JSON responses are compressed and also use a 30-second
revalidatable HTTP cache. Set `CATALOG_HTTP_CACHE_SECONDS` to `0` to disable it,
or up to `300` seconds. Searches are not cached.

### Artwork and AIOMetadata

Every catalog item already contains a poster URL. Stremio RSS Catalog applies
the following priority: **PostersPlus → RPDB → metadata artwork →
placeholder**. This provides consistent direct rendering in Stremio without
requiring another metadata addon.

When catalogs are routed through
[AIOMetadata](https://github.com/cedya77/aiometadata), AIOMetadata may keep or
replace that poster according to its own artwork providers. Choose which addon
should be authoritative:

- Stremio RSS Catalog, for catalogs that are already illustrated;
- AIOMetadata, to centralize artwork selection and image caching;
- or the same template in both, while remembering that AIOMetadata still
  applies its configured provider priority.

Processing artwork here removes that work for direct use, but does not
automatically disable AIOMetadata artwork providers.

### Persistence

Everything is stored in a WAL-enabled SQLite database (`data/addon.db`).
Content **accumulates** — a sync never replaces existing data. This is suitable
for hundreds of thousands of indexed rows and concurrent catalog reads in one
application process.

### Upgrade compatibility

Upgrades are designed for existing installations:

- the same `/data` volume and `addon.db` file;
- the same `community.useflowfr.catalog` addon identifier;
- the same `manifest.json` and `catalog/...` routes;
- the same identifiers for the nine historical catalogs;
- existing settings, media, and releases are preserved;
- new tables, columns, indexes, and defaults are added through idempotent
  startup migrations.

The addon does not need to be removed and reinstalled in Stremio. Backing up
the `/data` volume before an upgrade is still recommended, as with any database
migration.

### Scope

This project deliberately remains a **catalog** addon and does not provide
stream playback. Stream resolution remains the responsibility of dedicated
addons such as AIOStreams or Comet.

---

## Migration and repair

The advanced **Configuration → Migration and repair** section replaces the
previous reclassification buttons:

1. **Analyze media library** runs a read-only diagnostic and shows proposed
   corrections per category.
2. **Back up and apply** first creates a SQLite copy under `/data/backups`, then
   applies local corrections.
3. TMDB animation verification is optional because it requires one remote call
   per candidate and may take several minutes.
4. Every operation is recorded with its status, result, and backup name.

Source-rule reclassification remains a separate manual action because it may
move a large part of the library. No destructive correction cron is installed.
Future migrations are numbered, backed up when required, and run only once.

---

## WebUI Login

- **Credentials**: defined in `docker-compose.yml`
- **Session secret**: generate with `openssl rand -hex 32`

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
image: ghcr.io/aerya/stremio-rss-catalog:latest
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
- **Kitsu** — enabled by default, no key required
- **Stremio metadata addon** — optional fallback through a configured `manifest.json` URL, for example AIOMetadata
- **OMDb API key** — enables concert and live show detection (free at [omdbapi.com](https://www.omdbapi.com/apikey.aspx), 1000 req/day)

**5. Reinstall the addon in Stremio** if you changed ports.

---

## Notes

- The first sync may take several minutes depending on feed size — do it **before** installing the addon in Stremio
- Catalogs are paginated in pages of 100 media — Stremio loads them as you scroll, with no limit
- IMDb IDs are preferred; supported native anime identifiers are also preserved
- Concert and live show detection requires an OMDb API key (free, 1000 req/day at omdbapi.com)
- AniList is enabled by default and requires no key — it can be disabled from the config
- Media indexed before new categories were added remains in its old category — use analysis followed by grouped repair

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

## Credits

- Successor to [UseFlow-FR](https://github.com/Aerya/UseFlow-FR) — original codebase, compatible database
- Built on the [Stremio Addon SDK](https://github.com/Stremio/stremio-addon-sdk)
- Metadata: [TMDB](https://www.themoviedb.org/), [TVDB](https://thetvdb.com/), [OMDb](https://www.omdbapi.com/), [MyAnimeList](https://myanimelist.net/), [AniList](https://anilist.co/), [Kitsu](https://kitsu.io/), and [AIOMetadata](https://github.com/cedya77/aiometadata)
- Integrations: [Prowlarr](https://prowlarr.com/), [NZBHydra2](https://github.com/theotherp/nzbhydra2), [Apprise](https://github.com/caronc/apprise), [RPDB](https://ratingposterdb.com/)

---

## License

[GNU GPL v3](./LICENSE) — Please credit the source.

**Happy streaming**
