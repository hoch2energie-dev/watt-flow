import { describe, expect, it } from "vitest";
import { explainGoogleError } from "@/lib/google/errors";
import { geocodeUrl, parseGeocode } from "@/lib/google/geocode";
import { locate, type LocateDeps } from "@/lib/google/locate";
import { ADDRESS_REGIONS, ADDRESS_TYPES, autocompleteBody, cleanInput, detailsUrl, parseAddress, parseSuggestions, placesError, validPlaceId, validToken } from "@/lib/google/places";
import { geocodeWithGoogle, resolveAddress, suggestAddresses } from "@/lib/google/service";

/* Antworten im Aufbau der Google-Dokumentation, mit erfundenen Anschriften. */
const PLACE = "ChIJdemoPlaceId0123456789";
const autocomplete = {
  suggestions: [
    {
      placePrediction: {
        place: `places/${PLACE}`,
        placeId: PLACE,
        text: { text: "Musterweg 12, Köln, Deutschland", matches: [{ endOffset: 9 }] },
        structuredFormat: { mainText: { text: "Musterweg 12", matches: [{ endOffset: 9 }] }, secondaryText: { text: "Köln, Deutschland" } },
        types: ["premise", "geocode"],
      },
    },
    { queryPrediction: { text: { text: "Musterweg Apotheke" } } },
    { placePrediction: { placeId: "kurz", text: { text: "Ungültige Kennung" } } },
    { placePrediction: { placeId: "ChIJzweiterOrt9876543210", text: { text: "Musterweg, Bonn, Deutschland" } } },
  ],
};
const details = {
  addressComponents: [
    { longText: "12", shortText: "12", types: ["street_number"], languageCode: "de" },
    { longText: "Musterweg", shortText: "Musterweg", types: ["route"], languageCode: "de" },
    { longText: "Altstadt-Nord", shortText: "Altstadt-Nord", types: ["sublocality_level_2", "sublocality", "political"], languageCode: "de" },
    { longText: "Köln", shortText: "Köln", types: ["locality", "political"], languageCode: "de" },
    { longText: "Nordrhein-Westfalen", shortText: "NRW", types: ["administrative_area_level_1", "political"], languageCode: "de" },
    { longText: "Deutschland", shortText: "DE", types: ["country", "political"], languageCode: "de" },
    { longText: "50667", shortText: "50667", types: ["postal_code"], languageCode: "de" },
  ],
  location: { latitude: 50.9413, longitude: 6.9583 },
};
const geocode = {
  status: "OK",
  results: [{ formatted_address: "Musterweg 12, 50667 Köln, Deutschland", geometry: { location: { lat: 50.9413, lng: 6.9583 }, location_type: "ROOFTOP" }, place_id: PLACE, types: ["street_address"] }],
};

