import { describe, expect, it } from "vitest";
import { polygonArea, type XY } from "@/lib/roof/geo";
import { buildRoof, gableEaves, isConvex, newBuilding, offsetConvex, windName, type BuildingSpec } from "@/lib/roof3d/building";
import { CONTROL_DEFAULTS, DEG, cameraPosition, groundPoint, orbit, panBy, pointerMode, projectPoint, wheelNotches, zoomBy, zoomFactor, type View } from "@/lib/roof3d/camera";
import { pushEdge, snapDraft } from "@/lib/roof3d/draw";

/** 12 m in Ost-West, 8 m in Nord-Süd, Mitte im Ursprung. Kante 0 ist die Südseite. */
const rect: XY[] = [[-6, -4], [6, -4], [6, 4], [-6, 4]];
const building = (patch: Partial<BuildingSpec> = {}): BuildingSpec => ({ ...newBuilding("b1", rect), overhangM: 0, ...patch });
const view: View = { target: [0, 0], heading: 0, tilt: 50 * DEG, dist: 40 };

describe("Dachformen", () => {
  it("Satteldach: zwei Flächen nach Süd und Nord, First mittig auf Wandhöhe plus halbe Breite mal Tangens", () => {
    const roof = buildRoof(building());
    expect(roof.eaves).toEqual([0, 2]);
    expect(roof.faces.map((face) => face.azimuthDeg)).toEqual([180, 0]);
    expect(roof.faces.map((face) => face.tiltDeg)).toEqual([30, 30]);
    expect(roof.ridgeHeightM).toBeCloseTo(3 + 4 * Math.tan(30 * DEG), 6);
    for (const face of roof.faces) expect(face.areaM2).toBeCloseTo((12 * 4) / Math.cos(30 * DEG), 6);
  });

  it("Satteldach: Giebelwände reichen bis zum First, Traufwände bis zur Wandhöhe", () => {
    const roof = buildRoof(building());
    expect(roof.walls[0].map((point) => point[2])).toEqual([0, 0, 3, 3]);
    const gable = roof.walls[1].map((point) => point[2]);
    expect(gable).toHaveLength(5);
    expect(Math.max(...gable)).toBeCloseTo(roof.ridgeHeightM, 6);
  });

  it("Satteldach mit ungleichen Neigungen: First rückt zur steileren Seite", () => {
    const roof = buildRoof(building({ pitchDeg: [45, 30, 20, 30] }));
    const south = roof.faces.find((face) => face.edge === 0)!;
    const ridgeY = Math.max(...south.ring.map((point) => point[1]));
    expect(ridgeY).toBeLessThan(0);
    expect(roof.ridgeHeightM).toBeCloseTo(3 + 8 / (1 / Math.tan(45 * DEG) + 1 / Math.tan(20 * DEG)), 6);
  });

  it("First tauschen dreht die Traufen auf das kürzere Kantenpaar", () => {
    expect(gableEaves(rect, false)).toEqual([0, 2]);
    expect(gableEaves(rect, true)).toEqual([1, 3]);
    const roof = buildRoof(building({ ridgeSwap: true }));
    expect(roof.faces.map((face) => face.azimuthDeg)).toEqual([90, 270]);
  });

  it("Walmdach: vier Flächen, die den Grundriss lückenlos decken", () => {
    const roof = buildRoof(building({ roofType: "walm" }));
    expect(roof.faces.map((face) => face.azimuthDeg)).toEqual([180, 90, 0, 270]);
    const plan = roof.faces.reduce((sum, face) => sum + face.areaM2 * Math.cos(face.tiltDeg * DEG), 0);
    expect(plan).toBeCloseTo(12 * 8, 6);
    expect(roof.faces[0].ring).toHaveLength(4);
    expect(roof.faces[1].ring).toHaveLength(3);
    expect(roof.walls.every((wall) => wall.every((point) => point[2] <= 3 + 1e-9))).toBe(true);
  });

  it("Dachüberstand vergrößert die Flächen und senkt die Traufe", () => {
    const roof = buildRoof(building({ overhangM: 0.5 }));
    const south = roof.faces[0];
    expect(Math.min(...south.ring.map((point) => point[2]))).toBeCloseTo(3 - 0.5 * Math.tan(30 * DEG), 6);
    expect(south.areaM2).toBeCloseTo((13 * 4.5) / Math.cos(30 * DEG), 6);
  });

  it("Flachdach und einspringende Ecken", () => {
    const flat = buildRoof(building({ roofType: "flach" }));
    expect(flat.faces).toHaveLength(1);
    expect(flat.faces[0].tiltDeg).toBe(0);
    const lShape: XY[] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 9], [0, 9]];
    expect(isConvex(lShape)).toBe(false);
    expect(newBuilding("b2", lShape).roofType).toBe("flach");
    expect(buildRoof({ ...newBuilding("b2", lShape), roofType: "walm" }).roofType).toBe("flach");
  });

  it("Umriss im Uhrzeigersinn wird gedreht, Neigungen wandern mit ihrer Kante", () => {
    const clockwise = rect.slice().reverse();
    const roof = buildRoof({ ...newBuilding("b3", rect), outline: clockwise, overhangM: 0, pitchDeg: [10, 20, 30, 40] });
    const south = roof.faces.find((face) => face.azimuthDeg === 180)!;
    const north = roof.faces.find((face) => face.azimuthDeg === 0)!;
    // Im Uhrzeigersinn ist Kante 0 die Nordseite (10°) und Kante 2 die Südseite (30°).
    expect([south.tiltDeg, north.tiltDeg]).toEqual([30, 10]);
  });

  it("Hilfen", () => {
    expect(polygonArea(offsetConvex(rect, 0.5))).toBeCloseTo(13 * 9, 6);
    expect(windName(180)).toBe("Süd");
    expect(windName(350)).toBe("Nord");
  });
});

