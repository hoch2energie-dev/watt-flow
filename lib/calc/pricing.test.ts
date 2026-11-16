import { describe, expect, it } from "vitest";
import { allocateCents } from "@/lib/calc/money";
import { priceOffer, resolveVatRate } from "@/lib/calc/pricing";

describe("Mehrwertsteuer", () => {
  it("setzt PV-Positionen am Wohngebäude auf 0 Prozent", () => {
    expect(resolveVatRate("PV_NULL", true)).toBe(0);
  });

  it("setzt PV-Positionen ohne Nullsteuersatz und andere Gewerke auf 19 Prozent", () => {
    expect(resolveVatRate("PV_NULL", false)).toBe(0.19);
    expect(resolveVatRate("REGEL", true)).toBe(0.19);
    expect(resolveVatRate("REGEL", false)).toBe(0.19);
  });

  it("rechnet gemischte Steuersätze und verteilt einen Rabatt anteilig", () => {
    const summary = priceOffer({
      zeroRateEligible: true,
      rebateNet: 200,
      lines: [
        {
          id: "pv",
          section: "module",
          name: "Module",
          quantity: 1,
          unit: "Pauschale",
          unitPriceNet: 1000,
          purchasePriceNet: 600,
          discountPercent: 0,
          vatCategory: "PV_NULL",
        },
        {
          id: "wb",
          section: "wallbox",
          name: "Wallbox",
          quantity: 1,
          unit: "Stk",
          unitPriceNet: 1000,
          purchasePriceNet: 400,
          discountPercent: 0,
          vatCategory: "REGEL",
        },
      ],
    });

    expect(summary.lines.map((line) => line.rebateShare)).toEqual([100, 100]);
    expect(summary.lines[0].vat).toBe(0);
    expect(summary.lines[1].net).toBe(900);
    expect(summary.lines[1].vat).toBe(171);
    expect(summary.net).toBe(1800);
    expect(summary.vat).toBe(171);
    expect(summary.gross).toBe(1971);
    expect(summary.margin).toBe(800);
    expect(summary.marginPercent).toBeCloseTo(800 / 1800, 6);
  });

  it("wendet Positionsrabatt an und deckelt den Gesamtrabatt auf die Nettosumme", () => {
    const summary = priceOffer({
      zeroRateEligible: true,
      rebateNet: 99999,
      lines: [
        {
          id: "a",
          section: "extra",
          name: "Montage",
          quantity: 2,
          unit: "Stunde",
          unitPriceNet: 80,
          purchasePriceNet: 45,
          discountPercent: 10,
          vatCategory: "PV_NULL",
        },
      ],
    });
    expect(summary.netBeforeRebate).toBe(144);
    expect(summary.rebateNet).toBe(144);
    expect(summary.net).toBe(0);
    expect(summary.vat).toBe(0);
    expect(summary.gross).toBe(0);
    expect(summary.margin).toBe(-90);
  });

  it("rundet 19 Prozent von 1.000 Euro auf 190 Euro", () => {
    const summary = priceOffer({
      zeroRateEligible: false,
      rebateNet: 0,
      lines: [
        {
          id: "pv",
          section: "module",
          name: "Gewerbe-PV",
          quantity: 1,
          unit: "Pauschale",
          unitPriceNet: 1000,
          purchasePriceNet: 700,
          discountPercent: 0,
          vatCategory: "PV_NULL",
        },
      ],
    });
    expect(summary.vat).toBe(190);
    expect(summary.gross).toBe(1190);
  });
});

describe("Centverteilung", () => {
  it("verteilt einen Cent auf drei gleiche Positionen ohne Überschuss", () => {
    const shares = allocateCents([1000, 1000, 1000], 1);
    expect(shares.reduce((sum, value) => sum + value, 0)).toBe(1);
    expect(shares.every((value) => value === 0 || value === 1)).toBe(true);
  });

  it("überzieht kleine Gewichte nicht", () => {
    const shares = allocateCents([5000, 5000, 1], 100);
    expect(shares.reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(shares[2]).toBeLessThanOrEqual(1);
  });
});
