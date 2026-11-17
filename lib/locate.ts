import { prisma } from "@/lib/db";
import { googleServerKey } from "@/lib/google/config";
import { locate, type FoundLocation } from "@/lib/google/locate";
import { geocodeWithGoogle } from "@/lib/google/service";
import { geocodeAddress } from "@/lib/pvgis/geocode";

/** OpenStreetMap-Suche mit dem dauerhaften Zwischenspeicher in der Datenbank. */
async function cachedNominatim(address: string) {
  const query = address.toLowerCase();
  const cached = await prisma.geocodeCache.findUnique({ where: { query } });
  if (cached?.found && cached.latitude != null && cached.longitude != null) {
    return { latitude: Number(cached.latitude), longitude: Number(cached.longitude), label: cached.label };
  }
  if (cached && !cached.found) return null;
  const hit = await geocodeAddress(address);
  await prisma.geocodeCache.upsert({
    where: { query },
    create: { query, found: Boolean(hit), latitude: hit?.latitude, longitude: hit?.longitude, label: hit?.label ?? "" },
    update: {},
  });
  return hit;
}

/**
 * Koordinaten zu einer Anschrift. `null`, wenn sie nicht gefunden wurde; wirft, wenn kein Dienst
 * erreichbar ist. Ergebnisse von Google werden nicht zwischengespeichert.
 */
export function findLocation(address: string): Promise<FoundLocation | null> {
  return locate(address, { googleKey: googleServerKey(), google: geocodeWithGoogle, fallback: cachedNominatim });
}
