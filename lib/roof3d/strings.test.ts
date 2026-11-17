import { describe, expect, it } from "vitest";
import type { XY } from "@/lib/roof/geo";
import { parseRoofGeometry } from "@/lib/roof/parse";
import { newBuilding, type BuildingSpec } from "@/lib/roof3d/building";
import { buildingsFromFaces, facesFromBuildings } from "@/lib/roof3d/faces";
import { newObstacle, setCells, updatePlan, withOutline } from "@/lib/roof3d/plans";
import {
  NO_WIRING,
  assignCells,
  autoAssign,
  autoString,
  checkWiring,
  clearString,
  inverterElectricalOf,
  membership,
  moduleElectricalOf,
  modulesPerString,
  newString,
  nextStringName,
  parsePlanning,
  releaseCells,
  removeString,
  tidyWiring,
  voltageAt,
  type InverterElectrical,
  type ModuleElectrical,
  type Wiring,
} from "@/lib/roof3d/strings";

/** 12 m × 8 m, Satteldach 30°. Auf Süd (Kante 0) und Nord (Kante 2) liegen je 18 Module in zwei Reihen zu neun. */
const rect: XY[] = [[-6, -4], [6, -4], [6, 4], [-6, 4]];
const placement = { catalogItemId: "k1", powerWp: 450, widthM: 1.134, heightM: 1.762, portrait: true, setbackM: 0.3, gapM: 0.02 };
function house(id = "b1"): BuildingSpec {
  let spec: BuildingSpec = { ...newBuilding(id, rect), overhangM: 0 };
  for (const edge of [0, 2]) spec = setCells(updatePlan(spec, edge, (plan) => ({ ...plan, placement })), edge, "all", true);
  return spec;
}
const south = { building: "b1", edge: 0 };
const north = { building: "b1", edge: 2 };
const wiring = (...names: string[]): Wiring => ({ inverters: [], strings: names.map((name, index) => ({ id: name.toLowerCase(), name, color: `#00000${index}`, inverter: null, tracker: null })) });
const orderOf = (spec: BuildingSpec, edge: number) => spec.plans?.[edge].modules.map((cell) => (cell.string ? `${cell.string}${cell.order}` : "-")) ?? [];
let counter = 0;
const id = () => `s${++counter}`;

const moduleData: ModuleElectrical = { vocV: 39.8, iscA: 14.3, vmppV: 33.2, imppA: 13.56, tempCoeffVocPct: 0.25 };
const inverterData: InverterElectrical = { name: "Wechselrichter 10 kW", acPowerKw: 10, trackers: 2, stringsPerTracker: 1, maxDcVoltageV: 1000, mppMinV: 180, mppMaxV: 850, maxInputCurrentA: 16, maxShortCircuitCurrentA: 22, maxDcPowerKw: 15 };
const moduleOf = (item: string | null) => (item === "k1" ? moduleData : null);
const inverterOf = (item: string) => (item === "k3" ? inverterData : null);
const texts = (report: ReturnType<typeof checkWiring>, level?: string) => report.findings.filter((entry) => !level || entry.level === level).map((entry) => entry.text);

