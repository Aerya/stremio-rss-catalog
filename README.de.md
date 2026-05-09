<h1 align="center">
  <img src="src/public/logo.png" alt="Stremio RSS Catalog" width="120"><br>
  Stremio RSS Catalog
</h1>

<p align="center">
  <strong>Verwandeln Sie Ihre RSS-Feeds, Prowlarr und NZBHydra2 in Stremio-Kataloge — Filme · Dokumentarfilme · Serien · TV-Sendungen · Anime · Konzerte · Aufführungen</strong>
</p>

<p align="center">
  <a href="./README.md">🇫🇷 Français</a> · <a href="./README.en.md">🇬🇧 English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Stremio-addon-purple?style=flat-square" alt="Stremio">
  <img src="https://img.shields.io/badge/Docker-ready-blue?style=flat-square&logo=docker" alt="Docker">
  <img src="https://img.shields.io/badge/TMDB%20%2B%20TVDB%20%2B%20OMDb-matched-green?style=flat-square" alt="TMDB+TVDB+OMDb">
  <img src="https://img.shields.io/badge/Prowlarr-compatible-blue?style=flat-square" alt="Prowlarr">
  <img src="https://img.shields.io/badge/NZBHydra2-compatible-blue?style=flat-square" alt="NZBHydra2">
  <img src="https://img.shields.io/badge/i18n-FR%20%7C%20EN%20%7C%20DE-orange?style=flat-square" alt="i18n">
  <img src="https://img.shields.io/badge/MyAnimeList-integriert-blue?style=flat-square" alt="MAL">
  <img src="https://img.shields.io/badge/AniList-integriert-teal?style=flat-square" alt="AniList">
</p>

---

<p align="center">
  Nutzen Sie es? Mögen Sie es? <a href="https://github.com/Aerya/stremio-rss-catalogs/stargazers">Geben Sie einen Stern!</a> — es dauert nur eine Sekunde.
</p>

---

> Ein selbst gehostetes Stremio-Addon, das Ihre RSS-Feeds, Prowlarr und NZBHydra2 aggregiert, **9 Inhaltskategorien** automatisch erkennt (Filme, Dokumentarfilme, Serien, TV-Sendungen, Anime, Konzerte, Aufführungen), sie auf TMDB/TVDB/OMDb (und MAL + AniList für Anime) abgleicht und als Kataloge in Stremio bereitstellt.

---

## Funktionen

