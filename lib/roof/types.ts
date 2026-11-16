import type { LngLat } from "@/lib/roof/geo";
import type { RoofType } from "@/lib/roof3d/building";

/** Eckpunkte in Metern, Ost und Nord, bezogen auf den Schwerpunkt der Fläche. */
export type PlanPoint = [number, number];

export type RoofObstacle = {
  id: string;
  ring: LngLat[];
  heightM: number;
};

export type ModulePlacement = {
  catalogItemId: string | null;
  powerWp: number;
  widthM: number;
  heightM: number;
  portrait: boolean;
  setbackM: number;
  gapM: number;
};

export type PlannedModule = {
  corners: [PlanPoint, PlanPoint, PlanPoint, PlanPoint];
  active: boolean;
};

export type HorizonSample = {
  /** Kompass: 0 Nord, 90 Ost, 180 Süd. */
  azimuthDeg: number;
  heightDeg: number;
};

export type RoofShading = {
  /** Anlagenverluste ohne Verschattung, bisher 14 %. */
  systemLossPercent: number;
  obstacleLossPercent: number;
  horizonLossPercent: number;
  horizon?: HorizonSample[];
};

/**
 * Gebäude der 3D-Planung, aus dem eine Fläche entstanden ist. Es liegt an jeder
 * seiner Flächen, damit die Planung es ohne eigene Tabelle wieder zusammensetzen kann.
 */
export type StoredBuilding = {
  id: string;
  /** Kante des Umrisses, an der diese Fläche ihre Traufe hat. */
  edge: number;
  outline: LngLat[];
  roofType: RoofType;
  wallHeightM: number;
  overhangM: number;
  pitchDeg: number[];
  ridgeSwap: boolean;
};

/**
 * Grundriss einer Dachfläche. Liegt im bestehenden JSON-Feld `RoofFace.geometry`,
 * damit keine weitere Migration nötig ist.
 */
export type RoofGeometry = {
  version: 1;
  ring: LngLat[];
  obstacles: RoofObstacle[];
  placement: ModulePlacement | null;
  modules: PlannedModule[];
  shading: RoofShading;
  /** Nur bei Flächen aus der 3D-Planung. */
  building?: StoredBuilding;
};

export function blankGeometry(ring: LngLat[]): RoofGeometry {
  return {
    version: 1,
    ring,
    obstacles: [],
    placement: null,
    modules: [],
    shading: { systemLossPercent: 14, obstacleLossPercent: 0, horizonLossPercent: 0 },
  };
}

export function activeModuleCount(geometry: RoofGeometry | null | undefined): number {
  return geometry?.modules.filter((module) => module.active).length ?? 0;
}

export function layoutKwp(geometry: RoofGeometry | null | undefined): number | null {
  if (!geometry?.placement) return null;
  const count = activeModuleCount(geometry);
  if (geometry.modules.length === 0) return null;
  return Math.round(count * geometry.placement.powerWp) / 1000;
}
