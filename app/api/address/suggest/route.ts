import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { googleServerKey } from "@/lib/google/config";
import { MIN_INPUT, cleanInput, validToken } from "@/lib/google/places";
import { suggestAddresses } from "@/lib/google/service";

export const dynamic = "force-dynamic";
const fresh = { headers: { "Cache-Control": "private, no-store" } };

/**
 * Adressvorschläge beim Tippen. Der Browser fragt hier an, der Server fragt Google.
 * So bleibt der Schlüssel auf dem Server. Ohne Schlüssel meldet die Antwort `enabled: false`
 * und die Eingabefelder arbeiten ohne Vorschläge weiter.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const key = googleServerKey();
  if (!key) return NextResponse.json({ enabled: false, suggestions: [] }, fresh);
  const params = new URL(request.url).searchParams;
  const input = cleanInput(params.get("q"));
  const token = params.get("s");
  if (input.length < MIN_INPUT || !validToken(token)) return NextResponse.json({ enabled: true, suggestions: [] }, fresh);
  const result = await suggestAddresses(key, input, token);
  /* Googles Fehlertext geht nicht an den Browser. Die Ursache zeigt die Verbindungsprüfung in den Einstellungen. */
  if (!result.ok) return NextResponse.json({ enabled: true, suggestions: [], failed: true }, fresh);
  return NextResponse.json({ enabled: true, suggestions: result.suggestions }, fresh);
}
