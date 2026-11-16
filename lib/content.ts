export type PdfPageKey =
  | "cover"
  | "about"
  | "overview"
  | "pv"
  | "production"
  | "storage"
  | "wallbox"
  | "heatpump"
  | "building"
  | "prices"
  | "economics"
  | "legal";

export type PdfPageSetting = { key: PdfPageKey; enabled: boolean };

export const PDF_PAGE_LABELS: Record<PdfPageKey, string> = {
  cover: "Deckblatt",
  about: "Firmenvorstellung",
  overview: "Gesamtübersicht",
  pv: "Photovoltaik-Komponenten",
  production: "Ertrag und Eigenverbrauch",
  storage: "Speicher",
  wallbox: "Wallbox",
  heatpump: "Wärmepumpe",
  building: "Gebäude und Verbrauch",
  prices: "Preise und Zahlung",
  economics: "Wirtschaftlichkeit",
  legal: "Hinweise zum Angebot",
};

export const DEFAULT_PDF_PAGES: PdfPageSetting[] = (Object.keys(PDF_PAGE_LABELS) as PdfPageKey[]).map((key) => ({
  key,
  enabled: true,
}));

export function parsePdfPages(value: unknown): PdfPageSetting[] {
  const known = new Set(Object.keys(PDF_PAGE_LABELS));
  const pages: PdfPageSetting[] = [];
  if (Array.isArray(value)) {
    for (const raw of value) {
      if (!raw || typeof raw !== "object") continue;
      const key = (raw as { key?: unknown }).key;
      const enabled = (raw as { enabled?: unknown }).enabled;
      if (typeof key === "string" && known.has(key) && !pages.some((page) => page.key === key)) {
        pages.push({ key: key as PdfPageKey, enabled: enabled !== false });
      }
    }
  }
  for (const page of DEFAULT_PDF_PAGES) {
    if (!pages.some((entry) => entry.key === page.key)) pages.push(page);
  }
  return pages;
}

export const DEFAULT_ABOUT = `Hoch2 Energiesysteme GmbH plant und installiert Photovoltaik, Stromspeicher, Wärmepumpen und Ladeinfrastruktur für Haushalte, Gewerbe und Mieterstromprojekte. Wir arbeiten aus Monheim am Rhein und begleiten ein Vorhaben von der Aufnahme vor Ort bis zur Inbetriebnahme.

Im Angebot stehen die vorgesehenen Komponenten, die Preise und eine nachvollziehbare Einschätzung von Ertrag und Wirtschaftlichkeit. Alle Annahmen sind offen genannt.`;

export const DEFAULT_LEGAL = `Mustertext. Bitte vor dem produktiven Einsatz anwaltlich prüfen lassen.

1. Gültigkeit
Dieses Angebot ist freibleibend und gilt bis zum genannten Datum. Danach können sich Einkaufspreise und Lieferzeiten ändern.

2. Leistungsumfang
Geschuldet sind die aufgeführten Positionen der genannten Variante. Nicht enthalten sind bauseitige Leistungen, ein Gerüst außerhalb der Positionen, unvorhergesehene Mängel an Dach oder Elektroanlage sowie Auflagen des Netzbetreibers, soweit sie nicht ausdrücklich genannt sind.

3. Umsatzsteuer
Für Lieferung und Installation von Photovoltaikanlagen einschließlich wesentlicher Komponenten wie Wechselrichter und Speicher kann an oder in der Nähe von Wohnungen der Nullsteuersatz nach § 12 Abs. 3 UStG gelten. Wallboxen, Wärmepumpen und andere Leistungen werden mit 19 % ausgewiesen, sofern nichts anderes angegeben ist. Ob der Nullsteuersatz im Einzelfall greift, hängt von den gesetzlichen Voraussetzungen ab. Die im Angebot gewählte Steuer ist eine fachliche Einordnung des Betriebs und keine Steuerberatung.

4. Wirtschaftlichkeit
Ertrag, Eigenverbrauch, Autarkie und Amortisation sind eine Näherung aus den genannten Annahmen. Sie sind keine Zusage eines bestimmten Ertrags oder einer bestimmten Ersparnis.

5. Zahlung und Eigentum
Es gilt die gewählte Zahlungsart. Das Eigentum an gelieferten Waren geht erst mit vollständigem Zahlungseingang über.

6. Annahme
Die Annahme erfolgt durch Unterschrift auf diesem Angebot oder durch eine andere ausdrückliche Bestätigung. Damit kommt der Vertrag über die angebotene Variante zustande.`;

export const DEFAULT_COVER = "Angebot für Ihre Energieversorgung";

export const BUILDING_TYPES = ["Einfamilienhaus", "Zweifamilienhaus", "Mehrfamilienhaus", "Mieterstrom", "Gewerbe", "Sonstiges"];
export const ROOF_TYPES = ["Ziegel", "Biberschwanz", "Blech", "Flachdach", "Schiefer", "Trapezblech", "Unbekannt"];
export const ORIENTATIONS = ["Süd", "Südost", "Südwest", "Ost-West", "Ost", "West", "Nord", "Flachdach"];
export const HEATING_TYPES = ["Gas", "Öl", "Wärmepumpe", "Fernwärme", "Pellets", "Strom", "Unbekannt"];
export const REQUEST_SOURCES = ["Telefon", "Empfehlung", "Web", "Vor Ort", "Partner", "Sonstiges"];

export const DEFAULT_STAGES = [
  { seedKey: "neu", name: "Neu", color: "#5c6b73", isWon: false, isLost: false },
  { seedKey: "arbeit", name: "In Arbeit", color: "#1e5c42", isWon: false, isLost: false },
  { seedKey: "warten", name: "Warten auf Rückmeldung", color: "#8a6110", isWon: false, isLost: false },
  { seedKey: "rueckfragen", name: "Rückfragen", color: "#b4532a", isWon: false, isLost: false },
  { seedKey: "gewonnen", name: "Kunde gewonnen", color: "#1f7a4d", isWon: true, isLost: false },
  { seedKey: "planung", name: "Auftragsplanung", color: "#1e4d6b", isWon: false, isLost: false },
  { seedKey: "abschluss", name: "Projektabschluss", color: "#3f3a33", isWon: false, isLost: false },
];