const TOKEN = "3f2c7a10-9b1e-4d5a-8c77-0a1b2c3d4e5f";
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("Google: Adressvorschläge lesen und bauen", () => {
  it("räumt die Eingabe auf und prüft Kennzeichen", () => {
    expect(cleanInput("  Muster   weg\n12 ")).toBe("Muster weg 12");
    expect(cleanInput("x".repeat(300))).toHaveLength(120);
    expect(cleanInput(42)).toBe("");
    expect([validToken(TOKEN), validToken("kurz"), validToken("mit leerzeichen 12345"), validToken(`${TOKEN}x`), validToken(null)]).toEqual([true, false, false, false, false]);
    expect([validPlaceId(PLACE), validPlaceId("a/../b-1234567890"), validPlaceId("")]).toEqual([true, false, false]);
  });

  it("fragt auf Deutsch, in den vorgesehenen Ländern und nur nach Anschriften", () => {
    expect(autocompleteBody("Musterweg 1", TOKEN)).toEqual({ input: "Musterweg 1", sessionToken: TOKEN, languageCode: "de", regionCode: "de", includedRegionCodes: ADDRESS_REGIONS, includedPrimaryTypes: ADDRESS_TYPES });
    expect(ADDRESS_TYPES.length).toBeLessThanOrEqual(5);
    expect(ADDRESS_REGIONS.length).toBeLessThanOrEqual(15);
  });

  it("liest Ortsvorschläge und lässt Suchvorschläge und Kaputtes weg", () => {
    expect(parseSuggestions(autocomplete)).toEqual([
      { placeId: PLACE, main: "Musterweg 12", secondary: "Köln, Deutschland" },
      { placeId: "ChIJzweiterOrt9876543210", main: "Musterweg, Bonn, Deutschland", secondary: "" },
    ]);
    expect(parseSuggestions({})).toEqual([]);
    expect(parseSuggestions(null)).toEqual([]);
    expect(parseSuggestions({ suggestions: "nein" })).toEqual([]);
    const many = { suggestions: Array.from({ length: 12 }, (_, index) => ({ placePrediction: { placeId: `ChIJviele-Orte-${String(index).padStart(4, "0")}`, text: { text: `Weg ${index}` } } })) };
    expect(parseSuggestions(many)).toHaveLength(6);
  });

  it("baut die Detailadresse mit Sitzungskennzeichen", () => {
    const url = new URL(detailsUrl(PLACE, TOKEN));
    expect(url.origin + url.pathname).toBe(`https://places.googleapis.com/v1/places/${PLACE}`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ sessionToken: TOKEN, languageCode: "de", regionCode: "de" });
  });

  it("setzt Straße mit Hausnummer, PLZ, Ort und Koordinaten zusammen", () => {
    expect(parseAddress(details)).toEqual({ street: "Musterweg 12", zip: "50667", city: "Köln", country: "DE", latitude: 50.9413, longitude: 6.9583 });
  });

  it("kommt mit fehlenden Teilen und anderen Ländern zurecht", () => {
    const only = (types: string[], longText: string, shortText = longText) => ({ longText, shortText, types });
    expect(parseAddress({ addressComponents: [only(["route"], "Musterweg"), only(["locality"], "Bonn"), only(["country"], "Deutschland", "DE")] })).toEqual({ street: "Musterweg", zip: "", city: "Bonn", country: "DE", latitude: null, longitude: null });
    expect(parseAddress({ addressComponents: [only(["street_number"], "7"), only(["route"], "Rue de l'Exemple"), only(["locality"], "Luxembourg"), only(["country"], "Luxemburg", "LU")] })?.street).toBe("7 Rue de l'Exemple");
    expect(parseAddress({ addressComponents: [only(["route"], "High Street"), only(["street_number"], "3"), only(["postal_town"], "Sampletown"), only(["country"], "Vereinigtes Königreich", "GB")] })).toMatchObject({ street: "3 High Street", city: "Sampletown" });
    expect(parseAddress({ addressComponents: [only(["route"], "Dorfstraße"), only(["street_number"], "1"), only(["country"], "Deutschland", "DE")], location: { latitude: 95, longitude: 7 } })).toMatchObject({ city: "", latitude: null, longitude: null });
    expect(parseAddress({ addressComponents: [] })).toBeNull();
    expect(parseAddress({ location: { latitude: 1, longitude: 2 } })).toBeNull();
    expect(parseAddress("x")).toBeNull();
  });

  it("gibt Googles Fehlermeldung für die Verbindungsprüfung wieder", () => {
    expect(placesError({ error: { code: 403, message: "Places API (New) has not been used in project 1 before or it is disabled.", status: "PERMISSION_DENIED" } }, 403)).toBe("HTTP 403 · PERMISSION_DENIED · Places API (New) has not been used in project 1 before or it is disabled.");
    expect(placesError(null, 500)).toBe("HTTP 500");
  });
});

describe("Google: Standortsuche lesen und bauen", () => {
  it("baut die Anfrage auf Deutsch mit Schlüssel", () => {
    const url = new URL(geocodeUrl("Musterweg 12, 50667 Köln", "schluessel"));
    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/geocode/json");
    expect(Object.fromEntries(url.searchParams)).toEqual({ address: "Musterweg 12, 50667 Köln", language: "de", region: "de", key: "schluessel" });
  });

  it("übernimmt nur Breite und Länge und merkt sich, ob das Gebäude getroffen ist", () => {
    expect(parseGeocode(geocode)).toEqual({ ok: true, hit: { latitude: 50.9413, longitude: 6.9583, approximate: false } });
    const street = { status: "OK", results: [{ geometry: { location: { lat: 50.94, lng: 6.95 }, location_type: "GEOMETRIC_CENTER" } }] };
    expect(parseGeocode(street)).toEqual({ ok: true, hit: { latitude: 50.94, longitude: 6.95, approximate: true } });
    const partial = { status: "OK", results: [{ partial_match: true, geometry: { location: { lat: 50.94, lng: 6.95 }, location_type: "ROOFTOP" } }] };
    expect(parseGeocode(partial)).toMatchObject({ ok: true, hit: { approximate: true } });
  });

  it("unterscheidet nicht gefunden von abgelehnt", () => {
    expect(parseGeocode({ status: "ZERO_RESULTS", results: [] })).toEqual({ ok: true, hit: null });
    expect(parseGeocode({ status: "REQUEST_DENIED", error_message: "The provided API key is invalid.", results: [] })).toEqual({ ok: false, error: "REQUEST_DENIED · The provided API key is invalid." });
    expect(parseGeocode({ status: "OK", results: [] })).toEqual({ ok: true, hit: null });
    expect(parseGeocode(null)).toMatchObject({ ok: false });
    expect(parseGeocode({})).toEqual({ ok: false, error: "Unbekannter Status" });
  });
});

