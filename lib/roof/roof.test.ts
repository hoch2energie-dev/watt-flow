import path from "node:path";
import { describe, expect, it } from "vitest";
import { drawRoofPlan } from "@/lib/pdf/roof-plan";
import { azimuthFromRing, heightOnPlane, toLngLat, vertexHeights, type LngLat, type XY } from "@/lib/roof/geo";
import { parseHorizon } from "@/lib/roof/horizon";
import { layoutModules } from "@/lib/roof/layout";
import { roofsFromCityJson } from "@/lib/roof/lod2";
import { parseRoofGeometry } from "@/lib/roof/parse";
import { buildScene } from "@/lib/roof/scene";
import { applyShading, combinedLosses, horizonLossPercent, obstacleLossPercent } from "@/lib/roof/shading";
import { syncModuleLines } from "@/lib/roof/sync";
import { blankGeometry } from "@/lib/roof/types";
import type { RoofFaceInput } from "@/lib/pvgis/types";
import type { CatalogOption, LineDTO } from "@/lib/domain";

const origin: LngLat = [7, 51];

function ring(points: XY[]): LngLat[] {
  return points.map((point) => toLngLat(point, origin));
}

describe("Azimut aus der gezeichneten Kante", () => {
  it("schaut bei einem breiten Rechteck nach Süden", () => {
    const azimuth = azimuthFromRing(ring([[-6, -2], [6, -2], [6, 2], [-6, 2]]));
    expect(azimuth).toBeCloseTo(180, 0);
  });

  it("nimmt bei einem Nord-Süd-Rechteck die östliche der beiden Traufrichtungen", () => {
    const azimuth = azimuthFromRing(ring([[-2, -6], [2, -6], [2, 6], [-2, 6]]));
    expect(azimuth).toBeCloseTo(90, 0);
  });

  it("dreht ein Dreieck über der Basis nach Süden", () => {
    const azimuth = azimuthFromRing(ring([[0, 0], [10, 0], [5, 6]]));
    expect(azimuth).toBeCloseTo(180, 0);
  });
});

describe("Modulbelegung", () => {
  const polygon: XY[] = [[-5, -3], [5, -3], [5, 3], [-5, 3]];

  it("füllt ein Rechteck ohne Rand lückenlos", () => {
    const modules = layoutModules({
      polygon,
      obstacles: [],
      azimuthDeg: 180,
      moduleWidthM: 1,
      moduleHeightM: 1,
      portrait: true,
      setbackM: 0,
      gapM: 0,
    });
    expect(modules).toHaveLength(60);
    expect(modules.every((module) => module.active)).toBe(true);
  });

  it("hält den Randabstand ein", () => {
    const modules = layoutModules({
      polygon,
      obstacles: [],
      azimuthDeg: 180,
      moduleWidthM: 1,
      moduleHeightM: 1,
      portrait: true,
      setbackM: 0.5,
      gapM: 0,
    });
    expect(modules).toHaveLength(45);
  });

  it("lässt Module auf einem Hindernis weg", () => {
    const modules = layoutModules({
      polygon,
      obstacles: [[[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]],
      azimuthDeg: 180,
      moduleWidthM: 1,
      moduleHeightM: 1,
      portrait: true,
      setbackM: 0,
      gapM: 0,
    });
    expect(modules.length).toBeLessThan(60);
    expect(modules.length).toBe(56);
  });
});

describe("Verschattung", () => {
  it("rechnet Hindernis und Horizont als Aufschlag auf die 14 Prozent", () => {
    const polygon: XY[] = [[-5, -3], [5, -3], [5, 3], [-5, 3]];
    const obstacle = obstacleLossPercent(polygon, [{ ring: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], heightM: 2 }]);
    expect(obstacle).toBe(3.1);
    const horizon = horizonLossPercent(
      [
        { azimuthDeg: 160, heightDeg: 20 },
        { azimuthDeg: 180, heightDeg: 20 },
        { azimuthDeg: 200, heightDeg: 20 },
      ],
      180,
    );
    expect(horizon).toBe(6.8);
    expect(horizonLossPercent([{ azimuthDeg: 180, heightDeg: 0.4 }], 180)).toBe(0);
    expect(combinedLosses(14, obstacle, horizon)).toBe(23.9);
    expect(combinedLosses(14, 20, 20)).toBe(40);
  });

  it("setzt den Verlust neu und stapelt ihn nicht bei einem zweiten Lauf", () => {
    const face: RoofFaceInput = {
      id: "sued",
      name: "Süd",
      kwp: 4,
      tiltDeg: 30,
      azimuthDeg: 180,
      mounting: "gebaeude",
      lossesPercent: 14,
      geometry: {
        ...blankGeometry(ring([[-5, -3], [5, -3], [5, 3], [-5, 3]])),
        obstacles: [{ id: "kamin", ring: ring([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]), heightM: 2 }],
      },
    };
    const horizon = [{ azimuthDeg: 180, heightDeg: 20 }];
    const once = applyShading(face, horizon);
    const twice = applyShading(once, horizon);
    expect(once.lossesPercent).toBe(twice.lossesPercent);
    expect(once.lossesPercent).toBeGreaterThan(14);
    expect(once.geometry?.shading.systemLossPercent).toBe(14);
  });
});

