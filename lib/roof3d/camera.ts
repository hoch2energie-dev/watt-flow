import type { XY } from "@/lib/roof/geo";

/**
 * Kamera der 3D-Planung, ohne three.js, damit sie sich testen lässt.
 * Plan: x nach Ost, y nach Nord, in Metern. Welt (three.js): x Ost, y Höhe, z Süd.
 * Blickrichtung als Kompass: 0 schaut nach Norden, 90 nach Osten. Winkel in Bogenmaß.
 */
export type Vec3 = [number, number, number];

export type View = {
  /** Punkt am Boden in der Bildmitte. */
  target: XY;
  heading: number;
  /** 0 schaut senkrecht nach unten, 90° waagerecht. */
  tilt: number;
  dist: number;
};

export const DEG = Math.PI / 180;

export const VIEW_LIMITS = { tiltMin: 2 * DEG, tiltMax: 86 * DEG, distMin: 4, distMax: 420 };

/** Mit Rudi am 16.11.2026 auf der Testseite abgestimmt. */
export const CONTROL_DEFAULTS = { rotateDegPerPx: 0.3, zoomPerNotch: 0.15, zoomEaseMs: 70 };

export const FOV_DEG = 40;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function planToWorld(point: XY, height = 0): Vec3 {
  return [point[0], height, -point[1]];
}

export function forward(view: View): Vec3 {
  return [Math.sin(view.heading) * Math.sin(view.tilt), -Math.cos(view.tilt), -Math.cos(view.heading) * Math.sin(view.tilt)];
}

function rightOf(view: View): Vec3 {
  return [Math.cos(view.heading), 0, Math.sin(view.heading)];
}

function upOf(view: View): Vec3 {
  const r = rightOf(view);
  const f = forward(view);
  return [-r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1]];
}

export function cameraPosition(view: View): Vec3 {
  const f = forward(view);
  return [view.target[0] - f[0] * view.dist, -f[1] * view.dist, -view.target[1] - f[2] * view.dist];
}

/** Bodenpunkt unter einer Bildschirmposition. ndc: -1 links/unten bis 1 rechts/oben. */
export function groundPoint(view: View, ndcX: number, ndcY: number, aspect: number, fovDeg = FOV_DEG): XY | null {
  const f = forward(view);
  const r = rightOf(view);
  const u = upOf(view);
  const tan = Math.tan((fovDeg * DEG) / 2);
  const dir: Vec3 = [
    f[0] + r[0] * ndcX * tan * aspect + u[0] * ndcY * tan,
    f[1] + r[1] * ndcX * tan * aspect + u[1] * ndcY * tan,
    f[2] + r[2] * ndcX * tan * aspect + u[2] * ndcY * tan,
  ];
  const length = Math.hypot(dir[0], dir[1], dir[2]);
  if (dir[1] / length > -0.02) return null;
  const camera = cameraPosition(view);
  const t = -camera[1] / dir[1];
  if (t * length > 3000) return null;
  return [camera[0] + dir[0] * t, -(camera[2] + dir[2] * t)];
}

/** Bildschirmposition eines Punkts. `visible` ist falsch, wenn er hinter der Kamera liegt. */
export function projectPoint(view: View, point: XY, height: number, aspect: number, fovDeg = FOV_DEG): { x: number; y: number; visible: boolean } {
  const camera = cameraPosition(view);
  const world = planToWorld(point, height);
  const v: Vec3 = [world[0] - camera[0], world[1] - camera[1], world[2] - camera[2]];
  const f = forward(view);
  const r = rightOf(view);
  const u = upOf(view);
  const depth = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
  const tan = Math.tan((fovDeg * DEG) / 2);
  if (depth < 0.1) return { x: 0, y: 0, visible: false };
  return {
    x: (v[0] * r[0] + v[1] * r[1] + v[2] * r[2]) / (depth * tan * aspect),
    y: (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / (depth * tan),
    visible: true,
  };
}

/**
 * Dreht um die Hochachse und neigt, jeweils um die Bildmitte.
 * Positives dYaw dreht die Blickrichtung im Uhrzeigersinn, positives dPitch macht den Blick flacher.
 */
export function orbit(view: View, dYaw: number, dPitch: number): View {
  return {
    ...view,
    heading: normalizeAngle(view.heading + dYaw),
    tilt: clamp(view.tilt + dPitch, VIEW_LIMITS.tiltMin, VIEW_LIMITS.tiltMax),
  };
}

/** Faktor kleiner 1 zoomt hinein. Mit `anchor` bleibt dieser Bodenpunkt unter dem Mauszeiger. */
export function zoomBy(view: View, factor: number, anchor: XY | null): View {
  const dist = clamp(view.dist * factor, VIEW_LIMITS.distMin, VIEW_LIMITS.distMax);
  const k = dist / view.dist;
  if (!anchor) return { ...view, dist };
  return {
    ...view,
    dist,
    target: [anchor[0] + (view.target[0] - anchor[0]) * k, anchor[1] + (view.target[1] - anchor[1]) * k],
  };
}

/** Verschiebt so, dass der Bodenpunkt `from` unter dem Mauszeiger bleibt, der jetzt auf `to` zeigt. */
export function panBy(view: View, from: XY, to: XY, limit = 400): View {
  return {
    ...view,
    target: [clamp(view.target[0] + from[0] - to[0], -limit, limit), clamp(view.target[1] + from[1] - to[1], -limit, limit)],
  };
}

export function normalizeAngle(angle: number): number {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}

export type PointerMode = "rotate" | "pan" | "tool" | "idle";

/**
 * Was die gedrückten Maustasten bedeuten (`buttons` wie im PointerEvent: 1 links, 2 rechts, 4 Mitte).
 * Beide Tasten drehen. Danach löst eine einzelne Resttaste nichts mehr aus (`chord`),
 * sonst springt die Ansicht, wenn eine Taste früher losgelassen wird.
 */
export function pointerMode(buttons: number, chord: boolean): PointerMode {
  if ((buttons & 3) === 3) return "rotate";
  if (chord) return "idle";
  if (buttons & 4 || buttons & 2) return "pan";
  if (buttons & 1) return "tool";
  return "idle";
}

/** Rasten des Mausrads. Negativ heißt nach vorn, also hinein. */
export function wheelNotches(deltaY: number, deltaMode: number, ctrlKey: boolean): number {
  let delta = deltaY;
  if (deltaMode === 1) delta *= 33;
  else if (deltaMode === 2) delta *= 600;
  if (ctrlKey) delta *= 4;
  return clamp(delta / 100, -3, 3);
}

export function zoomFactor(notches: number, perNotch = CONTROL_DEFAULTS.zoomPerNotch): number {
  return Math.pow(1 + perNotch, notches);
}
