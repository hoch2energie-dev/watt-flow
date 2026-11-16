import { compassToPvgisAspect, pvgisMountingPlace } from "@/lib/pvgis/azimuth";
import { parsePvcalc, parseSeriesHourly } from "@/lib/pvgis/parse";
import type { PvgisPlaneResult, RoofFaceInput } from "@/lib/pvgis/types";

const PVGIS_BASE = "https://re.jrc.ec.europa.eu/api/v5_3";
const USER_AGENT = "Hoch2Angebote/1.0 (https://angebote.hoch2energie.de)";

export type PlaneRequest = {
  latitude: number;
  longitude: number;
  kwp: number;
  tiltDeg: number;
  azimuthDeg: number;
  lossesPercent: number;
  mounting: RoofFaceInput["mounting"];
};

export type PvgisFetch = (url: string, init: RequestInit) => Promise<Response>;

export function pvgisCacheKey(input: PlaneRequest): string {
  return [
    "pvgis-v5.3-pvcalc",
    input.latitude.toFixed(4),
    input.longitude.toFixed(4),
    input.kwp.toFixed(2),
    input.tiltDeg.toFixed(1),
    compassToPvgisAspect(input.azimuthDeg).toFixed(1),
    input.lossesPercent.toFixed(1),
    input.mounting,
  ].join("|");
}

export function pvgisCalcUrl(input: PlaneRequest): string {
  const url = new URL(`${PVGIS_BASE}/PVcalc`);
  url.searchParams.set("lat", input.latitude.toFixed(4));
  url.searchParams.set("lon", input.longitude.toFixed(4));
  url.searchParams.set("peakpower", input.kwp.toFixed(2));
  url.searchParams.set("loss", input.lossesPercent.toFixed(1));
  url.searchParams.set("mountingplace", pvgisMountingPlace(input.mounting));
  url.searchParams.set("angle", input.tiltDeg.toFixed(1));
  url.searchParams.set("aspect", String(compassToPvgisAspect(input.azimuthDeg)));
  url.searchParams.set("outputformat", "json");
  return url.toString();
}

/** Stundenreihe für ein späteres Lastprofil. Wird vom Assistenten hier nicht aufgerufen. */
export function pvgisSeriesUrl(input: PlaneRequest & { startYear?: number; endYear?: number }): string {
  const url = new URL(`${PVGIS_BASE}/seriescalc`);
  url.searchParams.set("lat", input.latitude.toFixed(4));
  url.searchParams.set("lon", input.longitude.toFixed(4));
  url.searchParams.set("peakpower", input.kwp.toFixed(2));
  url.searchParams.set("loss", input.lossesPercent.toFixed(1));
  url.searchParams.set("mountingplace", pvgisMountingPlace(input.mounting));
  url.searchParams.set("angle", input.tiltDeg.toFixed(1));
  url.searchParams.set("aspect", String(compassToPvgisAspect(input.azimuthDeg)));
  url.searchParams.set("pvcalculation", "1");
  url.searchParams.set("startyear", String(input.startYear ?? 2020));
  url.searchParams.set("endyear", String(input.endYear ?? 2020));
  url.searchParams.set("outputformat", "json");
  return url.toString();
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`PVGIS antwortet mit Status ${response.status}.`);
  return response.json();
}

export async function fetchPvgisPlane(input: PlaneRequest, fetchImpl: PvgisFetch = fetch, timeoutMs = 20000): Promise<PvgisPlaneResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(pvgisCalcUrl(input), {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    return parsePvcalc(await readJson(response));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("PVGIS hat nicht rechtzeitig geantwortet.");
    throw error instanceof Error ? error : new Error("PVGIS ist nicht erreichbar.");
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPvgisHourly(input: PlaneRequest, fetchImpl: PvgisFetch = fetch, timeoutMs = 30000): Promise<number[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(pvgisSeriesUrl(input), {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    return parseSeriesHourly(await readJson(response));
  } finally {
    clearTimeout(timer);
  }
}
