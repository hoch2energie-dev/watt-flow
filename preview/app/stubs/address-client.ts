import type { AddressSuggestion, ResolvedAddress } from "@/lib/google/places";

/**
 * Stellvertreter für die Adressvorschläge. Die Vorschau fragt nicht bei Google an,
 * sondern sucht in einer kleinen Liste erfundener Anschriften.
 */
const BOOK: (ResolvedAddress & { id: string })[] = [
  { id: "demo-ort-00000001", street: "Musterweg 12", zip: "50667", city: "Köln", country: "DE", latitude: 50.9413, longitude: 6.9583 },
  { id: "demo-ort-00000002", street: "Musterweg 12a", zip: "50667", city: "Köln", country: "DE", latitude: 50.9414, longitude: 6.9585 },
  { id: "demo-ort-00000003", street: "Musterweg 3", zip: "53111", city: "Bonn", country: "DE", latitude: 50.7374, longitude: 7.0982 },
  { id: "demo-ort-00000004", street: "Musterstraße 45", zip: "40789", city: "Monheim am Rhein", country: "DE", latitude: 51.0916, longitude: 6.8924 },
  { id: "demo-ort-00000005", street: "Beispielallee 7", zip: "40213", city: "Düsseldorf", country: "DE", latitude: 51.2254, longitude: 6.7763 },
  { id: "demo-ort-00000006", street: "Beispielgasse 2", zip: "52062", city: "Aachen", country: "DE", latitude: 50.7753, longitude: 6.0839 },
  { id: "demo-ort-00000007", street: "Am Probefeld 19", zip: "41460", city: "Neuss", country: "DE", latitude: 51.1981, longitude: 6.6916 },
  { id: "demo-ort-00000008", street: "Testring 8", zip: "51373", city: "Leverkusen", country: "DE", latitude: 51.0303, longitude: 6.9843 },
];

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Abgebrochen", "AbortError"));
    });
  });

export async function fetchSuggestions(input: string, _token: string, signal?: AbortSignal): Promise<{ enabled: boolean; suggestions: AddressSuggestion[] }> {
  await wait(120, signal);
  const words = input.toLowerCase().split(/\s+/).filter(Boolean);
  const suggestions = BOOK.filter((entry) => words.every((word) => `${entry.street} ${entry.zip} ${entry.city}`.toLowerCase().includes(word)))
    .slice(0, 5)
    .map((entry) => ({ placeId: entry.id, main: entry.street, secondary: `${entry.city}, Deutschland` }));
  return { enabled: true, suggestions };
}

export async function fetchAddress(placeId: string): Promise<ResolvedAddress | null> {
  await wait(80);
  const hit = BOOK.find((entry) => entry.id === placeId);
  return hit ? { street: hit.street, zip: hit.zip, city: hit.city, country: hit.country, latitude: hit.latitude, longitude: hit.longitude } : null;
}
