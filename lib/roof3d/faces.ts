import { DEFAULT_SYSTEM_LOSSES, type RoofFaceInput } from "@/lib/pvgis/types";
import { centroidLngLat, centroidXY, toLngLat, toLocal, type LngLat, type XY } from "@/lib/roof/geo";
import { blankGeometry, layoutKwp, type PlannedModule, type RoofGeometry, type RoofObstacle, type StoredBuilding } from "@/lib/roof/types";
import { buildRoof, normalizeBuilding, windName, type BuildingSpec, type RoofFace3D, type RoofType } from "@/lib/roof3d/building";
import { faceFrame, obstacleRing, sealPlan, type FacePlan, type ObstacleSpec, type PlanModule } from "@/lib/roof3d/plans";

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
  return [...found.values()].map((base) => {
    const model = buildRoof(base);
    const plans: Record<number, FacePlan> = {};
    for (const face of faces) {
      const geometry = face.geometry;
      const built = geometry?.building?.id === base.id ? model.faces.find((entry) => entry.edge === geometry.building?.edge) : undefined;
      if (!geometry || !built) continue;
      if (geometry.obstacles.length === 0 && !geometry.placement && geometry.modules.length === 0) continue;
      const faceOrigin = centroidLngLat(geometry.ring);
      plans[built.edge] = sealPlan(base, built.edge, {
        obstacles: geometry.obstacles.map((obstacle) => obstacleFromStored(base, built, obstacle, origin)),
        placement: geometry.placement,
        modules: geometry.modules.map(
          (panel): PlanModule => ({
            corners: panel.corners.map((corner) => toLocal(toLngLat(corner, faceOrigin), origin)) as PlanModule["corners"],
            active: panel.active,
            ...(panel.active && panel.string ? { string: panel.string, order: panel.order } : {}),
          }),
        ),
      });
    }
    return Object.keys(plans).length > 0 ? { ...base, plans } : base;
  });
}

/** Ein gespeichertes Hindernis wird zum Rechteck entlang der Traufe, wenn es eines ist, sonst bleibt seine Form. */
function obstacleFromStored(spec: BuildingSpec, face: RoofFace3D, stored: RoofObstacle, origin: LngLat): ObstacleSpec {
  const ring = stored.ring.map((point) => toLocal(point, origin));
  const center = centroidXY(ring);
  const frame = faceFrame(spec, face);
  const base = { id: stored.id, kind: stored.kind ?? "sperrzone", center, heightM: stored.heightM, marginM: stored.marginM ?? 0 } as const;
  const edge = (index: number): XY => [ring[(index + 1) % ring.length][0] - ring[index][0], ring[(index + 1) % ring.length][1] - ring[index][1]];
  if (ring.length === 4) {
    const first = edge(0);
    const second = edge(1);
    const width = Math.hypot(first[0], first[1]);
    const depth = Math.hypot(second[0], second[1]);
    const parallel = Math.abs(first[0] * frame.along[1] - first[1] * frame.along[0]) < 0.02 * width;
    const square = Math.abs(first[0] * second[0] + first[1] * second[1]) < 0.02 * width * depth;
    if (width > 0.05 && depth > 0.05 && parallel && square) return { ...base, widthM: width, lengthM: depth / frame.cos };
  }
  const xs = ring.map((point) => point[0]);
  const ys = ring.map((point) => point[1]);
  return {
    ...base,
    widthM: Math.max(...xs) - Math.min(...xs),
    lengthM: Math.max(...ys) - Math.min(...ys),
    shape: ring.map((point): XY => [point[0] - center[0], point[1] - center[1]]),
  };
}

