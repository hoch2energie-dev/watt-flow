# Installation auf dem eigenen Server

Ubuntu 24.04. Die Anwendung, PostgreSQL und Caddy (HTTPS über Let's Encrypt) starten mit einem Skript, ohne Rückfragen.

## 1. DNS

Der Name `angebote.hoch2energie.de` braucht einen A-Eintrag auf die IPv4-Adresse des Servers. Ohne diesen Eintrag kann Let's Encrypt kein Zertifikat ausstellen. Das Skript startet den Stack trotzdem; Caddy wiederholt die Anfrage.

## 2. Programm ablegen

```bash
sudo mkdir -p /opt/hoch2
sudo tar -xzf hoch2-angebote.tar.gz -C /opt/hoch2
cd /opt/hoch2
cp .env.example .env
```

In `.env` eintragen:

- `DOMAIN=angebote.hoch2energie.de`
- `ACME_EMAIL` für Hinweise von Let's Encrypt
- `POSTGRES_PASSWORD` (lang, ohne Leerzeichen und ohne `@ : / # ? % $`)
- `AUTH_SECRET` mit mindestens 32 Zeichen (`openssl rand -base64 36`)
- `ADMIN_EMAIL=r.gress@hoch2energie.de`
- `ADMIN_PASSWORD` mit mindestens 10 Zeichen
- `ADMIN_NAME`
- `SEED_DEMO=false`

## 3. Installieren

```bash
sudo bash scripts/install.sh
```

Das Skript installiert Docker, öffnet in UFW nur die Ports 22, 80 und 443, richtet die nächtliche Sicherung ein und startet den Stack. Beispielkunden werden nicht angelegt. Es entsteht nur das Administrationskonto aus `ADMIN_EMAIL`.

Danach im Browser: `https://angebote.hoch2energie.de`

## 4. Sicherung

Täglich um 02:00 Uhr schreibt Cron nach `/opt/hoch2/backups`:

- `db-ZEIT.dump` (PostgreSQL)
- `dateien-ZEIT.tar.gz` (hochgeladene Dateien)

Einmal von Hand prüfen:

```bash
cd /opt/hoch2
./scripts/backup.sh
```

Kopieren Sie den Ordner `backups` zusätzlich auf einen anderen Rechner. Wiederherstellen:

```bash
./scripts/restore.sh backups/db-DATUM.dump backups/dateien-DATUM.tar.gz
```

## 5. Passwort zurücksetzen

```bash
cd /opt/hoch2
docker compose exec app npx tsx scripts/reset-password.ts r.gress@hoch2energie.de NeuesPasswort123
```

## 6. Aktualisieren

Neue Programmversion nach `/opt/hoch2` legen, `.env` behalten, dann:

```bash
cd /opt/hoch2
docker compose up -d --build
```

Vorher eine Sicherung machen. `docker compose down -v` löscht die Datenbank. Das `-v` nicht verwenden.

## 7. Ausgehende Verbindungen

Keine API-Schlüssel. Der Server muss diese HTTPS-Hosts erreichen:

- `re.jrc.ec.europa.eu` — PVGIS-Ertrag und Horizontprofil (PVGIS © Europäische Union)
- `nominatim.openstreetmap.org` — Adresssuche, mit eigenem User-Agent und Zwischenspeicher
- `ogc-api.nrw.de` — LoD2-Gebäude in Nordrhein-Westfalen, Datenlizenz Deutschland – Zero – Version 2.0
- `www.wms.nrw.de` — Orthofoto NRW für die 3D-Planung, nur als Ausweichweg, wenn der Browser das Bild nicht direkt laden darf (© Geobasis NRW, Datenlizenz Deutschland – Zero – Version 2.0)

Das Luftbild lädt der Browser des Mitarbeiters, nicht der Server:

- `www.wms.nrw.de` — Orthofoto NRW, Datenlizenz Deutschland – Zero – Version 2.0, © Geobasis NRW
- `server.arcgisonline.com` — Esri Weltluftbild, mit der Quellenangabe in der Karte, nur als Anzeige

Neue Umgebungsvariablen gibt es dafür nicht.
