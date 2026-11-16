import type { HorizonSample, ModulePlacement, PlannedModule, RoofGeometry, RoofObstacle, StoredBuilding } from "@/lib/roof/types";

const MAX_RING = 80;
const MAX_OBSTACLES = 12;
const MAX_MODULES = 1500;

export function parseRoofGeometry(value: unknown): RoofGeometry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return null;
  const ring = parseRing(raw.ring, MAX_RING);
  if (!ring || ring.length < 3) return null;
  const obstacles = Array.isArray(raw.obstacles) ? raw.obstacles.slice(0, MAX_OBSTACLES).map(parseObstacle).filter((entry): entry is RoofObstacle => entry != null) : [];
  const modules = Array.isArray(raw.modules) ? raw.modules.slice(0, MAX_MODULES).map(parseModule).filter((entry): entry is PlannedModule => entry != null) : [];
  const building = parseBuilding(raw.building);
  return {
    version: 1,
    ring,
    obstacles,
    placement: parsePlacement(raw.placement),
    modules,
    shading: parseShading(raw.shading),
    ...(building ? { building } : {}),
  };
}

const ROOF_TYPES = ["sattel", "walm", "flach"] as const;

function parseBuilding(value: unknown): StoredBuilding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.slice(0, 60) : "";
  const outline = parseRing(raw.outline, 12);
  const roofType = ROOF_TYPES.find((type) => type === raw.roofType);
  const edge = Number(raw.edge);
  const wallHeightM = Number(raw.wallHeightM);
  const overhangM = Number(raw.overhangM);
  if (!id || !outline || outline.length < 3 || !roofType) return null;
  if (!Number.isInteger(edge) || edge < 0 || edge >= outline.length) return null;
  if (!Number.isFinite(wallHeightM) || !Number.isFinite(overhangM)) return null;
  const pitches = Array.isArray(raw.pitchDeg) ? raw.pitchDeg : [];
  return {
    id,
    edge,
    outline,
    roofType,
    wallHeightM: Math.max(0.2, Math.min(40, wallHeightM)),
    overhangM: Math.max(0, Math.min(1.5, overhangM)),
    pitchDeg: outline.map((_, index) => {
      const pitch = Number(pitches[index]);
      return Number.isFinite(pitch) ? Math.max(5, Math.min(70, pitch)) : 30;
    }),
    ridgeSwap: raw.ridgeSwap === true,
  };
}

function parseRing(value: unknown, limit: number): [number, number][] | null {
  if (!Array.isArray(value)) return null;
  const points: [number, number][] = [];
  for (const entry of value.slice(0, limit + 1)) {
    if (!Array.isArray(entry) || entry.length < 2) return null;
    const longitude = Number(entry[0]);
    const latitude = Number(entry[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
    if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return null;
    const last = points[points.length - 1];
    if (last && last[0] === longitude && last[1] === latitude) continue;
    points.push([longitude, latitude]);
  }
  if (points.length > 1 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1]) points.pop();
  return points.slice(0, limit);
}

function parseObstacle(value: unknown): RoofObstacle | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const ring = parseRing(raw.ring, 40);
  const id = typeof raw.id === "string" ? raw.id.slice(0, 80) : "";
  const height = Number(raw.heightM);
  if (!id || !ring || ring.length < 3 || !Number.isFinite(height)) return null;
  return { id, ring, heightM: Math.max(0, Math.min(80, height)) };
}

function parsePlacement(value: unknown): ModulePlacement | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const powerWp = Number(raw.powerWp);
  const widthM = Number(raw.widthM);
  const heightM = Number(raw.heightM);
  const setbackM = Number(raw.setbackM);
  const gapM = Number(raw.gapM);
  if (![powerWp, widthM, heightM, setbackM, gapM].every((entry) => Number.isFinite(entry))) return null;
  if (powerWp < 1 || powerWp > 1000 || widthM < 0.2 || widthM > 4 || heightM < 0.2 || heightM > 4) return null;
  return {
    catalogItemId: typeof raw.catalogItemId === "string" && raw.catalogItemId ? raw.catalogItemId.slice(0, 80) : null,
    powerWp,
    widthM,
    heightM,
    portrait: raw.portrait !== false,
    setbackM: Math.max(0, Math.min(3, setbackM)),
    gapM: Math.max(0, Math.min(1, gapM)),
  };
}

function parseModule(value: unknown): PlannedModule | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.corners) || raw.corners.length !== 4) return null;
  const corners: PlannedModule["corners"] = [[0, 0], [0, 0], [0, 0], [0, 0]];
  for (let index = 0; index < 4; index += 1) {
    const point = raw.corners[index];
    if (!Array.isArray(point)) return null;
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 5000 || Math.abs(y) > 5000) return null;
    corners[index] = [x, y];
  }
  return { corners, active: raw.active !== false };
}

function parseShading(value: unknown): RoofGeometry["shading"] {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const system = clampPercent(raw.systemLossPercent, 14);
  const obstacle = clampPercent(raw.obstacleLossPercent, 0);
  const horizon = clampPercent(raw.horizonLossPercent, 0);
  const samples = Array.isArray(raw.horizon) ? raw.horizon.slice(0, 64).map(parseSample).filter((entry): entry is HorizonSample => entry != null) : undefined;
  return {
    systemLossPercent: system,
    obstacleLossPercent: obstacle,
    horizonLossPercent: horizon,
    horizon: samples && samples.length > 0 ? samples : undefined,
  };
}

function parseSample(value: unknown): HorizonSample | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const azimuthDeg = Number(raw.azimuthDeg);
  const heightDeg = Number(raw.heightDeg);
  if (!Number.isFinite(azimuthDeg) || !Number.isFinite(heightDeg)) return null;
  return { azimuthDeg: ((azimuthDeg % 360) + 360) % 360, heightDeg: Math.max(0, Math.min(90, heightDeg)) };
}

function clampPercent(value: unknown, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(40, number));
}
