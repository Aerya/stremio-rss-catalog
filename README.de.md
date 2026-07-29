<h1 align="center">
  <img src="src/public/logo.png" alt="Stremio RSS Catalog" width="120"><br>
  Stremio RSS Catalog
</h1>

<p align="center">
  <strong>Verwandeln Sie Ihre RSS-Feeds, Prowlarr und NZBHydra2 in Stremio-Kataloge — Filme · Dokumentarfilme · Serien · TV-Sendungen · Anime · Konzerte · Aufführungen</strong>
</p>

> 🇫🇷 [Français](./README.md) · 🇬🇧 [English](./README.en.md)

<p align="center">
  <img src="https://img.shields.io/github/actions/workflow/status/Aerya/stremio-rss-catalog/ghcr.yml?branch=main&label=build&style=flat-square" alt="Build">
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/multi--arch-amd64%20%7C%20arm64-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Multi-arch">
  <img src="https://img.shields.io/github/last-commit/Aerya/stremio-rss-catalog?style=flat-square" alt="Last commit">
  <img src="https://img.shields.io/badge/i18n-FR%20%7C%20EN%20%7C%20DE-orange?style=flat-square" alt="i18n">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Stremio-addon-purple?style=flat-square" alt="Stremio">
  <img src="https://img.shields.io/badge/RSS-kompatibel-F6A623?style=flat-square&logo=rss&logoColor=white" alt="RSS">
  <img src="https://img.shields.io/badge/Prowlarr-kompatibel-blue?style=flat-square" alt="Prowlarr">
  <img src="https://img.shields.io/badge/Jackett-Torznab-blue?style=flat-square" alt="Jackett">
  <img src="https://img.shields.io/badge/NZBHydra2-kompatibel-blue?style=flat-square" alt="NZBHydra2">
  <img src="https://img.shields.io/badge/TMDB%20%2B%20TVDB%20%2B%20OMDb-matched-green?style=flat-square" alt="TMDB+TVDB+OMDb">
  <img src="https://img.shields.io/badge/MyAnimeList-integriert-2E51A2?style=flat-square" alt="MAL">
  <img src="https://img.shields.io/badge/AniList-integriert-02A9FF?style=flat-square" alt="AniList">
</p>

