import type { XY } from "@/lib/roof/geo";

/** Zeichnen des Gebäudeumrisses: Einrasten auf rechte Winkel, auf die Flucht zum ersten Punkt und aufs Schließen. */
export type SnapResult = {
  point: XY;
  /** Der Klick würde den Umriss schließen. */
  closes: boolean;
  /** Die neue Kante steht im rechten Winkel zur vorigen. */
  rightAngle: boolean;
  /** Der Punkt liegt in der Flucht des ersten Punkts; die schließende Kante wird rechtwinklig. */
  aligned: boolean;
};

export type SnapOptions = {
  enabled: boolean;
  /** Fangradius in Metern, aus der Zoomstufe abgeleitet. */
  radiusM: number;
  angleToleranceDeg?: number;
};

export function snapDraft(points: XY[], cursor: XY, options: SnapOptions): SnapResult {
  const free: SnapResult = { point: cursor, closes: false, rightAngle: false, aligned: false };
  if (points.length === 0) return free;
  const first = points[0];
  if (points.length >= 3 && Math.hypot(cursor[0] - first[0], cursor[1] - first[1]) <= options.radiusM) {
    return { point: first, closes: true, rightAngle: false, aligned: false };
  }
  if (!options.enabled || points.length < 2) return free;

  const last = points[points.length - 1];
  const before = points[points.length - 2];
  const length = Math.hypot(last[0] - before[0], last[1] - before[1]);
  if (length < 1e-6) return free;
  const along: XY = [(last[0] - before[0]) / length, (last[1] - before[1]) / length];
  const across: XY = [-along[1], along[0]];
  const offset: XY = [cursor[0] - last[0], cursor[1] - last[1]];
  const distance = Math.hypot(offset[0], offset[1]);
  if (distance < 1e-6) return free;

  const tolerance = Math.sin(((options.angleToleranceDeg ?? 8) * Math.PI) / 180);
  const onAlong = offset[0] * along[0] + offset[1] * along[1];
  const onAcross = offset[0] * across[0] + offset[1] * across[1];
  let axis: XY | null = null;
  let rightAngle = false;
  if (Math.abs(onAlong) / distance <= tolerance) {
    axis = across;
    rightAngle = true;
  } else if (Math.abs(onAcross) / distance <= tolerance && onAlong > 0) {
    axis = along;
  }
  if (!axis) return free;

  let reach = offset[0] * axis[0] + offset[1] * axis[1];
  let aligned = false;
  if (points.length >= 3) {
    const toFirst = (first[0] - last[0]) * axis[0] + (first[1] - last[1]) * axis[1];
    if (Math.abs(reach - toFirst) <= options.radiusM && Math.abs(toFirst) > 0.2) {
      reach = toFirst;
      aligned = true;
    }
  }
  return { point: [last[0] + axis[0] * reach, last[1] + axis[1] * reach], closes: false, rightAngle, aligned };
}

/** Schiebt eine Kante parallel zu sich selbst. Positiv heißt nach außen (Umriss gegen den Uhrzeigersinn). */
export function pushEdge(outline: XY[], edge: number, distance: number): XY[] {
  const count = outline.length;
  const a = outline[edge];
  const b = outline[(edge + 1) % count];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const outward: XY = [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
  return outline.map((point, index): XY =>
    index === edge || index === (edge + 1) % count ? [point[0] + outward[0] * distance, point[1] + outward[1] * distance] : point,
  );
}

export function moveOutline(outline: XY[], delta: XY): XY[] {
  return outline.map((point): XY => [point[0] + delta[0], point[1] + delta[1]]);
}

export function formatMeters(value: number): string {
  return `${value.toFixed(2).replace(".", ",")} m`;
}