describe("PVGIS-Horizont und LoD2", () => {
  it("liest das Horizontprofil ab Nord im Uhrzeigersinn", () => {
    const samples = parseHorizon({ outputs: { horizon_profile: Array.from({ length: 8 }, (_, index) => ({ A: -180 + index * 45, H_hor: index === 4 ? 5 : 0.2 })) } });
    expect(samples?.[0].azimuthDeg).toBeCloseTo(0, 5);
    expect(samples?.[4].azimuthDeg).toBeCloseTo(180, 5);
    expect(samples?.[4].heightDeg).toBe(5);
  });

  it("übernimmt nur ein Gebäude, das an der Adresse liegt", () => {
    const south: [number, number, number][] = [
      [...toLngLat([0, 0], origin), 0],
      [...toLngLat([10, 0], origin), 0],
      [...toLngLat([10, 4], origin), 2],
      [...toLngLat([0, 4], origin), 2],
    ];
    const payload = city(south);
    const near = roofsFromCityJson(payload, toLngLat([5, 2], origin));
    expect(near.roofs).toHaveLength(1);
    expect(near.roofs[0].azimuthDeg).toBeCloseTo(180, 0);
    expect(near.roofs[0].tiltDeg).toBeCloseTo(26.6, 0);
    const far = roofsFromCityJson(payload, [6.89, 51.09]);
    expect(far.roofs).toHaveLength(0);
    expect(far.notice).toMatch(/kein Gebäude/);
  });
});