describe("Strings: Module zuordnen", () => {
  it("hängt Module in der genannten Reihenfolge an und zählt beim nächsten Strich weiter", () => {
    const start = [house()];
    expect(membership(start).free).toHaveLength(36);
    const first = assignCells(start, south, [2, 1, 0], "a");
    expect(orderOf(first[0], 0).slice(0, 4)).toEqual(["a3", "a2", "a1", "-"]);
    const more = assignCells(first, south, [9, 10], "a");
    expect(membership(more).byString.get("a")).toEqual([2, 1, 0, 9, 10].map((index) => ({ ...south, index })));
    expect(membership(more).free).toHaveLength(31);
  });

  it("übergeht leere Plätze, vergebene Module und doppelte Nennungen", () => {
    const start = [setCells(house(), 0, [5], false)];
    const first = assignCells(start, south, [4, 5, 6, 6], "a");
    expect(membership(first).byString.get("a")?.map((ref) => ref.index)).toEqual([4, 6]);
    const second = assignCells(first, south, [6, 7], "b");
    expect(membership(second).byString.get("b")?.map((ref) => ref.index)).toEqual([7]);
    expect(assignCells(second, south, [4, 6, 7], "c")).toBe(second);
    expect(assignCells(second, { building: "fremd", edge: 0 }, [0], "c")).toBe(second);
  });

  it("ein String kann über beide Dachseiten laufen", () => {
    const both = assignCells(assignCells([house()], south, [0, 1], "a"), north, [0], "a");
    expect(membership(both).byString.get("a")).toEqual([{ ...south, index: 0 }, { ...south, index: 1 }, { ...north, index: 0 }]);
    expect(orderOf(both[0], 2)[0]).toBe("a3");
  });

  it("nimmt Module heraus und lässt die übrigen nachrücken", () => {
    const wired = assignCells([house()], south, [0, 1, 2, 3], "a");
    const less = releaseCells(wired, wiring("A"), south, [1, 2]);
    expect(orderOf(less[0], 0).slice(0, 5)).toEqual(["a1", "-", "-", "a2", "-"]);
  });

  it("ein geleerter Platz verliert seinen String, die Reihenfolge wird wieder lückenlos", () => {
    const wired = assignCells([house()], south, [0, 1, 2], "a");
    const emptied = [setCells(wired[0], 0, [1], false)];
    expect(emptied[0].plans?.[0].modules[1]).toEqual({ corners: wired[0].plans?.[0].modules[1].corners, active: false });
    const tidy = tidyWiring(emptied, wiring("A"));
    expect(orderOf(tidy.buildings[0], 0).slice(0, 3)).toEqual(["a1", "-", "a2"]);
  });

  it("räumt Module unbekannter Strings und Strings an gelöschten Wechselrichtern auf, sonst bleibt alles dasselbe Objekt", () => {
    const wired = assignCells([house()], south, [0, 1], "weg");
    const tidy = tidyWiring(wired, wiring("A"));
    expect(membership(tidy.buildings).free).toHaveLength(36);
    const clean = assignCells([house()], south, [0, 1], "a");
    const plan: Wiring = { inverters: [{ id: "w1", catalogItemId: "k3" }], strings: [{ ...wiring("A").strings[0], inverter: "w1", tracker: 1 }] };
    const same = tidyWiring(clean, plan);
    expect(same.buildings).toBe(clean);
    expect(same.wiring).toBe(plan);
    expect(tidyWiring(clean, { ...plan, inverters: [] }).wiring.strings[0]).toMatchObject({ inverter: null, tracker: null });
  });

  it("löscht und leert Strings, die Module bleiben liegen", () => {
    const wired = assignCells(assignCells([house()], south, [0, 1], "a"), south, [2], "b");
    const removed = removeString(wired, wiring("A", "B"), "a");
    expect(removed.wiring.strings.map((entry) => entry.name)).toEqual(["B"]);
    expect(orderOf(removed.buildings[0], 0).slice(0, 3)).toEqual(["-", "-", "b1"]);
    expect(removed.buildings[0].plans?.[0].modules.every((cell) => cell.active)).toBe(true);
    expect(membership(clearString(wired, "b")).byString.has("b")).toBe(false);
  });
});

