<h1 align="center">
  <img src="src/public/logo.png" alt="Stremio RSS Catalog" width="120"><br>
  Stremio RSS Catalog
</h1>

<p align="center">
  <strong>Stremio-katalógusok a saját forrásaidban ténylegesen elérhető tartalmakból</strong>
</p>

> 🇫🇷 [Français](./README.md) · 🇬🇧 [English](./README.en.md) · 🇩🇪 [Deutsch](./README.de.md)

<p align="center">
  <img src="https://img.shields.io/github/actions/workflow/status/Aerya/stremio-rss-catalog/ghcr.yml?branch=main&label=build&style=flat-square" alt="Build">
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/multi--arch-amd64%20%7C%20arm64-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Multi-arch">
  <img src="https://img.shields.io/badge/i18n-FR%20%7C%20EN%20%7C%20DE%20%7C%20HU-orange?style=flat-square" alt="i18n">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Stremio-addon-purple?style=flat-square" alt="Stremio">
  <img src="https://img.shields.io/badge/TMDB%20%2B%20TVDB%20%2B%20OMDb-matched-green?style=flat-square" alt="TMDB+TVDB+OMDb">
  <img src="https://img.shields.io/badge/MyAnimeList-integrated-2E51A2?style=flat-square" alt="MAL">
  <img src="https://img.shields.io/badge/AniList-integrated-02A9FF?style=flat-square" alt="AniList">
</p>

