import { geocodeUrl, parseGeocode, type GoogleGeocodeResult } from "@/lib/google/geocode";
import { AUTOCOMPLETE_URL, DETAILS_FIELDS, autocompleteBody, detailsUrl, parseAddress, parseSuggestions, placesError, type AddressSuggestion, type ResolvedAddress } from "@/lib/google/places";

/**
 * Die drei Anfragen an Google, die der Server stellt. Der Schlüssel wird hereingereicht und
 * geht nur in Kopfzeile oder Adresse der Anfrage an Google, nie in eine Antwort an den Browser.
 * `fetchImpl` lässt sich in Tests ersetzen.
 */
const TIMEOUT_MS = 6000;
const UNREACHABLE = "Google ist nicht erreichbar oder hat nicht rechtzeitig geantwortet.";

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function suggestAddresses(key: string, input: string, sessionToken: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; suggestions: AddressSuggestion[] } | { ok: false; error: string }> {
  try {
    const response = await fetchImpl(AUTOCOMPLETE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
      body: JSON.stringify(autocompleteBody(input, sessionToken)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const payload = await json(response);
    if (!response.ok) return { ok: false, error: placesError(payload, response.status) };
    return { ok: true, suggestions: parseSuggestions(payload) };
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}

export async function resolveAddress(key: string, placeId: string, sessionToken: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; address: ResolvedAddress | null } | { ok: false; error: string }> {
  try {
    const response = await fetchImpl(detailsUrl(placeId, sessionToken), {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAILS_FIELDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const payload = await json(response);
    if (!response.ok) return { ok: false, error: placesError(payload, response.status) };
    return { ok: true, address: parseAddress(payload) };
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}

export async function geocodeWithGoogle(key: string, address: string, fetchImpl: typeof fetch = fetch): Promise<GoogleGeocodeResult> {
  try {
    const response = await fetchImpl(geocodeUrl(address, key), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const payload = await json(response);
    if (!payload) return { ok: false, error: `HTTP ${response.status}` };
    return parseGeocode(payload);
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}
