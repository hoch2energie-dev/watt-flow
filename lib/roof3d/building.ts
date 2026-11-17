import { compassOf, polygonArea, signedArea, type XY } from "@/lib/roof/geo";
import type { FacePlan } from "@/lib/roof3d/plans";

/**
 * Gebäude der 3D-Planung: Umriss plus Dachform ergibt alle Dachflächen.
 * Plan: x nach Ost, y nach Nord, in Metern. Höhen in Metern über dem Boden.
 *
 * Jede Dachkante trägt eine Ebene, die an der Wand auf Wandhöhe beginnt und mit
 * ihrer Neigung nach innen steigt. Das Dach ist überall die niedrigste dieser Ebenen.
 * Beim Walmdach zählen alle Kanten, beim Satteldach nur die beiden Traufen.
 * Das stimmt für Umrisse ohne einspringende Ecken; alles andere wird als Flachdach geführt.
 */
export type RoofType = "sattel" | "walm" | "flach";

export type BuildingSpec = {
  id: string;
  /** Ecken gegen den Uhrzeigersinn. Kante i läuft von Ecke i zur nächsten. */
  outline: XY[];
  roofType: RoofType;
  wallHeightM: number;
  overhangM: number;
  /** Neigung je Kante in Grad. Giebelkanten ignorieren ihren Wert. */
  pitchDeg: number[];
  /** Satteldach: First quer statt längs. */
  ridgeSwap: boolean;
  /** Aufbauten und Module je Dachfläche, nach der Kante der Fläche. */
  plans?: Record<number, FacePlan>;
};

export type Point3 = [number, number, number];

export type RoofFace3D = {
  /** Kante des Umrisses, an der die Fläche ihre Traufe hat. */
  edge: number;
  /** Ecken im Plan mit Höhe. */
  ring: Point3[];
  tiltDeg: number;
  /** Kompass der Fallrichtung: 180 schaut nach Süden. */
  azimuthDeg: number;
  /** Fläche auf dem Dach, nicht im Grundriss. */
  areaM2: number;
};

export type RoofModel = {
  /** Dachform, die tatsächlich gerechnet wurde. */
  roofType: RoofType;
  faces: RoofFace3D[];
  /** Wandflächen vom Boden bis unter das Dach. */
  walls: Point3[][];
  ridgeHeightM: number;
  /** Kanten, die eine Dachfläche tragen. */
  eaves: number[];
};

export const BUILDING_DEFAULTS = { wallHeightM: 3, overhangM: 0.2, pitchDeg: 30 };
export const BUILDING_LIMITS = { wall: [0.2, 40], overhang: [0, 1.5], pitch: [5, 70] } as const;

const clamp = (value: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const DEG = Math.PI / 180;

export function ensureCcw(outline: XY[]): XY[] {
  return signedArea(outline) < 0 ? outline.slice().reverse() : outline.slice();
}

export function isConvex(outline: XY[]): boolean {
  const points = ensureCcw(outline);
  if (points.length < 3) return false;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const c = points[(index + 2) % points.length];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < -1e-6) return false;
  }
  return true;
}

export function edgeLengths(outline: XY[]): number[] {
  return outline.map((point, index) => {
    const next = outline[(index + 1) % outline.length];
    return Math.hypot(next[0] - point[0], next[1] - point[1]);
  });
}

/** Welche Dachformen der Umriss zulässt. */
export function allowedRoofTypes(outline: XY[]): RoofType[] {
  if (!isConvex(outline)) return ["flach"];
  return outline.length === 4 ? ["sattel", "walm", "flach"] : ["walm", "flach"];
}

export function newBuilding(id: string, outline: XY[]): BuildingSpec {
  const points = ensureCcw(outline);
  return {
    id,
    outline: points,
    roofType: allowedRoofTypes(points)[0],
    wallHeightM: BUILDING_DEFAULTS.wallHeightM,
    overhangM: BUILDING_DEFAULTS.overhangM,
    pitchDeg: points.map(() => BUILDING_DEFAULTS.pitchDeg),
    ridgeSwap: false,
  };
}

/** Bringt Werte in ihre Grenzen und die Neigungsliste auf die Zahl der Kanten. */
export function normalizeBuilding(spec: BuildingSpec): BuildingSpec {
  const outline = ensureCcw(spec.outline);
  const reversed = outline.length > 0 && outline[0] !== spec.outline[0];
  const pitches = outline.map((_, index) => {
    const source = reversed ? spec.pitchDeg[(outline.length * 2 - 2 - index) % outline.length] : spec.pitchDeg[index];
    return clamp(source ?? BUILDING_DEFAULTS.pitchDeg, BUILDING_LIMITS.pitch);
  });
  const allowed = allowedRoofTypes(outline);
  return {
    ...spec,
    outline,
    roofType: allowed.includes(spec.roofType) ? spec.roofType : allowed[0],
    wallHeightM: clamp(spec.wallHeightM, BUILDING_LIMITS.wall),
    overhangM: clamp(spec.overhangM, BUILDING_LIMITS.overhang),
    pitchDeg: pitches,
  };
}

/** Die beiden Traufkanten eines Satteldachs: das längere Paar gegenüberliegender Kanten, mit `ridgeSwap` das kürzere. */
export function gableEaves(outline: XY[], ridgeSwap: boolean): [number, number] {
  const lengths = edgeLengths(outline);
  const evenLonger = lengths[0] + lengths[2] >= lengths[1] + lengths[3];
  return evenLonger !== ridgeSwap ? [0, 2] : [1, 3];
}