describe("Strings: Dach ändert sich", () => {
  it("Module, die beim Neurastern an ihrem Platz bleiben, behalten String und Stelle", () => {
    const wired = assignCells([house()], south, [0, 1, 2, 9, 10], "a")[0];
    /* Ein Kamin mitten im Dach nimmt Plätze weg, die Module links unten bleiben, wo sie sind. */
    const chimney = updatePlan(wired, 0, (plan) => ({ ...plan, obstacles: [newObstacle("k", "kamin", [3, -2])] }));
    const cells = chimney.plans?.[0].modules ?? [];
    expect(cells.length).toBeLessThan(18);
    expect(cells.filter((cell) => cell.string === "a").map((cell) => cell.order).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(cells.every((cell) => cell.active)).toBe(true);
  });

  it("wandert mit, wenn das Gebäude verschoben wird", () => {
    const wired = assignCells([house()], south, [0, 1], "a")[0];
    const moved = withOutline(wired, rect.map((point): XY => [point[0] + 5, point[1] - 3]));
    expect(orderOf(moved, 0).slice(0, 3)).toEqual(["a1", "a2", "-"]);
    expect(moved.plans?.[0].modules[0].corners[0][0]).toBeCloseTo((wired.plans?.[0].modules[0].corners[0][0] ?? 0) + 5, 6);
  });

  it("übersteht Speichern und Laden über die Dachflächen des Angebots", () => {
    const wired = assignCells(assignCells([house()], south, [3, 2], "a"), north, [0], "a");
    const faces = facesFromBuildings(wired, [6.9583, 50.9413], [], "v1").map((face) => ({ ...face, geometry: parseRoofGeometry(JSON.parse(JSON.stringify(face.geometry))) }));
    expect(faces[0].geometry?.modules[3]).toMatchObject({ active: true, string: "a", order: 1 });
    expect(faces[0].geometry?.modules[0]).not.toHaveProperty("string");
    const back = buildingsFromFaces(faces, [6.9583, 50.9413]);
    expect(membership(back).byString.get("a")).toEqual([{ ...south, index: 3 }, { ...south, index: 2 }, { ...north, index: 0 }]);
  });

  it("die Eingabeprüfung lässt Zugehörigkeit nur an belegten Plätzen und mit sauberer Kennung zu", () => {
    const face = facesFromBuildings(assignCells([house()], south, [0], "a"), [6.9583, 50.9413], [], "v1")[0];
    const raw = JSON.parse(JSON.stringify(face.geometry));
    raw.modules[1] = { ...raw.modules[1], active: false, string: "a", order: 2 };
    raw.modules[2] = { ...raw.modules[2], string: "<script>", order: 3 };
    raw.modules[3] = { ...raw.modules[3], string: "a", order: -1 };
    const parsed = parseRoofGeometry(raw);
    expect(parsed?.modules.slice(0, 4).map((cell) => cell.string ?? null)).toEqual(["a", null, null, null]);
  });
});

describe("Strings: automatisch verstringen", () => {
  it("läuft in Schlangenlinie: untere Reihe von links nach rechts, die obere zurück", () => {
    const result = autoString([house()], NO_WIRING, south, 20, id);
    expect(result.created).toHaveLength(1);
    expect(result.wiring.strings[0]).toMatchObject({ name: "A", inverter: null });
    expect(membership(result.buildings).byString.get(result.created[0])?.map((ref) => ref.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 17, 16, 15, 14, 13, 12, 11, 10, 9]);
  });

  it("teilt in gleich lange Strings, wenn die Fläche mehr Module hat als in einen passen", () => {
    const two = autoString([house()], NO_WIRING, south, 10, id);
    expect(two.created.map((key) => membership(two.buildings).byString.get(key)?.length)).toEqual([9, 9]);
    expect(two.wiring.strings.map((entry) => entry.name)).toEqual(["A", "B"]);
    expect(new Set(two.wiring.strings.map((entry) => entry.color)).size).toBe(2);
    const three = autoString([house()], NO_WIRING, south, 7, id);
    expect(three.created.map((key) => membership(three.buildings).byString.get(key)?.length)).toEqual([6, 6, 6]);
    const uneven = autoString([setCells(house(), 0, [17], false)], NO_WIRING, south, 9, id);
    expect(uneven.created.map((key) => membership(uneven.buildings).byString.get(key)?.length)).toEqual([9, 8]);
  });

  it("nimmt nur freie Module und lässt vorhandene Strings stehen", () => {
    const started = assignCells([house()], south, [0, 1, 2], "a");
    const result = autoString(started, wiring("A"), south, 20, id);
    expect(result.wiring.strings.map((entry) => entry.name)).toEqual(["A", "B"]);
    expect(membership(result.buildings).byString.get("a")).toHaveLength(3);
    expect(membership(result.buildings).byString.get(result.created[0])?.[0].index).toBe(3);
    expect(membership(result.buildings).free).toHaveLength(18);
    expect(autoString(result.buildings, result.wiring, south, 20, id).created).toEqual([]);
  });

  it("vergibt Namen fortlaufend und freie Buchstaben wieder", () => {
    expect(nextStringName([])).toBe("A");
    expect(nextStringName(wiring("A", "C").strings)).toBe("B");
    expect(nextStringName(wiring(...Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index))).strings)).toBe("AA");
    expect(newString("x", wiring("A").strings)).toMatchObject({ id: "x", name: "B", inverter: null, tracker: null });
  });
});