/**
 * Erzeugt die Dachflächen der Gebäude. Flächen, die nicht aus der 3D-Planung stammen,
 * bleiben unverändert am Ende stehen. Eine Fläche, die es schon gab, behält ihre Kennung,
 * einen von Hand vergebenen Namen, eine von Hand eingetragene Leistung und ihre Verluste.
 * Aufbauten und Module führt die Planung selbst, sie stehen an den Gebäuden.
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
      const plan = spec.plans?.[face.edge];
      let geometry: RoofGeometry = kept?.geometry ? { ...kept.geometry, building } : { ...blankGeometry(ring), building };
      if (plan) {
        /* Die Planung führt Aufbauten und Module selbst. Modulecken stehen wie überall relativ zum Schwerpunkt der Fläche. */
        const frame = faceFrame(spec, face);
        const faceOrigin = centroidLngLat(ring);
        geometry = {
          ...geometry,
          obstacles: plan.obstacles.map((obstacle) => ({
            id: obstacle.id,
            ring: obstacleRing(frame, obstacle).map((point) => toLngLat(point, origin)),
            heightM: obstacle.heightM,
            kind: obstacle.kind,
            ...(obstacle.marginM > 0 ? { marginM: obstacle.marginM } : {}),
          })),
          placement: plan.placement,
          modules: plan.modules.map(
            (cell): PlannedModule => ({
              corners: cell.corners.map((corner) => toLocal(toLngLat(corner, origin), faceOrigin)) as PlannedModule["corners"],
              active: cell.active,
              ...(cell.active && cell.string ? { string: cell.string, order: cell.order ?? 1 } : {}),
            }),
          ),
        };
      }
      /*
       * Leistung: Ist ein Modul gewählt, zählt die Belegung, auch wenn noch kein Platz belegt ist.
       * Ohne Modul bleibt eine von Hand eingetragene Leistung stehen. Kam sie aber aus einer
       * Belegung, die es nicht mehr gibt, ist die Fläche leer.
       */
      const active = plan?.placement ? plan.modules.filter((cell) => cell.active).length : 0;
      const manual = before && layoutKwp(before.geometry) == null ? before.kwp : 0;
      planned.push({
        id,
        name: before && !autoNamed(before) ? before.name : faceName(number, buildings.length, model.roofType, face.azimuthDeg),
        kwp: plan?.placement ? Math.round(active * plan.placement.powerWp) / 1000 : manual,
        tiltDeg: face.tiltDeg,
        azimuthDeg: face.azimuthDeg,
        mounting: "gebaeude",
        lossesPercent: before?.lossesPercent ?? DEFAULT_SYSTEM_LOSSES,
        geometry,
      });
    }
  });
  return [...planned, ...free];
}

export function faceId(variantId: string, buildingId: string, edge: number): string {
  return `${variantId.slice(0, 30)}:${buildingId.slice(0, 40)}:${edge}`;
}

/**
 * Flächen mit Leistung, die durch das Umplanen leer geworden sind. Für den Hinweis beim Speichern.
 * Eine Fläche, die am selben Ort liegt und von Hand geleert wurde, zählt nicht dazu.
 */
export function resetFaces(previous: RoofFaceInput[], next: RoofFaceInput[]): RoofFaceInput[] {
  return previous.filter((face) => {
    if (!face.geometry?.building || face.kwp <= 0) return false;
    const now = next.find((entry) => entry.id === face.id);
    if (!now) return true;
    return now.kwp <= 0 && !(now.geometry && sameRing(now.geometry.ring, face.geometry.ring));
  });
}

/** Trägt die Fläche noch den Namen, den die Planung ihr gegeben hat? Dann darf er sich mit dem Dach ändern. */
function autoNamed(face: RoofFaceInput): boolean {
  const tail = face.geometry?.building?.roofType === "flach" ? "flach" : windName(face.azimuthDeg);
  return new RegExp(`^Dach( \\d+)? ${tail}$`).test(face.name);
}

function faceName(number: number, count: number, roofType: RoofType, azimuthDeg: number): string {
  const house = count > 1 ? `Dach ${number + 1}` : "Dach";
  return roofType === "flach" ? `${house} flach` : `${house} ${windName(azimuthDeg)}`;
}

/** Gleich innerhalb von etwa einem Zentimeter. */
function sameRing(a: LngLat[], b: LngLat[]): boolean {
  return a.length === b.length && a.every((point, index) => Math.abs(point[0] - b[index][0]) < 1.5e-7 && Math.abs(point[1] - b[index][1]) < 1e-7);
}
