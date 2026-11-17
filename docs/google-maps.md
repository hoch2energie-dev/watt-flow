# Google Maps anbinden

Stand: November 2026. Die Anbindung ist freiwillig. Ohne Schlüssel arbeitet das Programm wie bisher: Adressen werden von Hand eingetragen, den Standort sucht OpenStreetMap.

## Was Google im Programm macht

| Funktion | Wo | Dienst von Google | Schlüssel |
|---|---|---|---|
| Adressvorschläge beim Tippen | Kontakt anlegen und bearbeiten, Anfrage anlegen und bearbeiten | Places API (New) | Server |
| Standort aus der Anschrift | Angebot (Reiter Allgemein), 3D-Planung, Ertragsrechnung | Geocoding API | Server |
| Karte mit Satellitenbild | Angebot, Reiter Allgemein, Knopf „Auf der Karte prüfen" | Maps JavaScript API | Browser |

Das Luftbild in der 3D-Planung kommt weiter vom Orthofoto NRW und außerhalb NRW von Esri. Der Grund steht unten bei den Nutzungsregeln.

## Einrichten in der Google Cloud

Die Bezeichnungen in der Google-Oberfläche können leicht abweichen.

1. Unter <https://console.cloud.google.com> mit dem Firmenkonto anmelden und ein Projekt anlegen, zum Beispiel „WattFlow".
2. Unter „Abrechnung" ein Rechnungskonto mit dem Projekt verknüpfen. Ohne Rechnungskonto beantwortet Google keine Anfragen, auch nicht im Freikontingent.
3. Unter „APIs und Dienste › Bibliothek" drei Dienste aktivieren:
   - Places API (New)
   - Geocoding API
   - Maps JavaScript API
4. Unter „APIs und Dienste › Anmeldedaten" zwei API-Schlüssel erstellen.

   **Server-Schlüssel**
   - Anwendungsbeschränkung: IP-Adressen. Eintragen: die öffentliche IPv4-Adresse des Servers (auf dem Server: `curl -4 ifconfig.me`). Läuft die Testkopie auf einem anderen Server, auch dessen Adresse.
   - API-Beschränkung: nur „Places API (New)" und „Geocoding API".

   **Browser-Schlüssel**
   - Anwendungsbeschränkung: Websites. Eintragen: `https://angebote.hoch2energie.de/*` und `https://test-angebote.hoch2energie.de/*`.
   - API-Beschränkung: nur „Maps JavaScript API".

   Der Browser-Schlüssel ist in jedem Browser sichtbar, der die Karte lädt. Das ist bei Google so vorgesehen. Die Beschränkung auf die eigenen Adressen sorgt dafür, dass ihn niemand anders verwenden kann.
5. Kosten begrenzen:
   - Unter „Abrechnung › Budgets und Benachrichtigungen" ein Budget anlegen, zum Beispiel 10 € im Monat mit Benachrichtigung per E-Mail.
   - Unter „APIs und Dienste › Kontingente" je Dienst eine Obergrenze pro Tag setzen, zum Beispiel 500 Anfragen. Ist sie erreicht, lehnt Google weitere Anfragen ab, statt sie zu berechnen.

## Schlüssel auf den Server bringen

Die Schlüssel stehen nur in der Datei `.env` auf dem Server. Sie gehören nicht ins Repo, nicht in eine E-Mail und nicht in einen Chat.

```bash
cd /opt/hoch2
nano .env
```

Zwei Zeilen ergänzen:

```
GOOGLE_MAPS_SERVER_KEY=...
GOOGLE_MAPS_BROWSER_KEY=...
```

Danach neu starten. Ein neuer Bau ist nicht nötig, das Programm liest die Schlüssel beim Start:

```bash
docker compose up -d
```

## Prüfen

Im Programm unter „Einstellungen › Google Maps" steht, welche Schlüssel hinterlegt sind. „Verbindung prüfen" stellt je eine echte Anfrage an die Adressvorschläge und an die Standortsuche und zeigt darunter die Karte. Lehnt Google etwas ab, steht dort Googles Meldung mit einem Hinweis, was zu tun ist. Bei einer falschen IP-Beschränkung nennt Google in der Meldung die Adresse, von der die Anfrage kam.

Neu aktivierte Dienste und geänderte Beschränkungen brauchen bei Google oft ein paar Minuten, bis sie gelten.

## Kosten