> **Nutzen Sie es? Mögen Sie es? [⭐ Geben Sie einen Stern!](https://github.com/Aerya/stremio-rss-catalog/stargazers)** — es dauert nur zwei Sekunden.

---

> Ein selbst gehostetes Stremio-Addon, das Kataloge aus Inhalten Ihrer eigenen **BitTorrent-, Usenet- oder sonstigen Indexer** erstellt. Die Katalogquellen sollen den Quellen entsprechen, die Ihre Streaming-Addons tatsächlich verwenden. RSS, Pastebin, WebDAV, Newznab, Prowlarr, Jackett, NZBHydra2, WaCustom und Stremio-Manifeste lassen sich kombinieren.

---

## Funktionen

| | |
|---|---|
| **Verwaltete Kataloge** | Die 9 bisherigen Kataloge werden mit ihren vorhandenen Inhalten in die Verwaltung übernommen; beliebig viele eigene Kataloge können ergänzt werden |
| **Gemischte Quellen** | Ein Katalog kann RSS, Pastebin, WebDAV, Plex, Jellyfin, Newznab, Prowlarr, Jackett/Torznab, NZBHydra2, WaStream/WaCustom und aus Stremio-Manifesten importierte Quellen kombinieren |
| **Plex und Jellyfin direkt** | Bibliothekserkennung, Auswahl von Plex-Sammlungen, paginierter Film-/Serienimport und Erhalt der IMDb-/TMDB-IDs |
| **WebDAV-Ordner** | Authentifizierter rekursiver Scan mit konfigurierbaren Erweiterungen, Tiefe und Obergrenze; Dateinamen speisen Kataloge und [Davio](https://github.com/arvida42/davio) kann die Wiedergabe in Stremio übernehmen |
| **Eigene Filter** | Ein- oder ausgeschlossene Jahre, Jahresbereiche, Genres, Schlüsselwörter und Quellenauswahl |
| **Zwei getrennte Pausen** | Neue Kataloginhalte unabhängig von der Sichtbarkeit im Stremio-Manifest einfrieren |
| **Verschachtelte Pastebins** | Direkte Seiten, JSON-Verweise und kategorisierte Hauptindizes mit begrenzter Rekursion und Deduplizierung |
| **Stremio-Manifeste** | Generische Erkennung externer Kataloge und Import ihrer Inhalte |
| **Native Anime- und YouTube-Typen** | `anime`, Kitsu/MAL/AniList/AniDB und `YouTube`/`yt_id:` bleiben erhalten und werden nicht stillschweigend in Filme umgewandelt |
| **Katalog-Leitlisten** | MDBList, ListSync und SuggestArr liefern Auswahl und Reihenfolge; sichtbar werden nur bereits lokal indexierte Medien |
| **Testlauf** | Exakte Medienanzahl vor dem Erstellen eines Katalogs |
| **Manifestverlauf** | Revisionen und Ereignisse für Erstellung, Umbenennung, Einfrieren, Sichtbarkeit und Löschung |
| **Auto-Erkennung** | Kategorie aus Release-Name, Feed-URL-Schlüsselwörtern oder TMDB/OMDb-Genres ermittelt |
| **Feed-URL-Erkennung** | Kategorie wird im Auto-Modus automatisch aus Schlüsselwörtern in der RSS-Feed-URL abgeleitet (`concert`, `anime`, `docu`, `serie`…) |
| **Anime** | Via TMDB-Genre 16 + japanische Herkunft, OVA/OAV im Titel oder per Feed erzwungen |
| **MAL** | MyAnimeList API v2 — EN-Titel-Normalisierer für besseren TMDB-Abgleich bei Anime (optional, kostenloser Schlüssel) |
| **AniList** 🆕 NEW | AniList GraphQL-API — ergänzender Titel-Normalisierer (Romaji + Originaltitel) + Anime-Deduplizierung, vollständig kostenlos und anonym, keine Registrierung erforderlich |
| **Kitsu** | Nativer Anime-Fallback ohne Schlüssel: Erkannte Inhalte bleiben mit ihrer `kitsu:`-ID indexierbar, auch wenn TMDB keinen Treffer hat |
| **Stremio-Metadaten-Addons** | Mehrere umbenennbare, priorisierte, testbare und pausierbare Fallbacks über `manifest.json`-Dateien mit Suchkatalogen, zum Beispiel [AIOMetadata](https://github.com/cedya77/aiometadata) |
| **Konzerte** 🆕 NEW | Via TMDB-Genre 10402 (Music) + OMDb-Bestätigung, ohne narrative Genres (Drama, Action…) |
| **Aufführungen** 🆕 NEW | Via Titel-Schlüsselwörter (Stand-up, One Man Show, Theater, Zirkus…) + OMDb-Bestätigung |
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
| **Discord-Benachrichtigungen** 🆕 NEW | Erweiterte Benachrichtigungen mit Poster-Galerie bei jeder Sync |
| **Apprise-Benachrichtigungen** 🆕 NEW | Multi-Service-Benachrichtigungen via Apprise-Server (optional) |
| **Benachrichtigungssprache** 🆕 NEW | Discord/Apprise-Sprache unabhängig von der WebUI konfigurierbar (FR/EN/DE) |
| **Erklärte Auto-Sync** | Fällige Quellen nach eigenem Zeitplan sammeln → normalisieren und abgleichen → nicht eingefrorene Kataloge → Stremio-Cache leeren |
| **Moderne WebUI** | Sidebar, Hell-/Dunkel-Theme, mehrsprachig FR/EN/DE |
| **Mediathek** 🆕 NEW | Neugestaltung: Poster-/Listenansicht, Sortierung, Jahresfilter (Schnellauswahl + freie Eingabe/Bereich), Releases inline, RPDB-Poster, persistente Paginierung |
| **Übersicht** | Neueste Hinzufügungen in ausklappbaren Kategorie-Akkordeons (Titel + Jahr + IMDB-Link) |
| **Migration und Reparatur** | Schreibgeschützte Analyse, SQLite-Sicherung, gruppierte Korrekturen, Verlauf und einmalige versionierte Migrationen |
| **Quellenverwaltung** | Tabs, Suche, einklappbare Gruppen, vollständige Bearbeitung und eigener Zeitplan pro Quelle |
| **Status pro Quelle** | Letzter Erfolg, nächste Sammlung, Dauer, gelesene Elemente, aufeinanderfolgende Fehler und Nutzung der Obergrenze |
| **Indexer-APIs** | Mehrere umbenennbare Newznab-, Prowlarr-, Jackett/Torznab- und NZBHydra2-Quellen mit Pagination, inkrementellem Cursor, Obergrenze und Verzögerung |
| **WaStream/WaCustom** | Mehrere umbenennbare Instanzen; paginierter WASource-Import mit IMDb/TMDB, fortsetzbarer Erfassung, eigener Frequenz, Pause und Obergrenze |
| **Konfigurationssicherung** | Versionierter Export/Import; sensible Schlüssel und URLs nur auf ausdrücklichen Wunsch |
| **Proxy** | HTTP / HTTPS / SOCKS4 / SOCKS5 + integrierter Verbindungstest |
| **SQLite** | Persistente Daten, inkrementelle Inhalte, optimierte Indizes |
| **Tag-Filterung** | Konfigurierbare erforderliche Tags über die WebUI (FRENCH, MULTi, 1080p…) |
| **Docker** | Multi-Arch-Image `linux/amd64` + `linux/arm64` |

> Standardmäßig auf französischsprachige Inhalte beschränkt (FRENCH / MULTi / TRUEFRENCH / VOF / VFF / VFI / VFQ) — konfigurierbar über die WebUI

---

## Screenshots

| | |
|---|---|
| ![Mediathek](screens/Mediatheque.png) | ![Übersicht](screens/Vue.d.Ensemble.png) |
| ![Konfiguration](screens/Configuration.png) | ![Fehler](screens/Echecs.png) |
| ![Quellen](screens/Sources.png) | ![Synchronisierung](screens/Synchronisation.png) |

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
      - /pfad/zu/stremio-rss-catalog/:/data
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

Öffnen Sie danach die WebUI unter `http://localhost:7973`, fügen Sie unter
**Quellen** Inhaltsquellen hinzu, verwalten Sie unter **Kataloge** bestehende
und eigene Kataloge, wenden Sie bei Bedarf eine MDBList-, ListSync- oder
SuggestArr-Leitliste an, starten Sie die erste Synchronisierung und installieren
Sie das Addon mit der angegebenen URL in Stremio. Für Quellen, deren Titel noch
zugeordnet werden müssen, ist ein TMDB-Schlüssel erforderlich.

> **`TZ`** legt die Zeitzone des Containers fest. Passen Sie diese an Ihre eigene Zeitzone an (z. B. `Europe/Berlin`) für eine korrekte Datumsanzeige in der WebUI und eine korrekte Gruppierung des Sync-Verlaufs.

---

## Inhaltsquellen

Alle Quellen werden unter **Quellen** konfiguriert. Standard-RSS-Feeds bleiben
unterstützt; Newznab, Prowlarr, Jackett und NZBHydra2 sind eigenständige
paginierte API-Quellen statt bloßer RSS-Verknüpfungen.

Für Prowlarr verwenden Sie die Torznab-/Newznab-URL eines Indexers, zum Beispiel
`http://prowlarr:9696/1/api`. Für Jackett verwenden Sie den aus der Oberfläche
kopierten Torznab-Endpunkt, zum Beispiel
`http://jackett:9117/api/v2.0/indexers/mein-indexer/results/torznab/api`.
Getrennte Indexer können umbenannt und in der Mediathek als Herkunft erkannt werden.

Bei der ersten Sammlung wird `t=caps` gelesen. Danach werden `t=search`-Seiten
mit `offset` bis zur konfigurierten Obergrenze **pro Kategorie** geladen.
Standardmäßig sind das 1.000 Ergebnisse pro Kategorie, vom Server begrenzte
Seitengrößen und 750 ms Pause zwischen Seiten.

Spätere Sammlungen beginnen bei den neuesten Ergebnissen und enden am
gespeicherten Cursor oder am Ende des Überlappungsfensters. Der Cursor wird erst
nach erfolgreicher Verarbeitung des Stapels bestätigt; ein Abbruch führt daher
zu einer sicheren Wiederholung statt zu verlorenen Elementen.

Die globale Frequenz ist der Standard. Jede Quelle kann sie unter **Quellen**
überschreiben. Der Planer prüft jede Minute die Fälligkeiten und sammelt nur
fällige Quellen. Danach folgen Katalogverarbeitung und Cache-Invalidierung
sofort; es gibt keinen zweiten verzögerten Versand an Stremio.

Pastebin-Quellen unterstützen direkte Inhalte, JSON-Verweise und kategorisierte
Hauptindizes. Stremio-Manifeste erkennen externe Kataloge und machen sie in der
Katalogverwaltung auswählbar.

Damit lassen sich auch Film-/Serienkataloge kompatibler Addons wie Plexio oder
Stremio Jellyfin sowie Anime-/YouTube-Kataloge von Kitsu oder YouTubio
importieren. Ein reines Stream-Manifest legt die interne Datenbank eines Addons
nicht offen; ein Comet-Manifest kann ohne Export-API nicht alle Medien
aufzählen.

Eine WebDAV-Quelle zeigt auf einen Stammordner. Das Addon durchsucht Unterordner
mit `PROPFIND`, behält konfigurierte Videoerweiterungen und verwendet danach
dieselbe Titelbereinigung und TMDB-Zuordnung wie bei RSS. Es spielt keine
Dateien ab: Installieren Sie [Davio](https://github.com/arvida42/davio)
separat in Stremio, um dasselbe WebDAV aufzulösen. Lokale WebDAV-Quellen umgehen
den globalen Proxy standardmäßig; er kann pro Quelle aktiviert werden.

Eine [WaCustom](https://github.com/dydy13014/wacustom)-Quelle verwendet die URL
der Instanz und das Administratorpasswort. Das Addon liest die paginierte
WASource-API und speichert nur Kennungen und Katalogmetadaten, keine
Wiedergabelinks. Große Erstimporte werden bei den folgenden Synchronisierungen
fortgesetzt.

Quellkarten verbergen sensible URLs und Schlüssel. Anzeigen oder Kopieren
erfordert eine ausdrückliche Aktion. Konfigurationsexporte verhalten sich
genauso: Geheimnisse sind standardmäßig ausgeschlossen und benötigen eine
separate Bestätigung. Vor jedem Import wird eine SQLite-Sicherung erstellt.

> Die URL `manifest.json` bleibt unverändert. Inhalte bekannter Kataloge sind
> dynamisch, Stremio speichert das Manifest jedoch im Benutzerprofil. Nach
> Erstellen, Löschen, Umbenennen oder Sichtbarkeitsänderungen verwenden Sie
> **Installieren / aktualisieren**, ohne das Addon zu deinstallieren.

## Katalog-Leitlisten

Eine Leitliste ist keine Inhaltsquelle. Sie liefert eine geordnete Liste von
Kennungen, die mit der lokalen Mediathek geschnitten wird:

```text
geordnete externe Liste ∩ bereits indexierte Medien = Kataloginhalt
```

- **MDBList**: Listen-URL oder Kennung, paginiert bis zur gewählten Obergrenze;
- **ListSync**: Instanz-URL, Listentyp und Listenkennung; der aktuelle
  ListSync-Endpunkt ist auf 100 Elemente pro Liste begrenzt;
- **SuggestArr**: Instanz-URL, lokales Konto und Empfehlungsstatus; JWT-Anmeldung
  und 100er-Paginierung erfolgen automatisch.

Zugangsdaten bleiben verborgen und sind nur nach ausdrücklicher Bestätigung in
Konfigurationsexporten enthalten.

[Agregarr](https://github.com/agregarr/agregarr) unterstützt zahlreiche
Listenanbieter, bietet derzeit aber keinen stabilen Endpunkt, der Elemente
einer bestehenden Sammlung unabhängig von Plex aufzählt. Die Vorschau benötigt
eine authentifizierte Sitzung und eine Plex-Bibliothek; daher wird kein
fragiler Scraper eingebaut.

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

**Anime-Identifizierung (MAL + AniList + Kitsu):**

MAL, AniList und Kitsu liefern kanonische Titel vor der TMDB-Suche. Wenn TMDB keinen Treffer liefert, werden konfigurierte Stremio-Metadaten-Addons nach Priorität abgefragt und anschließend die native Kitsu-, MAL- oder AniList-ID erhalten. Für die vollständige Detailseite muss das passende Metadaten-Addon ebenfalls in Stremio installiert sein.

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

## Migration und Reparatur

Der erweiterte Bereich **Konfiguration → Migration und Reparatur** ersetzt die
bisherigen Schaltflächen:

1. **Mediathek analysieren** führt eine schreibgeschützte Diagnose aus und zeigt
   vorgeschlagene Korrekturen je Kategorie.
2. **Sichern und anwenden** erstellt zuerst eine SQLite-Kopie unter
   `/data/backups` und wendet danach lokale Korrekturen an.
3. Die TMDB-Prüfung von Animationen ist optional, da sie einen externen Aufruf
   pro Kandidat benötigt und mehrere Minuten dauern kann.
4. Jeder Vorgang wird mit Status, Ergebnis und Sicherungsnamen protokolliert.

Die Neuklassifizierung nach Quellenregeln bleibt eine getrennte manuelle Aktion,
da sie große Teile der Mediathek verschieben kann. Es wird kein destruktiver
Korrektur-Cron eingerichtet. Künftige Migrationen sind nummeriert, werden bei
Bedarf gesichert und nur einmal ausgeführt.

---

## WebUI-Anmeldung

- **Zugangsdaten**: in `docker-compose.yml` festgelegt
- **Session-Secret**: mit `openssl rand -hex 32` generieren

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
image: ghcr.io/aerya/stremio-rss-catalog:latest
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
- **Kitsu** — standardmäßig aktiviert, kein Schlüssel erforderlich
- **Stremio-Metadaten-Addon** — optionaler Fallback über eine konfigurierte `manifest.json`, zum Beispiel AIOMetadata
- **OMDb API-Schlüssel** — aktiviert die Konzert- und Aufführungserkennung (kostenlos auf [omdbapi.com](https://www.omdbapi.com/apikey.aspx), 1000 Anfragen/Tag)

**5. Addon in Stremio neu installieren**, falls Sie den Port geändert haben.

---

## Hinweise

- Die erste Synchronisierung kann je nach Feed-Größe mehrere Minuten dauern — **vor** der Installation des Addons in Stremio durchführen
- Kataloge werden in Seiten von 100 Medien paginiert — Stremio lädt sie beim Scrollen, ohne Limit
- IMDb-IDs werden bevorzugt; unterstützte native Anime- und YouTube-IDs bleiben ebenfalls erhalten
- Konzert- und Aufführungserkennung erfordert einen OMDb API-Schlüssel (kostenlos, 1000 Anfragen/Tag auf omdbapi.com)
- AniList ist standardmäßig aktiviert und erfordert keinen Schlüssel — es kann in der Konfiguration deaktiviert werden
- Vor Hinzufügung neuer Kategorien indexierte Medien bleiben in ihrer alten Kategorie — verwenden Sie Analyse und anschließende gruppierte Reparatur

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

## Credits

- Nachfolger von [UseFlow-FR](https://github.com/Aerya/UseFlow-FR) — ursprüngliche Codebasis, kompatible Datenbank
- Basiert auf dem [Stremio Addon SDK](https://github.com/Stremio/stremio-addon-sdk)
- Metadaten: [TMDB](https://www.themoviedb.org/), [TVDB](https://thetvdb.com/), [OMDb](https://www.omdbapi.com/), [MyAnimeList](https://myanimelist.net/), [AniList](https://anilist.co/), [Kitsu](https://kitsu.io/) und [AIOMetadata](https://github.com/cedya77/aiometadata)
- Integrationen: [Prowlarr](https://prowlarr.com/), [NZBHydra2](https://github.com/theotherp/nzbhydra2), [Apprise](https://github.com/caronc/apprise), [RPDB](https://ratingposterdb.com/)

---

## Lizenz

[GNU GPL v3](./LICENSE) — Bitte die Quelle angeben.

**Viel Spaß beim Streamen**
