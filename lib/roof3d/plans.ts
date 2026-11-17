import { centroidXY, distanceToEdges, pointInPolygon, polygonsOverlap, type XY } from "@/lib/roof/geo";
import type { ModulePlacement } from "@/lib/roof/types";
import { buildRoof, normalizeBuilding, type BuildingSpec, type RoofFace3D } from "@/lib/roof3d/building";

/**
 * Was auf einer Dachfläche liegt: Aufbauten (Sperrzone, Kamin, Fenster) und das Modulraster.
 * Gerechnet wird auf der Dachebene mit echten Maßen: Ein Modul ist auf dem Dach 1,76 m lang,
 * im Grundriss bei 30° Neigung aber nur 1,52 m. Gespeichert und gezeichnet wird der Grundriss.
 */
export type ObstacleKind = "sperrzone" | "kamin" | "fenster";

export type ObstacleSpec = {
  id: string;
  kind: ObstacleKind;
  /** Mitte im Grundriss. */
  center: XY;
  /** Breite entlang der Traufe, in Metern. */
  widthM: number;
  /** Länge in Fallrichtung, auf dem Dach gemessen. */
  lengthM: number;
  heightM: number;
  /** Zusätzlicher Abstand, den Module halten. */
  marginM: number;
  /** Freie Form aus der alten Dachplanung, als Versatz zur Mitte. Maße lassen sich dann nicht ändern. */
  shape?: XY[];
};

export type PlanModule = { corners: [XY, XY, XY, XY]; active: boolean };

export type FacePlan = {
  obstacles: ObstacleSpec[];
  placement: ModulePlacement | null;
  /** Alle möglichen Plätze des Rasters. `active` heißt: dort liegt ein Modul. */
  modules: PlanModule[];
  /** Fingerabdruck der Eingaben, aus denen das Raster entstand. Ändert er sich, wird neu gerastert. */
  layoutKey: string;
};

export const OBSTACLE_DEFAULTS: Record<ObstacleKind, { widthM: number; lengthM: number; heightM: number; label: string }> = {
  sperrzone: { widthM: 1, lengthM: 1, heightM: 0, label: "Sperrzone" },
  kamin: { widthM: 0.6, lengthM: 0.6, heightM: 1, label: "Kamin" },
  fenster: { widthM: 0.78, lengthM: 1.18, heightM: 0, label: "Fenster" },
};

export const PLACEMENT_DEFAULTS = { portrait: true, setbackM: 0.3, gapM: 0.02 };
const MAX_CELLS = 1500;
const DEG = Math.PI / 180;

export type FaceFrame = { origin: XY; along: XY; inward: XY; cos: number; slope: number; wall: number };

/** Achsen einer Dachfläche: entlang der Traufe und im Grundriss nach innen, also dachaufwärts. */
export function faceFrame(spec: BuildingSpec, face: RoofFace3D): FaceFrame {
  const a = spec.outline[face.edge];
  const b = spec.outline[(face.edge + 1) % spec.outline.length];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const along: XY = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const tilt = face.tiltDeg * DEG;
  return { origin: a, along, inward: [-along[1], along[0]], cos: Math.cos(tilt), slope: Math.tan(tilt), wall: spec.wallHeightM };
}

/** Grundriss nach Dachebene: a entlang der Traufe, s dachaufwärts auf dem Dach gemessen. */
function toRoof(frame: FaceFrame, point: XY): XY {
  const dx = point[0] - frame.origin[0];
  const dy = point[1] - frame.origin[1];
  return [dx * frame.along[0] + dy * frame.along[1], (dx * frame.inward[0] + dy * frame.inward[1]) / frame.cos];
}

function toPlan(frame: FaceFrame, point: XY): XY {
  const depth = point[1] * frame.cos;
  return [frame.origin[0] + point[0] * frame.along[0] + depth * frame.inward[0], frame.origin[1] + point[0] * frame.along[1] + depth * frame.inward[1]];
}

/** Höhe über dem Boden an einer Stelle der Dachfläche. */
export function heightOnFace(frame: FaceFrame, point: XY): number {
  return frame.wall + ((point[0] - frame.origin[0]) * frame.inward[0] + (point[1] - frame.origin[1]) * frame.inward[1]) * frame.slope;
}

/** Umriss eines Aufbaus im Grundriss. `extra` vergrößert ihn ringsum, auf dem Dach gemessen. */
export function obstacleRing(frame: FaceFrame, obstacle: ObstacleSpec, extra = 0): XY[] {
  if (obstacle.shape && obstacle.shape.length >= 3) {
    return obstacle.shape.map((offset): XY => [obstacle.center[0] + offset[0], obstacle.center[1] + offset[1]]);
  }
  const [a, s] = toRoof(frame, obstacle.center);
  const w = obstacle.widthM / 2 + extra;
  const l = obstacle.lengthM / 2 + extra;
  return [toPlan(frame, [a - w, s - l]), toPlan(frame, [a + w, s - l]), toPlan(frame, [a + w, s + l]), toPlan(frame, [a - w, s + l])];
}

