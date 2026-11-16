import { centroidLngLat, centroidXY, heightOnPlane, toLocal, vertexHeights, type XY } from "@/lib/roof/geo";
import type { RoofFaceInput } from "@/lib/pvgis/types";

export type SceneModel = {
  span: number;
  roofs: number[][];
  walls: number[][];
  modules: number[][];
  obstacles: { position: [number, number, number]; size: [number, number, number] }[];
};

/** Ost = x, Höhe = y, Nord = z. Das Modell ist um den Schwerpunkt zentriert. */
export function buildScene(faces: RoofFaceInput[]): SceneModel {
  const planned = faces.filter((face) => (face.geometry?.ring.length ?? 0) >= 3);
  const anchors = planned.flatMap((face) => face.geometry?.ring ?? []);
  if (anchors.length === 0) return { span: 10, roofs: [], walls: [], modules: [], obstacles: [] };
  const origin = centroidLngLat(anchors);
  const roofs: number[][] = [];
  const walls: number[][] = [];
  const modules: number[][] = [];
  const obstacles: SceneModel["obstacles"] = [];
  let span = 4;

  for (const face of planned) {
    const geometry = face.geometry;
    if (!geometry) continue;
    const local = geometry.ring.map((point) => toLocal(point, origin));
    const heights = vertexHeights(local, face.azimuthDeg, face.tiltDeg);
    span = Math.max(span, ...local.map((point) => Math.hypot(point[0], point[1]) * 2), ...heights);
    const roof = triangulate(local, heights);
    if (roof.length > 0) roofs.push(roof);
    walls.push(skirt(local, heights));
    for (const panel of geometry.modules) {
      if (!panel.active) continue;
      const corners = panel.corners;
      const lifted = corners.map((corner) => {
        const point: XY = [corner[0], corner[1]];
        const height = heightOnPlane(local, face.azimuthDeg, face.tiltDeg, point) + 0.25;
        span = Math.max(span, Math.hypot(point[0], point[1]) * 2);
        return [point[0], height, point[1]];
      });
      modules.push([...triangle(lifted[0], lifted[1], lifted[2]), ...triangle(lifted[0], lifted[2], lifted[3])]);
    }
    for (const obstacle of geometry.obstacles) {
      const locals = obstacle.ring.map((point) => toLocal(point, origin));
      const center = centroidXY(locals);
      const width = Math.max(0.4, Math.max(...locals.map((point) => point[0])) - Math.min(...locals.map((point) => point[0])));
      const depth = Math.max(0.4, Math.max(...locals.map((point) => point[1])) - Math.min(...locals.map((point) => point[1])));
      const base = heightOnPlane(local, face.azimuthDeg, face.tiltDeg, center);
      const height = Math.max(0.3, obstacle.heightM);
      obstacles.push({ position: [center[0], base + height / 2, center[1]], size: [width, height, depth] });
    }
  }

  return { span, roofs, walls, modules, obstacles };
}

function triangulate(local: XY[], heights: number[]): number[] {
  const indexes = earClip(local);
  const flat: number[] = [];
  for (let cursor = 0; cursor < indexes.length; cursor += 3) {
    const a = indexes[cursor];
    const b = indexes[cursor + 1];
    const c = indexes[cursor + 2];
    flat.push(local[a][0], heights[a], local[a][1], local[b][0], heights[b], local[b][1], local[c][0], heights[c], local[c][1]);
  }
  return flat;
}

function skirt(local: XY[], heights: number[]): number[] {
  const flat: number[] = [];
  for (let index = 0; index < local.length; index += 1) {
    const next = (index + 1) % local.length;
    const a = [local[index][0], heights[index], local[index][1]];
    const b = [local[next][0], heights[next], local[next][1]];
    const c = [local[next][0], 0, local[next][1]];
    const d = [local[index][0], 0, local[index][1]];
    flat.push(...triangle(a, b, c), ...triangle(a, c, d));
  }
  return flat;
}

function triangle(a: number[], b: number[], c: number[]): number[] {
  return [...a, ...b, ...c];
}

function earClip(points: XY[]): number[] {
  const count = points.length;
  if (count < 3) return [];
  if (count === 3) return [0, 1, 2];
  const area = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % count];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
  const indexes = points.map((_, index) => index);
  if (area < 0) indexes.reverse();
  const result: number[] = [];
  let guard = count * count;
  while (indexes.length > 3 && guard > 0) {
    guard -= 1;
    let clipped = false;
    for (let index = 0; index < indexes.length; index += 1) {
      const previous = indexes[(index + indexes.length - 1) % indexes.length];
      const current = indexes[index];
      const next = indexes[(index + 1) % indexes.length];
      if (!isEar(points, indexes, previous, current, next)) continue;
      result.push(previous, current, next);
      indexes.splice(index, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (indexes.length === 3) result.push(indexes[0], indexes[1], indexes[2]);
  return result;
}

function isEar(points: XY[], indexes: number[], previous: number, current: number, next: number): boolean {
  const a = points[previous];
  const b = points[current];
  const c = points[next];
  const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (cross <= 1e-8) return false;
  for (const index of indexes) {
    if (index === previous || index === current || index === next) continue;
    if (pointInTriangle(points[index], a, b, c)) return false;
  }
  return true;
}

function pointInTriangle(point: XY, a: XY, b: XY, c: XY): boolean {
  const sign = (p: XY, q: XY, r: XY) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const ab = sign(point, a, b);
  const bc = sign(point, b, c);
  const ca = sign(point, c, a);
  const hasNeg = ab < 0 || bc < 0 || ca < 0;
  const hasPos = ab > 0 || bc > 0 || ca > 0;
  return !(hasNeg && hasPos);
}
