/**
 * Lädt die Maps JavaScript API von Google einmal je Seite und meldet, wenn Google den
 * Schlüssel ablehnt. Nur im Browser benutzen.
 *
 * Die Typen hier beschreiben nur den kleinen Teil der Google-Schnittstelle, den das Programm nutzt.
 */
export type GoogleLatLng = { lat(): number; lng(): number };
export type GoogleMap = {
  getCenter(): GoogleLatLng | undefined;
  getZoom(): number | undefined;
  setCenter(center: { lat: number; lng: number }): void;
  setZoom(zoom: number): void;
  addListener(event: string, handler: () => void): { remove(): void };
};
export type GoogleMapsApi = {
  importLibrary(name: "maps"): Promise<{ Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap }>;
  event?: { clearInstanceListeners(instance: object): void };
};

type MapsWindow = Window & {
  google?: { maps?: GoogleMapsApi };
  __wattflowMapsReady?: () => void;
  gm_authFailure?: () => void;
};

export const MAPS_SCRIPT = "https://maps.googleapis.com/maps/api/js";

export function mapsScriptUrl(key: string): string {
  const url = new URL(MAPS_SCRIPT);
  url.searchParams.set("key", key);
  url.searchParams.set("v", "weekly");
  url.searchParams.set("loading", "async");
  url.searchParams.set("callback", "__wattflowMapsReady");
  url.searchParams.set("language", "de");
  url.searchParams.set("region", "DE");
  return url.toString();
}

let pending: Promise<GoogleMapsApi> | null = null;
let rejected = false;
const authListeners = new Set<() => void>();

/** Ruft `listener`, wenn Google den Schlüssel ablehnt (falscher Schlüssel, falsche Adresse, API nicht aktiviert). */
export function onMapsAuthFailure(listener: () => void): () => void {
  if (rejected) listener();
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

export function loadGoogleMaps(key: string): Promise<GoogleMapsApi> {
  if (pending) return pending;
  const scope = window as MapsWindow;
  pending = new Promise<GoogleMapsApi>((resolve, reject) => {
    if (scope.google?.maps?.importLibrary) return resolve(scope.google.maps);
    scope.gm_authFailure = () => {
      rejected = true;
      authListeners.forEach((listener) => listener());
    };
    scope.__wattflowMapsReady = () => (scope.google?.maps ? resolve(scope.google.maps) : reject(new Error("Google Maps hat sich nicht gemeldet.")));
    const script = document.createElement("script");
    script.src = mapsScriptUrl(key);
    script.async = true;
    script.onerror = () => {
      /* Beim nächsten Öffnen neu versuchen, etwa wenn das Netz kurz weg war. */
      pending = null;
      script.remove();
      reject(new Error("Google Maps ließ sich nicht laden."));
    };
    document.head.append(script);
  });
  return pending;
}

/** Entfernung zweier Punkte auf der Erde in Metern. */
export function distanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}
