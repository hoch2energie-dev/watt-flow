import { describe, expect, it } from "vitest";
import { newTenantPower, parseTenantPower, suggestedSharePct, tenantGaps, tenantSummary, type TenantPower } from "@/lib/tenant-power";

let counter = 0;
const id = () => `t${++counter}`;

function supplier(patch: Partial<TenantPower> = {}): TenantPower {
  return {
    model: "versorger",
    tariffMode: "zweitarif",
    pvPriceCt: 22,
    gridPriceCt: 30,
    mixedPriceCt: 27,
    baseFeeEur: 8,
    vatPct: 19,
    pvSharePct: 40,
    gridPurchaseCt: 24,
    feedMode: "einspeiseverguetung",
    feedInCt: 7,
    surchargeCt: 2.5,
    basicPriceCt: 40,
    basicBaseEur: 12,
    tenants: [{ id: "m1", name: "Wohnungen", kind: "privat", count: 4, annualKwh: 2500, currentPriceCt: 38, currentBaseEur: 10 }],
    general: [{ id: "a1", name: "Treppenhaus", annualKwh: 1500, priceCt: 35 }],
    ...patch,
  };
}

const line = (summary: ReturnType<typeof tenantSummary>, label: string) => summary.yearly.find((entry) => entry.label === label)?.eur;

describe("Mieterstrom: Vollversorgung im Zweitarif", () => {
  const summary = tenantSummary(supplier(), 20000);

  it("teilt den Strom in Solar, Rest, Allgemeinstrom und Einspeisung", () => {
    expect(summary.tenantCount).toBe(4);
    expect(summary.demandKwh).toBe(10000);
    expect(summary.pvToTenantsKwh).toBeCloseTo(4000);
    expect(summary.gridToTenantsKwh).toBeCloseTo(6000);
    expect(summary.pvToGeneralKwh).toBeCloseTo(600);
    expect(summary.feedInKwh).toBeCloseTo(15400);
    expect(summary.limited).toBe(false);
  });

  it("zeigt den Mietern Bruttopreise und den Durchschnitt aus beiden Tarifen", () => {
    expect(summary.gross.pvCt).toBeCloseTo(26.18);
    expect(summary.gross.gridCt).toBeCloseTo(35.7);
    expect(summary.gross.effectiveCt).toBeCloseTo(31.892);
    expect(summary.gross.baseFeeEur).toBeCloseTo(9.52);
  });

  it("rechnet den Jahresüberschlag des Betreibers netto", () => {
    expect(line(summary, "Solarstrom an Mieter")).toBe(880);
    expect(line(summary, "Reststrom an Mieter")).toBe(1800);
    expect(line(summary, "Grundpreise")).toBe(384);
    expect(line(summary, "Mieterstromzuschlag")).toBe(100);
    expect(line(summary, "Einkauf Reststrom")).toBe(-1440);
    expect(line(summary, "Ersparnis beim Allgemeinstrom")).toBe(210);
    expect(line(summary, "Einspeisung des Überschusses")).toBe(1078);
    expect(summary.yearlyTotal).toBe(3012);
    expect(summary.pvRevenueCt).toBeCloseTo(24.5);
    expect(summary.gridMarginCt).toBeCloseTo(6);
  });

  it("vergleicht je Mietpartei den bisherigen Tarif mit dem Mieterstrom und prüft die 90 %", () => {
    const [group] = summary.groups;
    expect(group.currentEur).toBe(1070);
    expect(group.newEur).toBe(911.54);
    expect(group.savingEur).toBe(158.46);
    expect(group.savingPct).toBe(14.8);
    expect(group.capEur).toBe(1029.6);
    expect(group.withinCap).toBe(true);
  });

  it("meldet einen Tarif über 90 % der Grundversorgung", () => {
    const [group] = tenantSummary(supplier({ pvPriceCt: 32, gridPriceCt: 38 }), 20000).groups;
    expect(group.newEur).toBeGreaterThan(group.capEur!);
    expect(group.withinCap).toBe(false);
  });

  it("prüft die Obergrenze nicht für Gewerbe und nicht ohne Grundversorgungstarif", () => {
    const business = supplier();
    business.tenants[0] = { ...business.tenants[0], kind: "gewerbe" };
    expect(tenantSummary(business, 20000).groups[0].withinCap).toBeNull();
    expect(tenantSummary(supplier({ basicPriceCt: 0 }), 20000).groups[0].capEur).toBeNull();
  });
});