> **Használod? Tetszik? [⭐ Adj egy csillagot!](https://github.com/Aerya/stremio-rss-catalog/stargazers)** — két másodperc az egész.

---

> Saját üzemeltetésű kiegészítő, amely azonosítja, duplikációmentesíti és
> besorolja a következő forrásokban talált médiákat: **RSS hírcsatornák**,
> **Pastebinek**, **WebDAV mappák**, **Plex/Jellyfin könyvtárak és
> gyűjtemények**, **közvetlen Newznab/Torznab API-k vagy a Prowlarr, a Jackett
> és az NZBHydra2 által biztosított API-k**, **WaStream/WaCustom és StreamFusion
> Stremio stream-kiegészítők**, **CometNet bejelentések**, valamint **más
> Stremio-kiegészítők manifestjei által közzétett katalógusok**. Ezek a
> BitTorrent-, Usenet- és médiaforrások kombinálhatók.

---

## Az alapelv: abból indulunk ki, ami elérhető számodra

A Stremio RSS Catalog nem elméleti ajánlólisták generátora. Begyűjti a
forrásaidat, azonosítja és duplikációmentesíti az általuk bejelentett
médiákat, és ezekből helyi médiatárat épít. A katalógusok ebből a médiatárból
készülnek.

Az MDBList, ListSync, SuggestArr és Agregarr útmutatók csak **válogatják és
rendezik** ezeket a médiákat. Egy forrásaidban nem szereplő cím a végső
katalógusból is hiányozni fog. Így olyan trendeket, válogatásokat és
gyűjteményeket jeleníthetsz meg, amelyek kizárólag a saját ökoszisztémádban
ténylegesen indexelt tartalomból állnak.

Az „elérhető” itt azt jelenti: **egy beállított forrásban megtalálható**. A
kiegészítő nem ellenőrzi valós időben a seedereket, a debrid gyorsítótár
állapotát vagy a lejátszási hivatkozásokat, és maga nem szolgáltat streameket.

> **Frissítés törés nélkül:** frissítsd a Docker-képet, és hozd létre újra a
> konténert ugyanazzal a `/data` kötettel. A meglévő beállítások, adatbázis,
> médiák, kiadások, kiegészítő-azonosító és Stremio URL-ek megmaradnak. Minden
> sémamigráció előtt automatikus SQLite biztonsági mentés készül.

## Funkciók

| | |
|---|---|
| **Katalógustípusok** | Filmek, dokumentumfilmek, dokumentumsorozatok, sorozatok, tévéműsorok, animefilmek, animesorozatok, koncertek és élő előadások, valamint korlátlan számú egyéni katalógus |
| **Katalógusok összevonása** | Azonos típusú katalógusok egyesítése, és későbbi eltávolításuk az összevonásból |
| **Vegyes források** | Egy katalógus kombinálhatja az RSS, Pastebin, WebDAV, Plex, Jellyfin, Newznab, Prowlarr, Jackett/Torznab, NZBHydra2, WaStream/WaCustom, StreamFusion, CometNet forrásokat és a Stremio manifestekből importált katalógusokat |
| **Közvetlen Plex és Jellyfin** | Könyvtárak és gyűjtemények felderítése, lapozható film/sorozat importálás, megőrzött IMDb/TMDB azonosítók |
| **WebDAV mappák** | Hitelesített rekurzív vizsgálat beállítható kiterjesztésekkel, mélységgel és korláttal; a fájlnevek töltik fel a katalógusokat, a lejátszást a Stremióban a [Davio](https://github.com/arvida42/davio) végezheti |
| **Egyéni szűrők** | Belefoglalt vagy kizárt évek, évtartományok, belefoglalt/kizárt műfajok és kulcsszavak, forrásválasztás |
| **Két külön szüneteltetés** | Az új katalógustartalom befagyasztása függetlenül a katalógus Stremio-manifestbeli láthatóságától |
| **Egymásba ágyazott Pastebinek** | Közvetlen oldalak, JSON-mutatók és kategorizált főindexek korlátozott rekurzióval és duplikációszűréssel |
| **Stremio manifestek** | Távoli katalógusok általános felderítése és tartalmuk importálása |
| **Natív anime** | Az `anime` típus és a Kitsu/MAL/AniList/AniDB azonosítók megőrzése, csendes filmmé alakítás nélkül |
| **Katalógus-útmutatók** | Az MDBList, ListSync, SuggestArr és Agregarr válogatást és sorrendet ad; csak a helyben már indexelt médiák jelennek meg |
| **Próbafuttatás** | Pontos médiaszám a katalógus létrehozása előtt |
| **Manifest-előzmények** | Revíziók, valamint létrehozási, átnevezési, befagyasztási, láthatósági és törlési események |
| **Automatikus felismerés** | A kategória a kiadás nevéből, a hírcsatorna URL-jének kulcsszavaiból vagy a TMDB/OMDb műfajokból |
| **Felismerés a hírcsatorna URL-jéből** | A kategória automatikus kikövetkeztetése az RSS URL kulcsszavaiból (`concert`, `anime`, `docu`, `serie`, `film`…) |
| **Anime** | Felismerés a TMDB 16-os műfaja + japán eredet, a címben szereplő OVA/OAV alapján, vagy hírcsatornánként kényszerítve |
| **MAL** | MyAnimeList API v2 — angol címnormalizáló az animék TMDB-azonosításának javítására (opcionális, ingyenes kulcs) |
| **AniList** | AniList GraphQL API — kiegészítő címnormalizáló (romaji + eredeti címek) + anime-duplikációszűrés, teljesen ingyenes és névtelen, regisztráció nélkül |
| **Kitsu** | Kulcs nélküli natív anime-tartalék: a felismert tartalom `kitsu:` azonosítóval indexelhető marad akkor is, ha a TMDB-n nincs találat |
| **Stremio metaadat-kiegészítők** | Több átnevezhető, rendezhető, tesztelhető és szüneteltethető tartalék keresést támogató `manifest.json` fájlokon keresztül, például [AIOMetadata](https://github.com/cedya77/aiometadata) |
| **Koncertek** | Felismerés a TMDB 10402-es (Zene) műfaja + OMDb-megerősítés alapján, narratív műfajok (Dráma, Akció…) nélkül |
| **Élő előadások** | Felismerés a cím kulcsszavai (Stand-up, One Man Show, Színház, Cirkusz…) + OMDb-megerősítés alapján |
| **OMDb** | Az OMDb API-t minden TMDB-találat után lekérdezzük a koncert- és előadás-besorolás megerősítésére |
| **Automatikus azonosítás** | PTT/Parsett elemzés belső tartalékkal, több TMDB-jelölt összehasonlítása, címváltozatok és automatikus film/sorozat javítás |
| **TVDB-tartalék** | Tartalék a TMDB-n nem talált sorozatokhoz + dokumentumfilm-megerősítés (opcionális) |
| **Dokumentumsorozatok** | Felismerés a TMDB 99-es műfaja vagy a TVDB alapján, a Dokumentumfilmek (sorozat) katalógusba kerülnek |
| **Tévéműsorok** | Külön katalógus — automatikusan a TMDB Reality/Talk/News/Soap műfajai alapján, vagy hírcsatornánként kényszerítve |
| **Téves találatok elleni védelem** | Az ellentmondó műfajok kikapcsolják a dokumentumfilm- (Akció, Sci-Fi, Fantasy, Horror), a tévéműsor- (Sci-Fi, Fantasy, Animáció) és a koncertfelismerést (Dráma, Vígjáték, Romantikus) |
| **Specifikussági hierarchia** | Az automatikus újrabesorolás soha nem soroltathat vissza egy specifikusabb kategóriát — anime (4) > dokumentumfilmek/műsorok/koncertek/előadások (3) > sorozatok (2) > filmek (1) |
| **Kézi kategóriaváltás** | A médiatár médiaadatlap-paneljéről |
| **Kiadás kézi felülbírálása** | IMDB/TMDB/TVDB azonosító kényszerítése egy sikertelen kiadáshoz közvetlenül a WebUI-ból, opcionálisan az adott címhez megjegyezve |
| **Azonosítás javítása** | Egy média adatlap-paneljéről: add meg a helyes IMDb/TMDB/TVDB azonosítót, helyezd át az összes kiadását, és jegyezd meg a szabályt a későbbi lekérésekhez |
| **Célzott törlés** | Egy média és kiadásainak törlése, opcionálisan a címei figyelmen kívül hagyásával a későbbi lekéréseknél |
| **Azonosítási szabályok** | A „Hibák” alatt listázhatók és törölhetők; elsőbbséget élveznek az automatikus azonosítással és a források által megadott azonosítókkal szemben |
| **Duplikációszűrés** | IMDB-azonosító szerint (média) + RSS GUID szerint + torrent-hash szerint, ha elérhető (kiadások) |
| **Hash-ek** | Infohash automatikus kinyerése a magnet/torrent hivatkozásokból |
| **Újrapróbálás** | Az azonosítatlan kiadások tárolva és újrapróbálhatók |
| **Frissesség** | `last_seen_at`, opcionális lejárat, elrejtés, ha több teljes vizsgálat sem találja a kiadást, és visszaállítás, ha újra megjelenik |
| **Előmelegített gyorsítótár** | Minden közzétett katalógus első öt oldala újraépül indításkor és minden érvénytelenítés után |
| **Borítókép-gyorsítótár** | Opcionális helyi képproxy/gyorsítótár beállítható élettartammal, maximális mérettel, frissítéssel és kiürítéssel |
| **RPDB** | Értékeléses poszterek (opcionális) |
| **PostersPlus** | Az AIOMetadata-kompatibilis URL-sablonok közvetlen támogatása RPDB- és eredeti borítókép-tartalékkal |
| **Discord értesítések** | Bővített értesítések posztergalériával minden szinkronizáláskor; elsőként PostersPlus, majd RPDB vagy az eredeti poszter |
| **Apprise értesítések** | Több szolgáltatásra kiterjedő értesítések Apprise kiszolgálón keresztül (opcionális) |
| **Értesítések nyelve** | A Discord/Apprise nyelve a WebUI-tól függetlenül állítható (FR/EN/DE/HU) |
| **Egyértelmű automatikus szinkronizálás** | Az esedékes források begyűjtése saját ütemezésük szerint → normalizálás és azonosítás → nem befagyasztott katalógusok → a Stremio-gyorsítótár érvénytelenítése |
| **Modern WebUI** | Oldalsáv, sötét/világos téma, többnyelvű FR/EN/DE/HU |
| **Médiatár** | Új kialakítás: poszter/lista nézet, rendezés, évszűrő (gyorsgombok + szabad bevitel/tartomány), beágyazott kiadások, RPDB poszterek, megmaradó lapozás |
| **Áttekintés** | Legutóbbi hozzáadások kategóriánként összecsukható harmonikákban (cím + év + IMDB hivatkozás) |
| **Migráció és javítás** | Csak olvasó elemzés, csoportos javítások, előzmények, verziózott migrációk és automatikus SQLite mentés a sémamódosítások előtt |
| **Forráskezelés** | Fülek, keresés, összecsukható csoportok, teljes szerkesztés és forrásonkénti ütemezés |
| **Forrásonkénti állapot** | Utolsó sikeres futás, következő begyűjtés, időtartam, lekért elemek, egymást követő hibák és a korlát kihasználtsága |
| **Elérhetőségi ellenőrzés** | Beállítható könnyű ellenőrzés a begyűjtések között, tartalom importálása és a kurzor léptetése nélkül; a riasztások a következő begyűjtés előtt is megérkezhetnek |
| **Indexelő API-k** | Több átnevezhető Newznab, Prowlarr, Jackett/Torznab és NZBHydra2 forrás lapozással, növekményes kurzorral, korláttal és késleltetéssel |
| **WaStream/WaCustom** | Több átnevezhető példány; a WASource tartalom lapozható importálása IMDb/TMDB azonosítókkal, folytatható bejárással, forrásonkénti gyakorisággal, szüneteltetéssel és korláttal |
| **StreamFusion Reborn** | Több átnevezhető példány; aláírt és titkosított privát gyorsítótár importálása a hivatalos Peer API-n keresztül, lapozással és növekményes kurzorral |
| **CometNet** | Nem teljes körű kiegészítő forrás: aláírt, tartós fogadó az újonnan továbbított gossip-bejelentésekhez, garantált előzményimport nélkül |
| **Beállítások mentése** | Verziózott export/import; az érzékeny kulcsok és URL-ek kimaradnak, hacsak kifejezetten nem kéred őket |
| **Proxy** | HTTP / HTTPS / SOCKS4 / SOCKS5 + beépített kapcsolatteszt |
| **SQLite WAL** | Tartós adatok, párhuzamos olvasás, optimalizált indexek, idegen kulcsok és várakozás foglalt írás esetén |
| **Címkeszűrés** | A WebUI-ból beállítható kötelező címkék (FRENCH, MULTi, 1080p…) |
| **Felbontásszűrés** | Opcionális minimális és maximális korlát az elemzés előtt: a kifejezetten tartományon kívüli kiadás nem hoz létre médiát |
| **Docker** | Többarchitektúrás kép: `linux/amd64` + `linux/arm64` |

> Alapértelmezés szerint francia nyelvű tartalmakra van beállítva (FRENCH / MULTi / TRUEFRENCH / VOF / VFF / VFI / VFQ) — a WebUI-ból módosítható, például magyar tartalomhoz `HUN` vagy `HUNGARIAN` címkével

---

## Képernyőképek

Az új felület képernyőképei hamarosan érkeznek.

---

## Gyors kezdés

Másold le vagy hozd létre a [docker-compose.yml](./docker-compose.yml) fájlt:

```yaml
services:
  stremio-rss-catalog:
    image: ghcr.io/aerya/stremio-rss-catalog:latest
    container_name: stremio-rss-catalog
    restart: always
    ports:
      - "7973:7000"
    volumes:
    # Igazítsd a saját környezetedhez: /útvonal/az/adataidhoz/:/data
      - /path/to/stremio-rss-catalog/:/data
    environment:
      - PORT=7000
      - NODE_ENV=production
      - TZ=Europe/Budapest
      # Ezeket módosítsd
      - WEBUI_USERNAME=admin
      - WEBUI_PASSWORD=admin
      # Ne módosítsd
      - DB_PATH=/data/addon.db
      # Generálás: openssl rand -hex 32
      - SESSION_SECRET=changeme
```

Ezután nyisd meg a WebUI-t a `http://localhost:7973` címen, add hozzá a
tartalomforrásokat a **Források** alatt, kezeld a meglévő és egyéni
katalógusokat a **Katalógusok** alatt, opcionálisan alkalmazz egy MDBList,
ListSync vagy SuggestArr útmutatót, futtass le egy első szinkronizálást, majd
telepítsd a kiegészítőt a Stremióba a megadott URL-lel. TMDB-kulcs szükséges
azokhoz a forrásokhoz, amelyek címeit még azonosítani kell.

> A **`TZ`** a konténer időzónáját állítja be. Igazítsd a saját időzónádhoz (pl. `Europe/Budapest`), hogy a dátumok helyesen jelenjenek meg a WebUI-ban, és a szinkronizálási előzmények jól csoportosuljanak.

---

## Tartalomforrások

Minden forrás a **Források** alatt állítható be. A szabványos RSS hírcsatornák
továbbra is támogatottak, a Newznab, Prowlarr, Jackett és NZBHydra2 pedig
teljes értékű, lapozható API-forrás, nem csupán RSS-rövidítés.

Prowlarr esetén egy indexelő Torznab/Newznab URL-jét használd, például
`http://prowlarr:9696/1/api`. Jackett esetén a felületéről kimásolt Torznab
végpontot, például
`http://jackett:9117/api/v2.0/indexers/my-indexer/results/torznab/api`.
Az indexelők külön hozzáadásával átnevezheted őket, és a médiatárban látod a
származásukat.

Egy indexelő első begyűjtése beolvassa a `t=caps` választ, majd `offset`
segítségével lekéri a `t=search` oldalakat, amíg el nem éri a beállított
korlátot **kategóriánként**. A biztonsági korlát **10 000 000**-ig emelhető,
ami gyakorlatilag korlátlan módnak felel meg. Egy valóban végtelen érték nem
lenne biztonságos olyan forrásnál, amelynek lapozása sosem ér véget. Az
oldalméretet továbbra is a kiszolgáló korlátozza, az oldalak közötti
alapértelmezett késleltetés 750 ms. Ez a köteg memóriáját védi, nem a
felhalmozott médiatárat korlátozza.

A későbbi begyűjtések a legújabb oldalon kezdenek, és a tárolt kurzornál vagy
az átfedési ablak végén állnak meg. A kurzor csak a köteg sikeres feldolgozása
után kerül rögzítésre, így egy megszakítás biztonságos újrajátszást okoz, nem
elveszett elemeket.

A globális gyakoriság az alapértelmezés. Minden forrás felülbírálhatja a
**Források** alatt. Az ütemező percenként ellenőrzi az esedékes időpontokat,
és csak az esedékes forrásokat gyűjti be. Amint létrejön egy köteg, a
katalógusok feldolgozása és a gyorsítótár érvénytelenítése azonnal megtörténik;
nincs második, késleltetett küldés a Stremio felé.

A Pastebin források támogatják a közvetlen tartalmat, a JSON-mutatókat és a
kategorizált főindexeket. A Stremio manifest források felderítik a távoli
katalógusokat, és kiválaszthatóvá teszik őket a katalóguskezelőben.

Így kompatibilis kiegészítőkből, például a Plexióból vagy a Stremio
Jellyfinből is importálhatók film/sorozat katalógusok, a Kitsuból pedig
anime-katalógusok. Egy csak streameket kínáló manifest nem teszi elérhetővé a
kiegészítő belső adatbázisát: például egy Comet manifest egy erre szolgáló
export API nélkül nem tudja felsorolni az összes médiát.

### A CometNet pontos hatóköre

A Stremio RSS Catalog aláírt fogadó peerként csatlakozik, és feldolgozás előtt
eltárolja az érvényes bejelentéseket. A CometNet fanout-alapú gossip protokoll:
a fogadó a hozzá továbbított új bejelentéseket kapja meg, nem pedig a célzott
peer adatbázisának garantált másolatát. A `sync_request` és `sync_response`
üzenetnevek léteznek a protokollban, de a Comet nem valósítja meg őket, így a
teljes előzményvisszatöltés jelenleg nem érhető el.
A CometNet poolok a közreműködők megbízhatóságát szűrik. Egy pool létrehozása a
célzott peerrel nem kényszeríti ki a meglévő gyorsítótár újrajátszását, ezért
nem biztosít előzményvisszatöltést.

### Riasztások és elérhetőségi ellenőrzés

A riasztások minden begyűjtésnél számolják az egymást követő hibákat. Az
opcionális **könnyű ellenőrzés** ezen felül rendszeresen megnézi, hogy egy
forrás URL-je válaszol-e, a katalógusa beolvasása, tartalom importálása vagy a
kurzor léptetése nélkül. Így a következő ütemezett begyűjtés előtt is jelezhet
egy kiesést. Az ellenőrzési hibák a begyűjtési hibáktól külön tárolódnak, és
ugyanazt a forrásonkénti küszöbértéket használják; a CometNet a tartós
kapcsolatának állapotán keresztül kerül ellenőrzésre.

> **Röviden:** a CometNet fokozatosan kiegészítheti a médiatárat, de nem teljes
> körű forrás. A teljes kezdeti importhoz inkább lapozható API-t,
> katalógus-manifestet, RSS hírcsatornát vagy gyorsítótár-exportot használj.

Egy WebDAV forrás egy gyökérmappára mutat. A kiegészítő `PROPFIND` segítségével
átvizsgálja az almappákat, megtartja a beállított videókiterjesztéseket, majd
ugyanazt a címtisztítást és TMDB-azonosítást alkalmazza, mint az RSS esetén.
Nem játssza le a fájlokat: a [Davio](https://github.com/arvida42/davio)
kiegészítőt külön telepítsd a Stremióba ugyanazon WebDAV feloldásához. A helyi
WebDAV források alapértelmezés szerint megkerülik a globális proxyt, ami
forrásonként bekapcsolható.

Egy [WaCustom](https://github.com/dydy13014/wacustom) forrás a példány URL-jét
és a rendszergazdai jelszavát használja. A kiegészítő a lapozható WASource API-t
olvassa, és csak az azonosítókat és a katalógus-metaadatokat tárolja, a
lejátszási hivatkozásokat nem. A nagy kezdeti importok a következő
szinkronizálásokkal folytatódnak, amíg a bejárás be nem fejeződik.

A forráskártyák elrejtik az érzékeny URL-eket és kulcsokat; felfedésük vagy
másolásuk kifejezett műveletet igényel. A beállítások exportja ugyanezt a
szabályt követi: a titkos adatok alapértelmezés szerint kimaradnak, és külön
megerősítést igényelnek. Minden importálás előtt SQLite biztonsági mentés
készül.

> A `manifest.json` URL-je soha nem változik. A meglévő katalógusok tartalma
> dinamikus, de a Stremio a manifestet a felhasználói profilban tárolja.
> Katalógus létrehozása, törlése, átnevezése vagy láthatóságának módosítása után
> a **Telepítés / frissítés** gombbal frissítheted, a kiegészítő eltávolítása
> nélkül.

## Katalógus-útmutatók

Egy útmutató soha nem tartalomforrás. Rendezett azonosítólistát biztosít, a
kiegészítő pedig ezt metszi a helyi médiatárral:

```text
rendezett külső lista ∩ már indexelt médiák = a katalógus tartalma
```

- **MDBList**: lista URL-je vagy azonosítója, lapozással a választott korlátig;
- **ListSync**: példány URL-je, listatípus és listaazonosító; a ListSync
  jelenlegi listánkénti végpontja 100 elemre korlátozott;
- **SuggestArr**: példány URL-je, helyi fiók és ajánlási állapotok; a JWT
  bejelentkezést és a 100 elemes lapozást automatikusan kezeli.
- **Agregarr**: példány URL-je és API-kulcs, gyűjtemények felderítése, majd
  rendezett előnézeti import TMDB-azonosítókkal. A Plexszel már szinkronizált
  gyűjtemény közvetlenül a Plex forrásból is kiválasztható.

A hitelesítő adatok rejtve maradnak, és kimaradnak a beállítások exportjából,
hacsak a felhasználó kifejezetten nem kéri a titkos adatokat is.

Az [Agregarr](https://github.com/agregarr/agregarr) integráció a hivatalos
`api/v1` felületet, `X-Api-Key` hitelesítést és az aszinkron előnézeti
végpontokat használja. Nem olvassa ki a HTML-felületet.

---

## Működés

```text
forrás → kötelező címkék → PTT/Parsett elemzés → típus- és kategóriafelismerés
       → TMDB/TVDB/OMDb vagy MAL/AniList/Kitsu azonosítás
       → duplikációszűrés → SQLite médiatár → katalógusok → Stremio-gyorsítótár
```

A **kötelező címkék** az elemzés és azonosítás előtt szűrnek minden forrást. Az
elemző kinyeri a címet, az évet, az évadot/epizódot, a minőséget, a nyelvet, a
csoportot és az infohasht. A forrásszabályok, URL-ek, címek és metaadatok
határozzák meg a kategóriát; az ellentmondó műfajok csökkentik a téves
találatokat. A hibák újrapróbálhatók maradnak, az azonosítások kézzel
javíthatók.

### Azonosítás javítása

A médiatárban nyisd meg a rosszul azonosított médiát, majd válaszd az
**Azonosítás javítása** lehetőséget: add meg a helyes IMDb, TMDB (film vagy
sorozat) vagy TVDB azonosítót. Minden kiadása átkerül a megfelelő médiához, és
a kategória megmarad, ha elfogadja az új típust. A bejelölt címek (évvel
együtt, ha van) **szabályokká** válnak: minden lekéréskor az ilyen című kiadás
közvetlenül ehhez a médiához kapcsolódik, még az automatikus azonosítás előtt.
A túl általános címek, például „The”, alapértelmezés szerint nincsenek
bejelölve.

A **Média törlése** eltávolítja a médiát és minden kiadását. Az **Ezt a címet
soha többé ne importáld** opcióval a címei kizárási szabályokká válnak; nélküle
a média a következő lekéréskor visszakerülhet. A szabályok a **Hibák →
Azonosítási szabályok** alatt tekinthetők meg és törölhetők. Egy sikertelen
kiadás javítása szintén megjegyezhető.

A MAL, AniList és Kitsu az animéket normalizálja. A TMDB, TVDB és OMDb
azonosítja és újrabesorolja a filmeket, sorozatokat, dokumentumfilmeket,
tévéműsorokat, koncerteket és élő előadásokat. A beállított Stremio
metaadat-kiegészítők rendezett tartalékként szolgálnak.

### Adatok és gyorsítótár

```text
media           → 1 sor filmenként/sorozatonként (kulcs: imdb_id)
releases        → N kiadás médiánként (minőség, hash, forrás, dátum)
failed_releases → azonosítatlan kiadások (újrapróbáláshoz)
match_rules     → cím (+ év), amely mindig egy médiához kapcsolódik, vagy figyelmen kívül marad
```

Az SQLite WAL módot használ, így a katalógusok írás közben is olvashatók
maradnak. A katalógusválaszok tömörítettek, gyorsítótárazottak, és változás
után előmelegítésre kerülnek. A `CATALOG_HTTP_CACHE_SECONDS` szabályozza a HTTP
gyorsítótárazást (alapértelmezés `30`, kikapcsolás `0`). Az opcionális helyi
borítókép-proxynak/gyorsítótárnak saját élettartama és méretkorlátja van.

Nagy médiatár esetén (több száz MB-os adatbázis) adj a konténernek legalább
512 MB – 1 GB memóriát. A túl alacsony memóriakorlát (`mem_limit`) megakadályozza,
hogy az SQLite gyorsítótárazza a lapjait: a WebUI és a katalógusok ilyenkor
percekig is válaszolhatnak.

### Borítóképek és AIOMetadata

Sorrend: **PostersPlus → RPDB → metaadat-borítókép → helyőrző**. Ha
[AIOMetadata](https://github.com/cedya77/aiometadata) is használatban van,
állítsd a poszter-szolgáltatóját `meta` értékre, hogy megmaradjon az e katalógus
által már biztosított poszter; a TMDB, Fanart és RPDB lecseréli azt. A Discord
galériák ugyanezt a sorrendet követik.

### Felbontásszűrő

A felbontáskorlátok az elemzés és azonosítás előtt kerülnek alkalmazásra minden
kiadásalapú forrásra. `720p` minimum esetén a 480p, 576p vagy SD-ként
felismert kiadások kizárásra kerülnek, így nem hozhatnak létre médiát. A
kifejezett felbontás nélküli kiadás továbbra is elfogadott.

A WebUI a már tárolt kiadások helyi újrafeldolgozását is kínálja: megmutatja a
mennyiséget és egy becslést, SQLite biztonsági mentést készít, törli a
tartományon kívüli kiadásokat, és egy médiát csak akkor töröl, ha nem maradt
megfelelő kiadása. A kötegelt feldolgozás nem függeszti fel az új kiadások
begyűjtését.

### Hatókör

Ez a projekt szándékosan **katalógus**-kiegészítő marad, és nem biztosít
stream-lejátszást. A streamek feloldása az erre szolgáló kiegészítők, például
az AIOStreams vagy a Comet feladata.

---

## Migráció és javítás

A **Beállítások → Migráció és javítás** írás nélkül elemez, a `/data/backups`
alá menti az SQLite adatbázist, alkalmazza a kiválasztott javításokat, és
rögzíti az előzményeiket. Az újrabesorolás kézi marad; a sémamigrációk
verziózottak, előzetes mentéssel futnak, és csak egyszer.

---

## Bejelentkezés a WebUI-ba

- **Hitelesítő adatok**: a `docker-compose.yml` fájlban megadva
- **Munkamenet-titok**: generálás: `openssl rand -hex 32`

---

## Átállás a UseFlow-FR-ről

A [régi verzióról (UseFlow-FR)](https://github.com/Aerya/UseFlow-FR) érkezel? Az átállás zökkenőmentes — az adatbázisod teljesen kompatibilis.

**1. Állítsd le a régi konténert**
```bash
docker compose down
```

**2. Frissítsd a `docker-compose.yml` fájlt**

```yaml
# Előtte
image: ghcr.io/aerya/useflow-fr:latest

# Utána
image: ghcr.io/aerya/stremio-rss-catalog:latest
```

> A kötet útvonala (`/data`) és a `DB_PATH` változó nem változik.

**3. Indítsd el az új konténert**
```bash
docker compose up -d
```

Az adatbázis-migráció az első indításkor automatikusan lefut. Minden meglévő beállításod megmarad.

**4. (Opcionális) Állítsd be az új funkciókat**

- **TVDB API-kulcs** — javítja a dokumentumsorozatok felismerését (ingyenes a [thetvdb.com](https://thetvdb.com) oldalon)
- **MAL Client ID** — javítja az animék azonosítását (ingyenes a [myanimelist.net/apiconfig](https://myanimelist.net/apiconfig) oldalon)
- **AniList** — alapértelmezés szerint engedélyezve, kulcs nem szükséges
- **Kitsu** — alapértelmezés szerint engedélyezve, kulcs nem szükséges
- **Stremio metaadat-kiegészítő** — opcionális tartalék egy beállított `manifest.json` URL-en keresztül, például AIOMetadata
- **OMDb API-kulcs** — bekapcsolja a koncertek és élő előadások felismerését (ingyenes az [omdbapi.com](https://www.omdbapi.com/apikey.aspx) oldalon, napi 1000 kérés)

**5. Telepítsd újra a kiegészítőt a Stremióba**, ha portot váltottál.

---

## Megjegyzések

- Az első szinkronizálás a hírcsatornák méretétől függően több percig is tarthat — végezd el, **mielőtt** telepítenéd a kiegészítőt a Stremióba
- A katalógusok 100 médiás oldalakra vannak bontva — a Stremio görgetés közben, korlát nélkül tölti be őket
- Az IMDb-azonosítók előnyt élveznek; a támogatott natív anime-azonosítók is megmaradnak
- A koncertek és élő előadások felismeréséhez OMDb API-kulcs szükséges (ingyenes, napi 1000 kérés az omdbapi.com oldalon)
- Az AniList alapértelmezés szerint engedélyezve van, és nem igényel kulcsot — a beállításokban kikapcsolható
- Az új kategóriák bevezetése előtt indexelt médiák a régi kategóriájukban maradnak — használd az elemzést, majd a csoportos javítást

### A külső API-k velejáró korlátai

Minden besorolás közösségi adatbázisokra és külső API-kra támaszkodik — **IMDB**, **TMDB**, **OMDb**, **TVDB**, **MyAnimeList** és **AniList**. Ezek a források természetüknél fogva tökéletlenek:

- Egy cím **hiányozhat** egy vagy több adatbázisból, és azonosítatlan maradhat (a `failed_releases` táblába kerül)
- A **műfajokat és metaadatokat** a közösség adja meg: egy dokumentumfilmből hiányozhat a 99-es műfaj, egy animéből a 16-os, egy koncertfilm drámaként lehet címkézve
- Az **eredeti nyelv** (amelyet az animefelismerés használ) hiányozhat vagy hibás lehet a TMDB-n
- Az OMDb ugyanarra a címre más műfajokat adhat vissza, mint a TMDB, vagy egyáltalán nem tartalmazhatja
- A MAL és az AniList ugyanarra az animére eltérő angol címet adhat vissza, vagy nem ismerheti a címet
- Egy **hibás TMDB-találat** (névrokon, közelítő cím) téves besoroláshoz vezethet
- A filmre vett koncertek, tévés különkiadások és zenei dokumentumfilmek jellemzői átfedik egymást — ezekben a kategóriákban **téves pozitív vagy téves negatív** találatok előfordulhatnak

A karbantartó eszközök (kézi újrabesorolás, téves találatok javítása), valamint a médiaadatlap-panel kategóriaváltása lehetővé teszi a problémás esetek kézi javítását.

---

## Köszönetnyilvánítás

- A [UseFlow-FR](https://github.com/Aerya/UseFlow-FR) utódja — eredeti kódbázis, kompatibilis adatbázis
- A [Stremio Addon SDK](https://github.com/Stremio/stremio-addon-sdk) alapján
- Metaadatok: [TMDB](https://www.themoviedb.org/), [TVDB](https://thetvdb.com/), [OMDb](https://www.omdbapi.com/), [MyAnimeList](https://myanimelist.net/), [AniList](https://anilist.co/), [Kitsu](https://kitsu.io/) és [AIOMetadata](https://github.com/cedya77/aiometadata)
- Integrációk: [Prowlarr](https://prowlarr.com/), [NZBHydra2](https://github.com/theotherp/nzbhydra2), [Apprise](https://github.com/caronc/apprise), [RPDB](https://ratingposterdb.com/)

---

## Licenc

[GNU GPL v3](./LICENSE) — Kérjük, tüntesd fel a forrást.

**Jó streamelést!**


## Katalógusrendezés és IMDb-azonosító nélküli TMDB-médiák

Minden katalógus megválaszthatja a megjelenítési sorrendet: **RSS dátum** (legújabb vagy legrégebbi), **hozzáadás dátuma**, **év** vagy **cím**. Az RSS dátum szerinti rendezés az adott katalógushoz kiválasztott források között a média legújabb kiadásának közzétételi dátumát használja; ha egy forrás ezt nem adja meg, a hozzáadás dátuma szolgál tartalékként.

Az **IMDb-azonosító nélküli TMDB-médiák** is indexelhetők. Ezek külön `tmdb:movie:<id>` vagy `tmdb:tv:<id>` kulcsot kapnak, és a kiegészítő kiszolgálja a metaadataikat a Stremiónak, anélkül hogy megváltoztatná a már IMDb-azonosítóval rendelkező médiák viselkedését.