describe("Strings: elektrische Kennwerte", () => {
  it("rechnet Spannungen auf −10 °C und 70 °C um, unabhängig vom Vorzeichen des Koeffizienten", () => {
    expect(voltageAt(39.8, 0.25, -10)).toBeCloseTo(43.2825, 4);
    expect(voltageAt(39.8, -0.25, -10)).toBeCloseTo(43.2825, 4);
    expect(voltageAt(33.2, 0.25, 70)).toBeCloseTo(29.465, 4);
    expect(voltageAt(40, 0.25, 25)).toBe(40);
  });

  it("nennt die Zahl der Module je String, die zum Wechselrichter passt", () => {
    expect(modulesPerString(moduleData, inverterData)).toEqual({ max: 23, min: 7 });
    expect(modulesPerString(null, inverterData)).toEqual({ max: null, min: null });
    expect(modulesPerString(moduleData, { ...inverterData, maxDcVoltageV: null })).toEqual({ max: null, min: 7 });
  });

  it("liest Datenblattwerte aus dem Katalog und meldet fehlende", () => {
    expect(moduleElectricalOf({ vocV: 39.8, iscA: 14.3, vmppV: 33.2, imppA: 13.56, tempCoeffVocPct: -0.25 })).toEqual(moduleData);
    expect(moduleElectricalOf({ vocV: "39,8", iscA: 14.3, vmppV: 33.2, imppA: 13.56, tempCoeffVocPct: 0.25 })).toEqual(moduleData);
    expect(moduleElectricalOf({ vocV: 39.8, iscA: 14.3, vmppV: 33.2, imppA: 13.56 })).toBeNull();
    expect(moduleElectricalOf({ powerWp: 450 })).toBeNull();
    expect(inverterElectricalOf("WR", { acPowerKw: 10, mppt: 2 })).toEqual({ name: "WR", acPowerKw: 10, trackers: 2, stringsPerTracker: null, maxDcVoltageV: null, mppMinV: null, mppMaxV: null, maxInputCurrentA: null, maxShortCircuitCurrentA: null, maxDcPowerKw: null });
    expect(inverterElectricalOf("WR", {}).trackers).toBe(1);
    expect(inverterElectricalOf("WR", { mppt: 99 }).trackers).toBe(12);
  });
});