describe("Mieterstrom: Mischtarif", () => {
  const summary = tenantSummary(supplier({ tariffMode: "mischtarif" }), 20000);

  it("verlangt für jede Kilowattstunde denselben Preis", () => {
    expect(summary.gross.effectiveCt).toBeCloseTo(32.13);
    expect(line(summary, "Strom an Mieter (Mischtarif)")).toBe(2700);
    expect(line(summary, "Solarstrom an Mieter")).toBeUndefined();
    expect(summary.gridMarginCt).toBeCloseTo(3);
    expect(summary.groups[0].newEur).toBe(917.49);
  });

});

describe("Mieterstrom: andere Modelle und Grenzen", () => {
  it("lässt bei direkter Vermarktung den bisherigen Vertrag für den Reststrom weiterlaufen", () => {
    const summary = tenantSummary(supplier({ model: "direkt" }), 20000);
    expect(summary.gridToTenantsKwh).toBe(0);
    expect(summary.gridMarginCt).toBeNull();
    expect(line(summary, "Mieterstromzuschlag")).toBeUndefined();
    expect(line(summary, "Einkauf Reststrom")).toBeUndefined();
    expect(summary.groups[0].newEur).toBe(1066.04);
    expect(summary.groups[0].capEur).toBeNull();
  });

  it("rechnet bei Volleinspeisung nur die Einspeisung", () => {
    const summary = tenantSummary(supplier({ model: "volleinspeisung" }), 20000);
    expect(summary.yearly).toEqual([{ label: "Einspeisung", eur: 1400 }]);
    expect(summary.groups).toEqual([]);
    expect(summary.tenantCount).toBe(0);
  });

  it("kürzt den Solaranteil, wenn die Anlage weniger erzeugt als eingeplant", () => {
    const summary = tenantSummary(supplier(), 2300);
    expect(summary.limited).toBe(true);
    expect(summary.sharePct).toBe(20);
    expect(summary.pvToTenantsKwh).toBeCloseTo(2000);
    expect(summary.feedInKwh).toBe(0);
  });

  it("rechnet ohne geplante Anlage mit dem eingegebenen Anteil und ohne Einspeisung", () => {
    const summary = tenantSummary(supplier(), 0);
    expect(summary.limited).toBe(false);
    expect(summary.sharePct).toBe(40);
    expect(summary.feedInKwh).toBe(0);
    expect(line(summary, "Einspeisung des Überschusses")).toBeUndefined();
  });

  it("schlägt einen Solaranteil aus Ertrag und Verbrauch vor", () => {
    expect(suggestedSharePct(supplier(), 0, 0, 0)).toBeNull();
    expect(suggestedSharePct(supplier({ tenants: [], general: [] }), 20000, 0, 0)).toBeNull();
    const without = suggestedSharePct(supplier(), 11500, 0, 0)!;
    const withBattery = suggestedSharePct(supplier(), 11500, 10, 220)!;
    expect(without).toBe(41);
    expect(withBattery).toBeGreaterThan(without);
    expect(withBattery).toBeLessThanOrEqual(100);
  });
});

