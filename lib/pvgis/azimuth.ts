/**
 * Kompass (0 = Nord, im Uhrzeigersinn) nach PVGIS-Aspekt.
 * PVGIS: 0 = Süd, 90 = West, -90 = Ost, ±180 = Nord.
 */
export function compassToPvgisAspect(compassDeg: number): number {
  if (!Number.isFinite(compassDeg)) return 0;
  const compass = ((compassDeg % 360) + 360) % 360;
  let aspect = compass - 180;
  if (aspect > 180) aspect -= 360;
  if (aspect <= -180) aspect += 360;
  return Math.round(aspect * 10) / 10;
}

export function pvgisMountingPlace(mounting: "gebaeude" | "frei"): "building" | "free" {
  return mounting === "frei" ? "free" : "building";
}