describe("Kamera", () => {
  it("steht hinter dem Zielpunkt und trifft ihn in der Bildmitte", () => {
    const camera = cameraPosition(view);
    expect(camera[1]).toBeCloseTo(40 * Math.cos(50 * DEG), 6);
    expect(camera[2]).toBeGreaterThan(0);
    const center = groundPoint(view, 0, 0, 1.6)!;
    expect(center[0]).toBeCloseTo(0, 6);
    expect(center[1]).toBeCloseTo(0, 6);
  });

  it("Bodenpunkt und Bildschirmpunkt sind Umkehrungen", () => {
    const point = groundPoint(view, 0.4, -0.3, 1.6)!;
    const screen = projectPoint(view, point, 0, 1.6);
    expect(screen.visible).toBe(true);
    expect(screen.x).toBeCloseTo(0.4, 6);
    expect(screen.y).toBeCloseTo(-0.3, 6);
    expect(groundPoint({ ...view, tilt: 86 * DEG }, 0, 0.9, 1.6)).toBeNull();
  });

  it("Mausrad nach vorn zoomt hinein und hält den Punkt unter der Maus fest", () => {
    expect(wheelNotches(-100, 0, false)).toBe(-1);
    expect(zoomFactor(-1)).toBeCloseTo(1 / (1 + CONTROL_DEFAULTS.zoomPerNotch), 9);
    const anchor = groundPoint(view, 0.5, 0.2, 1.6)!;
    const zoomed = zoomBy(view, zoomFactor(-1), anchor);
    expect(zoomed.dist).toBeLessThan(view.dist);
    const screen = projectPoint(zoomed, anchor, 0, 1.6);
    expect(screen.x).toBeCloseTo(0.5, 6);
    expect(screen.y).toBeCloseTo(0.2, 6);
    expect(zoomBy(view, 0.0001, null).dist).toBe(4);
  });

  it("Drehen bleibt in den Grenzen, Verschieben zieht den Boden mit", () => {
    const turned = orbit(view, 36 * DEG, -200 * DEG);
    expect(turned.heading).toBeCloseTo(36 * DEG, 9);
    expect(turned.tilt).toBeCloseTo(2 * DEG, 9);
    expect(turned.target).toEqual(view.target);
    expect(panBy(view, [3, 1], [1, 4]).target).toEqual([2, -3]);
  });

  it("Maustasten: beide drehen, danach löst eine Resttaste nichts aus", () => {
    expect(pointerMode(3, false)).toBe("rotate");
    expect(pointerMode(2, true)).toBe("idle");
    expect(pointerMode(1, true)).toBe("idle");
    expect(pointerMode(2, false)).toBe("pan");
    expect(pointerMode(4, false)).toBe("pan");
    expect(pointerMode(1, false)).toBe("tool");
    expect(pointerMode(0, false)).toBe("idle");
  });
});

