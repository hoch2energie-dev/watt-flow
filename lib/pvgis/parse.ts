import type { PvgisPlaneResult } from "@/lib/pvgis/types";

/** PVcalc v5.3: Monatswerte E_m und Jahreswert E_y, in kWh. */
export function parsePvcalc(payload: unknown): PvgisPlaneResult {
  if (!payload || typeof payload !== "object") throw new Error("PVGIS-Antwort ist leer.");
  const monthly = (payload as { outputs?: { monthly?: { fixed?: unknown } } }).outputs?.monthly?.fixed;
  if (!Array.isArray(monthly)) throw new Error("PVGIS-Antwort ohne Monatswerte.");
  const monthlyKwh = Array.from({ length: 12 }, () => 0);
  for (const row of monthly) {
    if (!row || typeof row !== "object") continue;
    const month = Number((row as { month?: unknown }).month);
    const energy = Number((row as { E_m?: unknown }).E_m);
    if (month >= 1 && month <= 12 && Number.isFinite(energy)) monthlyKwh[month - 1] = energy;
  }
  if (monthlyKwh.every((value) => value === 0) && monthly.length < 12) {
    throw new Error("PVGIS-Antwort ohne Monatswerte.");
  }
  const annualField = Number(
    (payload as { outputs?: { totals?: { fixed?: { E_y?: unknown } } } }).outputs?.totals?.fixed?.E_y,
  );
  const annualFromMonths = monthlyKwh.reduce((sum, value) => sum + value, 0);
  return {
    annualKwh: Number.isFinite(annualField) && annualField > 0 ? annualField : annualFromMonths,
    monthlyKwh,
  };
}

/**
 * seriescalc: Stundenleistung P in Watt. Eine Zeile je Stunde wird zu kWh.
 * Lieferung 2 verwendet diese Reihe für Lastprofil und Speicher.
 */
export function parseSeriesHourly(payload: unknown): number[] {
  const hourly = (payload as { outputs?: { hourly?: unknown } })?.outputs?.hourly;
  if (!Array.isArray(hourly) || hourly.length === 0) throw new Error("PVGIS-Stundenreihe fehlt.");
  return hourly.map((row) => {
    const powerW = Number((row as { P?: unknown })?.P);
    return Number.isFinite(powerW) ? powerW / 1000 : 0;
  });
}
