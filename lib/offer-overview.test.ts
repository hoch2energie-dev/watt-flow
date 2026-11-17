import { describe, expect, it } from "vitest";
import { calculateOffer } from "@/lib/calc/offer";
import { toCalcInput } from "@/lib/domain";
import { PLAN_TOPICS, TABS, THEMES, TOPIC_SECTIONS, baselineTiles, isPlanTopic, keyFigures, planSummary, solarProgress, tenantBaseline, tenantOutcome, topicItems, topicNet, type PlanTopic } from "@/lib/offer-overview";
import type { LngLat } from "@/lib/roof/geo";
import { newBuilding } from "@/lib/roof3d/building";
import { facesFromBuildings } from "@/lib/roof3d/faces";
import { setCells, updatePlan } from "@/lib/roof3d/plans";
import { newTenantPower, type TenantPower } from "@/lib/tenant-power";
import { demoOffer } from "@/preview/demo-data";

describe("Angebotsseite: Reiter, Themenhubs, Kacheln", () => {
  const offer = demoOffer();
  const variant = offer.variants[0];
  const result = calculateOffer(toCalcInput(offer, variant));
  const plan = Object.values(PLAN_TOPICS).flat();

  it("hat vier Reiter und drei Themen, jede Planungskachel steht unter genau einem Thema", () => {
    expect(TABS.map((tab) => tab.id)).toEqual(["allgemein", "planung", "simulation", "abschluss"]);
    expect(THEMES.map((theme) => theme.id)).toEqual(["strom", "waerme", "mobilitaet"]);
    expect([...plan].sort()).toEqual(Object.keys(TOPIC_SECTIONS).sort());
    expect(new Set(plan).size).toBe(plan.length);
    expect([isPlanTopic("pv"), isPlanTopic("strom")]).toEqual([true, false]);
  });

  it("summiert die Positionen je Kachel, zusammen ergibt das den Nettopreis vor Rabatt", () => {
    expect(topicNet(result, "pv")).toBeCloseTo(24 * 185 + 1890 + 3400, 6);
    expect(topicNet(result, "speicher")).toBeCloseTo(5200, 6);
    expect(topicNet(result, "wallbox")).toBe(0);
    expect(plan.reduce((sum, topic) => sum + topicNet(result, topic), 0)).toBeCloseTo(result.pricing.netBeforeRebate, 6);
    expect([topicItems(variant, "pv"), topicItems(variant, "wallbox")]).toEqual([3, 0]);
    /* Jeder Abschnitt der Positionen gehört zu genau einer Kachel. */
    const sections = Object.values(TOPIC_SECTIONS).flat();
    expect(new Set(sections).size).toBe(sections.length);
  });

  it("Ausgangslage: Werte je Thema, leere Kacheln bleiben leer", () => {
    const tiles = baselineTiles(offer);
    const strom = Object.fromEntries(tiles.strom.map((tile) => [tile.id, tile]));
    expect(strom.verbrauch.value).toBe("6.500 kWh");
    expect(strom.verbrauch.detail).toContain("ct/kWh");
    expect(strom.bestand.value).toBe("");
    expect(tiles.waerme.map((tile) => [tile.id, tile.value])).toEqual([["heizung", "Gas"], ["wp-strom", ""]]);
    const later = baselineTiles({ ...offer, existingPvKwp: 5, existingBatteryKwh: 7.5, heatPumpElectricKwh: 3200, heatPumpThermalKwh: 11000, evKwh: 0, existingWallbox: true, electricityPriceEur: 0.39, priceIncreasePct: 3 });
    expect(later.strom[0].detail).toBe("39 ct/kWh · +3 % Preisänderung pro Jahr");
    expect(later.strom[1].value).toBe("PV 5,0 kWp · Speicher 7,5 kWh");
    expect([later.waerme[1].value, later.waerme[1].detail]).toEqual(["3.200 kWh", "11.000 kWh Wärme pro Jahr"]);
    expect([later.mobilitaet[0].value, later.mobilitaet[0].empty]).toEqual(["", "Wallbox vorhanden, noch kein Ladestrom eingetragen."]);
    /* Jede Kachel führt in den Bearbeitungsbereich ihres Themas. */
    for (const theme of THEMES) expect(tiles[theme.id].every((tile) => tile.topic === theme.id)).toBe(true);
  });

  it("Planungskacheln: Kurzwert, Preis und ob schon etwas geplant ist", () => {
    const pv = planSummary("pv", variant, result);
    expect([pv.value, pv.filled]).toEqual(["10,80 kWp geplant", true]);
    expect(pv.detail.endsWith("netto")).toBe(true);
    expect(planSummary("speicher", variant, result).value).toBe("10,0 kWh");
    expect(planSummary("wallbox", variant, result)).toEqual({ value: "", detail: "", filled: false });
    const blank = { ...variant, lines: [], faces: [] };
    const none = calculateOffer(toCalcInput(offer, blank));
    for (const topic of plan as PlanTopic[]) expect(planSummary(topic, blank, none).filled).toBe(false);
  });

  it("erkennt, was an der Photovoltaik schon steht", () => {
    expect(solarProgress(variant)).toEqual({ roof: false, layout: false, modules: true, inverter: true });
    expect(solarProgress({ ...variant, lines: variant.lines.filter((line) => line.section !== "inverter") }).inverter).toBe(false);
    /* Gebäude aus der 3D-Planung: erst das Dach, mit belegten Modulen auch die Modulbelegung. */
    const origin: LngLat = [6.9583, 50.9413];
    const house = newBuilding("haus", [[-5, -4], [5, -4], [5, 4], [-5, 4]]);
    expect(solarProgress({ ...variant, faces: facesFromBuildings([house], origin, [], variant.id) })).toMatchObject({ roof: true, layout: false });
    const placement = { catalogItemId: "k1", powerWp: 450, widthM: 1.134, heightM: 1.762, portrait: true, setbackM: 0.3, gapM: 0.02 };
    const filled = setCells(updatePlan(house, 0, (plan) => ({ ...plan, placement })), 0, "all", true);
    expect(solarProgress({ ...variant, faces: facesFromBuildings([filled], origin, [], variant.id) })).toMatchObject({ roof: true, layout: true });
  });

  it("nennt sieben Kennzahlen und Striche, wenn noch keine Anlage geplant ist", () => {
    expect(keyFigures(result).map((figure) => figure.label)).toEqual(["Investition", "Marge", "Amortisation", "Rendite", "Produktion", "Autarkie", "Eigenverbrauch"]);
    const none = keyFigures(calculateOffer(toCalcInput(offer, { ...variant, lines: [] })));
    expect(none.find((figure) => figure.label === "Produktion")?.value).toBe("–");
    expect(none.find((figure) => figure.label === "Marge")?.value).toBe("–");
  });
});