describe("Zeichnen", () => {
  const snap = { enabled: true, radiusM: 0.5 };

  it("rastet auf den rechten Winkel zur vorigen Kante", () => {
    const result = snapDraft([[0, 0], [10, 0]], [10.4, 6], snap);
    expect(result.rightAngle).toBe(true);
    expect(result.point[0]).toBeCloseTo(10, 9);
    expect(result.point[1]).toBeCloseTo(6, 9);
    expect(snapDraft([[0, 0], [10, 0]], [13, 6], snap).rightAngle).toBe(false);
  });

  it("rastet in die Flucht des ersten Punkts, damit das Rechteck sauber schließt", () => {
    const result = snapDraft([[0, 0], [10, 0], [10, 6]], [0.3, 6.2], snap);
    expect(result.aligned).toBe(true);
    expect(result.point[0]).toBeCloseTo(0, 9);
    expect(result.point[1]).toBeCloseTo(6, 9);
  });

  it("schließt auf dem ersten Punkt, ohne Snap bleibt der Punkt frei", () => {
    const points: XY[] = [[0, 0], [10, 0], [10, 6], [0, 6]];
    expect(snapDraft(points, [0.2, 0.3], snap).closes).toBe(true);
    expect(snapDraft([[0, 0], [10, 0]], [10.4, 6], { enabled: false, radiusM: 0.5 }).point).toEqual([10.4, 6]);
  });

  it("Kante schieben vergrößert das Rechteck nach außen", () => {
    const pushed = pushEdge(rect, 0, 1);
    expect(pushed[0]).toEqual([-6, -5]);
    expect(pushed[1]).toEqual([6, -5]);
    expect(polygonArea(pushed)).toBeCloseTo(12 * 9, 9);
  });
});

import { parseRoofGeometry } from "@/lib/roof/parse";
import { toLocal, type LngLat } from "@/lib/roof/geo";
import type { RoofFaceInput } from "@/lib/pvgis/types";
import { AERIAL_SIZE_M, aerialSources } from "@/lib/roof3d/aerial";
import { buildingsFromFaces, facesFromBuildings, resetFaces } from "@/lib/roof3d/faces";
import { moveOutline } from "@/lib/roof3d/draw";