describe("Rückgabe in die Variante", () => {
  it("setzt die Modulstückzahl auf die belegten Module", () => {
    const item: CatalogOption = {
      id: "mod",
      typeKey: "pv_module",
      manufacturer: "Nordlicht",
      model: "NM-440",
      name: "Nordlicht NM-440",
      unit: "Stk",
      purchasePriceNet: 100,
      salesPriceNet: 180,
      vatCategory: "PV_NULL",
      specs: { powerWp: 440, widthMm: 1134, heightMm: 1762 },
      description: null,
      active: true,
    };
    const line: LineDTO = {
      id: "line",
      catalogItemId: "alt",
      typeKey: "pv_module",
      section: "module",
      name: "Alt",
      description: null,
      quantity: 2,
      unit: "Stk",
      unitPriceNet: 10,
      purchasePriceNet: 8,
      discountPercent: 0,
      vatCategory: "PV_NULL",
      specs: { powerWp: 400 },
      sortOrder: 0,
    };
    const face: RoofFaceInput = {
      id: "f",
      name: "Süd",
      kwp: 1.32,
      tiltDeg: 30,
      azimuthDeg: 180,
      mounting: "gebaeude",
      lossesPercent: 14,
      geometry: {
        ...blankGeometry([[7, 51], [7.001, 51], [7.001, 51.001]]),
        placement: { catalogItemId: "mod", powerWp: 440, widthM: 1.134, heightM: 1.762, portrait: true, setbackM: 0.3, gapM: 0.02 },
        modules: [
          { corners: [[0, 0], [1, 0], [1, 1], [0, 1]], active: true },
          { corners: [[1, 0], [2, 0], [2, 1], [1, 1]], active: true },
          { corners: [[2, 0], [3, 0], [3, 1], [2, 1]], active: false },
        ],
      },
    };
    const lines = syncModuleLines([line], [face], [item]);
    expect(lines[0].quantity).toBe(2);
    expect(lines[0].catalogItemId).toBe("mod");
    expect(lines[0].specs.powerWp).toBe(440);
    expect(lines[0].unitPriceNet).toBe(180);
  });

  it("behält eine gültige Geometrie und verwirft eine andere Fassung", () => {
    const parsed = parseRoofGeometry({
      version: 1,
      ring: [[6.89, 51.09], [6.891, 51.09], [6.891, 51.091]],
      obstacles: [],
      placement: null,
      modules: [],
      shading: { systemLossPercent: 14, obstacleLossPercent: 0, horizonLossPercent: 0 },
    });
    expect(parsed?.ring).toHaveLength(3);
    expect(parseRoofGeometry({ version: 2, ring: [[0, 0], [1, 0], [1, 1]] })).toBeNull();
  });

  it("hebt die Nordkante einer Süddachfläche an", () => {
    const local: XY[] = [[-5, -2], [5, -2], [5, 2], [-5, 2]];
    const heights = vertexHeights(local, 180, 30);
    expect(heights[0]).toBeCloseTo(0, 2);
    expect(heights[2]).toBeCloseTo(4 * Math.tan(Math.PI / 6), 2);
    expect(heightOnPlane(local, 180, 30, [0, 0])).toBeGreaterThan(0);
    const face: RoofFaceInput = {
      id: "f",
      name: "Süd",
      kwp: 1,
      tiltDeg: 30,
      azimuthDeg: 180,
      mounting: "gebaeude",
      lossesPercent: 14,
      geometry: blankGeometry(ring(local)),
    };
    const scene = buildScene([face]);
    expect(scene.roofs[0]?.length).toBeGreaterThan(0);
    expect(scene.walls[0]?.length).toBeGreaterThan(0);
  });

  it("schreibt die Dachbelegung in ein PDF", async () => {
    const PDFDocument = (await import("pdfkit")).default;
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    doc.registerFont("Regular", path.join(process.cwd(), "assets/fonts/NotoSans-Regular.ttf"));
    doc.registerFont("Bold", path.join(process.cwd(), "assets/fonts/NotoSans-Bold.ttf"));
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
    const planned: RoofFaceInput = {
      id: "f",
      name: "Süd",
      kwp: 0.44,
      tiltDeg: 30,
      azimuthDeg: 180,
      mounting: "gebaeude",
      lossesPercent: 17.1,
      geometry: {
        ...blankGeometry(ring([[-4, -3], [4, -3], [4, 3], [-4, 3]])),
        shading: { systemLossPercent: 14, obstacleLossPercent: 3.1, horizonLossPercent: 0 },
        modules: [{ corners: [[-1, -1], [1, -1], [1, 1], [-1, 1]], active: true }],
      },
    };
    drawRoofPlan(doc, [planned], { brand: "#1e5c42", ink: "#1c2622", muted: "#5c6b64", accent: "#c65b2e" });
    doc.end();
    const buffer = await done;
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

function city(vertices: [number, number, number][]) {
  return {
    type: "CityJSON",
    version: "1.1",
    transform: { scale: [1, 1, 1], translate: [0, 0, 0] },
    vertices,
    CityObjects: {
      haus: {
        type: "Building",
        geometry: [
          {
            type: "Solid",
            boundaries: [[[ [0, 1, 2, 3] ], [ [0, 1, 2] ]]],
            semantics: {
              surfaces: [{ type: "RoofSurface" }, { type: "WallSurface" }],
              values: [[0, 1]],
            },
          },
        ],
      },
    },
  };
}
