/** Länge/Breite als [Länge, Breite]. Lokal: x nach Ost, y nach Nord, in Metern. */
export type LngLat = [number, number];
export type XY = [number, number];

const METERS_PER_DEG_LAT = 111_320;

export function metersPerDegLon(latitude: number): number {
  return METERS_PER_DEG_LAT * Math.cos((latitude * Math.PI) / 180);
}

export function toLocal(point: LngLat, origin: LngLat): XY {
  return [(point[0] - origin[0]) * metersPerDegLon(origin[1]), (point[1] - origin[1]) * METERS_PER_DEG_LAT];
}

export function toLngLat(point: XY, origin: LngLat): LngLat {
  const meters = metersPerDegLon(origin[1]) || METERS_PER_DEG_LAT;
  return [origin[0] + point[0] / meters, origin[1] + point[1] / METERS_PER_DEG_LAT];
}

export function openRing<T extends number[]>(ring: T[]): T[] {
  if (ring.length < 2) return ring.slice();
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
  return ring.slice();
}

export function centroidLngLat(ring: LngLat[]): LngLat {
  const points = openRing(ring);
  const count = points.length || 1;
  return [points.reduce((sum, point) => sum + point[0], 0) / count, points.reduce((sum, point) => sum + point[1], 0) / count];
}

export function centroidXY(points: XY[]): XY {
  const count = points.length || 1;
  return [points.reduce((sum, point) => sum + point[0], 0) / count, points.reduce((sum, point) => sum + point[1], 0) / count];
}

export function signedArea(points: XY[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    sum += points[index][0] * next[1] - next[0] * points[index][1];
  }
  return sum / 2;
}

export function polygonArea(points: XY[]): number {
  return Math.abs(signedArea(points));
}

export function distanceToSegment(point: XY, start: XY, end: XY): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = dx * dx + dy * dy;
  if (length === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

export function distanceToEdges(point: XY, polygon: XY[]): number {
  let best = Infinity;
  for (let index = 0; index < polygon.length; index += 1) {
    best = Math.min(best, distanceToSegment(point, polygon[index], polygon[(index + 1) % polygon.length]));
  }
  return best;
}

export function pointInPolygon(point: XY, polygon: XY[]): boolean {
  if (polygon.length < 3) return false;
  if (distanceToEdges(point, polygon) <= 1e-6) return true;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];
    const crosses = current[1] > point[1] !== prior[1] > point[1];
    if (!crosses) continue;
    const x = ((prior[0] - current[0]) * (point[1] - current[1])) / (prior[1] - current[1]) + current[0];
    if (point[0] < x) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a: XY, b: XY, c: XY, d: XY): boolean {
  const cross = (p: XY, q: XY, r: XY) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const left = cross(c, d, a);
  const right = cross(c, d, b);
  const start = cross(a, b, c);
  const end = cross(a, b, d);
  return left > 0 !== right > 0 && left !== 0 && right !== 0 && start > 0 !== end > 0 && start !== 0 && end !== 0;
}

export function polygonsOverlap(first: XY[], second: XY[]): boolean {
  if (first.some((point) => pointInPolygon(point, second))) return true;
  if (second.some((point) => pointInPolygon(point, first))) return true;
  for (let i = 0; i < first.length; i += 1) {
    for (let j = 0; j < second.length; j += 1) {
      if (segmentsIntersect(first[i], first[(i + 1) % first.length], second[j], second[(j + 1) % second.length])) return true;
    }
  }
  return false;
}

export function angularDistance(a: number, b: number): number {
  const delta = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(delta, 360 - delta);
}

export function compassOf(vector: XY): number {
  const degrees = (Math.atan2(vector[0], vector[1]) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

export function haversineMeters(a: LngLat, b: LngLat): number {
  const radius = 6_371_000;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Azimut aus der gezeichneten Fläche.
 * Die längsten Kanten gelten als Traufe. Die Fläche schaut senkrecht dazu.
 * Von den beiden Richtungen gewinnt die südlichere, damit ein Rechteck ohne
 * Firstlinie nicht nach Norden kippt. „Umdrehen“ dreht das um 180°.
 */
export function azimuthFromRing(ring: LngLat[]): number | null {
  const points = openRing(ring);
  if (points.length < 3) return null;
  const origin = centroidLngLat(points);
  const local = points.map((point) => toLocal(point, origin));
  const edges: { length: number; outward: XY }[] = [];
  for (let index = 0; index < local.length; index += 1) {
    const start = local[index];
    const end = local[(index + 1) % local.length];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.hypot(dx, dy);
    if (length < 0.2) continue;
    const left: XY = [-dy / length, dx / length];
    const right: XY = [dy / length, -dx / length];
    const mid: XY = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    const outward = left[0] * mid[0] + left[1] * mid[1] >= right[0] * mid[0] + right[1] * mid[1] ? left : right;
    edges.push({ length, outward });
  }
  if (edges.length === 0) return null;
  const longest = Math.max(...edges.map((edge) => edge.length));
  let best = edges[0];
  let bestScore = Infinity;
  let bestAzimuth = 999;
  for (const edge of edges) {
    if (edge.length < longest * 0.95) continue;
    const azimuth = compassOf(edge.outward);
    const score = angularDistance(azimuth, 180);
    if (score < bestScore - 1e-6 || (Math.abs(score - bestScore) <= 1e-6 && azimuth < bestAzimuth)) {
      best = edge;
      bestScore = score;
      bestAzimuth = azimuth;
    }
  }
  return Math.round(compassOf(best.outward) * 10) / 10;
}

/** Höhe über der Traufe. Azimut ist die Fallrichtung, die Traufe liegt am niedrigsten Punkt. */
export function heightOnPlane(polygon: XY[], azimuthDeg: number, tiltDeg: number, point: XY): number {
  if (polygon.length === 0) return 0;
  const radians = (azimuthDeg * Math.PI) / 180;
  const upEast = -Math.sin(radians);
  const upNorth = -Math.cos(radians);
  const project = (value: XY) => value[0] * upEast + value[1] * upNorth;
  const lowest = Math.min(...polygon.map(project));
  const tilt = Math.min(70, Math.max(0, tiltDeg));
  const slope = Math.tan((tilt * Math.PI) / 180);
  return Math.max(0, (project(point) - lowest) * slope);
}

export function vertexHeights(local: XY[], azimuthDeg: number, tiltDeg: number): number[] {
  return local.map((point) => heightOnPlane(local, azimuthDeg, tiltDeg, point));
}

/**
 * Modulecken sind relativ zum Schwerpunkt ihrer eigenen Dachfläche gespeichert.
 * Für Zeichnungen mit mehreren Flächen rechnet dies sie auf einen gemeinsamen Ursprung um.
 */
export function moduleCornersAt(ring: LngLat[], corners: readonly (readonly [number, number])[], origin: LngLat): XY[] {
  const faceOrigin = centroidLngLat(ring);
  return corners.map((corner) => toLocal(toLngLat([corner[0], corner[1]], faceOrigin), origin));
}
