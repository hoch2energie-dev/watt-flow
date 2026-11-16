import { DEFAULT_SYSTEM_LOSSES, type RoofFaceInput } from "@/lib/pvgis/types";
import { toLngLat, toLocal, type LngLat } from "@/lib/roof/geo";
import { blankGeometry, type StoredBuilding } from "@/lib/roof/types";
import { buildRoof, normalizeBuilding, windName, type BuildingSpec, type RoofType } from "@/lib/roof3d/building";

/**
 * Brücke zwischen der 3D-Planung und den Dachflächen des Angebots.
 * Die Ertragsrechnung kennt nur Flächen mit Neigung, Ausrichtung und Leistung.
 * Jede Fläche aus der 3D-Planung trägt deshalb ihr Gebäude mit sich.
 */

/** Mehr Flächen je Variante schneidet `sanitizeOffer` beim Speichern ab. */
export const MAX_FACES = 16;

/** Setzt die Gebäude aus gespeicherten Flächen zusammen. `origin` ist der Standort des Angebots. */
export function buildingsFromFaces(faces: RoofFaceInput[], origin: LngLat): BuildingSpec[] {
  const found = new Map<string, BuildingSpec>();
  for (const face of faces) {
    const stored = face.geometry?.building;
    if (!stored || found.has(stored.id)) continue;
    found.set(
      stored.id,
      normalizeBuilding({
        id: stored.id,
        outline: stored.outline.map((point) => toLocal(point, origin)),
        roofType: stored.roofType,
        wallHeightM: stored.wallHeightM,
        overhangM: stored.overhangM,
        pitchDeg: stored.pitchDeg.slice(),
        ridgeSwap: stored.ridgeSwap,
      }),
    );
  }
  return [...found.values()];
}

/**
 * Erzeugt die Dachflächen der Gebäude. Flächen, die nicht aus der 3D-Planung stammen,
 * bleiben unverändert am Ende stehen. Liegt eine Fläche noch am selben Ort, behält sie
 * Namen, Leistung, Module und Verluste. Hat sich ihr Grundriss geändert, beginnt sie leer,
 * weil die alten Module nicht mehr auf sie passen.
 *
 * Wiedererkannt wird eine Fläche an Gebäude und Kante, nicht an ihrer Kennung: Beim Kopieren
 * einer Variante bekommen die Flächen neue Kennungen. Neue Kennungen enthalten die Variante,
 * weil sie in der Datenbank über alle Varianten eindeutig sein müssen.
 */
export function facesFromBuildings(buildings: BuildingSpec[], origin: LngLat, previous: RoofFaceInput[], variantId: string): RoofFaceInput[] {
  const free = previous.filter((face) => !face.geometry?.building);
  const planned: RoofFaceInput[] = [];
  buildings.forEach((input, number) => {
    const spec = normalizeBuilding(input);
    const model = buildRoof(spec);
    const stored: Omit<StoredBuilding, "edge"> = {
      id: spec.id,
      outline: spec.outline.map((point) => toLngLat(point, origin)),
      roofType: model.roofType,
      wallHeightM: spec.wallHeightM,
      overhangM: spec.overhangM,
      pitchDeg: spec.pitchDeg,
      ridgeSwap: spec.ridgeSwap,
    };
    for (const face of model.faces) {
      const ring = face.ring.map((point): LngLat => toLngLat([point[0], point[1]], origin));
      const before = previous.find((entry) => entry.geometry?.building?.id === spec.id && entry.geometry.building.edge === face.edge);
      const id = before?.id ?? faceId(variantId, spec.id, face.edge);
      const kept = before?.geometry && sameRing(before.geometry.ring, ring) ? before : null;
      const building: StoredBuilding = { ...stored, edge: face.edge };
      planned.push({
        id,
        name: kept ? kept.name : faceName(number, buildings.length, model.roofType, face.azimuthDeg),
        kwp: kept ? kept.kwp : 0,
        tiltDeg: face.tiltDeg,
        azimuthDeg: face.azimuthDeg,
        mounting: "gebaeude",
        lossesPercent: before?.lossesPercent ?? DEFAULT_SYSTEM_LOSSES,
        geometry: kept?.geometry ? { ...kept.geometry, building } : { ...blankGeometry(ring), building },
      });
    }
  });
  return [...planned, ...free];
}

export function faceId(variantId: string, buildingId: string, edge: number): string {
  return `${variantId.slice(0, 30)}:${buildingId.slice(0, 40)}:${edge}`;
}

/** Flächen mit Leistung, die nach dem Umplanen leer beginnen. Für den Hinweis beim Speichern. */
export function resetFaces(previous: RoofFaceInput[], next: RoofFaceInput[]): RoofFaceInput[] {
  return previous.filter((face) => face.geometry?.building && face.kwp > 0 && !next.some((entry) => entry.id === face.id && entry.kwp > 0));
}

function faceName(number: number, count: number, roofType: RoofType, azimuthDeg: number): string {
  const house = count > 1 ? `Dach ${number + 1}` : "Dach";
  return roofType === "flach" ? `${house} flach` : `${house} ${windName(azimuthDeg)}`;
}

/** Gleich innerhalb von etwa einem Zentimeter. */
function sameRing(a: LngLat[], b: LngLat[]): boolean {
  return a.length === b.length && a.every((point, index) => Math.abs(point[0] - b[index][0]) < 1.5e-7 && Math.abs(point[1] - b[index][1]) < 1e-7);
}
