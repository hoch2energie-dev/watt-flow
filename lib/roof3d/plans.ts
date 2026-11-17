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

/** Platz des Rasters. `string` und `order` sagen, in welchem String das Modul hängt und an welcher Stelle (siehe strings.ts). */
export type PlanModule = { corners: [XY, XY, XY, XY]; active: boolean; string?: string; order?: number };

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

/**
 * Punkt im Grundriss, an dem ein Sehstrahl die Ebene der Dachfläche von oben trifft.
 * Welt: x Ost, y Höhe, z Süd. Null, wenn der Blick von unten oder an der Fläche entlang kommt.
 */
export function rayOnFace(frame: FaceFrame, origin: readonly [number, number, number], dir: readonly [number, number, number]): XY | null {
  const [ix, iy] = frame.inward;
  const falling = dir[1] - frame.slope * (dir[0] * ix - dir[2] * iy);
  if (falling > -1e-6) return null;
  const above = origin[1] - frame.wall - frame.slope * ((origin[0] - frame.origin[0]) * ix + (-origin[2] - frame.origin[1]) * iy);
  const t = -above / falling;
  if (!(t > 0) || t > 5000) return null;
  return [origin[0] + dir[0] * t, -(origin[2] + dir[2] * t)];
}

/** Lage und Maße eines rechteckigen Aufbaus, wie sie die Maus ändert. */
export type ObstacleShape = Pick<ObstacleSpec, "center" | "widthM" | "lengthM">;
/** Griff an einem Aufbau: welche Seite er bewegt, entlang der Traufe (`da`) und dachaufwärts (`ds`). */
export type Grip = { da: -1 | 0 | 1; ds: -1 | 0 | 1 };
export const GRIPS: Grip[] = [
  { da: -1, ds: -1 }, { da: 0, ds: -1 }, { da: 1, ds: -1 }, { da: 1, ds: 0 },
  { da: 1, ds: 1 }, { da: 0, ds: 1 }, { da: -1, ds: 1 }, { da: -1, ds: 0 },
];
export const OBSTACLE_LIMITS = { minM: 0.1, maxM: 20 };

function sized(value: number, stepM: number): number {
  const snapped = stepM > 0 ? Math.round(value / stepM) * stepM : value;
  return Math.round(Math.min(OBSTACLE_LIMITS.maxM, Math.max(OBSTACLE_LIMITS.minM, snapped)) * 100) / 100;
}

/** Die acht Griffe eines rechteckigen Aufbaus im Grundriss: vier Ecken, vier Kantenmitten. Freie Formen haben keine. */
export function gripPoints(frame: FaceFrame, obstacle: ObstacleSpec): { grip: Grip; point: XY }[] {
  if (obstacle.shape && obstacle.shape.length >= 3) return [];
  const [a, s] = toRoof(frame, obstacle.center);
  return GRIPS.map((grip) => ({ grip, point: toPlan(frame, [a + (grip.da * obstacle.widthM) / 2, s + (grip.ds * obstacle.lengthM) / 2]) }));
}

/**
 * Zieht einen Griff an die Stelle `point`. Die gegenüberliegende Seite bleibt stehen.
 * Die Maße rasten auf `stepM`, 0 schaltet das Raster ab.
 */
export function resizeObstacle(frame: FaceFrame, obstacle: ObstacleSpec, grip: Grip, point: XY, stepM = 0.05): ObstacleShape {
  const [a, s] = toRoof(frame, obstacle.center);
  const [pa, ps] = toRoof(frame, point);
  let a0 = a - obstacle.widthM / 2;
  let a1 = a + obstacle.widthM / 2;
  let s0 = s - obstacle.lengthM / 2;
  let s1 = s + obstacle.lengthM / 2;
  if (grip.da === 1) a1 = a0 + sized(pa - a0, stepM);
  if (grip.da === -1) a0 = a1 - sized(a1 - pa, stepM);
  if (grip.ds === 1) s1 = s0 + sized(ps - s0, stepM);
  if (grip.ds === -1) s0 = s1 - sized(s1 - ps, stepM);
  return { center: toPlan(frame, [(a0 + a1) / 2, (s0 + s1) / 2]), widthM: sized(a1 - a0, 0), lengthM: sized(s1 - s0, 0) };
}

/** Rechteck zwischen zwei Punkten der Dachfläche, wie beim Aufziehen mit der Maus. Der erste Punkt bleibt eine Ecke. */
export function spanObstacle(frame: FaceFrame, from: XY, to: XY, stepM = 0.05): ObstacleShape {
  const [fa, fs] = toRoof(frame, from);
  const [ta, ts] = toRoof(frame, to);
  const width = sized(Math.abs(ta - fa), stepM);
  const length = sized(Math.abs(ts - fs), stepM);
  return { center: toPlan(frame, [fa + (ta >= fa ? width : -width) / 2, fs + (ts >= fs ? length : -length) / 2]), widthM: width, lengthM: length };
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
    const taken = plan.modules.filter((cell) => cell.active);
    plans[face.edge] = {
      ...plan,
      layoutKey: key,
      modules: fresh.map((cell) => {
        const center = centroidXY(cell.corners);
        const before = taken.find((entry) => pointInPolygon(center, entry.corners)) ?? taken.find((entry) => distanceToEdges(center, entry.corners) < 0.06);
        /* Ein Modul, das an seinem Platz bleibt, behält auch seinen String. */
        return before?.string ? { ...cell, active: true, string: before.string, order: before.order } : { ...cell, active: full || before != null };
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
  /* Ein Platz, der geleert wird, verliert auch seinen String. */
  const modules = plan.modules.map((cell, index): PlanModule => (indexes === "all" || indexes.includes(index) ? (active ? { ...cell, active } : { corners: cell.corners, active }) : cell));
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