export function newObstacle(id: string, kind: ObstacleKind, center: XY): ObstacleSpec {
  const preset = OBSTACLE_DEFAULTS[kind];
  return { id, kind, center, widthM: preset.widthM, lengthM: preset.lengthM, heightM: preset.heightM, marginM: 0 };
}

/** Alle Plätze, auf die ein Modul passt: ganz in der Fläche, mit Randabstand, ohne Aufbau darunter. */
export function layoutFace(frame: FaceFrame, face: RoofFace3D, plan: Pick<FacePlan, "obstacles" | "placement">): PlanModule[] {
  const placement = plan.placement;
  if (!placement) return [];
  const across = placement.portrait ? placement.widthM : placement.heightM;
  const up = placement.portrait ? placement.heightM : placement.widthM;
  if (across < 0.2 || up < 0.2 || across > 4 || up > 4) return [];
  const polygon = face.ring.map((point) => toRoof(frame, [point[0], point[1]]));
  const blocked = plan.obstacles.map((obstacle) => obstacleRing(frame, obstacle, Math.max(0, obstacle.marginM)).map((point) => toRoof(frame, point)));
  const setback = Math.max(0, placement.setbackM);
  const gap = Math.max(0, placement.gapM);
  const minA = Math.min(...polygon.map((point) => point[0])) + setback;
  const maxA = Math.max(...polygon.map((point) => point[0])) - setback;
  const minS = Math.min(...polygon.map((point) => point[1])) + setback;
  const maxS = Math.max(...polygon.map((point) => point[1])) - setback;
  const columns = Math.floor((maxA - minA + gap + 1e-6) / (across + gap));
  if (columns < 1) return [];
  /* Das Raster steht mittig auf der Fläche und beginnt an der Traufe. */
  const startA = minA + (maxA - minA - (columns * (across + gap) - gap)) / 2;
  const cells: PlanModule[] = [];
  for (let s = minS; s + up <= maxS + 1e-6 && cells.length < MAX_CELLS; s += up + gap) {
    for (let column = 0; column < columns && cells.length < MAX_CELLS; column += 1) {
      const a = startA + column * (across + gap);
      const corners: XY[] = [[a, s], [a + across, s], [a + across, s + up], [a, s + up]];
      const probes: XY[] = [...corners, [a + across / 2, s + up / 2]];
      if (probes.some((point) => !pointInPolygon(point, polygon))) continue;
      if (setback > 0 && probes.some((point) => distanceToEdges(point, polygon) < setback - 1e-3)) continue;
      if (blocked.some((ring) => polygonsOverlap(corners, ring))) continue;
      cells.push({ corners: corners.map((point) => toPlan(frame, point)) as PlanModule["corners"], active: false });
    }
  }
  return cells;
}

function fingerprint(face: RoofFace3D, plan: FacePlan): string {
  const round = (value: number) => Math.round(value * 100);
  return JSON.stringify([
    face.tiltDeg,
    face.ring.map((point) => [round(point[0]), round(point[1])]),
    plan.obstacles.map((o) => [round(o.center[0]), round(o.center[1]), round(o.widthM), round(o.lengthM), round(o.marginM), o.shape?.map((p) => [round(p[0]), round(p[1])]) ?? 0]),
    plan.placement ? [round(plan.placement.widthM), round(plan.placement.heightM), plan.placement.portrait, round(plan.placement.setbackM), round(plan.placement.gapM)] : 0,
  ]);
}

/**
 * Hält die Raster zu den Dachflächen passend. Unveränderte Flächen bleiben, wie sie sind.
 * Hat sich an einer Fläche etwas geändert, wird neu gerastert: Eine volle Fläche bleibt voll,
 * sonst ist ein Platz belegt, wenn dort vorher schon ein Modul lag. Pläne zu Flächen, die es nicht mehr gibt, entfallen.
 */
export function syncPlans(input: BuildingSpec): BuildingSpec {
  const spec = normalizeBuilding(input);
  if (!spec.plans) return spec;
  const faces = buildRoof(spec).faces;
  const plans: Record<number, FacePlan> = {};
  let changed = Object.keys(spec.plans).length !== faces.filter((face) => spec.plans?.[face.edge]).length;
  for (const face of faces) {
    const plan = spec.plans[face.edge];
    if (!plan) continue;
    const key = fingerprint(face, plan);
    if (key === plan.layoutKey) {
      plans[face.edge] = plan;
      continue;
    }
    changed = true;
    const fresh = layoutFace(faceFrame(spec, face), face, plan);
    /*
     * Eine voll belegte Fläche bleibt voll. Sonst bleibt belegt, wo vorher ein Modul lag:
     * Die Mitte des neuen Platzes muss auf einem alten Modul liegen, die Fuge zählt mit.
     */
    const full = plan.modules.length > 0 && plan.modules.every((cell) => cell.active);
    const taken = plan.modules.filter((cell) => cell.active).map((cell) => cell.corners);
    plans[face.edge] = {
      ...plan,
      layoutKey: key,
      modules: fresh.map((cell) => {
        const center = centroidXY(cell.corners);
        return { ...cell, active: full || taken.some((ring) => pointInPolygon(center, ring) || distanceToEdges(center, ring) < 0.06) };
      }),
    };
  }
  return changed ? { ...spec, plans } : spec;
}

