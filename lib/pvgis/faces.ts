import type { RoofFaceInput } from "@/lib/pvgis/types";
import { DEFAULT_SYSTEM_LOSSES } from "@/lib/pvgis/types";

const COMPASS: Record<string, number> = {
  Süd: 180,
  Südost: 135,
  Südwest: 225,
  Ost: 90,
  West: 270,
  Nord: 0,
  Flachdach: 180,
};

export function sumMonthly(parts: number[][]): number[] {
  const monthly = Array.from({ length: 12 }, () => 0);
  for (const part of parts) {
    for (let index = 0; index < 12; index += 1) monthly[index] += part[index] ?? 0;
  }
  return monthly;
}

export function sumFaceYields(faces: { annualKwh: number; monthlyKwh: number[] }[]): { annualKwh: number; monthlyKwh: number[] } {
  const monthlyKwh = sumMonthly(faces.map((face) => face.monthlyKwh));
  const annualFromMonths = monthlyKwh.reduce((sum, value) => sum + value, 0);
  const annualKwh = faces.reduce((sum, face) => sum + face.annualKwh, 0);
  return { annualKwh: annualKwh > 0 ? annualKwh : annualFromMonths, monthlyKwh };
}

export function yieldRequestKey(latitude: number, longitude: number, faces: RoofFaceInput[]): string {
  const planes = faces
    .filter((face) => face.kwp > 0)
    .map((face) => [face.kwp.toFixed(2), face.tiltDeg.toFixed(1), face.azimuthDeg.toFixed(1), face.mounting, face.lossesPercent.toFixed(1)].join(","))
    .sort();
  return `${latitude.toFixed(4)}|${longitude.toFixed(4)}|${planes.join(";")}`;
}

export function defaultRoofFaces(input: { kwp: number; tiltDeg: number | null; orientation: string }): RoofFaceInput[] {
  const kwp = Math.max(0, input.kwp);
  const tilt = input.tiltDeg != null && input.tiltDeg > 0 ? input.tiltDeg : input.orientation === "Flachdach" ? 10 : 30;
  if (input.orientation === "Ost-West") {
    const half = Math.round((kwp / 2) * 100) / 100;
    return [
      face("Ost", half, tilt, 90),
      face("West", Math.round((kwp - half) * 100) / 100, tilt, 270),
    ];
  }
  const azimuth = COMPASS[input.orientation] ?? 180;
  return [face(input.orientation || "Dachfläche", kwp, tilt, azimuth)];
}

function face(name: string, kwp: number, tiltDeg: number, azimuthDeg: number): RoofFaceInput {
  return {
    id: crypto.randomUUID(),
    name,
    kwp,
    tiltDeg,
    azimuthDeg,
    mounting: "gebaeude",
    lossesPercent: DEFAULT_SYSTEM_LOSSES,
    geometry: null,
  };
}
