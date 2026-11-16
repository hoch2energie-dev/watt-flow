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
