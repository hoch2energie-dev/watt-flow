import type { HorizonSample } from "@/lib/roof/types";

export const HORIZON_ENDPOINT = "https://re.jrc.ec.europa.eu/api/v5_3/printhorizon";

export function horizonUrl(latitude: number, longitude: number): string {
  const url = new URL(HORIZON_ENDPOINT);
  url.searchParams.set("lat", latitude.toFixed(4));
  url.searchParams.set("lon", longitude.toFixed(4));
  url.searchParams.set("outputformat", "json");
  return url.toString();
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** PVGIS-Aspekt A: 0 = Süd. Kompass = A + 180, also -180 = Nord. */
export function parseHorizon(payload: unknown): HorizonSample[] | null {
  if (!record(payload)) return null;
  const outputs = record(payload.outputs) ? payload.outputs : payload;
  const profile = outputs.horizon_profile;
  if (!Array.isArray(profile)) return null;
  const samples: HorizonSample[] = [];
  for (const entry of profile) {
    if (!record(entry)) continue;
    const aspect = Number(entry.A);
    const height = Number(entry.H_hor);
    if (!Number.isFinite(aspect) || !Number.isFinite(height)) continue;
    samples.push({ azimuthDeg: (aspect + 540) % 360, heightDeg: Math.max(0, height) });
  }
  return samples.length >= 8 ? samples : null;
}