describe("Strings: Prüfung gegen den Wechselrichter", () => {
  const twoStrings = (): { buildings: BuildingSpec[]; wiring: Wiring } => {
    const a = autoString([house()], NO_WIRING, south, 20, () => "a");
    const b = autoString(a.buildings, a.wiring, north, 20, () => "b");
    return { buildings: b.buildings, wiring: { inverters: [{ id: "w1", catalogItemId: "k3" }], strings: b.wiring.strings.map((entry, index) => ({ ...entry, inverter: "w1", tracker: index + 1 })) } };
  };

  it("rechnet Kennwerte je String und Auslastung je Wechselrichter", () => {
    const plan = twoStrings();
    const report = checkWiring(plan.buildings, plan.wiring, moduleOf, inverterOf);
    const a = report.strings.get("a");
    expect(a).toMatchObject({ count: 18, kwp: 8.1, iscA: 14.3, imppA: 13.56, mixedOrientation: false, mixedModules: false });
    expect(a?.vocColdV).toBeCloseTo(18 * 43.2825, 3);
    expect(a?.vmppHotV).toBeCloseTo(18 * 29.465, 3);
    expect(a?.vmppV).toBeCloseTo(597.6, 6);
    expect(report).toMatchObject({ modules: 36, wired: 36, free: 0 });
    expect(report.inverters[0]).toMatchObject({ name: "Wechselrichter 10 kW", known: true, dcKwp: 16.2, acKw: 10, ratioPct: 162 });
    expect(report.inverters[0].trackers).toEqual([
      { number: 1, strings: ["a"], capacity: 1, imppA: 13.56, iscA: 14.3 },
      { number: 2, strings: ["b"], capacity: 1, imppA: 13.56, iscA: 14.3 },
    ]);
    /* 16,2 kWp an 10 kW: zu klein, und über den 15 kW zulässiger DC-Leistung. */
    expect(texts(report, "fehler")).toEqual([expect.stringContaining("über der zulässigen DC-Leistung von 15 kW")]);
    expect(texts(report, "warnung")).toEqual([expect.stringContaining("deutlich zu klein (162 % der AC-Leistung)")]);
    expect(texts(report, "hinweis")).toEqual([]);
  });

  it("ist ohne Befund, wenn alles passt", () => {
    const a = autoString([setCells(house(), 2, "all", false)], NO_WIRING, south, 9, id);
    const plan: Wiring = { inverters: [{ id: "w1", catalogItemId: "k3" }], strings: a.wiring.strings.map((entry, index) => ({ ...entry, inverter: "w1", tracker: index + 1 })) };
    const report = checkWiring(a.buildings, plan, moduleOf, inverterOf);
    expect(report.findings).toEqual([]);
    expect(report.inverters[0].ratioPct).toBe(81);
  });

  it("meldet zu hohe Leerlaufspannung und zu niedrige Spannung bei Hitze", () => {
    let buildings = [house()];
    buildings = assignCells(buildings, south, Array.from({ length: 18 }, (_, index) => index), "lang");
    buildings = assignCells(buildings, north, [0, 1, 2, 3, 4, 5], "lang");
    buildings = assignCells(buildings, north, [9, 10, 11, 12, 13], "kurz");
    const plan: Wiring = {
      inverters: [{ id: "w1", catalogItemId: "k3" }],
      strings: [
        { id: "lang", name: "A", color: "#000000", inverter: "w1", tracker: 1 },
        { id: "kurz", name: "B", color: "#111111", inverter: "w1", tracker: 2 },
      ],
    };
    const report = checkWiring(buildings, plan, moduleOf, (item) => (item === "k3" ? { ...inverterData, maxDcPowerKw: null, acPowerKw: 12 } : null));
    expect(report.strings.get("lang")?.vocColdV).toBeCloseTo(24 * 43.2825, 3);
    expect(texts(report, "fehler")).toEqual(["String A: 1039 V Leerlaufspannung bei -10 °C liegen über den 1000 V von Wechselrichter 10 kW. Weniger Module in Reihe."]);
    expect(texts(report, "warnung")).toContain("String B: 147 V bei 70 °C liegen unter dem MPP-Bereich von Wechselrichter 10 kW (ab 180 V). Mehr Module in Reihe.");
    expect(texts(report, "warnung")).toContainEqual(expect.stringContaining("String A verbindet Module mit unterschiedlicher Ausrichtung"));
    expect(texts(report, "hinweis")).toEqual([expect.stringContaining("7 Module liegen in keinem String")]);
  });

  it("prüft Plätze und Ströme je MPP-Tracker", () => {
    const plan = twoStrings();
    const shared: Wiring = { ...plan.wiring, strings: plan.wiring.strings.map((entry) => ({ ...entry, tracker: 1 })) };
    const report = checkWiring(plan.buildings, shared, moduleOf, inverterOf);
    expect(report.inverters[0].trackers[0]).toMatchObject({ strings: ["a", "b"], imppA: 27.12, iscA: 28.6 });
    expect(texts(report, "fehler")).toEqual(expect.arrayContaining([
      "Wechselrichter 10 kW, MPP-Tracker 1: 2 Strings (A, B), Platz ist für 1.",
      "Wechselrichter 10 kW, MPP-Tracker 1: 28,6 A Kurzschlussstrom liegen über den zulässigen 22,0 A.",
    ]));
    expect(texts(report, "warnung")).toContainEqual(expect.stringContaining("27,1 A Betriebsstrom liegen über dem Eingangsstrom von 16,0 A"));
    const uneven = checkWiring(releaseCells(plan.buildings, shared, north, [0]), shared, moduleOf, inverterOf);
    expect(texts(uneven, "warnung")).toContainEqual(expect.stringContaining("Die Strings A, B sind unterschiedlich lang"));
  });

  it("sagt, was noch fehlt: Datenblattwerte, Wechselrichter, Tracker, Module", () => {
    const other = { ...placement, catalogItemId: "k2", powerWp: 430 };
    const mixed = [setCells(updatePlan(house(), 2, (plan) => ({ ...plan, placement: other })), 2, "all", true)];
    const a = autoString(mixed, NO_WIRING, north, 20, () => "a");
    const bare = checkWiring(a.buildings, a.wiring, moduleOf, inverterOf);
    expect(bare.strings.get("a")).toMatchObject({ count: 18, kwp: 7.74, vocColdV: null, iscA: null });
    expect(texts(bare)).toEqual(expect.arrayContaining([
      "String A ist noch keinem Wechselrichter zugeordnet.",
      "18 Module liegen in keinem String.",
      expect.stringContaining("fehlen Datenblattwerte im Katalog"),
      "Es ist noch kein Wechselrichter gewählt.",
    ]));
    const unknown: Wiring = { inverters: [{ id: "w1", catalogItemId: "weg" }, { id: "w2", catalogItemId: "k3" }], strings: [{ ...a.wiring.strings[0], inverter: "w2", tracker: null }, { id: "leer", name: "B", color: "#222222", inverter: null, tracker: null }] };
    const report = checkWiring(a.buildings, unknown, moduleOf, inverterOf);
    expect(report.inverters.map((entry) => [entry.name, entry.known])).toEqual([["Wechselrichter (1)", false], ["Wechselrichter 10 kW (2)", true]]);
    expect(texts(report)).toEqual(expect.arrayContaining([
      "Wechselrichter (1) fehlt im Katalog oder ist nicht mehr aktiv. Seine Grenzwerte werden nicht geprüft.",
      "An Wechselrichter (1) hängt noch kein String.",
      "String A braucht noch einen MPP-Tracker an Wechselrichter 10 kW (2).",
      "String B hat noch keine Module.",
    ]));
    const blend = assignCells(assignCells(mixed, south, [0], "x"), north, [0], "x");
    expect(texts(checkWiring(blend, wiring("X"), moduleOf, inverterOf), "warnung")).toContain("String X mischt verschiedene Module.");
  });

  it("verteilt Strings der Reihe nach auf freie Tracker", () => {
    const three: Wiring = { inverters: [{ id: "w1", catalogItemId: "k3" }], strings: wiring("A", "B", "C").strings };
    expect(autoAssign(three, inverterOf).strings.map((entry) => [entry.inverter, entry.tracker])).toEqual([["w1", 1], ["w1", 2], [null, null]]);
    const roomy = autoAssign(three, () => ({ ...inverterData, stringsPerTracker: 2 }));
    expect(roomy.strings.map((entry) => entry.tracker)).toEqual([1, 1, 2]);
    const kept: Wiring = { ...three, strings: [{ ...three.strings[0], inverter: "w1", tracker: 2 }, three.strings[1]] };
    expect(autoAssign(kept, inverterOf).strings.map((entry) => entry.tracker)).toEqual([2, 1]);
    expect(autoAssign(wiring("A"), inverterOf)).toEqual(wiring("A"));
    const done = autoAssign(three, inverterOf);
    expect(autoAssign({ ...done, strings: done.strings.slice(0, 2) }, inverterOf).strings).toEqual(done.strings.slice(0, 2));
  });

  it("lässt Strings aus, die keinen Platz bekommen sollen, etwa leere", () => {
    const three: Wiring = { inverters: [{ id: "w1", catalogItemId: "k3" }], strings: wiring("A", "B", "C").strings };
    const filled = autoAssign(three, inverterOf, (stringId) => stringId !== "a");
    expect(filled.strings.map((entry) => [entry.name, entry.tracker])).toEqual([["A", null], ["B", 1], ["C", 2]]);
    /* Wer schon einen Platz hat, behält ihn und zählt weiter als belegt, auch wenn er nicht mitverteilt wird. */
    const held: Wiring = { ...three, strings: [{ ...three.strings[0], inverter: "w1", tracker: 1 }, three.strings[1], three.strings[2]] };
    expect(autoAssign(held, inverterOf, (stringId) => stringId !== "a").strings.map((entry) => entry.tracker)).toEqual([1, 2, null]);
    expect(autoAssign(three, inverterOf, () => false)).toBe(three);
  });
});