describe("Google: Anfragen des Servers", () => {
  it("schickt Vorschlagsanfragen mit Schlüssel in der Kopfzeile, nicht in der Adresse", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fake = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return reply(autocomplete);
    }) as typeof fetch;
    const result = await suggestAddresses("geheim", "Musterweg 1", TOKEN, fake);
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.suggestions).toHaveLength(2);
    expect(calls[0].url).toBe("https://places.googleapis.com/v1/places:autocomplete");
    expect(calls[0].init?.method).toBe("POST");
    expect(new Headers(calls[0].init?.headers).get("X-Goog-Api-Key")).toBe("geheim");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ input: "Musterweg 1", sessionToken: TOKEN });
  });

  it("holt die Details nur mit den zwei günstigen Feldern", async () => {
    let seen: RequestInit | undefined;
    const fake = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      seen = init;
      return reply(details);
    }) as typeof fetch;
    expect(await resolveAddress("geheim", PLACE, TOKEN, fake)).toEqual({ ok: true, address: { street: "Musterweg 12", zip: "50667", city: "Köln", country: "DE", latitude: 50.9413, longitude: 6.9583 } });
    expect(new Headers(seen?.headers).get("X-Goog-FieldMask")).toBe("addressComponents,location");
  });

  it("meldet Ablehnung, Ausfall und Unlesbares, ohne zu werfen", async () => {
    const denied = (async () => reply({ error: { status: "PERMISSION_DENIED", message: "API key not valid." } }, 403)) as typeof fetch;
    expect(await suggestAddresses("k", "Musterweg", TOKEN, denied)).toEqual({ ok: false, error: "HTTP 403 · PERMISSION_DENIED · API key not valid." });
    expect(await resolveAddress("k", PLACE, TOKEN, denied)).toMatchObject({ ok: false });
    const down = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await suggestAddresses("k", "Musterweg", TOKEN, down)).toMatchObject({ ok: false, error: expect.stringContaining("nicht erreichbar") });
    expect(await geocodeWithGoogle("k", "Musterweg 12", down)).toMatchObject({ ok: false });
    const html = (async () => new Response("<html>", { status: 502 })) as typeof fetch;
    expect(await geocodeWithGoogle("k", "Musterweg 12", html)).toEqual({ ok: false, error: "HTTP 502" });
    expect(await suggestAddresses("k", "Musterweg", TOKEN, html)).toEqual({ ok: false, error: "HTTP 502" });
  });

  it("sucht den Standort und reicht Googles Status durch", async () => {
    const found = (async () => reply(geocode)) as typeof fetch;
    expect(await geocodeWithGoogle("k", "Musterweg 12, 50667 Köln", found)).toEqual({ ok: true, hit: { latitude: 50.9413, longitude: 6.9583, approximate: false } });
    const none = (async () => reply({ status: "ZERO_RESULTS", results: [] })) as typeof fetch;
    expect(await geocodeWithGoogle("k", "gibt es nicht", none)).toEqual({ ok: true, hit: null });
  });
});