| | |
|---|---|
| **9 Kataloge** | Filme · Dokumentarfilme (Filme) · Dokumentarfilme (Serien) · Serien · TV-Sendungen · Anime (Filme) · Anime (Serien) · Konzerte · Aufführungen |
| **Auto-Erkennung** | Kategorie aus Release-Name, Feed-URL-Schlüsselwörtern oder TMDB/OMDb-Genres ermittelt |
| **Feed-URL-Erkennung** | Kategorie wird im Auto-Modus automatisch aus Schlüsselwörtern in der RSS-Feed-URL abgeleitet (`concert`, `anime`, `docu`, `serie`…) |
| **Anime** | Via TMDB-Genre 16 + japanische Herkunft, OVA/OAV im Titel oder per Feed erzwungen |
| **MAL** | MyAnimeList API v2 — EN-Titel-Normalisierer für besseren TMDB-Abgleich bei Anime (optional, kostenloser Schlüssel) |
| **AniList** | AniList GraphQL-API — ergänzender Titel-Normalisierer (Romaji + Originaltitel), vollständig kostenlos und anonym, keine Registrierung erforderlich |
| **Konzerte** | Via TMDB-Genre 10402 (Music) + OMDb-Bestätigung, ohne narrative Genres (Drama, Action…) |
| **Aufführungen** | Via Titel-Schlüsselwörter (Stand-up, One Man Show, Theater, Zirkus…) + OMDb-Bestätigung |
| **OMDb** | OMDb-API nach jedem TMDB-Match abgefragt, um Konzert- und Aufführungsklassifizierung zu bestätigen |
| **TMDB-Abgleich** | Bis zu 5 Versuche pro Release (FR/EN, mit/ohne Jahr, vereinfachter Titel) |
| **TVDB-Fallback** | Fallback für auf TMDB nicht gefundene Serien + Dokumentarfilm-Bestätigung (optional) |
| **Doku-Serien** | Via TMDB-Genre 99 oder TVDB erkannt, in Dokumentarfilme (Serien) eingeordnet |
| **TV-Sendungen** | Dedizierter Katalog — automatisch via TMDB Reality/Talk/News/Soap oder per Feed erzwungen |
| **Falsch-Positiv-Schutz** | Widersprüchliche Genres deaktivieren Dokumentarfilm- (Action, SF, Fantasy, Horror), Sendungs- (SF, Fantasy, Animation) und Konzert-Erkennung (Drama, Komödie, Romance) |
| **Spezifitätshierarchie** | Automatische Reklassifizierung kann eine spezifischere Kategorie nie herabstufen — Anime (4) > Dokus/Sendungen/Konzerte/Aufführungen (3) > Serien (2) > Filme (1) |
| **Manuelle Kategorieänderung** | Aus dem Medien-Detailbereich in der Mediathek |
| **Manuelles Release-Override** | IMDB-/TMDB-/TVDB-ID einer fehlgeschlagenen Release direkt in der WebUI erzwingen |
| **Deduplizierung** | Per IMDB-ID (Medien) + per RSS-GUID + per Torrent-Hash wenn verfügbar (Releases) |
| **Hashes** | Automatische Infohash-Extraktion aus Magnet-/Torrent-Links |
| **Retry** | Nicht gematchte Releases gespeichert und wiederholbar |
| **Cache** | Katalogantworten im Speicher gecacht, automatische Invalidierung nach Sync |
| **RPDB** | Bewertungs-Poster (optional) |
| **Discord** | Erweiterte Benachrichtigungen mit Poster-Galerie bei jeder Sync |
| **Apprise** | Multi-Service-Benachrichtigungen via Apprise-Server (optional) |
| **Benachrichtigungssprache** | Discord/Apprise-Sprache unabhängig von der WebUI konfigurierbar (FR/EN/DE) |
| **Auto-Sync** | Konfigurierbare Planung — Auslösung nur beim Start und per Timer, nie beim Konfigurationsspeichern |
| **Moderne WebUI** | Sidebar, Hell-/Dunkel-Theme, mehrsprachig FR/EN/DE |
| **Mediathek** | Poster-/Listenansicht, Sortierung, Jahresfilter (Schnellauswahl + freie Eingabe/Bereich), Releases inline, RPDB-Poster, persistente Paginierung |
| **Übersicht** | Neueste Hinzufügungen in ausklappbaren Kategorie-Akkordeons (Titel + Jahr + IMDB-Link) |
| **Wartungs-Suite** | 8 Reklassifizierungsaktionen (Anime, Dokus, falsche Dokus, falsche Sendungen, Konzerte, falsche Konzerte, Aufführungen, Feed-Konfiguration) |
| **Quellen** | Feed-Statistiken mit benutzerdefinierter Benennung |
| **Integrationen** | Prowlarr + NZBHydra2 per Klick aus der WebUI einrichten |
| **Proxy** | HTTP / HTTPS / SOCKS4 / SOCKS5 + integrierter Verbindungstest |
| **SQLite** | Persistente Daten, inkrementelle Inhalte, optimierte Indizes |
| **Tag-Filterung** | Konfigurierbare erforderliche Tags über die WebUI (FRENCH, MULTi, 1080p…) |
| **Docker** | Multi-Arch-Image `linux/amd64` + `linux/arm64` |

> Standardmäßig auf französischsprachige Inhalte beschränkt (FRENCH / MULTi / TRUEFRENCH / VOF / VFF / VFI / VFQ) — konfigurierbar über die WebUI

---

## Screenshots

| | |
|---|---|
| ![Mediathek](screens/Médiathèque.png) | ![Übersicht](screens/Vue.d.Ensemble.png) |
| ![Synchronisierung](screens/Synchronisation.png) | ![Fehlgeschlagene Releases](screens/Echecs.png) |
| ![Quellen](screens/Sources.png) | ![Konfiguration](screens/Configuration.png) |

![Discord-Benachrichtigung](screens/DiscordNotif.png)

---

## Schnellstart

[docker-compose.yml](./docker-compose.yml) kopieren oder erstellen:

```yaml
services:
  stremio-rss-catalog:
    image: ghcr.io/aerya/stremio-rss-catalog:latest
    container_name: stremio-rss-catalog
    restart: always
    ports:
      - "7973:7000"
    volumes:
    # An Ihre Konfiguration anpassen: /pfad/zu/ihren/daten/:/data
      - /home/aerya/docker/stremio-rss-catalog/:/data
    environment:
      - PORT=7000
      - NODE_ENV=production
      - TZ=Europe/Paris
      # Ändern
      - WEBUI_USERNAME=admin
      - WEBUI_PASSWORD=admin
      # Nicht ändern
      - DB_PATH=/data/addon.db
      # Generieren mit: openssl rand -hex 32
      - SESSION_SECRET=changeme
```

