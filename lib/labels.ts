export const SEGMENT_LABEL = { HAUSHALT: "Haushalt", GEWERBE: "Gewerbe" } as const;

export const REQUEST_STATUS_LABEL = {
  NEU: "Neu",
  IN_QUALIFIZIERUNG: "In Qualifizierung",
  QUALIFIZIERT: "Qualifiziert",
  ANGEBOT_ERSTELLT: "Angebot erstellt",
  GEWONNEN: "Gewonnen",
  VERLOREN: "Verloren",
  UNGEEIGNET: "Ungeeignet",
} as const;

export const OFFER_STATUS_LABEL = {
  ENTWURF: "Entwurf",
  VERSENDET: "Versendet",
  ANGENOMMEN: "Angenommen",
  ABGELEHNT: "Abgelehnt",
} as const;

export const PAYMENT_LABEL = {
  BAR: "Barzahlung",
  FINANZIERUNG: "Finanzierung",
  RATEN: "Ratenzahlung",
} as const;

export const SECTION_LABEL: Record<string, string> = {
  module: "Module",
  inverter: "Wechselrichter",
  mounting: "Montage und Elektro",
  storage: "Speicher",
  wallbox: "Wallbox",
  heatpump: "Wärmepumpe",
  extra: "Weitere Positionen",
};
