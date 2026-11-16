import { centroidLngLat, haversineMeters, polygonArea, toLocal, type LngLat, type XY } from "@/lib/roof/geo";

export const MAX_LOD2_DISTANCE_M = 120;

export type SuggestedRoof = {
  ring: LngLat[];
  tiltDeg: number;
  azimuthDeg: number;
  areaM2: number;
};

type Building = { id: string; roofs: SuggestedRoof[]; centroid: LngLat };

/**
 * Liest RoofSurface-Ringe aus CityJSON 1.1.
 * Die Schnittstelle von NRW hat die bbox in Stichproben ignoriert. Deshalb
 * wird ein Gebäude nur übernommen, wenn sein Schwerpunkt nahe der Adresse liegt.
 */
export function roofsFromCityJson(payload: unknown, request: LngLat): { roofs: SuggestedRoof[]; notice: string } {
  const buildings = buildingsFromCityJson(payload);
  if (buildings.length === 0) {
    return { roofs: [], notice: "An dieser Stelle hat LoD2 kein Gebäude geliefert. Bitte die Dachflächen auf dem Luftbild zeichnen." };
  }
  const near = buildings
    .map((building) => ({ building, distance: haversineMeters(building.centroid, request) }))
    .filter((entry) => entry.distance <= MAX_LOD2_DISTANCE_M)
    .sort((a, b) => a.distance - b.distance);
  if (near.length === 0) {
    return {
      roofs: [],
      notice: "LoD2 hat kein Gebäude an dieser Koordinate geliefert. Bitte die Dachflächen auf dem Luftbild zeichnen.",
    };
  }
  const roofs = near[0].building.roofs.sort((a, b) => b.areaM2 - a.areaM2).slice(0, 8);
  if (roofs.length === 0) {
    return { roofs: [], notice: "Das Gebäude hat in LoD2 keine nutzbare Dachfläche. Bitte zeichnen." };
  }
  return { roofs, notice: "" };
}

function buildingsFromCityJson(payload: unknown): Building[] {
  if (!isRecord(payload) || !isRecord(payload.CityObjects) || !Array.isArray(payload.vertices)) return [];
  const scale = transformOf(payload.transform, "scale", [1, 1, 1]);
  const translate = transformOf(payload.transform, "translate", [0, 0, 0]);
  const vertices = payload.vertices;
  const decode = (index: unknown): [number, number, number] | null => {
    const slot = typeof index === "number" ? vertices[index] : undefined;
    if (!Array.isArray(slot) || slot.length < 3) return null;
    const x = Number(slot[0]) * scale[0] + translate[0];
    const y = Number(slot[1]) * scale[1] + translate[1];
    const z = Number(slot[2]) * scale[2] + translate[2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    if (Math.abs(x) > 180 || Math.abs(y) > 90) return null;
    return [x, y, z];
  };

  const buildings: Building[] = [];
  for (const [id, value] of Object.entries(payload.CityObjects)) {
    if (!isRecord(value) || !Array.isArray(value.geometry)) continue;
    const roofs: SuggestedRoof[] = [];
    const samples: LngLat[] = [];
    for (const geometry of value.geometry) {
      for (const ring of roofRings(geometry)) {
        const points = ring.map((index) => decode(index)).filter((point): point is [number, number, number] => point != null);
        const unique = dedupe(points);
        if (unique.length < 3) continue;
        const lnglat = unique.map((point): LngLat => [point[0], point[1]]);
        const origin = centroidLngLat(lnglat);
        const local = unique.map((point) => toLocal([point[0], point[1]], origin));
        const area = polygonArea(local);
        if (area < 4) continue;
        const pose = poseOf(local, unique.map((point) => point[2]));
        if (!pose) continue;
        roofs.push({ ring: lnglat, tiltDeg: pose.tiltDeg, azimuthDeg: pose.azimuthDeg, areaM2: Math.round(area * 10) / 10 });
        samples.push(origin);
      }
    }
    if (samples.length === 0) continue;
    buildings.push({ id, roofs, centroid: centroidLngLat(samples) });
  }
  return buildings;
}

function poseOf(local: XY[], heights: number[]): { tiltDeg: number; azimuthDeg: number } | null {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let index = 0; index < local.length; index += 1) {
    const next = (index + 1) % local.length;
    const a = { x: local[index][0], y: local[index][1], z: heights[index] };
    const b = { x: local[next][0], y: local[next][1], z: heights[next] };
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  const length = Math.hypot(nx, ny, nz);
  if (length < 1e-6) return null;
  if (nz < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  nx /= length;
  ny /= length;
  nz /= length;
  const tilt = (Math.acos(Math.min(1, Math.max(-1, nz))) * 180) / Math.PI;
  const azimuth = (Math.atan2(nx, ny) * 180) / Math.PI;
  if (tilt > 75) return null;
  return { tiltDeg: Math.round(tilt * 10) / 10, azimuthDeg: Math.round(((azimuth + 360) % 360) * 10) / 10 };
}

function roofRings(geometry: unknown): unknown[][] {
  if (!isRecord(geometry) || !Array.isArray(geometry.boundaries)) return [];
  const semantics = isRecord(geometry.semantics) ? geometry.semantics : null;
  const surfaces = Array.isArray(semantics?.surfaces) ? semantics.surfaces : [];
  const type = geometry.type;
  const shells = type === "MultiSurface" || type === "CompositeSurface" ? [geometry.boundaries] : geometry.boundaries;
  const valueShells = type === "MultiSurface" || type === "CompositeSurface" ? [semantics?.values] : semantics?.values;
  const rings: unknown[][] = [];
  shells.forEach((shell, shellIndex) => {
    if (!Array.isArray(shell)) return;
    const semanticRow = Array.isArray(valueShells) ? valueShells[shellIndex] : undefined;
    shell.forEach((surface, surfaceIndex) => {
      if (!Array.isArray(surface) || !Array.isArray(surface[0])) return;
      const semanticIndex = Array.isArray(semanticRow) ? semanticRow[surfaceIndex] : semanticRow;
      const surfaceType = surfaces[Number(semanticIndex)];
      const kind = isRecord(surfaceType) ? surfaceType.type : undefined;
      if (kind !== "RoofSurface") return;
      rings.push(surface[0]);
    });
  });
  return rings;
}

function dedupe(points: [number, number, number][]): [number, number, number][] {
  const result: [number, number, number][] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last && last[0] === point[0] && last[1] === point[1] && last[2] === point[2]) continue;
    result.push(point);
  }
  const first = result[0];
  const last = result[result.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) result.pop();
  return result;
}

function transformOf(transform: unknown, key: "scale" | "translate", fallback: number[]): number[] {
  if (!isRecord(transform) || !Array.isArray(transform[key])) return fallback;
  const values = transform[key].slice(0, 3).map(Number);
  return values.length === 3 && values.every((value) => Number.isFinite(value)) ? values : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