describe("Standortsuche: Reihenfolge der Dienste", () => {
  const osm = { latitude: 50.9, longitude: 6.9, label: "Musterweg, Köln, Deutschland" };
  const setup = (googleKey: string | null, answer: Awaited<ReturnType<LocateDeps["google"]>>, fallback: LocateDeps["fallback"] = async () => osm) => {
    const calls: string[] = [];
    const deps: LocateDeps = {
      googleKey,
      google: async (_key, address) => {
        calls.push(`google:${address}`);
        return answer;
      },
      fallback: async (address) => {
        calls.push(`osm:${address}`);
        return fallback(address);
      },
    };
    return { deps, calls };
  };

  it("nimmt Googles Koordinaten und behält die eingegebene Anschrift als Bezeichnung", async () => {
    const { deps, calls } = setup("k", { ok: true, hit: { latitude: 50.9413, longitude: 6.9583, approximate: false } });
    expect(await locate("  Musterweg 12,   50667 Köln ", deps)).toEqual({ latitude: 50.9413, longitude: 6.9583, label: "Musterweg 12, 50667 Köln", source: "google", approximate: false });
    expect(calls).toEqual(["google:Musterweg 12, 50667 Köln"]);
  });

  it("rät nicht woanders weiter, wenn Google nichts findet", async () => {
    const { deps, calls } = setup("k", { ok: true, hit: null });
    expect(await locate("Gibtesnicht 99", deps)).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("weicht auf OpenStreetMap aus, wenn Google ablehnt oder ausfällt", async () => {
    const { deps, calls } = setup("k", { ok: false, error: "REQUEST_DENIED" });
    expect(await locate("Musterweg 12", deps)).toEqual({ ...osm, source: "nominatim", approximate: false });
    expect(calls).toEqual(["google:Musterweg 12", "osm:Musterweg 12"]);
  });

  it("fragt ohne Schlüssel nur OpenStreetMap und reicht dessen Ausfall weiter", async () => {
    const { deps, calls } = setup(null, { ok: true, hit: null });
    expect(await locate("Musterweg 12", deps)).toMatchObject({ source: "nominatim" });
    expect(calls).toEqual(["osm:Musterweg 12"]);
    const none = setup(null, { ok: true, hit: null }, async () => null);
    expect(await locate("Musterweg 12", none.deps)).toBeNull();
    const down = setup(null, { ok: true, hit: null }, async () => {
      throw new Error("Die Adresssuche ist gerade nicht erreichbar.");
    });
    await expect(locate("Musterweg 12", down.deps)).rejects.toThrow("nicht erreichbar");
    expect(await locate("ab", none.deps)).toBeNull();
  });
});

describe("Google: Fehler für die Verbindungsprüfung erklären", () => {
  it("erkennt die üblichen Ursachen", () => {
    expect(explainGoogleError("REQUEST_DENIED · The provided API key is invalid.")).toContain("Schlüssel ist falsch");
    expect(explainGoogleError("HTTP 400 · INVALID_ARGUMENT · API key not valid. Please pass a valid API key.")).toContain("Schlüssel ist falsch");
    expect(explainGoogleError("HTTP 403 · PERMISSION_DENIED · Places API (New) has not been used in project 123 before or it is disabled.")).toContain("noch nicht aktiviert");
    expect(explainGoogleError("REQUEST_DENIED · You must enable Billing on the Google Cloud Project")).toContain("Rechnungskonto");
    expect(explainGoogleError("REQUEST_DENIED · API keys with referer restrictions cannot be used with this API.")).toContain("auf Websites beschränkt");
    expect(explainGoogleError("REQUEST_DENIED · This IP, site or mobile application is not authorized to use this API key. Request received from IP address 203.0.113.7, with empty referer")).toContain("passt nicht zu diesem Server");
    expect(explainGoogleError("HTTP 403 · PERMISSION_DENIED · Requests from this IP address 203.0.113.7 are blocked. API_KEY_IP_ADDRESS_BLOCKED")).toContain("passt nicht zu diesem Server");
    expect(explainGoogleError("HTTP 403 · PERMISSION_DENIED · Requests from referer <empty> are blocked. API_KEY_HTTP_REFERRER_BLOCKED")).toContain("auf Websites beschränkt");
    expect(explainGoogleError("HTTP 403 · PERMISSION_DENIED · Requests to this API places.googleapis.com method google.maps.places.v1.Places.AutocompletePlaces are blocked. API_KEY_SERVICE_BLOCKED")).toContain("darf diese API nicht benutzen");
    expect(explainGoogleError("OVER_QUERY_LIMIT")).toContain("Kontingent");
    expect(explainGoogleError("Google ist nicht erreichbar oder hat nicht rechtzeitig geantwortet.")).toContain("kommt nicht zu Google");
    expect(explainGoogleError("HTTP 500")).toBe("");
  });
});
