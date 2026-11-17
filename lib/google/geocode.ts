/**
 * Standortsuche über die Geocoding API von Google: aus einer Anschrift werden Koordinaten.
 * Übernommen werden nur Breite und Länge. Den Adresstext von Google nutzt das Programm nicht,
 * die Anschrift bleibt so, wie sie im Programm eingetragen ist.
 */
export const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

export type GoogleGeocodeHit = {
  latitude: number;
  longitude: number;
  /** Google hat nicht das Gebäude selbst getroffen, sondern Straße, Ortsteil oder Ort. */
  approximate: boolean;
};

export type GoogleGeocodeResult = { ok: true; hit: GoogleGeocodeHit | null } | { ok: false; error: string };

export function geocodeUrl(address: string, key: string): string {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("address", address);
  url.searchParams.set("language", "de");
  url.searchParams.set("region", "de");
  url.searchParams.set("key", key);
  return url.toString();
}

export function parseGeocode(payload: unknown): GoogleGeocodeResult {
  if (!payload || typeof payload !== "object") return { ok: false, error: "Die Antwort von Google war nicht lesbar." };
  const root = payload as { status?: unknown; error_message?: unknown; results?: unknown };
  const status = typeof root.status === "string" ? root.status : "";
  if (status === "ZERO_RESULTS") return { ok: true, hit: null };
  if (status !== "OK") {
    const message = typeof root.error_message === "string" ? root.error_message.trim() : "";
    return { ok: false, error: [status || "Unbekannter Status", message].filter(Boolean).join(" · ").slice(0, 400) };
  }
  const first = Array.isArray(root.results) ? (root.results[0] as { geometry?: { location?: { lat?: unknown; lng?: unknown }; location_type?: unknown }; partial_match?: unknown } | undefined) : undefined;
  const latitude = first?.geometry?.location?.lat;
  const longitude = first?.geometry?.location?.lng;
  if (typeof latitude !== "number" || typeof longitude !== "number" || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { ok: true, hit: null };
  return { ok: true, hit: { latitude, longitude, approximate: first?.geometry?.location_type !== "ROOFTOP" || first?.partial_match === true } };
}