describe("Angebotsseite: Mieterstrom im Hub", () => {
  const filled: TenantPower = {
    ...newTenantPower("versorger", { currentPriceCt: 38, feedInCt: 7 }, () => "m1"),
    pvPriceCt: 22,
    gridPriceCt: 30,
    mixedPriceCt: 27,
    baseFeeEur: 8,
    pvSharePct: 40,
    gridPurchaseCt: 24,
    surchargeCt: 2.5,
    basicPriceCt: 40,
    basicBaseEur: 12,
    tenants: [{ id: "m1", name: "Wohnungen", kind: "privat", count: 4, annualKwh: 2500, currentPriceCt: 38, currentBaseEur: 10 }],
  };

  it("zeigt in der Ausgangslage Modell, Mieter und den Tarif in Bruttopreisen", () => {
    expect(tenantBaseline(null).value).toBe("");
    expect(tenantBaseline(filled)).toMatchObject({ value: "Energieversorger", detail: "4 Mietparteien · 10.000 kWh pro Jahr", note: "Zweitarif: 26,2 ct Solar · 35,7 ct Rest, brutto" });
    expect(tenantBaseline({ ...filled, tariffMode: "mischtarif" }).note).toBe("Mischtarif: 32,1 ct/kWh brutto");
    expect(tenantBaseline({ ...filled, model: "direkt" })).toMatchObject({ value: "Direkte Vermarktung", note: "Solarstrom: 26,2 ct/kWh brutto" });
    expect(tenantBaseline({ ...filled, pvPriceCt: 0, gridPriceCt: 0 }).note).toBe("Tarif noch offen");
    expect(tenantBaseline({ ...filled, gridPriceCt: 0 }).note).toBe("Tarif noch unvollständig");
    expect(tenantBaseline({ ...filled, model: "volleinspeisung", tenants: [] })).toMatchObject({ value: "Volleinspeisung", detail: "Vergütung 7,0 ct/kWh" });
  });

  it("rechnet den Überschlag mit dem Ertrag der Variante und nennt, was die Mieter sparen", () => {
    expect(tenantOutcome(null, 20000).value).toBe("");
    const outcome = tenantOutcome(filled, 20000);
    expect(outcome.value.replace(/\s/g, " ")).toBe("2.844,00 € pro Jahr");
    expect(outcome.note.replace(/\s/g, " ")).toBe("Mieter sparen 158,00 € pro Jahr und Partei.");
    expect(outcome.warn).toBe(false);
  });

  it("sagt, was noch fehlt, und warnt bei zu teurem Tarif", () => {
    expect(tenantOutcome({ ...filled, gridPurchaseCt: 0 }, 20000)).toMatchObject({ value: "", detail: "Es fehlt noch: Einkaufspreis für Reststrom." });
    expect(tenantOutcome({ ...filled, pvPriceCt: 32, gridPriceCt: 38 }, 20000)).toMatchObject({ note: "Tarif liegt über 90 % der Grundversorgung.", warn: true });
    expect(tenantOutcome({ ...filled, basicPriceCt: 0, pvPriceCt: 34, gridPriceCt: 40 }, 20000)).toMatchObject({ note: "Für mindestens eine Mietergruppe wird der Strom teurer als bisher.", warn: true });
    expect(tenantOutcome(filled, 0).note).toBe("Noch keine Anlage geplant, gerechnet ohne Einspeisung.");
  });
});
