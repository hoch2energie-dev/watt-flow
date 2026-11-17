import type { GoogleGeocodeResult } from "@/lib/google/geocode";

/**
 * Reihenfolge der Standortsuche: zuerst Google, wenn ein Schlüssel hinterlegt ist, sonst und bei
 * einem Ausfall von Google die bisherige Suche über OpenStreetMap mit ihrem Zwischenspeicher.
 * Die Dienste werden hereingereicht, damit sich die Reihenfolge ohne Netz und Datenbank prüfen lässt.
 */
export type FoundLocation = {
  latitude: number;
  longitude: number;
  /** Bezeichnung des Standorts. Bei Google die eingegebene Anschrift, nie Googles Adresstext. */
  label: string;
  source: "google" | "nominatim";
  /** Nur bei Google bekannt: Das Gebäude selbst wurde nicht getroffen. */
  approximate: boolean;
};

export type LocateDeps = {
  googleKey: string | null;
  google: (key: string, address: string) => Promise<GoogleGeocodeResult>;
  /** Bisherige Suche samt Zwischenspeicher. `null` heißt nicht gefunden; wirft, wenn sie nicht erreichbar ist. */
  fallback: (address: string) => Promise<{ latitude: number; longitude: number; label: string } | null>;
};

export async function locate(address: string, deps: LocateDeps): Promise<FoundLocation | null> {
  const query = address.replace(/\s+/g, " ").trim().slice(0, 240);
  if (query.length < 3) return null;
  if (deps.googleKey) {
    const result = await deps.google(deps.googleKey, query);
    if (result.ok) {
      /* Google hat geantwortet. Findet es nichts, wird nicht noch woanders geraten. */
      return result.hit ? { latitude: result.hit.latitude, longitude: result.hit.longitude, label: query, source: "google", approximate: result.hit.approximate } : null;
    }
  }
  const hit = await deps.fallback(query);
  return hit ? { latitude: hit.latitude, longitude: hit.longitude, label: hit.label, source: "nominatim", approximate: false } : null;
}