describe("Dachflächen fürs Angebot", () => {
  const origin: LngLat = [6.8921, 51.0912];
  const spec = { ...newBuilding("haus", rect), pitchDeg: [35, 30, 25, 30] };
  const legacy: RoofFaceInput = {
    id: "alt-1",
    name: "Garage",
    kwp: 2.4,
    tiltDeg: 10,
    azimuthDeg: 200,
    mounting: "gebaeude",
    lossesPercent: 14,
    geometry: null,
  };

  it("erzeugt je Dachseite eine Fläche mit Neigung und Ausrichtung und lässt fremde Flächen stehen", () => {
    const faces = facesFromBuildings([spec], origin, [legacy], "v1");
    expect(faces.map((face) => face.id)).toEqual(["v1:haus:0", "v1:haus:2", "alt-1"]);
    expect(faces.map((face) => face.name)).toEqual(["Dach Süd", "Dach Nord", "Garage"]);
    expect([faces[0].tiltDeg, faces[0].azimuthDeg, faces[0].kwp]).toEqual([35, 180, 0]);
    expect([faces[1].tiltDeg, faces[1].azimuthDeg]).toEqual([25, 0]);
    expect(faces[0].geometry?.building?.edge).toBe(0);
    expect(faces[2]).toBe(legacy);
    const corner = toLocal(faces[0].geometry!.ring[0], origin);
    expect(Math.hypot(corner[0], corner[1])).toBeLessThan(12);
  });

  it("übersteht Speichern und Laden: aus den Flächen wird wieder dasselbe Gebäude", () => {
    const faces = facesFromBuildings([spec], origin, [], "v1").map((face) => ({ ...face, geometry: parseRoofGeometry(JSON.parse(JSON.stringify(face.geometry))) }));
    const [loaded] = buildingsFromFaces(faces, origin);
    expect(loaded.roofType).toBe("sattel");
    expect(loaded.pitchDeg).toEqual([35, 30, 25, 30]);
    expect([loaded.wallHeightM, loaded.overhangM, loaded.ridgeSwap]).toEqual([3, 0.2, false]);
    loaded.outline.forEach((point, index) => {
      expect(point[0]).toBeCloseTo(rect[index][0], 5);
      expect(point[1]).toBeCloseTo(rect[index][1], 5);
    });
    expect(buildingsFromFaces([legacy], origin)).toEqual([]);
  });

  it("behält eigenen Namen und von Hand eingetragene Leistung, auch wenn das Dach umgeplant wird", () => {
    const first = facesFromBuildings([spec], origin, [], "v1");
    expect(first.map((face) => face.name)).toEqual(["Dach Süd", "Dach Nord"]);
    const planned = first.map((face, index) => ({ ...face, kwp: index === 0 ? 8.8 : 3, name: index === 0 ? "Südseite groß" : face.name }));
    const steeper = facesFromBuildings([{ ...spec, wallHeightM: 4.5 }], origin, planned, "v1");
    expect([steeper[0].name, steeper[0].kwp]).toEqual(["Südseite groß", 8.8]);
    const moved = facesFromBuildings([{ ...spec, outline: moveOutline(spec.outline, [2, 0]) }], origin, planned, "v1");
    expect(moved.map((face) => [face.id, face.name, face.kwp])).toEqual([["v1:haus:0", "Südseite groß", 8.8], ["v1:haus:2", "Dach Nord", 3]]);
    expect(resetFaces(planned, moved)).toEqual([]);
    /* Namen, die die Planung vergeben hat, gehen mit dem Dach mit. */
    const flat = facesFromBuildings([{ ...spec, roofType: "flach" }], origin, planned, "v1");
    expect(flat.map((face) => [face.name, face.kwp])).toEqual([["Südseite groß", 8.8]]);
    expect(resetFaces(planned, flat).map((face) => face.id)).toEqual(["v1:haus:2"]);
    const two = facesFromBuildings([spec, newBuilding("garage", moveOutline(rect, [30, 0]))], origin, planned, "v1");
    expect(two.map((face) => face.name)).toEqual(["Südseite groß", "Dach 1 Nord", "Dach 2 Süd", "Dach 2 Nord"]);
  });

  it("kopierte Variante: Flächen behalten ihre eigene Kennung, neue Flächen bekommen die der Variante", () => {
    const original = facesFromBuildings([spec], origin, [], "v1").map((face) => ({ ...face, kwp: 5 }));
    const copied = original.map((face, index) => ({ ...face, id: `kopie-${index}` }));
    const again = facesFromBuildings([spec], origin, copied, "v2");
    expect(again.map((face) => [face.id, face.kwp])).toEqual([["kopie-0", 5], ["kopie-1", 5]]);
    const hipped = facesFromBuildings([{ ...spec, roofType: "walm" }], origin, copied, "v2");
    expect(hipped.map((face) => face.id)).toEqual(["kopie-0", "v2:haus:1", "kopie-1", "v2:haus:3"]);
    const ids = [...original, ...hipped].map((face) => face.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("verwirft ein beschädigtes Gebäude, ohne die Fläche zu verlieren", () => {
    const [face] = facesFromBuildings([spec], origin, [], "v1");
    const broken = parseRoofGeometry({ ...face.geometry, building: { ...face.geometry!.building, edge: 9 } });
    expect(broken?.ring.length).toBeGreaterThanOrEqual(3);
    expect(broken?.building).toBeUndefined();
  });

  it("mehrere Gebäude und Flachdach bekommen eigene Namen", () => {
    const flat = { ...newBuilding("halle", moveOutline(rect, [30, 0])), roofType: "flach" as const };
    const faces = facesFromBuildings([spec, flat], origin, [], "v1");
    expect(faces.map((face) => face.name)).toEqual(["Dach 1 Süd", "Dach 1 Nord", "Dach 2 flach"]);
    expect(faces[2].tiltDeg).toBe(0);
  });
});

describe("Luftbild", () => {
  it("fragt in NRW zuerst das Orthofoto an, mit Breite vor Länge und 160 m Kantenlänge", () => {
    const sources = aerialSources([6.8921, 51.0912]);
    expect(sources.map((source) => source.provider)).toEqual(["nrw", "esri"]);
    const url = new URL(sources[0].url);
    const [south, west, north, east] = url.searchParams.get("BBOX")!.split(",").map(Number);
    expect(south).toBeLessThan(51.0912);
    expect(north).toBeGreaterThan(51.0912);
    expect((north - south) * 111_320).toBeCloseTo(AERIAL_SIZE_M, 1);
    expect((east - west) * 111_320 * Math.cos((51.0912 * Math.PI) / 180)).toBeCloseTo(AERIAL_SIZE_M, 1);
    expect(url.searchParams.get("CRS")).toBe("EPSG:4326");
    const esri = new URL(sources[1].url);
    expect(esri.pathname.endsWith("/MapServer/export")).toBe(true);
    expect(esri.searchParams.get("bbox")!.split(",").map(Number)[0]).toBeCloseTo(west, 6);
  });

  it("nimmt außerhalb von NRW nur das Weltluftbild", () => {
    expect(aerialSources([11.57, 48.14]).map((source) => source.provider)).toEqual(["esri"]);
  });
});

import { pointInPolygon } from "@/lib/roof/geo";
import { centroidLngLat, moduleCornersAt, toLngLat } from "@/lib/roof/geo";
import { buildScene } from "@/lib/roof/scene";
import { cellAt, emptyPlan, faceFrame, heightOnFace, layoutFace, moveObstacle, newObstacle, obstacleRing, planTotals, setCells, syncPlans, updatePlan, withOutline } from "@/lib/roof3d/plans";

describe("Aufbauten und Modulraster", () => {
  const placement = { catalogItemId: "k1", powerWp: 450, widthM: 1.134, heightM: 1.762, portrait: true, setbackM: 0.3, gapM: 0.02 };
  const house = building();
  const south = buildRoof(house).faces[0];
  const frame = faceFrame(house, south);
  const withModules = updatePlan(house, 0, (plan) => ({ ...plan, placement }));

  it("rastert auf der Dachebene: bei 30° passen zwei Reihen hochkant, im Grundriss wäre es nur eine", () => {
    const cells = layoutFace(frame, south, { obstacles: [], placement });
    expect(cells).toHaveLength(18);
    expect(cells.every((cell) => !cell.active)).toBe(true);
    const first = cells[0].corners;
    expect(Math.hypot(first[1][0] - first[0][0], first[1][1] - first[0][1])).toBeCloseTo(1.134, 6);
    expect(Math.hypot(first[3][0] - first[0][0], first[3][1] - first[0][1])).toBeCloseTo(1.762 * Math.cos(30 * DEG), 6);
    expect(first[0][1]).toBeCloseTo(-4 + 0.3 * Math.cos(30 * DEG), 6);
    const xs = cells.flatMap((cell) => cell.corners.map((corner) => corner[0]));
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 6);
  });

  it("Querformat und Flachdach", () => {
    expect(layoutFace(frame, south, { obstacles: [], placement: { ...placement, portrait: false } })).toHaveLength(18);
    const flat = building({ roofType: "flach" });
    const face = buildRoof(flat).faces[0];
    expect(layoutFace(faceFrame(flat, face), face, { obstacles: [], placement })).toHaveLength(9 * 4);
  });

  it("lässt Plätze unter einem Kamin frei und hält den zusätzlichen Abstand", () => {
    const chimney = newObstacle("k", "kamin", [0, -2]);
    const free = layoutFace(frame, south, { obstacles: [chimney], placement });
    expect(free.length).toBeLessThan(18);
    expect(free.some((cell) => pointInPolygon([0, -2], cell.corners))).toBe(false);
    const wide = layoutFace(frame, south, { obstacles: [{ ...chimney, marginM: 1 }], placement });
    expect(wide.length).toBeLessThan(free.length);
    const ring = obstacleRing(frame, chimney);
    expect(Math.hypot(ring[1][0] - ring[0][0], ring[1][1] - ring[0][1])).toBeCloseTo(0.6, 6);
    expect(Math.hypot(ring[3][0] - ring[0][0], ring[3][1] - ring[0][1])).toBeCloseTo(0.6 * Math.cos(30 * DEG), 6);
    expect(heightOnFace(frame, [0, -4])).toBeCloseTo(3, 6);
    expect(heightOnFace(frame, [0, 0])).toBeCloseTo(3 + 4 * Math.tan(30 * DEG), 6);
  });

  it("belegt Plätze, zählt Leistung und rührt unveränderte Flächen nicht an", () => {
    expect(withModules.plans?.[0].modules).toHaveLength(18);
    const some = setCells(withModules, 0, [0, 1, 2], true);
    expect(planTotals([some])).toEqual({ modules: 3, kwp: 1.35 });
    expect(planTotals([setCells(some, 0, "all", true)])).toEqual({ modules: 18, kwp: 8.1 });
    expect(syncPlans(some).plans).toBe(some.plans);
    const cell = some.plans![0].modules[4];
    expect(cellAt(some.plans![0], [(cell.corners[0][0] + cell.corners[2][0]) / 2, (cell.corners[0][1] + cell.corners[2][1]) / 2])).toBe(4);
    expect(cellAt(some.plans![0], [50, 50])).toBe(-1);
  });

  it("rastert neu, wenn sich etwas ändert, und behält belegte Plätze, die es weiter gibt", () => {
    const full = setCells(withModules, 0, "all", true);
    const blocked = updatePlan(full, 0, (plan) => ({ ...plan, obstacles: [newObstacle("k", "kamin", [0, -2])] }));
    const left = blocked.plans![0].modules;
    expect(left.length).toBeLessThan(18);
    expect(left.every((cell) => cell.active)).toBe(true);
    /* Hochkant voll belegt, dann quer und wieder hochkant: Die Fläche bleibt voll. Eine halb belegte bleibt etwa halb. */
    const turn = (spec: typeof full, portrait: boolean) => updatePlan(spec, 0, (plan) => ({ ...plan, placement: { ...placement, portrait } }));
    const across = turn(full, false);
    expect(across.plans![0].modules.filter((cell) => cell.active)).toHaveLength(across.plans![0].modules.length);
    expect(turn(across, true).plans![0].modules.every((cell) => cell.active)).toBe(true);
    const half = turn(setCells(withModules, 0, [0, 1, 2, 3, 4, 5, 6, 7, 8], true), false).plans![0].modules.filter((cell) => cell.active).length;
    expect(half).toBeGreaterThan(5);
    expect(half).toBeLessThan(13);
    const steeper = syncPlans({ ...full, pitchDeg: [45, 30, 45, 30] });
    expect(steeper.plans![0].layoutKey).not.toBe(full.plans![0].layoutKey);
    const hipped = syncPlans({ ...full, roofType: "walm" });
    expect(Object.keys(hipped.plans ?? {})).toEqual(["0"]);
    const turned = syncPlans({ ...full, ridgeSwap: true });
    expect(Object.keys(turned.plans ?? {})).toEqual([]);
  });

  it("speichert Module und Aufbauten in die Felder der Dachfläche und lädt sie unverändert zurück", () => {
    const origin: LngLat = [6.8921, 51.0912];
    const planned = updatePlan(setCells(withModules, 0, [0, 1, 2, 3, 4], true), 2, () => ({ ...emptyPlan(), obstacles: [{ ...newObstacle("f", "fenster", [1, 2]), marginM: 0.2 }] }));
    const faces = facesFromBuildings([planned], origin, [], "v1").map((face) => ({ ...face, geometry: parseRoofGeometry(JSON.parse(JSON.stringify(face.geometry))) }));
    const [southFace, northFace] = faces;
    expect(southFace.kwp).toBeCloseTo(5 * 0.45, 6);
    expect(southFace.geometry?.modules.filter((panel) => panel.active)).toHaveLength(5);
    expect(southFace.geometry?.placement?.catalogItemId).toBe("k1");
    expect(northFace.kwp).toBe(0);
    expect(northFace.geometry?.obstacles[0]).toMatchObject({ id: "f", kind: "fenster", marginM: 0.2, heightM: 0 });
    /* Lesart der übrigen Programmteile: Ecke plus Schwerpunkt der Fläche ergibt den Ort. */
    const ring = southFace.geometry!.ring;
    const corner = toLngLat(southFace.geometry!.modules[0].corners[0], centroidLngLat(ring));
    expect(pointInPolygon(corner, ring)).toBe(true);

    const [loaded] = buildingsFromFaces(faces, origin);
    expect(loaded.plans?.[0].modules.filter((cell) => cell.active)).toHaveLength(5);
    expect(syncPlans(loaded).plans).toBe(loaded.plans);
    const window = loaded.plans![2].obstacles[0];
    expect([window.kind, window.marginM, window.shape]).toEqual(["fenster", 0.2, undefined]);
    expect(window.widthM).toBeCloseTo(0.78, 4);
    expect(window.lengthM).toBeCloseTo(1.18, 4);
    const again = facesFromBuildings([loaded], origin, faces, "v1");
    expect(again[0].kwp).toBeCloseTo(southFace.kwp, 6);
    expect(again[0].geometry?.modules[0].corners[0][0]).toBeCloseTo(southFace.geometry!.modules[0].corners[0][0], 4);
  });

  it("Leistung je Fläche: Belegung zählt, sobald ein Modul gewählt ist; ohne Modul bleibt die Handeingabe", () => {
    const origin: LngLat = [6.8921, 51.0912];
    const manual = facesFromBuildings([house], origin, [], "v1").map((face) => ({ ...face, kwp: 4 }));
    /* Nur ein Kamin auf der Südseite: Die Handeingabe bleibt. */
    const chimney = updatePlan(house, 0, (plan) => ({ ...plan, obstacles: [newObstacle("k", "kamin", [0, -2])] }));
    expect(facesFromBuildings([chimney], origin, manual, "v1").map((face) => face.kwp)).toEqual([4, 4]);
    /* Raster angelegt, noch nichts belegt: Die Fläche zählt mit 0, die andere bleibt. */
    expect(facesFromBuildings([withModules], origin, manual, "v1").map((face) => face.kwp)).toEqual([0, 4]);
    const some = setCells(withModules, 0, [0, 1, 2], true);
    const filled = facesFromBuildings([some], origin, manual, "v1");
    expect(filled.map((face) => face.kwp)).toEqual([1.35, 4]);
    expect(resetFaces(manual, filled)).toEqual([]);
    /* Modul wieder herausgenommen: Die Leistung kam aus der Belegung, also ist die Fläche leer. Kein Hinweis, das war Absicht. */
    const [loaded] = buildingsFromFaces(filled, origin);
    const cleared = facesFromBuildings([updatePlan(loaded, 0, (plan) => ({ ...plan, placement: null }))], origin, filled, "v1");
    expect(cleared.map((face) => [face.kwp, face.geometry?.modules.length])).toEqual([[0, 0], [4, 0]]);
    expect(resetFaces(filled, cleared)).toEqual([]);
    /* Gebäude verschoben: Module und Aufbauten wandern mit, die Handeingabe der Nordseite bleibt. */
    const shifted = withOutline(updatePlan(loaded, 0, (plan) => ({ ...plan, obstacles: [newObstacle("s", "sperrzone", [-3.5, -1])] })), moveOutline(loaded.outline, [3, 0.5]));
    expect(shifted.plans![0].obstacles[0].center).toEqual([-0.5, -0.5]);
    expect(shifted.plans![0].modules.filter((cell) => cell.active)).toHaveLength(3);
    const moved = facesFromBuildings([shifted], origin, filled, "v1");
    expect(moved.map((face) => face.kwp)).toEqual([1.35, 4]);
    expect(resetFaces(filled, moved)).toEqual([]);
    /* Eine Seite verschoben: Der Aufbau bleibt, wo er auf dem Luftbild liegt. */
    const pushed = withOutline(shifted, pushEdge(shifted.outline, 1, 1));
    expect(pushed.plans![0].obstacles[0].center).toEqual([-0.5, -0.5]);
  });

  it("ein Aufbau, der über den First gezogen wird, wechselt die Dachseite und gibt seine Plätze frei", () => {
    const blocked = updatePlan(setCells(withModules, 0, "all", true), 0, (plan) => ({ ...plan, obstacles: [newObstacle("k", "kamin", [0, -2])] }));
    expect(blocked.plans![0].modules.length).toBeLessThan(18);
    const same = moveObstacle(blocked, 0, "k", [1, -2.5]);
    expect([same.edge, same.spec.plans![0].obstacles[0].center]).toEqual([0, [1, -2.5]]);
    const over = moveObstacle(blocked, 0, "k", [0, 2]);
    expect(over.edge).toBe(2);
    expect(over.spec.plans![0].obstacles).toEqual([]);
    expect(over.spec.plans![0].modules).toHaveLength(18);
    expect(over.spec.plans![0].modules.every((cell) => cell.active)).toBe(true);
    expect(over.spec.plans![2].obstacles.map((entry) => [entry.id, entry.center])).toEqual([["k", [0, 2]]]);
    /* Neben das Dach gezogen bleibt er bei seiner Seite. */
    expect(moveObstacle(blocked, 0, "k", [40, 40]).edge).toBe(0);
    expect(moveObstacle(blocked, 0, "gibt-es-nicht", [0, 0]).spec).toBe(blocked);
  });

  it("Zeichnungen mit mehreren Flächen: Module liegen auf ihrer eigenen Dachseite, nicht alle in der Mitte", () => {
    const origin: LngLat = [6.8921, 51.0912];
    const both = setCells(updatePlan(setCells(withModules, 0, "all", true), 2, (plan) => ({ ...plan, placement })), 2, "all", true);
    const faces = facesFromBuildings([both], origin, [], "v1");
    const shared = centroidLngLat(faces.flatMap((face) => face.geometry!.ring));
    for (const face of faces) {
      const ring = face.geometry!.ring.map((point) => toLocal(point, shared));
      for (const panel of face.geometry!.modules) {
        for (const corner of moduleCornersAt(face.geometry!.ring, panel.corners, shared)) expect(pointInPolygon(corner, ring)).toBe(true);
      }
    }
    /* Die Südseite liegt südlich der Mitte, die Nordseite nördlich. In der alten 3D-Vorschau ist Nord die z-Achse. */
    const scene = buildScene(faces);
    const norths = scene.modules.map((triangles) => triangles[2]);
    expect(norths.filter((value) => value < 0)).toHaveLength(18);
    expect(norths.filter((value) => value > 0)).toHaveLength(18);
  });

  it("behält die freie Form eines Hindernisses aus der alten Dachplanung", () => {
    const origin: LngLat = [6.8921, 51.0912];
    const [face] = facesFromBuildings([house], origin, [], "v1");
    const triangle = [[1, -3], [2, -3], [1.5, -2]].map((point) => toLngLat(point as XY, origin));
    const old = { ...face, geometry: { ...face.geometry!, obstacles: [{ id: "alt", ring: triangle, heightM: 1.5 }] } };
    const [loaded] = buildingsFromFaces([old], origin);
    const kept = loaded.plans![0].obstacles[0];
    expect(kept.shape).toHaveLength(3);
    const saved = facesFromBuildings([loaded], origin, [old], "v1")[0].geometry!.obstacles[0];
    saved.ring.forEach((point, index) => {
      expect(point[0]).toBeCloseTo(triangle[index][0], 7);
      expect(point[1]).toBeCloseTo(triangle[index][1], 7);
    });
  });
});
