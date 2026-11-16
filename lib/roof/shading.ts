import { centroidLngLat, centroidXY, pointInPolygon, polygonArea, toLocal, type XY } from "@/lib/roof/geo";
import { DEFAULT_SYSTEM_LOSSES, type RoofFaceInput } from "@/lib/pvgis/types";
import type { HorizonSample } from "@/lib/roof/types";

/**
 * Hindernis in der Fläche: etwa 1,2 Prozentpunkte je Meter Höhe,
 * dazu ein Anteil nach der überdeckten Fläche. Weit entfernte Körper zählen wenig.
 * Das ist eine Planungshilfe, keine Strahlensimulation.
 */
export function obstacleLossPercent(polygon: XY[], obstacles: { ring: XY[]; heightM: number }[]): number {
  const area = polygonArea(polygon);
  if (area <= 0 || obstacles.length === 0) return 0;
  let loss = 0;
  for (const obstacle of obstacles) {
    if (obstacle.ring.length < 3) continue;
    const height = Math.max(0, Math.min(40, obstacle.heightM));
    const obstacleArea = polygonArea(obstacle.ring);
    const inside = obstacle.ring.some((point) => pointInPolygon(point, polygon)) || pointInPolygon(centroidXY(obstacle.ring), polygon);
    if (!inside) continue;
    const fraction = Math.min(1, obstacleArea / area);
    loss += Math.min(18, height * 1.2 + fraction * 40);
  }
  return Math.round(Math.min(25, loss) * 10) / 10;
}

/** Horizont über 3° in einem Sektor von ±45° um die Fallrichtung, 0,4 Prozentpunkte je Grad. */
export function horizonLossPercent(samples: HorizonSample[], azimuthDeg: number): number {
  const near = samples.filter((sample) => {
    const delta = Math.abs((((sample.azimuthDeg - azimuthDeg) % 360) + 360) % 360);
    return Math.min(delta, 360 - delta) <= 45;
  });
  if (near.length === 0) return 0;
  const excess = near.reduce((sum, sample) => sum + Math.max(0, sample.heightDeg - 3), 0) / near.length;
  return Math.round(Math.min(20, excess * 0.4) * 10) / 10;
}

export function combinedLosses(systemPercent: number, obstaclePercent: number, horizonPercent: number): number {
  const total = Math.max(0, systemPercent) + Math.max(0, obstaclePercent) + Math.max(0, horizonPercent);
  return Math.round(Math.min(40, total) * 10) / 10;
}

/** Setzt den PVGIS-Verlust neu aus System, Hindernis und Horizont. Zählt nichts doppelt. */
export function applyShading(face: RoofFaceInput, horizon: HorizonSample[] | null): RoofFaceInput {
  const geometry = face.geometry;
  if (!geometry || geometry.ring.length < 3) return face;
  const origin = centroidLngLat(geometry.ring);
  const polygon = geometry.ring.map((point) => toLocal(point, origin));
  const obstacles = geometry.obstacles.map((obstacle) => ({
    ring: obstacle.ring.map((point) => toLocal(point, origin)),
    heightM: obstacle.heightM,
  }));
  const obstacle = obstacleLossPercent(polygon, obstacles);
  const previousHorizon = geometry.shading.horizonLossPercent;
  const horizonLoss = horizon && horizon.length > 0 ? horizonLossPercent(horizon, face.azimuthDeg) : previousHorizon;
  const system = geometry.shading.systemLossPercent > 0 ? geometry.shading.systemLossPercent : DEFAULT_SYSTEM_LOSSES;
  return {
    ...face,
    lossesPercent: combinedLosses(system, obstacle, horizonLoss),
    geometry: {
      ...geometry,
      shading: {
        systemLossPercent: system,
        obstacleLossPercent: obstacle,
        horizonLossPercent: horizonLoss,
        horizon: horizon && horizon.length > 0 ? horizon.slice(0, 64) : geometry.shading.horizon,
      },
    },
  };
}