type Plane = { edge: number; origin: XY; normal: XY; slope: number };

function planeHeight(plane: Plane, wall: number, point: XY): number {
  return wall + ((point[0] - plane.origin[0]) * plane.normal[0] + (point[1] - plane.origin[1]) * plane.normal[1]) * plane.slope;
}

function inwardNormal(outline: XY[], edge: number): XY {
  const a = outline[edge];
  const b = outline[(edge + 1) % outline.length];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
}

/** Schiebt jede Kante eines Umrisses ohne einspringende Ecken um `distance` nach außen. */
export function offsetConvex(outline: XY[], distance: number): XY[] {
  if (distance <= 0) return outline.slice();
  const count = outline.length;
  return outline.map((corner, index) => {
    const before = inwardNormal(outline, (index + count - 1) % count);
    const after = inwardNormal(outline, index);
    const dot = before[0] * after[0] + before[1] * after[1];
    const scale = distance / Math.max(0.2, 1 + dot);
    return [corner[0] - (before[0] + after[0]) * scale, corner[1] - (before[1] + after[1]) * scale];
  });
}

/** Behält den Teil des Vielecks, für den `side` höchstens 0 ist. `side` muss linear im Ort sein. */
function clipPolygon(polygon: XY[], side: (point: XY) => number): XY[] {
  const result: XY[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const a = side(current);
    const b = side(next);
    if (a <= 1e-9) result.push(current);
    if ((a < -1e-9 && b > 1e-9) || (a > 1e-9 && b < -1e-9)) {
      const t = a / (a - b);
      result.push([current[0] + (next[0] - current[0]) * t, current[1] + (next[1] - current[1]) * t]);
    }
  }
  return result;
}

export function buildRoof(input: BuildingSpec): RoofModel {
  const spec = normalizeBuilding(input);
  const outline = spec.outline;
  const wall = spec.wallHeightM;
  if (outline.length < 3) return { roofType: "flach", faces: [], walls: [], ridgeHeightM: wall, eaves: [] };

  if (spec.roofType === "flach") {
    const ring = outline.map((point): Point3 => [point[0], point[1], wall]);
    return {
      roofType: "flach",
      faces: [{ edge: 0, ring, tiltDeg: 0, azimuthDeg: 180, areaM2: polygonArea(outline) }],
      walls: outline.map((point, index) => wallBetween(point, outline[(index + 1) % outline.length], [0, 1], () => wall)),
      ridgeHeightM: wall,
      eaves: [],
    };
  }

  const eaves = spec.roofType === "sattel" ? gableEaves(outline, spec.ridgeSwap) : outline.map((_, index) => index);
  const planes: Plane[] = eaves.map((edge) => ({
    edge,
    origin: outline[edge],
    normal: inwardNormal(outline, edge),
    slope: Math.tan(spec.pitchDeg[edge] * DEG),
  }));
  const roofHeight = (point: XY) => Math.min(...planes.map((plane) => planeHeight(plane, wall, point)));
  const covered = offsetConvex(outline, spec.overhangM);

  const faces: RoofFace3D[] = [];
  for (const plane of planes) {
    let polygon = covered;
    for (const other of planes) {
      if (other === plane) continue;
      polygon = clipPolygon(polygon, (point) => planeHeight(plane, wall, point) - planeHeight(other, wall, point));
      if (polygon.length < 3) break;
    }
    const planArea = polygon.length >= 3 ? polygonArea(polygon) : 0;
    if (planArea < 0.05) continue;
    const tiltDeg = spec.pitchDeg[plane.edge];
    faces.push({
      edge: plane.edge,
      ring: polygon.map((point): Point3 => [point[0], point[1], planeHeight(plane, wall, point)]),
      tiltDeg,
      azimuthDeg: Math.round(compassOf([-plane.normal[0], -plane.normal[1]]) * 10) / 10,
      areaM2: planArea / Math.cos(tiltDeg * DEG),
    });
  }

  const walls = outline.map((point, index) => {
    const next = outline[(index + 1) % outline.length];
    const breaks = [0, 1];
    for (let i = 0; i < planes.length; i += 1) {
      for (let j = i + 1; j < planes.length; j += 1) {
        const a = planeHeight(planes[i], wall, point) - planeHeight(planes[j], wall, point);
        const b = planeHeight(planes[i], wall, next) - planeHeight(planes[j], wall, next);
        if ((a < -1e-9 && b > 1e-9) || (a > 1e-9 && b < -1e-9)) breaks.push(a / (a - b));
      }
    }
    return wallBetween(point, next, breaks.sort((x, y) => x - y), roofHeight);
  });

  return {
    roofType: spec.roofType,
    faces,
    walls,
    ridgeHeightM: Math.max(wall, ...faces.flatMap((face) => face.ring.map((point) => point[2]))),
    eaves,
  };
}

function wallBetween(start: XY, end: XY, stops: number[], height: (point: XY) => number): Point3[] {
  const top = stops.map((t): Point3 => {
    const point: XY = [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
    return [point[0], point[1], height(point)];
  });
  return [[start[0], start[1], 0], [end[0], end[1], 0], ...top.reverse()];
}

const WINDS = ["Nord", "Nordost", "Ost", "Südost", "Süd", "Südwest", "West", "Nordwest"];

export function windName(azimuthDeg: number): string {
  return WINDS[Math.round((((azimuthDeg % 360) + 360) % 360) / 45) % 8];
}

export const ROOF_TYPE_LABELS: Record<RoofType, string> = { sattel: "Satteldach", walm: "Walmdach", flach: "Flachdach" };
