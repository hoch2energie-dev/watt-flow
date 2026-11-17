import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { googleServerKey } from "@/lib/google/config";
import { validPlaceId, validToken } from "@/lib/google/places";
import { resolveAddress } from "@/lib/google/service";

export const dynamic = "force-dynamic";
const fresh = { headers: { "Cache-Control": "private, no-store" } };

/** Löst einen gewählten Vorschlag in Straße, PLZ, Ort und Koordinaten auf. Schließt die Sitzung bei Google ab. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const key = googleServerKey();
  if (!key) return NextResponse.json({ address: null }, fresh);
  const params = new URL(request.url).searchParams;
  const placeId = params.get("id");
  const token = params.get("s");
  if (!validPlaceId(placeId) || !validToken(token)) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const result = await resolveAddress(key, placeId, token);
  return NextResponse.json({ address: result.ok ? result.address : null }, fresh);
}
