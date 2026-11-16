import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { aerialSources } from "@/lib/roof3d/aerial";

export const dynamic = "force-dynamic";

/**
 * Reicht das Orthofoto von Geobasis NRW durch, falls der Browser es nicht direkt
 * als Bild für die 3D-Ansicht laden darf. Nur für NRW: Die Daten stehen unter der
 * Datenlizenz Deutschland – Zero. Andere Luftbilder lädt weiter der Browser selbst.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lon"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ error: "Breite und Länge fehlen." }, { status: 400 });
  }
  const source = aerialSources([longitude, latitude]).find((entry) => entry.provider === "nrw");
  if (!source) return NextResponse.json({ error: "Für diesen Standort gibt es kein Orthofoto aus NRW." }, { status: 404 });
  try {
    const upstream = await fetch(source.url, {
      headers: { "User-Agent": "Hoch2Angebote/1.0 (https://angebote.hoch2energie.de)" },
      signal: AbortSignal.timeout(25000),
    });
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !type.startsWith("image/")) {
      return NextResponse.json({ error: "Der Bildserver hat kein Bild geliefert." }, { status: 502 });
    }
    return new NextResponse(upstream.body, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" } });
  } catch {
    return NextResponse.json({ error: "Der Bildserver ist nicht erreichbar." }, { status: 502 });
  }
}