describe("Strings: gespeicherte Verschaltung prüfen", () => {
  it("behält Gültiges und repariert Verweise", () => {
    const parsed = parsePlanning({
      version: 1,
      fremd: true,
      inverters: [{ id: "w1", catalogItemId: "k3", mehr: 1 }, { id: "w1", catalogItemId: "k9" }, { id: "<x>", catalogItemId: "k3" }, null],
      strings: [
        { id: "a", name: "  Süd  ", color: "#F2A516", inverter: "w1", tracker: 2 },
        { id: "b", name: "", color: "rot", inverter: "gibt-es-nicht", tracker: 1 },
        { id: "c", name: "x".repeat(40), color: "#123456", inverter: "w1", tracker: 99 },
        { id: "a", name: "Doppelt", color: "#000000" },
        "kaputt",
      ],
    });
    expect(parsed).toEqual({
      version: 1,
      inverters: [{ id: "w1", catalogItemId: "k3" }],
      strings: [
        { id: "a", name: "Süd", color: "#f2a516", inverter: "w1", tracker: 2 },
        { id: "b", name: "A", color: expect.stringMatching(/^#[0-9a-f]{6}$/), inverter: null, tracker: null },
        { id: "c", name: "x".repeat(12), color: "#123456", inverter: "w1", tracker: null },
      ],
    });
  });

  it("verwirft Leeres und Fremdes", () => {
    expect(parsePlanning(null)).toBeNull();
    expect(parsePlanning({ version: 2, strings: [{ id: "a" }] })).toBeNull();
    expect(parsePlanning({ version: 1, inverters: [], strings: [] })).toBeNull();
    expect(parsePlanning([])).toBeNull();
  });
});
