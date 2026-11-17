import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* Anmeldung und Schlüssel werden ersetzt, Google durch eine nachgestellte Antwort. So laufen die beiden Wege des Servers ohne Datenbank und ohne Netz. */
const state = vi.hoisted(() => ({ session: true, key: "geheimer-schluessel" as string | null }));
vi.mock("@/lib/auth", () => ({ getSession: async () => (state.session ? { userId: "u1" } : null) }));
vi.mock("@/lib/google/config", () => ({ googleServerKey: () => state.key, googleBrowserKey: () => null }));

import { GET as resolve } from "@/app/api/address/resolve/route";
import { GET as suggest } from "@/app/api/address/suggest/route";

const TOKEN = "3f2c7a10-9b1e-4d5a-8c77-0a1b2c3d4e5f";
const PLACE = "ChIJdemoPlaceId0123456789";
const calls: { url: string; init?: RequestInit }[] = [];
let answer: () => Response;

beforeEach(() => {
  state.session = true;
  state.key = "geheimer-schluessel";
  calls.length = 0;
  answer = () => Response.json({ suggestions: [{ placePrediction: { placeId: PLACE, structuredFormat: { mainText: { text: "Musterweg 12" }, secondaryText: { text: "Köln, Deutschland" } } } }] });
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return answer();
  });
});
afterEach(() => vi.unstubAllGlobals());

const ask = (path: string) => new Request(`https://angebote.example${path}`);

describe("Server: Adressvorschläge", () => {
  it("verlangt eine Anmeldung", async () => {
    state.session = false;
    expect((await suggest(ask(`/api/address/suggest?q=Musterweg&s=${TOKEN}`))).status).toBe(401);
    expect((await resolve(ask(`/api/address/resolve?id=${PLACE}&s=${TOKEN}`))).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("meldet ohne Schlüssel, dass die Vorschläge aus sind, und fragt Google nicht", async () => {
    state.key = null;
    const response = await suggest(ask(`/api/address/suggest?q=Musterweg&s=${TOKEN}`));
    expect(await response.json()).toEqual({ enabled: false, suggestions: [] });
    expect(await (await resolve(ask(`/api/address/resolve?id=${PLACE}&s=${TOKEN}`))).json()).toEqual({ address: null });
    expect(calls).toHaveLength(0);
  });

  it("fragt Google erst ab drei Zeichen und nur mit gültigem Sitzungskennzeichen", async () => {
    expect(await (await suggest(ask(`/api/address/suggest?q=Mu&s=${TOKEN}`))).json()).toEqual({ enabled: true, suggestions: [] });
    expect(await (await suggest(ask("/api/address/suggest?q=Musterweg&s=x"))).json()).toEqual({ enabled: true, suggestions: [] });
    expect(await (await suggest(ask("/api/address/suggest?q=Musterweg"))).json()).toEqual({ enabled: true, suggestions: [] });
    expect(calls).toHaveLength(0);
  });

  it("liefert Vorschläge, ohne den Schlüssel herauszugeben oder die Antwort zwischenzuspeichern", async () => {
    const response = await suggest(ask(`/api/address/suggest?q=${encodeURIComponent("Musterweg  1")}&s=${TOKEN}`));
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ enabled: true, suggestions: [{ placeId: PLACE, main: "Musterweg 12", secondary: "Köln, Deutschland" }] });
    expect(body).not.toContain("geheimer-schluessel");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://places.googleapis.com/v1/places:autocomplete");
    expect(JSON.parse(String(calls[0].init?.body)).input).toBe("Musterweg 1");
  });

  it("gibt Googles Fehlertext nicht an den Browser weiter", async () => {
    answer = () => Response.json({ error: { status: "PERMISSION_DENIED", message: "API key not valid. geheimer-schluessel" } }, { status: 403 });
    const body = await (await suggest(ask(`/api/address/suggest?q=Musterweg&s=${TOKEN}`))).text();
    expect(JSON.parse(body)).toEqual({ enabled: true, suggestions: [], failed: true });
    expect(body).not.toContain("geheim");
  });
});

describe("Server: gewählten Vorschlag auflösen", () => {
  it("weist kaputte Kennungen ab, bevor Google gefragt wird", async () => {
    expect((await resolve(ask(`/api/address/resolve?id=../x&s=${TOKEN}`))).status).toBe(400);
    expect((await resolve(ask(`/api/address/resolve?id=${PLACE}&s=nein`))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("liefert Straße, PLZ, Ort und Koordinaten", async () => {
    answer = () =>
      Response.json({
        addressComponents: [
          { longText: "12", shortText: "12", types: ["street_number"] },
          { longText: "Musterweg", shortText: "Musterweg", types: ["route"] },
          { longText: "Köln", shortText: "Köln", types: ["locality", "political"] },
          { longText: "Deutschland", shortText: "DE", types: ["country", "political"] },
          { longText: "50667", shortText: "50667", types: ["postal_code"] },
        ],
        location: { latitude: 50.9413, longitude: 6.9583 },
      });
    const response = await resolve(ask(`/api/address/resolve?id=${PLACE}&s=${TOKEN}`));
    expect(await response.json()).toEqual({ address: { street: "Musterweg 12", zip: "50667", city: "Köln", country: "DE", latitude: 50.9413, longitude: 6.9583 } });
    expect(calls[0].url).toContain(`/v1/places/${PLACE}?sessionToken=${TOKEN}`);
    expect(new Headers(calls[0].init?.headers).get("X-Goog-Api-Key")).toBe("geheimer-schluessel");
  });

  it("antwortet mit leerer Anschrift, wenn Google ablehnt", async () => {
    answer = () => Response.json({ error: { status: "NOT_FOUND" } }, { status: 404 });
    expect(await (await resolve(ask(`/api/address/resolve?id=${PLACE}&s=${TOKEN}`))).json()).toEqual({ address: null });
  });
});
