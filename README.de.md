<h1 align="center">
  <img src="src/public/logo.png" alt="Stremio RSS Catalog" width="120"><br>
  Stremio RSS Catalog
</h1>

<p align="center">
  <strong>Verwandeln Sie Ihre RSS-Feeds in Stremio-Kataloge — Filme, Dokumentarfilme und Serien</strong>
</p>

<p align="center">
  <a href="./README.md">🇫🇷 Français</a> · <a href="./README.en.md">🇬🇧 English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Stremio-addon-purple?style=flat-square" alt="Stremio">
  <img src="https://img.shields.io/badge/Docker-ready-blue?style=flat-square&logo=docker" alt="Docker">
  <img src="https://img.shields.io/badge/TMDB%20%2B%20TVDB-matched-green?style=flat-square" alt="TMDB+TVDB">
  <img src="https://img.shields.io/badge/i18n-FR%20%7C%20EN%20%7C%20DE-orange?style=flat-square" alt="i18n">
</p>

---

<p align="center">
  💡 Nutzen Sie es? Mögen Sie es? <a href="https://github.com/Aerya/stremio-rss-catalogs/stargazers">⭐ Geben Sie einen Stern!</a> — es dauert nur eine Sekunde.
</p>

---

> Ein selbst gehostetes Stremio-Addon, das Ihre RSS-Feeds parst, Filme, Dokumentarfilme und Serien automatisch erkennt, sie auf TMDB/TVDB abgleicht und als Kataloge in Stremio bereitstellt.

---

## ✨ Neuigkeiten

- 🏗️ **Neue DB-Architektur**: Medien und Releases werden getrennt gespeichert — ein Eintrag pro IMDB-ID, alle Releases desselben Films/Shows werden verknüpft
- 🔁 **Null Duplikate garantiert**: Deduplizierung per IMDB-ID, unabhängig von Feed oder Sync-Datum
- 🔍 **Verbesserter TMDB-Abgleich**: Bis zu 5 Versuche pro Release (mit/ohne Jahr, FR dann EN, vereinfachter Titel) — deutlich höhere Trefferquote
- 📺 **TVDB-Fallback**: Schlägt TMDB bei einer Serie fehl, wird TVDB automatisch abgefragt — verbessert auch die Dokumentarfilm-Erkennung (optional, kostenloser API-Schlüssel)
- 🎬 **5 Kataloge**: Filme · Dokumentarfilme (Filme) · Dokumentarfilme (Serien) · Serien · TV-Sendungen — Doku-Serien landen in Dokumentarfilmen, nicht in Serien
- 🔄 **Retry bei Fehlschlägen**: Nicht gematchte Releases werden gespeichert und können über die WebUI oder API erneut verarbeitet werden
- #️⃣ **Hash-Extraktion**: Der Infohash wird automatisch aus Magnet-/Torrent-Links in RSS-Feeds extrahiert
- 🏷️ **Qualitäts-Tracking**: Auflösung und Quelle (4K HDR, 1080p WEB-DL…) werden pro Release gespeichert
- 📡 **Quellen-Tracking**: Die ursprüngliche RSS-Feed-URL wird für jede Release gespeichert
- 📺 **TV-Shows**: Dedizierter Katalog — automatische Klassifizierung anhand TMDB-Genres (Reality, Talk, News, Soap) oder per RSS-Feed erzwingbar
- ♾️ **Kataloge ohne Limit**: Native Stremio-Paginierung (100 Items/Seite), keine künstliche Begrenzung
- ⚡ **In-Memory-Cache**: Katalogantworten werden zwischen Syncs zwischengespeichert — sofortige Antworten für gleichzeitige Nutzer, automatische Invalidierung nach jeder Sync

---

## 🎬 Funktionen