describe("Mieterstrom: fehlende Angaben", () => {
  it("meldet nichts, wenn alles eingetragen ist", () => {
    expect(tenantGaps(supplier())).toEqual([]);
    expect(tenantGaps(supplier({ tariffMode: "mischtarif" }))).toEqual([]);
    expect(tenantGaps(supplier({ model: "direkt", gridPriceCt: 0, gridPurchaseCt: 0 }))).toEqual([]);
    expect(tenantGaps(supplier({ model: "volleinspeisung" }))).toEqual([]);
  });

  it("nennt, was für die Zusammenfassung fehlt", () => {
    const fresh = newTenantPower("versorger", { currentPriceCt: 0, feedInCt: 0 }, id);
    expect(tenantGaps(fresh)).toEqual(["Preis für Solarstrom", "Preis für Reststrom", "Einkaufspreis für Reststrom", "bisheriger Strompreis der Mieter"]);
    expect(tenantGaps({ ...fresh, tariffMode: "mischtarif" })).toContain("Mischpreis");
    expect(tenantGaps({ ...fresh, tenants: [] })).toContain("Mieter mit Verbrauch");
    expect(tenantGaps(newTenantPower("volleinspeisung", { currentPriceCt: 0, feedInCt: 0 }, id))).toEqual(["Vergütung für die Einspeisung"]);
  });
});

describe("Mieterstrom: Eingabeprüfung", () => {
  it("legt ein Modell mit einer ersten Mietergruppe an", () => {
    const fresh = newTenantPower("versorger", { currentPriceCt: 36, feedInCt: 7.8 }, id);
    expect(fresh.tenants).toHaveLength(1);
    expect(fresh.tenants[0].currentPriceCt).toBe(36);
    expect(fresh.feedInCt).toBe(7.8);
    expect(fresh.surchargeCt).toBe(0);
    expect(newTenantPower("volleinspeisung", { currentPriceCt: 36, feedInCt: 7.8 }, id).tenants).toEqual([]);
  });

  it("verwirft Unbrauchbares und unbekannte Modelle", () => {
    expect(parseTenantPower(null)).toBeNull();
    expect(parseTenantPower("x")).toBeNull();
    expect(parseTenantPower([])).toBeNull();
    expect(parseTenantPower({ model: "irgendwas" })).toBeNull();
  });

  it("begrenzt Zahlen, kürzt Texte und lässt fremde Felder weg", () => {
    const parsed = parseTenantPower({
      model: "versorger",
      tariffMode: "quatsch",
      pvPriceCt: "22,5",
      gridPriceCt: 9999,
      vatPct: -5,
      pvSharePct: 250,
      fremd: "<script>",
      tenants: [{ id: "a", name: "  " + "x".repeat(200), kind: "sonstwas", count: 2.6, annualKwh: -10, currentPriceCt: 38.129, currentBaseEur: "9.5", extra: 1 }, null, { id: "a" }],
      general: "kein Feld",
    })!;
    expect(parsed.tariffMode).toBe("zweitarif");
    expect(parsed.pvPriceCt).toBe(0);
    expect(parsed.gridPriceCt).toBe(300);
    expect(parsed.vatPct).toBe(0);
    expect(parsed.pvSharePct).toBe(100);
    expect(parsed).not.toHaveProperty("fremd");
    expect(parsed.tenants).toHaveLength(2);
    expect(parsed.tenants[0]).toEqual({ id: "a", name: "x".repeat(80), kind: "privat", count: 3, annualKwh: 0, currentPriceCt: 38.13, currentBaseEur: 9.5 });
    expect(parsed.tenants[1].id).not.toBe("a");
    expect(parsed.tenants[1].count).toBe(1);
    expect(parsed.general).toEqual([]);
  });

  it("bleibt nach Speichern und Laden unverändert", () => {
    const config = supplier();
    expect(parseTenantPower(JSON.parse(JSON.stringify(config)))).toEqual(config);
  });

  it("führt bei Volleinspeisung keine Mieter", () => {
    expect(parseTenantPower({ ...supplier(), model: "volleinspeisung" })!.tenants).toEqual([]);
  });
});
