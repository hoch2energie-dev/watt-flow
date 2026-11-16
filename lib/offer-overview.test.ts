import { describe, expect, it } from "vitest";
import { calculateOffer } from "@/lib/calc/offer";
import { toCalcInput } from "@/lib/domain";
import { STEP_ORDER, keyFigures, solarProgress, stepItems, stepNet, stepValue } from "@/lib/offer-overview";
import { demoOffer } from "@/preview/demo-data";

describe("Angebotsübersicht", () => {
  const offer = demoOffer();
  const variant = offer.variants[0];
  const result = calculateOffer(toCalcInput(offer, variant));

  it("behält die Reihenfolge der zehn Schritte", () => {
    expect(STEP_ORDER).toEqual(["verbrauch", "gebaeude", "bestand", "solar", "speicher", "wallbox", "waerme", "extras", "zahlung", "ergebnisse"]);
  });

  it("summiert die Positionen je Thema, zusammen ergibt das den Nettopreis vor Rabatt", () => {
    expect(stepNet(result, "solar")).toBeCloseTo(24 * 185 + 1890 + 3400, 6);
    expect(stepNet(result, "speicher")).toBeCloseTo(5200, 6);
    expect(stepNet(result, "wallbox")).toBe(0);
    const all = STEP_ORDER.reduce((sum, step) => sum + stepNet(result, step), 0);
    expect(all).toBeCloseTo(result.pricing.netBeforeRebate, 6);
    expect([stepItems(variant, "solar"), stepItems(variant, "wallbox")]).toEqual([3, 0]);
  });

  it("zeigt je Schritt einen Kurzwert und lässt leere Themen leer", () => {
    expect(stepValue("verbrauch", offer, variant, result)).toBe("6.500 kWh");
    expect(stepValue("bestand", offer, variant, result)).toBe("Gas");
    expect(stepValue("bestand", { ...offer, existingHeating: "" }, variant, result)).toBe("Keine Anlagen");
    expect(stepValue("solar", offer, variant, result).startsWith("10,80 kWp · ")).toBe(true);
    expect(stepValue("speicher", offer, variant, result).startsWith("10,0 kWh · ")).toBe(true);
    expect(stepValue("wallbox", offer, variant, result)).toBe("");
    expect(stepValue("zahlung", offer, variant, result)).toBe("Barzahlung");
  });

  it("erkennt, was an der Photovoltaik schon steht", () => {
    expect(solarProgress(variant)).toEqual({ roof: false, modules: true, inverter: true });
    const empty = { ...variant, lines: variant.lines.filter((line) => line.section !== "inverter") };
    expect(solarProgress(empty).inverter).toBe(false);
  });

  it("nennt sieben Kennzahlen und Striche, wenn noch keine Anlage geplant ist", () => {
    expect(keyFigures(result).map((figure) => figure.label)).toEqual(["Investition", "Marge", "Amortisation", "Rendite", "Produktion", "Autarkie", "Eigenverbrauch"]);
    const blank = { ...variant, lines: [] };
    const none = keyFigures(calculateOffer(toCalcInput(offer, blank)));
    expect(none.find((figure) => figure.label === "Produktion")?.value).toBe("–");
    expect(none.find((figure) => figure.label === "Marge")?.value).toBe("–");
  });
});
