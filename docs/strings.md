# Strings in der 3D-Planung

Schritt 3 der 3D-Planung, nach Gebäude und Module. Hier wird festgelegt, welche Module in Reihe hängen, in welcher Reihenfolge, und an welchem Wechselrichter und MPP-Tracker ein String liegt.

## Bedienung

- **Von Hand:** Ein freies Modul anklicken oder mit gedrückter linker Maustaste über mehrere streichen. Ohne gewählten String entsteht dabei ein neuer, sonst kommen die Module in der Reihenfolge der Berührung an den gewählten String. Ein Klick auf ein Modul des gewählten Strings nimmt es heraus. Ein Klick auf ein Modul eines anderen Strings wählt diesen. Ein Klick neben die Module oder Esc lässt den String los.
- **Automatisch:** „Module je String" einstellen, dann die gewählte Dachseite oder alle Flächen verstringen. Die freien Module laufen in Schlangenlinie von der Traufe zum First. Liegen mehr Module frei als in einen String passen, entstehen gleich lange Strings.
- **Wechselrichter:** aus dem Katalog hinzufügen. Wechselrichter, die schon als Position im Angebot stehen, sind beim ersten Öffnen vorbelegt. „Strings auf MPP-Tracker verteilen" setzt Strings mit Modulen der Reihe nach auf freie Tracker; von Hand geht es am String unter „Anschluss".
- Das gilt in der Draufsicht (2D) und in der räumlichen Ansicht (3D). Die Maus dreht, zoomt und verschiebt wie in den anderen Schritten; beginnt man mit beiden Tasten zu drehen, wird ein angefangener Strich verworfen.

## Prüfung

Die Liste „Prüfung" rechnet mit den Datenblattwerten aus dem Katalog:

| Prüfung | Stufe |
| --- | --- |
| Leerlaufspannung des Strings bei −10 °C über der maximalen DC-Spannung | Fehler |
| Mehr Strings an einem MPP-Tracker als Eingänge | Fehler |
| Summe der Kurzschlussströme über dem zulässigen Wert je MPP-Tracker | Fehler |
| DC-Leistung über der zulässigen DC-Leistung des Wechselrichters | Fehler |
| Spannung im Arbeitspunkt bei 70 °C unter dem MPP-Bereich | Warnung |
| Spannung im Arbeitspunkt bei 25 °C über dem MPP-Bereich | Warnung |
| Summe der Betriebsströme über dem Eingangsstrom je MPP-Tracker | Warnung |
| Parallele Strings an einem Tracker mit unterschiedlich vielen Modulen | Warnung |
| Ein String mischt Ausrichtungen, Neigungen oder Modultypen | Warnung |
| DC/AC-Verhältnis über 150 % | Warnung |
| DC/AC-Verhältnis über 130 % oder unter 70 % | Hinweis |
| Freie Module, leere Strings, Strings ohne Wechselrichter oder Tracker, fehlende Datenblattwerte | Hinweis |

Die Spannung bei anderer Zelltemperatur ist `U × (1 − |β| / 100 × (T − 25))`, mit β als Temperaturkoeffizient der Leerlaufspannung in %/K. Für die Spannung im Arbeitspunkt wird derselbe Koeffizient verwendet.

Das ist eine Plausibilitätsprüfung. Sie ersetzt nicht die Auslegung mit dem Werkzeug des Wechselrichterherstellers.

## Was im Katalog stehen muss

- **PV-Modul:** Leerlaufspannung Voc, Kurzschlussstrom Isc, Spannung und Strom im MPP (Vmpp, Impp), Temperaturkoeffizient Voc. Fehlt einer der fünf Werte, werden Spannung und Strom für Strings mit diesem Modul nicht geprüft.
- **Wechselrichter:** AC-Leistung, Zahl der MPP-Tracker, Strings je MPP-Tracker, maximale DC-Spannung, MPP-Bereich von/bis, maximaler Eingangsstrom und Kurzschlussstrom je MPP-Tracker, maximale DC-Leistung. Jede fehlende Angabe lässt nur die zugehörige Prüfung entfallen. Ohne Angabe gilt ein Tracker.

## Speicherung

- Zu welchem String ein Modul gehört und an welcher Stelle es hängt, steht am Modul selbst (`geometry.modules[].string` und `.order` an der Dachfläche). So wandert die Zuordnung mit, wenn ein Gebäude verschoben oder das Raster geändert wird.
- Die Liste der Strings und der Wechselrichter liegt an der Variante in `OfferVariant.planning` (JSON, Migration `20261117140000_variant_planning`).
- Wird in der Planung ein Wechselrichter hinzugefügt, entfernt oder getauscht, folgen beim Speichern die Wechselrichter-Positionen des Angebots: Steht das Gerät schon dort, ändert sich nur die Stückzahl. Ein einzelner anderer Typ ersetzt die bisherige Wechselrichterzeile, weitere Typen kommen als Zeile dazu. Gelöscht wird keine Position; bleibt eine übrig, die in der Planung nicht mehr vorkommt, steht das in der Meldung nach dem Speichern.
- Wird ein Wechselrichter später nur in den Positionen des Angebots getauscht, bleibt in der Planung der bisherige stehen. Dann dort ebenfalls tauschen.

## Im Angebot

- Die Kachel Photovoltaikanlage zeigt „Strings zugeordnet" als erledigt, wenn jedes gelegte Modul in einem String hängt und jeder dieser Strings an einem MPP-Tracker.
- Im PDF färbt die Seite „Dachbelegung" die Module in der Draufsicht nach Strings, zeichnet die Reihenfolge als Linie und listet unter „Verschaltung" je String Stückzahl, Leistung und Anschluss.
