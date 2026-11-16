import { toLngLat, type LngLat } from "@/lib/roof/geo";
import { ESRI_TILES, NRW_DOP_WMS, inNrw } from "@/lib/roof/sources";

/**
 * Luftbild als ein einzelnes Bild um den Standort, Norden oben, für den Boden der 3D-Planung.
 * Das Bild wird in Länge/Breite angefordert und linear gestreckt. Das deckt sich mit
 * `toLocal`, das im Kleinen genauso linear rechnet.
 */
export const AERIAL_SIZE_M = 160;
export const AERIAL_PIXELS = 2048;

export type AerialSource = { provider: "nrw" | "esri"; url: string; credit: string };

/** Mögliche Quellen in der Reihenfolge, in der sie versucht werden. */
export function aerialSources(origin: LngLat): AerialSource[] {
  const half = AERIAL_SIZE_M / 2;
  const [west, south] = toLngLat([-half, -half], origin);
  const [east, north] = toLngLat([half, half], origin);
  const fixed = (value: number) => value.toFixed(7);

  const esri = new URL(ESRI_TILES.replace("/tile/{z}/{y}/{x}", "/export"));
  esri.searchParams.set("bbox", [west, south, east, north].map(fixed).join(","));
  esri.searchParams.set("bboxSR", "4326");
  esri.searchParams.set("imageSR", "4326");
  esri.searchParams.set("size", `${AERIAL_PIXELS},${AERIAL_PIXELS}`);
  esri.searchParams.set("format", "jpg");
  esri.searchParams.set("f", "image");
  const sources: AerialSource[] = [{ provider: "esri", url: esri.toString(), credit: "Luftbild: Esri, Maxar, Earthstar Geographics und die GIS User Community" }];

  if (inNrw(origin[1], origin[0])) {
    const nrw = new URL(NRW_DOP_WMS);
    nrw.searchParams.set("SERVICE", "WMS");
    nrw.searchParams.set("VERSION", "1.3.0");
    nrw.searchParams.set("REQUEST", "GetMap");
    nrw.searchParams.set("LAYERS", "nw_dop_rgb");
    nrw.searchParams.set("STYLES", "");
    nrw.searchParams.set("CRS", "EPSG:4326");
    /* WMS 1.3.0 erwartet bei EPSG:4326 erst die Breite, dann die Länge. */
    nrw.searchParams.set("BBOX", [south, west, north, east].map(fixed).join(","));
    nrw.searchParams.set("WIDTH", String(AERIAL_PIXELS));
    nrw.searchParams.set("HEIGHT", String(AERIAL_PIXELS));
    nrw.searchParams.set("FORMAT", "image/jpeg");
    sources.unshift({ provider: "nrw", url: nrw.toString(), credit: "Orthofoto: © Geobasis NRW, Datenlizenz Deutschland – Zero – Version 2.0" });
  }
  return sources;
}
