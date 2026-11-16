/**
 * Gemeinsame Eingaben für den Ertrag.
 * `geometry` trägt Grundriss, Module und Verschattung der Dachplanung.
 * Eine spätere Lastprofilrechnung kann an der Stundenreihe von seriescalc hängen.
 */

import type { RoofGeometry } from "@/lib/roof/types";

export type Mounting = "gebaeude" | "frei";

export type RoofFaceInput = {
  id: string;
  name: string;
  kwp: number;
  tiltDeg: number;
  /** Kompass: 0 Nord, 90 Ost, 180 Süd, 270 West, im Uhrzeigersinn. */
  azimuthDeg: number;
  mounting: Mounting;
  lossesPercent: number;
  geometry: RoofGeometry | null;
};

export type PvgisPlaneResult = {
  annualKwh: number;
  monthlyKwh: number[];
};

export const PVGIS_SOURCE_NOTE = "Quelle: PVGIS © Europäische Union";
export const DEFAULT_SYSTEM_LOSSES = 14;

export function normalizeMounting(value: unknown): Mounting {
  return value === "frei" ? "frei" : "gebaeude";
}
