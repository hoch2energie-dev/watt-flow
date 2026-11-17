/**
 * Schlüssel für die Google Maps Platform. Sie stehen nur in der Umgebung des Servers
 * (Datei .env auf dem Server), nie im Repo. Fehlt ein Schlüssel, bleibt die zugehörige
 * Funktion aus und das Programm arbeitet wie ohne Google.
 *
 * - GOOGLE_MAPS_SERVER_KEY: Adressvorschläge (Places API) und Standortsuche (Geocoding API).
 *   Wird nur vom Server benutzt und verlässt ihn nicht.
 * - GOOGLE_MAPS_BROWSER_KEY: Karte im Browser (Maps JavaScript API). Dieser Schlüssel ist im
 *   Browser sichtbar und muss in der Google Cloud auf die eigene Adresse beschränkt sein.
 */
const read = (name: string): string | null => {
  const value = process.env[name]?.trim();
  return value ? value : null;
};

export const googleServerKey = () => read("GOOGLE_MAPS_SERVER_KEY");
export const googleBrowserKey = () => read("GOOGLE_MAPS_BROWSER_KEY");
