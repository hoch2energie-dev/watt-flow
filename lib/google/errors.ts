/**
 * Übersetzt Googles Fehlermeldungen in einen Hinweis, was in der Google Cloud zu tun ist.
 * Für die Verbindungsprüfung in den Einstellungen. Unbekanntes ergibt einen leeren Hinweis,
 * dann steht nur Googles eigener Text da.
 */
export function explainGoogleError(error: string): string {
  const text = error.toLowerCase();
  if (text.includes("nicht erreichbar")) return "Der Server kommt nicht zu Google durch. Bitte Internetzugang und Firewall des Servers prüfen.";
  if (text.includes("api key not valid") || text.includes("provided api key is invalid") || text.includes("api_key_invalid")) return "Der Schlüssel ist falsch, unvollständig kopiert oder wurde gelöscht. Bitte den Wert in der .env mit dem Schlüssel in der Google Cloud vergleichen.";
  if (text.includes("billing")) return "Im Google-Cloud-Projekt ist kein Rechnungskonto verknüpft. Ohne Rechnungskonto beantwortet Google keine Anfragen, auch nicht im Freikontingent.";
  if (text.includes("has not been used in project") || text.includes("is disabled") || text.includes("service_disabled") || text.includes("not activated") || text.includes("not enabled")) return "Die API ist im Google-Cloud-Projekt noch nicht aktiviert. Unter „APIs und Dienste“ aktivieren und ein paar Minuten warten.";
  if (text.includes("referer restrictions") || text.includes("referrer_blocked")) return "Der Schlüssel ist auf Websites beschränkt. Der Server-Schlüssel braucht stattdessen eine Beschränkung auf die IP-Adresse des Servers.";
  if (text.includes("not authorized to use this api key") || text.includes("ip_address_blocked") || text.includes("from this ip address")) return "Die Beschränkung des Schlüssels passt nicht zu diesem Server. Der Server-Schlüssel braucht eine Beschränkung auf die IP-Adresse des Servers, keine auf Websites. Googles Meldung nennt die Adresse, von der die Anfrage kam.";
  if (text.includes("service_blocked") || text.includes("are blocked") || text.includes("not authorized to use this")) return "Der Schlüssel darf diese API nicht benutzen. Bitte bei den API-Beschränkungen des Schlüssels „Places API (New)“ und „Geocoding API“ zulassen.";
  if (text.includes("over_query_limit") || text.includes("over_daily_limit") || text.includes("resource_exhausted") || text.includes("quota")) return "Das eingestellte Kontingent ist ausgeschöpft. In der Google Cloud unter „Kontingente“ nachsehen.";
  return "";
}