| | |
|---|---|
| 📁 **5 Kataloge** | Filme · Dokumentarfilme (Filme) · Dokumentarfilme (Serien) · Serien · TV-Sendungen |
| 🔍 **Auto-Erkennung** | Typ wird aus dem Release-Namen erkannt oder pro Feed erzwungen |
| 🎯 **TMDB-Abgleich** | Bis zu 5 Versuche pro Release (FR/EN, mit/ohne Jahr) |
| 📺 **TVDB-Fallback** | Fallback für auf TMDB nicht gefundene Serien + Dokumentarfilm-Bestätigung (optional) |
| 🎬 **Doku-Serien** | Via TMDB-Genre 99 oder TVDB erkannt, in Dokumentarfilme (Serien) eingeordnet |
| 📺 **TV-Shows** | Dedizierter Katalog — automatisch via TMDB-Genres oder per Feed erzwungen |
| 🔁 **Deduplizierung** | Per IMDB-ID (Medien) + per RSS-GUID + per Torrent-Hash wenn verfügbar (Releases) |
| #️⃣ **Hashes** | Automatische Infohash-Extraktion aus Magnet-/Torrent-Links |
| 🏷️ **Qualität** | 4K, HDR, DV, 1080p, WEB-DL… pro Release erkannt |
| 🔄 **Retry** | Nicht gematchte Releases gespeichert und wiederholbar |
| ⚡ **Cache** | Katalogantworten im Speicher gecacht, automatische Invalidierung nach Sync |
| 🖼️ **RPDB** | Bewertungs-Poster (optional) |
| 🔔 **Discord** | Benachrichtigungen mit Poster-Galerie bei jeder Sync |
| 🔄 **Auto-Sync** | Konfigurierbare Planung |
| 🌐 **WebUI** | Vollständige Admin-Oberfläche, 🇫🇷 🇬🇧 🇩🇪 |
| 🔒 **Proxy** | HTTP / HTTPS / SOCKS4 / SOCKS5 |
| 💾 **SQLite** | Persistente Daten, inkrementelle Inhalte, optimierte Indizes |
| 🏷️ **Tag-Filterung** | Konfigurierbare erforderliche Tags über die WebUI (FRENCH, MULTi, 1080p…) |
| 🐳 **Docker** | Multi-Arch-Image `linux/amd64` + `linux/arm64` |

> Standardmäßig auf französischsprachige Inhalte beschränkt (FRENCH / MULTi / TRUEFRENCH / VOF / VFF / VFI / VFQ) — konfigurierbar über die WebUI

---

## 🚀 Schnellstart

[docker-compose.yml](./docker-compose.yml) kopieren oder erstellen:

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
      - WEBUI_USERNAME=admin        # Ändern
      - WEBUI_PASSWORD=admin        # Ändern
      - DB_PATH=/data/addon.db
      - SESSION_SECRET=changeme     # openssl rand -hex 32
    labels:
      - com.centurylinklabs.watchtower.enable=true
```

Dann die WebUI unter `http://localhost:7973` öffnen, RSS-Feed(s) + TMDB-API-Schlüssel (und optional TVDB) konfigurieren, eine erste Synchronisierung starten und das Addon in Stremio mit der angegebenen URL installieren.

---

## 📡 Kompatible RSS-Quellen

Das Tool akzeptiert jeden Standard-RSS-Feed. Zusätzlich zu den nativen Feeds Ihrer Tracker ist es mit **Prowlarr** und **NZBHydra2** kompatibel:

### Prowlarr (BitTorrent)

- **Pro Indexer**: Jeder in Prowlarr konfigurierte Indexer stellt seinen eigenen RSS-Feed bereit
  `http://prowlarr:9696/{id}/api?apikey=XXXX&t=rss`
- **Aggregiert**: Ein einziger Feed, der alle Indexer kombiniert
  `http://prowlarr:9696/api/v1/indexer/all/newznab?apikey=XXXX&t=rss`
- **Aggregiert — Nur Filme** (Newznab-Kategorie 2000):
  `http://prowlarr:9696/api/v1/indexer/all/newznab?apikey=XXXX&t=rss&cat=2000`
- **Aggregiert — Nur Serien** (Newznab-Kategorie 5000):
  `http://prowlarr:9696/api/v1/indexer/all/newznab?apikey=XXXX&t=rss&cat=5000`