Dann die WebUI unter `http://localhost:7973` öffnen, RSS-Feed(s) + TMDB-API-Schlüssel konfigurieren, eine erste Synchronisierung starten und das Addon in Stremio mit der angegebenen URL installieren.

> **`TZ`** legt die Zeitzone des Containers fest. Passen Sie diese an Ihre eigene Zeitzone an (z. B. `Europe/Berlin`) für eine korrekte Datumsanzeige in der WebUI und eine korrekte Gruppierung des Sync-Verlaufs.

---

## Kompatible RSS-Quellen

Das Tool akzeptiert jeden Standard-RSS-Feed. Zusätzlich zu den nativen Feeds Ihrer Tracker ist es mit **Prowlarr** und **NZBHydra2** kompatibel:

### Prowlarr (BitTorrent)

Die Schnellintegrations-Schaltflächen generieren **aggregierte** Feeds (alle Ihre Indexer):

| Schaltfläche | Generierte URL |
|---|---|
| Alle | `/api/v1/indexer/all/newznab?apikey=XXXX&t=rss` |
| Filme | `/api/v1/indexer/all/newznab?apikey=XXXX&t=rss&cat=2000` |
| Serien | `/api/v1/indexer/all/newznab?apikey=XXXX&t=rss&cat=5000` |

Um einen **bestimmten Indexer** anzusprechen, fügen Sie seine URL direkt in der RSS-Feed-Liste hinzu:
```
http://prowlarr:9696/{id}/api?apikey=XXXX&t=rss
```
*(ersetzen Sie `{id}` durch die numerische Indexer-ID in Prowlarr)*

### NZBHydra2 (Usenet)

Die Schaltflächen generieren **aggregierte** Feeds (alle Ihre Quellen):

| Schaltfläche | Generierte URL |
|---|---|
| Alle | `/api?t=rss&apikey=XXXX` |
| Filme | `/api?t=rss&apikey=XXXX&cat=2000` |
| Serien | `/api?t=rss&apikey=XXXX&cat=5000` |

> Jede Schaltfläche fügt eine **neue Zeile** zur RSS-Feed-Liste hinzu — Sie können mehrere klicken, um Filme und Serien als separate Feeds zu haben. Die gespeicherte Basis-URL dient nur der Schnellintegration und ist selbst kein RSS-Feed.

---

## Migration von UseFlow-FR