Google rechnet je Dienst und Monat ab. Die Zahlen sind Googles Listenpreise in US-Dollar, Stand November 2026; maßgeblich ist die Preisliste von Google.

| Dienst | Was zählt | Frei pro Monat | Danach je 1.000 |
|---|---|---|---|
| Adressvorschläge | jede Anfrage beim Tippen, höchstens 12 je Adresse | 10.000 | 2,83 $ |
| Adresse auflösen | jede gewählte Adresse | 10.000 | 5,00 $ |
| Standortsuche | jede Suche | 10.000 | 5,00 $ |
| Karte | jedes Öffnen der Karte | 10.000 | 7,00 $ |

Das Programm hält die Zahl der Anfragen klein: Vorschläge kommen erst ab drei Zeichen und nach einer kurzen Tipp-Pause, eine Adresse ist bei Google eine zusammenhängende Sitzung, und die Karte lädt erst, wenn jemand sie öffnet.

## Nutzungsregeln von Google, die das Programm berücksichtigt

Für Projekte mit Rechnungsadresse im Europäischen Wirtschaftsraum gelten seit dem 8. Juli 2025 eigene Bedingungen. Das Folgende beschreibt, wie das Programm damit umgeht. Es ist keine Rechtsberatung; verbindlich ist der Vertrag mit Google.

- **Satellitenbilder gibt es nur in Googles interaktiver Karte.** Als einzelnes Bild (Maps Static API) oder als Kacheln (Map Tiles API) liefert Google sie an EWR-Projekte nicht aus. Die 3D-Planung braucht das Luftbild als Bild unter dem Gebäude und bleibt deshalb beim Orthofoto NRW und bei Esri.
- **Adressvorschläge sind erlaubt.** „Adresssuche und Autovervollständigung" steht ausdrücklich in Googles Liste der zulässigen Verwendungen der Places API.
- **Inhalte aus Places API und Geocoding API dürfen nicht auf oder neben einer Karte stehen**, ausgenommen Breite, Länge und Orts-Kennung. Deshalb übernimmt das Programm von der Standortsuche nur Breite und Länge, und der Dialog „Standort auf der Karte" zeigt nur Karte und Koordinaten, keine Anschrift. Wer die Oberfläche ändert, sollte Adressen nicht in Kartenansichten einblenden.
- **Herkunftsangabe.** Unter der Vorschlagsliste steht „Google Maps". Das verlangt Google, wenn Vorschläge ohne Karte gezeigt werden, und muss bleiben.
- **Standortsuche wird nicht zwischengespeichert.** Ergebnisse von Google landen nicht im dauerhaften Zwischenspeicher der OpenStreetMap-Suche. Am Angebot steht der Standort, den die Nutzerin oder der Nutzer bestätigt oder auf der Karte gesetzt hat.

## Datenschutz

- Bei Adressvorschlägen und Standortsuche schickt der Server den getippten Text bzw. die Anschrift an Google. Der Browser der Mitarbeitenden spricht dabei nicht mit Google.
- Die Karte lädt der Browser direkt von Google. Google sieht dabei die IP-Adresse des Arbeitsplatzes.
- Die Nutzung der Google Maps Platform gehört in das Verzeichnis der Verarbeitungstätigkeiten und, soweit Kundenadressen betroffen sind, in die Datenschutzhinweise. Das klärt der Betrieb mit seiner Datenschutzberatung.

## Für Entwickler

- Schlüssel lesen: `lib/google/config.ts`. Anfragen und Antworten: `lib/google/places.ts`, `lib/google/geocode.ts`, abgeschickt in `lib/google/service.ts`. Reihenfolge der Standortsuche: `lib/google/locate.ts`, an die Datenbank gebunden in `lib/locate.ts`.
- Der Browser fragt den eigenen Server (`/api/address/suggest`, `/api/address/resolve`), der Server fragt Google. Der Server-Schlüssel erscheint in keiner Antwort an den Browser.
- Eingabefelder: `components/address-fields.tsx`. Karte: `lib/google/maps-loader.ts`, `components/google-map.tsx`, `components/offer/location-dialog.tsx`.
- Der Browser-Schlüssel wird zur Laufzeit vom Server an die Seite gereicht, nicht beim Bau eingebettet. Deshalb gibt es keine Variable `NEXT_PUBLIC_…`.
- Tests ohne Netz: `lib/google/google.test.ts` mit Antworten im Aufbau der Google-Dokumentation.
