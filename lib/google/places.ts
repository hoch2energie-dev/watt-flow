/**
 * Adressvorschläge über die Places API (New) von Google: Anfragen bauen und Antworten lesen.
 * Hier wird nichts abgeschickt, das macht lib/google/service.ts.
 *
 * Ablauf einer Eingabe („Sitzung"): Jede Vorschlagsanfrage trägt dasselbe Sitzungskennzeichen,
 * die Auswahl eines Vorschlags schließt die Sitzung mit einer Detailanfrage ab. So rechnet
 * Google die Tipp-Anfragen einer Adresse zusammen ab.
 */
export const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
export const DETAILS_URL = "https://places.googleapis.com/v1/places/";
/** Felder der Detailanfrage. Beide gehören zur günstigsten Stufe („Essentials"). */
export const DETAILS_FIELDS = "addressComponents,location";
/** Länder, aus denen Vorschläge kommen: Deutschland und die Nachbarn, in denen Kunden sitzen können. */
export const ADDRESS_REGIONS = ["de", "at", "ch", "nl", "be", "lu"];
/** Nur Anschriften, keine Geschäfte oder Sehenswürdigkeiten. */
export const ADDRESS_TYPES = ["street_address", "premise", "subpremise", "route"];
export const MIN_INPUT = 3;

export type AddressSuggestion = { placeId: string; main: string; secondary: string };
export type ResolvedAddress = { street: string; zip: string; city: string; country: string; latitude: number | null; longitude: number | null };

/** Eingabe des Nutzers: Leerraum zusammengefasst, höchstens 120 Zeichen. */
export function cleanInput(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 120) : "";
}

/** Google verlangt höchstens 36 Zeichen aus Buchstaben, Ziffern, Binde- und Unterstrich. Eine UUID passt. */
export function validToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,36}$/.test(value);
}

export function validPlaceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{10,400}$/.test(value);
}

export function autocompleteBody(input: string, sessionToken: string) {
  return {
    input,
    sessionToken,
    languageCode: "de",
    regionCode: "de",
    includedRegionCodes: ADDRESS_REGIONS,
    includedPrimaryTypes: ADDRESS_TYPES,
  };
}

const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const textOf = (value: unknown): string => {
  const text = record(value)?.text;
  return typeof text === "string" ? text.trim().slice(0, 200) : "";
};

/** Liest die Vorschläge aus der Antwort. Unbekanntes und Unvollständiges fällt weg. */
export function parseSuggestions(payload: unknown): AddressSuggestion[] {
  const list = record(payload)?.suggestions;
  if (!Array.isArray(list)) return [];
  const suggestions: AddressSuggestion[] = [];
  for (const entry of list) {
    const prediction = record(record(entry)?.placePrediction);
    if (!prediction || !validPlaceId(prediction.placeId)) continue;
    const format = record(prediction.structuredFormat);
    const main = textOf(format?.mainText) || textOf(prediction.text);
    if (!main) continue;
    suggestions.push({ placeId: prediction.placeId, main, secondary: textOf(format?.secondaryText) });
    if (suggestions.length >= 6) break;
  }
  return suggestions;
}

export function detailsUrl(placeId: string, sessionToken: string): string {
  const url = new URL(DETAILS_URL + encodeURIComponent(placeId));
  url.searchParams.set("sessionToken", sessionToken);
  url.searchParams.set("languageCode", "de");
  url.searchParams.set("regionCode", "de");
  return url.toString();
}

/** Länder, in denen die Hausnummer vor dem Straßennamen steht. */
const NUMBER_FIRST = new Set(["FR", "LU", "GB", "IE", "US", "CA", "AU", "NZ"]);

/**
 * Macht aus den Adressbestandteilen Straße mit Hausnummer, PLZ und Ort.
 * `null`, wenn die Antwort keine Bestandteile enthält.
 */
export function parseAddress(payload: unknown): ResolvedAddress | null {
  const root = record(payload);
  const components = root?.addressComponents;
  if (!Array.isArray(components) || components.length === 0) return null;
  const pick = (type: string, short = false): string => {
    for (const entry of components) {
      const component = record(entry);
      if (!component || !Array.isArray(component.types) || !component.types.includes(type)) continue;
      const value = short ? component.shortText : component.longText;
      if (typeof value === "string" && value.trim()) return value.trim().slice(0, 120);
    }
    return "";
  };
  const country = pick("country", true).toUpperCase();
  const route = pick("route");
  const number = pick("street_number");
  const street = route && number ? (NUMBER_FIRST.has(country) ? `${number} ${route}` : `${route} ${number}`) : route || pick("premise");
  const city = pick("locality") || pick("postal_town") || pick("administrative_area_level_3") || pick("sublocality") || pick("administrative_area_level_2");
  const location = record(root?.location);
  const latitude = typeof location?.latitude === "number" && Math.abs(location.latitude) <= 90 ? location.latitude : null;
  const longitude = typeof location?.longitude === "number" && Math.abs(location.longitude) <= 180 ? location.longitude : null;
  const located = latitude != null && longitude != null;
  return { street, zip: pick("postal_code"), city, country, latitude: located ? latitude : null, longitude: located ? longitude : null };
}

/** Fehlermeldung von Google aus einer Fehlantwort der Places API, für die Verbindungsprüfung. */
export function placesError(payload: unknown, status: number): string {
  const error = record(record(payload)?.error);
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  const code = typeof error?.status === "string" ? error.status : "";
  return [`HTTP ${status}`, code, message].filter(Boolean).join(" · ").slice(0, 400);
}