Sie nutzen die [alte Version (UseFlow-FR)](https://github.com/Aerya/UseFlow-FR)? Die Migration ist nahtlos — Ihre Datenbank ist vollständig kompatibel.

**1. Alten Container stoppen**
```bash
docker compose down
```

**2. `docker-compose.yml` aktualisieren**

```yaml
# Vorher
image: ghcr.io/aerya/useflow-fr:latest

# Nachher
image: ghcr.io/aerya/stremio-rss-catalogs:latest
```

> Der Volume-Pfad (`/data`) und die Variable `DB_PATH` ändern sich nicht.

**3. Neuen Container starten**
```bash
docker compose up -d
```

Die Datenbankmigration wird beim ersten Start automatisch durchgeführt. Ihre gesamte bestehende Konfiguration bleibt erhalten.

**4. (Optional) Neue Funktionen konfigurieren**

- **TVDB API-Schlüssel** — verbessert die Erkennung von Doku-Serien (kostenlos auf [thetvdb.com](https://thetvdb.com))
- **MAL Client-ID** — verbessert den Anime-Abgleich (kostenlos auf [myanimelist.net/apiconfig](https://myanimelist.net/apiconfig))
- **AniList** — standardmäßig aktiviert, kein Schlüssel erforderlich
- **OMDb API-Schlüssel** — aktiviert die Konzert- und Aufführungserkennung (kostenlos auf [omdbapi.com](https://www.omdbapi.com/apikey.aspx), 1000 Anfragen/Tag)

**5. Addon in Stremio neu installieren**, falls Sie den Port geändert haben.

---

## Funktionsweise

### Vorgelagerte Filterung

Vor jeder Verarbeitung wird jede Release anhand der in der WebUI konfigurierten **erforderlichen Tags** gefiltert. Eine Release ohne diese Tags wird sofort ignoriert.

### Release-Parsing

Jeder Release-Titel wird analysiert, um Folgendes zu extrahieren:
- Den **bereinigten Namen** (technische Tags entfernt: Auflösung, Codec, Sprache, Team…)
- Das **Erscheinungsjahr**
- Den **Typ**: Film oder Serie — mit Priorität: Anime > Konzert > Aufführung > Dokumentarfilm > TV-Sendung > Serie > Film
- Den **Infohash**: aus Magnet-/Torrent-Links im RSS-Feed extrahiert

### Kategorieerkennung

Die endgültige Kategorie ergibt sich aus drei Quellen in Prioritätsreihenfolge:

1. **Explizite Feed-Erzwingung** — der Benutzer legt die Kategorie eines Feeds manuell fest
2. **Feed-URL-Erkennung** — im Auto-Modus werden Schlüsselwörter in der RSS-Feed-URL zur Kategoriebestimmung genutzt
3. **Release-Titel-Schlüsselwörter** — `OVA`, `STAND UP`, `CONCERT`, `LIVE AT`, `DOCU`…
4. **TMDB-Genres + OMDb-Bestätigung** — nach dem TMDB-Match können die Genres eine Reklassifizierung auslösen

### Matching-Pipeline

```
RSS-Release
  → Tag-Filter
  → Parsing (Typ + Kategorie aus Titel + Feed-URL)
  → Anime erkannt?
      ja  → MAL (falls konfiguriert) + AniList (falls aktiviert) → normalisierte Titel → TMDB → OMDb → DB
      nein → TMDB (5 Versuche FR/EN) → OMDb → Genre-Reklassifizierung → DB
                  ↓ Fehlschlag (Serie)
              TVDB-Fallback → DB
  → Vollständiger Fehlschlag → failed_releases (manueller oder automatischer Retry)
```

**Anime-Titel-Normalisierung (MAL + AniList):**

MAL und AniList werden kombiniert eingesetzt, um vor der TMDB-Suche den kanonischen englischen Titel zu ermitteln. MAL hat Priorität, wenn ein Schlüssel konfiguriert ist; AniList ergänzt ihn (oder agiert allein, wenn MAL nicht konfiguriert ist). Die TMDB-Suchversuche werden aus den Titeln beider Quellen aufgebaut, dedupliziert und nach Relevanz geordnet (EN-Titel, Romaji, Originaltitel, cleanName-Fallback).

**TMDB — 5 Versuche der Reihe nach (Nicht-Anime):**
1. Genauer Titel + Jahr, Französisch
2. Genauer Titel ohne Jahr, Französisch
3. Genauer Titel ohne Jahr, Englisch
4. Vereinfachter Titel (erste 3 Wörter) + Jahr, Englisch
5. Vereinfachter Titel ohne Jahr, Englisch

**Automatische Reklassifizierung nach TMDB-Match:**
- Genre 99 (Documentary) ohne widersprüchliche Genres (Action/SF/Fantasy/Horror) → **Dokumentarfilme**
- Genre 16 (Animation) + japanische Herkunft → **Anime** *(nur Auto-Modus-Quellen)*
- Reality/Talk/News/Soap-Genres ohne widersprüchliche Genres → **TV-Sendungen** *(nur Auto-Modus-Quellen)*
- Genre 10402 (Music) ohne narrative Genres (Drama/Komödie/Romance/Action) + OMDb bestätigt "Music" → **Konzerte**
- Stand-up/Theater/Zirkus-Schlüsselwörter + OMDb bestätigt nicht-narrative Komödie → **Aufführungen**

**Spezifitätshierarchie** — automatische Reklassifizierung kann eine spezifischere Kategorie nie herabstufen:
- Filme (1) < Serien (2) < TV-Sendungen/Dokumentarfilme/Konzerte/Aufführungen (3) < Anime (4)

### Datenbankarchitektur

```
media           → 1 Zeile pro Film/Serie (Schlüssel: imdb_id)
releases        → N Releases pro Medium (Qualität, Hash, Quelle, Datum)
failed_releases → nicht gematchte Releases (für Retry)
```

### Cache

Katalogantworten werden zwischen Syncs gecacht und nach jeder erfolgreichen Sync automatisch invalidiert. Suchanfragen werden nicht gecacht.

### Persistenz

Alles wird in einer SQLite-Datenbank (`data/addon.db`) gespeichert. Inhalte **akkumulieren sich** — eine Sync ersetzt niemals vorhandene Daten.

---

## Wartungs-Suite

Unter **Konfiguration → Wartung** in der WebUI sind 8 Aktionen verfügbar:

| Aktion | Beschreibung |
|---|---|
| Anime neu klassifizieren | Erkennt Filme/Serien mit TMDB-Animations-Genre + japanischer Herkunft. Erfordert TMDB-Schlüssel. |
| Dokumentarfilme neu klassifizieren | Erkennt Medien mit TMDB-Genre 99 in der DB. Kein API-Aufruf. |
| Falsche Dokumentarfilme korrigieren | Entfernt Medien mit widersprüchlichen Genres (Action, SF…) aus Dokumentarfilmen. Kein API-Aufruf. |
| Falsche TV-Sendungen korrigieren | Entfernt Serien mit inkompatiblen Genres (SF, Animation…) aus TV-Sendungen. Kein API-Aufruf. |
| Konzerte neu klassifizieren | Erkennt Medien mit TMDB-Music-Genre (10402) ohne narrative Genres. Kein API-Aufruf. |
| Falsche Konzerte korrigieren | Entfernt Medien mit narrativen Genres (Drama, Action…) aus Konzerten. Kein API-Aufruf. |
| Aufführungen neu klassifizieren | Erkennt Medien mit Aufführungs-Schlüsselwörtern im Release-Namen (Stand-up, Theater, Zirkus…). Kein API-Aufruf. |
| Nach Feed-Konfiguration neu klassifizieren | Reklassifiziert alle Medien basierend auf aktuellen Feed-Einstellungen + URL-Erkennung. Respektiert Spezifitätshierarchie. Kein API-Aufruf. |

---

## WebUI-Anmeldung

- **Zugangsdaten**: in `docker-compose.yml` festgelegt
- **Session-Secret**: mit `openssl rand -hex 32` generieren

---

## Hinweise

- Die erste Synchronisierung kann je nach Feed-Größe mehrere Minuten dauern — **vor** der Installation des Addons in Stremio durchführen
- Kataloge werden in Seiten von 100 Medien paginiert — Stremio lädt sie beim Scrollen, ohne Limit
- Nur Inhalte mit einer gültigen IMDB-ID werden indexiert — Stremio akzeptiert ausschließlich IMDB-IDs
- Konzert- und Aufführungserkennung erfordert einen OMDb API-Schlüssel (kostenlos, 1000 Anfragen/Tag auf omdbapi.com)
- AniList ist standardmäßig aktiviert und erfordert keinen Schlüssel — es kann in der Konfiguration deaktiviert werden
- Vor Hinzufügung der neuen Kategorien indizierte Medien bleiben in ihrer alten Kategorie — verwenden Sie die Wartungsschaltflächen zur Reklassifizierung

### Inhärente Grenzen von Drittanbieter-APIs

Die gesamte Klassifizierung basiert auf Community-Datenbanken und Drittanbieter-APIs — **IMDB**, **TMDB**, **OMDb**, **TVDB**, **MyAnimeList** und **AniList**. Diese Quellen sind von Natur aus unvollständig:

- Ein Titel kann in einer oder mehreren Datenbanken **fehlen** und bleibt dann ohne Match (er landet in `failed_releases`)
- **Genres und Metadaten** werden von der Community eingepflegt: Ein Dokumentarfilm kann Genre 99 fehlen, einem Anime kann Genre 16 fehlen, ein Konzertfilm kann als Drama getaggt sein
- Die **Originalsprache** (für die Anime-Erkennung verwendet) kann in TMDB fehlen oder falsch sein
- OMDb kann für denselben Titel andere Genres als TMDB zurückgeben oder gar keinen Eintrag haben
- MAL und AniList können für denselben Anime unterschiedliche englische Titel zurückgeben oder den Titel gar nicht haben
- Ein **falscher TMDB-Treffer** (Namensvetter, ungefährer Titel) kann zu einer falschen Klassifizierung führen
- Gefilmte Konzerte, TV-Specials und Musik-Dokumentarfilme haben ähnliche Merkmale — **Falsch-Positive oder Falsch-Negative** sind in diesen Kategorien möglich

Die Wartungswerkzeuge (manuelle Reklassifizierung, Korrektur von Falsch-Positiven) und die Kategorieänderung im Medien-Detailbereich ermöglichen die manuelle Korrektur problematischer Fälle.

---


## Lizenz

GNU GPL v3 — Bitte die Quelle angeben.

**Viel Spaß beim Streamen**
