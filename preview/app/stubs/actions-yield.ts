export type YieldComputation = never;
export async function calculatePvgis() {
  return { ok: false as const, notice: "In der Vorschau gibt es keine PVGIS-Rechnung." };
}