### NZBHydra2 (Usenet)

- **Alle Inhalte**:
  `http://nzbhydra2:5076/api?t=rss&apikey=XXXX`
- **Nur Filme** (Newznab-Kategorie 2000):
  `http://nzbhydra2:5076/api?t=rss&apikey=XXXX&cat=2000`
- **Nur Serien** (Newznab-Kategorie 5000):
  `http://nzbhydra2:5076/api?t=rss&apikey=XXXX&cat=5000`

> 💡 Die WebUI bietet **Schnellintegrationen** im Konfigurationsbereich: Geben Sie die Basis-URL und den API-Schlüssel für Prowlarr oder NZBHydra2 ein und klicken Sie auf *Alle*, *Filme* oder *Serien*, um den entsprechenden RSS-Feed automatisch zu generieren und hinzuzufügen.

---

## 🔄 Migration von UseFlow-FR

Sie nutzen die [alte Version (UseFlow-FR)](https://github.com/Aerya/UseFlow-FR)? Die Migration ist nahtlos — Ihre Datenbank ist vollständig kompatibel.

**1. Alten Container stoppen**
```bash
docker compose down
```

**2. `docker-compose.yml` aktualisieren**

Nur zwei Dinge ändern sich (alles andere bleibt identisch — gleicher Port, gleiches Volume, gleiche Variablen):

```yaml
# Vorher
image: ghcr.io/aerya/useflow-fr:latest
container_name: useflow-fr

# Nachher
image: ghcr.io/aerya/stremio-rss-catalogs:latest
container_name: stremio-rss-catalogs
```

> ⚠️ Der Volume-Pfad (`/data`) und die Variable `DB_PATH` ändern sich nicht — zeigen Sie weiterhin auf denselben Ordner.

**3. Neuen Container starten**
```bash
docker compose up -d
```

Beim ersten Start wird die Datenbankmigrierung automatisch durchgeführt, falls nötig (altes Schema → neues Schema). Ihre gesamte bestehende Konfiguration (API-Schlüssel, RSS-Feeds, Discord…) bleibt erhalten.

**4. (Optional) Neue Funktionen konfigurieren**

Neue Optionen sind in der WebUI verfügbar:
- **TVDB API-Schlüssel** — verbessert die Erkennung von Doku-Serien und dient als Fallback für auf TMDB nicht gefundene Serien (kostenlos auf [thetvdb.com](https://thetvdb.com))

**5. Addon in Stremio neu installieren**

Die Addon-URL hat sich nicht geändert, wenn Sie denselben Port beibehalten haben. Bei Portänderung installieren Sie das Addon mit der in der WebUI angezeigten neuen URL neu.

---

## ⚙️ Funktionsweise

### Vorgelagerte Filterung

Vor jeder Verarbeitung wird jede Release anhand der in der WebUI konfigurierten **erforderlichen Tags** gefiltert (z. B. `FRENCH,MULTi,TRUEFRENCH`). Eine Release ohne diese Tags wird sofort ignoriert.

### Release-Parsing

Jeder Release-Titel wird analysiert, um Folgendes zu extrahieren:
- Den **bereinigten Namen** (technische Tags entfernt: Auflösung, Codec, Sprache, Team…)
- Das **Erscheinungsjahr**
- Den **Typ**: Film, Dokumentarfilm oder Serie — der Dokumentarfilm-Tag (`docu`, `documentary`…) hat Vorrang vor dem Serienformat (`S01E01`)
- Die **Qualität**: 4K, HDR, DV, 1080p, WEB-DL, BluRay…
- Den **Infohash**: aus Magnet-/Torrent-Links im RSS-Feed extrahiert

### Matching-Pipeline — TMDB + TVDB

```
RSS-Release  →  Tag-Filter  →  Parsing  →  TMDB (5 Versuche)  →  Reklassifizierung  →  DB
                                                  ↓ Fehlschlag (Serie)
                                              TVDB-Fallback  →  Reklassifizierung  →  DB
```

**TMDB — 5 Versuche der Reihe nach:**

1. Genauer Titel + Jahr, Französisch
2. Genauer Titel ohne Jahr, Französisch
3. Genauer Titel ohne Jahr, Englisch
4. Vereinfachter Titel (erste 3 Wörter) + Jahr, Englisch
5. Vereinfachter Titel ohne Jahr, Englisch

**Automatische Reklassifizierung nach Match (nur automatische Erkennung):**
- TMDB-Genre 99 (Documentary) → **Dokumentarfilme**
- TMDB-Genre Reality/Talk/News/Soap → **TV-Sendungen**
- Keines dieser Genres, TVDB konfiguriert → TVDB-Prüfung zur Dokumentarfilm-Bestätigung

**TVDB-Fallback (wenn TMDB bei einer Serie fehlschlägt):**
- 2 TVDB-Versuche (mit und ohne Jahr)
- Bei gefundener IMDB-ID → Einordnung in Serien oder Dokumentarfilme anhand TVDB-Genre

Scheitern alle Versuche, wird die Release in `failed_releases` gespeichert und kann manuell oder automatisch erneut verarbeitet werden.

### Datenbankarchitektur

```
media           → 1 Zeile pro Film/Serie (Schlüssel: imdb_id)
releases        → N Releases pro Medium (Qualität, Hash, Quelle, Datum)
failed_releases → nicht gematchte Releases (für Retry)
```

Diese Trennung garantiert:
- **Null Duplikate** in den Katalogen, unabhängig von der Anzahl der Versionen oder Quell-Feeds
- **Vollständiger Verlauf** aller bekannten Releases für ein Medium
- **Retry** nicht gematchter Releases ohne erneute Verarbeitung des gesamten Feeds

### Cache

Katalogantworten werden zwischen Syncs im Arbeitsspeicher zwischengespeichert. Der Cache wird nach jeder erfolgreichen Sync automatisch invalidiert — keine veralteten Daten möglich. Suchanfragen werden nicht gecacht.

### Persistenz

Alles wird in einer SQLite-Datenbank (`data/addon.db`) gespeichert. Inhalte **akkumulieren sich** — eine Synchronisierung ersetzt niemals vorhandene Daten. Die Migration vom alten Schema erfolgt beim ersten Start automatisch.

---

## 🔐 WebUI-Anmeldung

- **Zugangsdaten**: in `docker-compose.yml` festgelegt
- **Session-Secret**: mit `openssl rand -hex 32` generieren

---

## 📝 Hinweise

- Die erste Synchronisierung kann je nach Feed-Größe mehrere Minuten dauern — **vor** der Installation des Addons in Stremio durchführen
- Kataloge werden in Seiten von 100 Medien paginiert — Stremio lädt sie beim Scrollen, ohne Limit
- Nur Inhalte mit einer gültigen IMDB-ID werden indexiert
- Inkonsistenzen zwischen den Katalogen **Dokumentarfilme** und **Serien** sind möglich: Die Reklassifizierung basiert auf TMDB-Genre 99 und dem TVDB-Genre Documentary, beide von der Community vergeben und nicht immer einheitlich — ein nicht entsprechend getaggter Dokumentarfilm kann in Serien landen

---

## 💡 Ideen in Überlegung

- **Erweiterte WebUI**: Auflistung von Medien, Releases, Quellen und Hashes
- **Genre-Filterung** — zur Verfeinerung der Kataloge
- **Erweiterte Statistiken** — Diagramme und Visualisierungen

---

## 📖 Blog-Beitrag

[Stremio RSS Catalog: mein RSS-zu-Stremio-Katalog-Addon](https://upandclear.org/2025/11/20/useflow-fr-mon-addon-de-conversion-de-rss-en-catalogures-stremio/) (Französisch)

---

## 📄 Lizenz

GNU GPL v3 — Bitte die Quelle angeben.

**Viel Spaß beim Streamen 🍿**