/**
 * Setzt einen neuen Umriss. Wurde das Gebäude nur verschoben, wandern Aufbauten und Module mit.
 * Wurde eine Seite verschoben, bleiben die Aufbauten, wo sie auf dem Luftbild liegen.
 */
export function withOutline(spec: BuildingSpec, outline: XY[]): BuildingSpec {
  const from = spec.outline;
  const shift: XY | null = from.length === outline.length && from.length > 0 ? [outline[0][0] - from[0][0], outline[0][1] - from[0][1]] : null;
  const moved = shift != null && from.every((point, index) => Math.abs(outline[index][0] - point[0] - shift[0]) < 1e-6 && Math.abs(outline[index][1] - point[1] - shift[1]) < 1e-6);
  if (!shift || !moved || !spec.plans) return syncPlans({ ...spec, outline });
  const plans: Record<number, FacePlan> = {};
  for (const [edge, plan] of Object.entries(spec.plans)) {
    plans[Number(edge)] = {
      ...plan,
      obstacles: plan.obstacles.map((obstacle) => ({ ...obstacle, center: [obstacle.center[0] + shift[0], obstacle.center[1] + shift[1]] })),
      modules: plan.modules.map((cell) => ({ ...cell, corners: cell.corners.map((corner): XY => [corner[0] + shift[0], corner[1] + shift[1]]) as PlanModule["corners"] })),
    };
  }
  return syncPlans({ ...spec, outline, plans });
}

/** Fingerabdruck für eine frisch geladene Fläche, damit ihr gespeichertes Raster unangetastet bleibt. */
export function sealPlan(spec: BuildingSpec, edge: number, plan: Omit<FacePlan, "layoutKey">): FacePlan {
  const face = buildRoof(spec).faces.find((entry) => entry.edge === edge);
  const full: FacePlan = { ...plan, layoutKey: "" };
  return face ? { ...full, layoutKey: fingerprint(face, full) } : full;
}

export function emptyPlan(): FacePlan {
  return { obstacles: [], placement: null, modules: [], layoutKey: "" };
}

/** Ändert den Plan einer Fläche und rastert bei Bedarf neu. */
export function updatePlan(spec: BuildingSpec, edge: number, change: (plan: FacePlan) => FacePlan): BuildingSpec {
  const current = spec.plans?.[edge] ?? emptyPlan();
  return syncPlans({ ...spec, plans: { ...spec.plans, [edge]: change(current) } });
}

/** Verschiebt einen Aufbau. Liegt seine Mitte danach auf einer anderen Dachseite, gehört er zu dieser. */
export function moveObstacle(spec: BuildingSpec, edge: number, id: string, center: XY): { spec: BuildingSpec; edge: number } {
  const obstacle = spec.plans?.[edge]?.obstacles.find((entry) => entry.id === id);
  if (!obstacle) return { spec, edge };
  const moved = { ...obstacle, center };
  const under = buildRoof(spec).faces.find((face) => pointInPolygon(center, face.ring.map((point): XY => [point[0], point[1]])));
  const target = under?.edge ?? edge;
  if (target === edge) {
    return { spec: updatePlan(spec, edge, (plan) => ({ ...plan, obstacles: plan.obstacles.map((entry) => (entry.id === id ? moved : entry)) })), edge };
  }
  const without = updatePlan(spec, edge, (plan) => ({ ...plan, obstacles: plan.obstacles.filter((entry) => entry.id !== id) }));
  return { spec: updatePlan(without, target, (plan) => ({ ...plan, obstacles: [...plan.obstacles, moved] })), edge: target };
}

/** Belegt oder leert einzelne Plätze, ohne neu zu rastern. */
export function setCells(spec: BuildingSpec, edge: number, indexes: number[] | "all", active: boolean): BuildingSpec {
  const plan = spec.plans?.[edge];
  if (!plan) return spec;
  const modules = plan.modules.map((cell, index) => (indexes === "all" || indexes.includes(index) ? { ...cell, active } : cell));
  return { ...spec, plans: { ...spec.plans, [edge]: { ...plan, modules } } };
}

export function cellAt(plan: FacePlan | undefined, point: XY): number {
  if (!plan) return -1;
  for (let index = plan.modules.length - 1; index >= 0; index -= 1) {
    if (pointInPolygon(point, plan.modules[index].corners)) return index;
  }
  return -1;
}

export function planTotals(buildings: BuildingSpec[]): { modules: number; kwp: number } {
  let modules = 0;
  let watts = 0;
  for (const building of buildings) {
    for (const plan of Object.values(building.plans ?? {})) {
      const count = plan.modules.filter((cell) => cell.active).length;
      modules += count;
      watts += count * (plan.placement?.powerWp ?? 0);
    }
  }
  return { modules, kwp: Math.round(watts) / 1000 };
}
