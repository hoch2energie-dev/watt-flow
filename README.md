# Hoch2 Angebote

Interne Angebots- und Projektsoftware für Hoch2 Energiesysteme GmbH. Sie führt Anfragen, Kontakte, den Produktkatalog, Angebotsvarianten, eine Wirtschaftlichkeitsrechnung, das Angebots-PDF, ein Board und Termine. Kundendaten liegen in einer PostgreSQL-Datenbank auf dem eigenen Server.

Die Oberfläche ist deutsch. Währung ist Euro. Photovoltaik-Positionen können mit 0 % Umsatzsteuer nach § 12 Abs. 3 UStG gerechnet werden, andere Positionen mit 19 %.

## Lokal ausprobieren

Für eine Probelauf-Datenbank mit erfundenen Kontakten:

```bash
cp .env.example .env
# In .env: SEED_DEMO=true und eine lokale DATABASE_URL auf PostgreSQL
SEED_DEMO=true npx prisma migrate dev
SEED_DEMO=true npm run db:seed
npm run dev
```

Die Entwicklungsumgebung liegt auf Port 4317.

Beispielkonten, nur wenn `SEED_DEMO=true`:

| Name | E-Mail | Passwort | Rolle |
| --- | --- | --- | --- |
| Leonie Hartmann | leonie.hartmann@hoch2.example | Sonnenklar!2026 | Administration |
| Jonas Keller | jonas.keller@hoch2.example | Speicher!2026 | Team |

`docker compose` ist der Produktivstack: Caddy auf Port 80/443, keine Beispielkunden. Dafür muss `.env` ausgefüllt sein. Die Server-Einrichtung steht in [DEPLOY.md](DEPLOY.md).

## Was die Software in Stufe 1 kann

1. Anfragen für Haushalt und Gewerbe, Kontakte, Qualifizierungs-Checkliste, Status, Notizen, Dateien.
2. Katalog mit 25 Komponententypen, Einkauf, Verkauf, Datenblattwerten und CSV-Import/Export.
3. Angebot aus einer Anfrage, mehrere Varianten, Schritte Verbrauch, Gebäude, Bestand, Solar, Speicher, Wallbox, Wärmepumpe, Extras, Zahlung, Ergebnisse.
4. Eigenverbrauch, Autarkie, Ersparnis, EEG-Vergütung, Amortisation, Zahlungsstrom über 10 bis 30 Jahre, Finanzierungsrate. Der PV-Ertrag kommt aus einem spezifischen Ertrag (kWh/kWp). Das Ertragsmodell ist austauschbar.
5. Angebots-PDF mit schaltbaren Seiten, Logo und Texten.
6. Board mit den Spalten Neu, In Arbeit, Warten auf Rückmeldung, Rückfragen, Kunde gewonnen, Auftragsplanung, Projektabschluss. Einfacher Terminkalender.

Angenommene Angebote werden mit einem hochgeladenen unterschriebenen PDF gesperrt.

## Tests

```bash
npm install
npm test
```

Getestet werden Mehrwertsteuer, Rabattverteilung, Marge, Eigenverbrauch, Amortisation, interner Zins und die Annuität.

## Betrieb

Die Einrichtung auf einem gemieteten Linux-Server steht in [DEPLOY.md](DEPLOY.md).

## Ertrag und Dachplanung

Der Ertrag einer Variante kommt von PVGIS (PVGIS © Europäische Union), solange Standort und Dachflächen dazu passen. Sonst gilt der spezifische Ertrag, mit einem Hinweis.

Unter **Dach planen** im Schritt Solar sucht man die Objektadresse, legt Dachflächen auf ein Luftbild, füllt Module aus dem Katalog und sieht das Dach in 3D. Hindernisse und das PVGIS-Horizontprofil erhöhen die Anlagenverluste. Modulzahl, kWp, Neigung und Azimut gehen zurück in die Variante, die Wirtschaftlichkeit und das Angebots-PDF.

Luftbilder und Gebäudemodelle, ohne API-Schlüssel:

- In Nordrhein-Westfalen das Orthofoto von Geobasis NRW (Datenlizenz Deutschland – Zero – Version 2.0).
- Sonst das Esri-Weltluftbild, mit Quellenangabe, nur beim Ansehen.
- LoD2-Gebäude von NRW, dieselbe Zero-Lizenz, nur wenn das Gebäude an der Adresse liegt. Sonst zeichnet man die Flächen.

Die ausgehenden Adressen stehen in [DEPLOY.md](DEPLOY.md).

Mit Schlüsseln der Google Maps Platform kommen Adressvorschläge beim Tippen, eine genauere Standortsuche und eine Satellitenkarte zum Prüfen des Standorts dazu. Das Luftbild der Planung bleibt dabei, wie oben beschrieben. Einrichtung, Kosten und Nutzungsregeln: [docs/google-maps.md](docs/google-maps.md).

## Bewusst nicht enthalten

- Lastprofile und Stundenverbrauchsrechnung
- Lexoffice, HubSpot und andere Integrationen
- Rechnungen
- Elektronische Signatur (Status plus PDF-Upload ist vorhanden)
- Mieterstrom-Abrechnung
- Lastgangsimulation statt der Näherungsformel
- Verrechnung einer schon vorhandenen Photovoltaikanlage im Ertrag
- Versand des Angebots per E-Mail
