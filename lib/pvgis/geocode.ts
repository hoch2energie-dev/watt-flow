const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Hoch2Angebote/1.0 (https://angebote.hoch2energie.de)";

export type GeocodeHit = { latitude: number; longitude: number; label: string };

let lastCall = 0;

export async function geocodeAddress(query: string, fetchImpl: typeof fetch = fetch): Promise<GeocodeHit | null> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return null;
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCall = Date.now();
  const url = new URL(NOMINATIM);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "de");
  url.searchParams.set("q", trimmed);
  const response = await fetchImpl(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!response.ok) throw new Error("Die Adresssuche ist gerade nicht erreichbar.");
  const payload = (await response.json()) as { lat?: string; lon?: string; display_name?: string }[];
  const first = Array.isArray(payload) ? payload[0] : undefined;
  if (!first) return null;
  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, label: first.display_name ?? trimmed };
}
