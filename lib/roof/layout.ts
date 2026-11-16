import { centroidXY, distanceToEdges, pointInPolygon, polygonsOverlap, type XY } from "@/lib/roof/geo";
import type { PlannedModule } from "@/lib/roof/types";

const MAX_MODULES = 1500;

export type LayoutInput = {
  /** Ost/Nord-Meter, gleicher Ursprung wie die zurückgegebenen Ecken. */
  polygon: XY[];
  obstacles: XY[][];
  azimuthDeg: number;
  moduleWidthM: number;
  moduleHeightM: number;
  portrait: boolean;
  setbackM: number;
  gapM: number;
};

/**
 * Füllt die Fläche mit Modulen.
 * Hochformat: die lange Seite liegt in Fallrichtung.
 * Ein Modul bleibt nur, wenn alle Ecken in der Fläche liegen, den Randabstand
 * halten und kein Hindernis schneiden.
 */
export function layoutModules(input: LayoutInput): PlannedModule[] {
  const polygon = input.polygon;
  if (polygon.length < 3) return [];
  const across = input.portrait ? input.moduleWidthM : input.moduleHeightM;
  const along = input.portrait ? input.moduleHeightM : input.moduleWidthM;
  if (across < 0.2 || along < 0.2 || across > 4 || along > 4) return [];
  const center = centroidXY(polygon);
  const local = polygon.map((point): XY => [point[0] - center[0], point[1] - center[1]]);
  const obstacles = input.obstacles.map((ring) => ring.map((point): XY => [point[0] - center[0], point[1] - center[1]]));
  const radians = (input.azimuthDeg * Math.PI) / 180;
  const downEast = Math.sin(radians);
  const downNorth = Math.cos(radians);
  const uphill: XY = [-downEast, -downNorth];
  const side: XY = [-downNorth, downEast];
  const framed = local.map((point) => project(point, side, uphill));
  const minX = Math.min(...framed.map((point) => point[0]));
  const maxX = Math.max(...framed.map((point) => point[0]));
  const minY = Math.min(...framed.map((point) => point[1]));
  const maxY = Math.max(...framed.map((point) => point[1]));
  const setback = Math.max(0, input.setbackM);
  const gap = Math.max(0, input.gapM);
  const x0 = minX + setback;
  const y0 = minY + setback;
  const x1 = maxX - setback;
  const y1 = maxY - setback;
  const modules: PlannedModule[] = [];
  for (let y = y0; y + along <= y1 + 1e-6 && modules.length < MAX_MODULES; y += along + gap) {
    for (let x = x0; x + across <= x1 + 1e-6 && modules.length < MAX_MODULES; x += across + gap) {
      const corners = [
        compose(x, y, side, uphill, center),
        compose(x + across, y, side, uphill, center),
        compose(x + across, y + along, side, uphill, center),
        compose(x, y + along, side, uphill, center),
      ] as PlannedModule["corners"];
      const shifted = corners.map((corner): XY => [corner[0] - center[0], corner[1] - center[1]]);
      if (!moduleFits(shifted, local, setback)) continue;
      if (obstacles.some((obstacle) => polygonsOverlap(shifted, obstacle))) continue;
      modules.push({ corners, active: true });
    }
  }
  return modules;
}

function project(point: XY, side: XY, uphill: XY): XY {
  return [point[0] * side[0] + point[1] * side[1], point[0] * uphill[0] + point[1] * uphill[1]];
}

function compose(x: number, y: number, side: XY, uphill: XY, center: XY): XY {
  return [center[0] + x * side[0] + y * uphill[0], center[1] + x * side[1] + y * uphill[1]];
}

function moduleFits(corners: XY[], polygon: XY[], setback: number): boolean {
  const center: XY = [(corners[0][0] + corners[2][0]) / 2, (corners[0][1] + corners[2][1]) / 2];
  const samples = [...corners, center];
  if (samples.some((point) => !pointInPolygon(point, polygon))) return false;
  if (setback > 0 && samples.some((point) => distanceToEdges(point, polygon) < setback - 1e-3)) return false;
  return true;
}

export function moduleHitIndex(modules: PlannedModule[], point: XY): number {
  for (let index = modules.length - 1; index >= 0; index -= 1) {
    if (pointInPolygon(point, modules[index].corners)) return index;
  }
  return -1;
}
