import { describe, expect, it } from "vitest";
import { SELF_CONSUMPTION_ALPHA, estimateSelfConsumption, financePlan, internalRateOfReturn, paymentForPeriods } from "@/lib/calc/economics";
import { calculateOffer, type CalcInput } from "@/lib/calc/offer";
import { getYieldProvider, registerYieldProvider } from "@/lib/calc/yield";

function sample(overrides: Partial<CalcInput> = {}): CalcInput {
  return {
    zeroRateEligible: true,
    vatDeductible: false,
    rebateNet: 0,
    householdKwh: 5000,
    heatPumpElectricKwh: 0,
    evKwh: 0,
    otherKwh: 0,
    electricityPriceEur: 0.3,
    priceIncreasePct: 0,
    lines: [
      {
        id: "mod",
        section: "module",
        name: "Modul",
        quantity: 20,
        unit: "Stk",
        unitPriceNet: 200,
        purchasePriceNet: 120,
        discountPercent: 0,
        vatCategory: "PV_NULL",
        specs: { powerWp: 500 },
      },
      {
        id: "wr",
        section: "inverter",
        name: "Wechselrichter",
        quantity: 1,
        unit: "Stk",
        unitPriceNet: 2000,
        purchasePriceNet: 1500,
        discountPercent: 0,
        vatCategory: "PV_NULL",
        specs: { acPowerKw: 10 },
      },
    ],
    specificYield: 1000,
    yieldProvider: "specific",
    kwpOverride: null,
    kwpManual: false,
    degradationPct: 0,
    horizonYears: 20,
    eegTariffEur: 0.08,
    postEegTariffEur: 0.08,
    opexEurPerYear: 0,
    batteryCyclesPerYear: 200,
    paymentMode: "BAR",
    downPayment: 0,
    financeYears: 10,
    financeInterestPct: 4,
    instalmentCount: 12,
    instalmentIntervalMonths: 1,
    instalmentInterestPct: 0,
    ...overrides,
  };
}

describe("Eigenverbrauch und Ertrag", () => {
  it("fixiert die Dokumentationskonstante der Direktverbrauchsformel", () => {
    expect(SELF_CONSUMPTION_ALPHA).toBe(1.45);
  });

  it("rechnet 10 kWp mal 1.000 kWh/kWp auf 10.000 kWh und verteilt die Monate", () => {
    const estimate = getYieldProvider("specific").estimate({ kwp: 10, specificYieldKwhPerKwp: 1000 });
    expect(estimate.annualKwh).toBe(10000);
    expect(estimate.monthlyKwh).toHaveLength(12);
    expect(estimate.monthlyKwh.reduce((sum, value) => sum + value, 0)).toBeCloseTo(10000, 6);
  });

  it("fällt auf den spezifischen Ertrag zurück, wenn ein Modell noch nicht registriert ist", () => {
    expect(getYieldProvider("unbekannt").id).toBe("specific");
  });

  it("erhöht den Eigenverbrauch mit Speicher und bleibt unter 100 Prozent", () => {
    const without = estimateSelfConsumption({
      annualProductionKwh: 10000,
      annualConsumptionKwh: 5000,
      batteryUsableKwh: 0,
      batteryCyclesPerYear: 200,
    });
    const withBattery = estimateSelfConsumption({
      annualProductionKwh: 10000,
      annualConsumptionKwh: 5000,
      batteryUsableKwh: 10,
      batteryCyclesPerYear: 200,
    });
    const directRatio = 1 / (1 + 1.45 * 2);
    expect(without.directKwh).toBeCloseTo(10000 * directRatio, 4);
    expect(without.selfConsumedKwh).toBeCloseTo(2564.102564, 3);
    expect(withBattery.batteryKwh).toBeCloseTo(2000, 3);
    expect(withBattery.selfConsumedKwh).toBeGreaterThan(without.selfConsumedKwh);
    expect(withBattery.selfConsumptionRatio).toBeLessThanOrEqual(1);
    expect(withBattery.autarkyRatio).toBeLessThanOrEqual(1);
    expect(withBattery.autarkyRatio).toBeCloseTo(0.9128205, 4);
  });

  it("liefert bei fehlender Produktion oder fehlendem Verbrauch keine NaN-Werte", () => {
    const none = estimateSelfConsumption({
      annualProductionKwh: 0,
      annualConsumptionKwh: 4000,
      batteryUsableKwh: 10,
      batteryCyclesPerYear: 200,
    });
    expect(none.selfConsumedKwh).toBe(0);
    expect(none.autarkyRatio).toBe(0);
    expect(Number.isNaN(none.selfConsumptionRatio)).toBe(false);
  });
});

describe("Wirtschaftlichkeit", () => {
  it("rechnet ein einfaches System ohne Preissteigerung und Degradation", () => {
    const result = calculateOffer(sample());
    expect(result.kwp).toBe(10);
    expect(result.inverterKw).toBe(10);
    expect(result.dcAcRatio).toBe(1);
    expect(result.pricing.net).toBe(6000);
    expect(result.pricing.vat).toBe(0);
    expect(result.pricing.margin).toBe(2100);
    expect(result.investment).toBe(6000);
    expect(result.yield.annualKwh).toBe(10000);
    expect(result.self.selfConsumedKwh).toBeCloseTo(2564.102564, 3);
    expect(result.kpis.annualSavingsYear1).toBeCloseTo(1364.102564, 2);
    expect(result.kpis.breakEvenYears).toBeCloseTo(4.398, 2);
    expect(result.kpis.netProfit).toBeCloseTo(1364.102564 * 20 - 6000, 1);
    expect(result.kpis.irr).not.toBeNull();
    expect(result.kpis.irr!).toBeGreaterThan(0.15);
    expect(result.kpis.irr!).toBeLessThan(0.3);
  });

  it("nutzt bei vorsteuerabzugsberechtigtem Gewerbe den Nettopreis als Investition", () => {
    const result = calculateOffer(
      sample({
        zeroRateEligible: false,
        vatDeductible: true,
      }),
    );
    expect(result.pricing.vat).toBeCloseTo(1140, 2);
    expect(result.pricing.gross).toBeCloseTo(7140, 2);
    expect(result.investment).toBe(6000);
  });

  it("nimmt bei Privatkunden den Bruttopreis", () => {
    const result = calculateOffer(
      sample({
        zeroRateEligible: false,
        vatDeductible: false,
        lines: [
          {
            id: "wb",
            section: "wallbox",
            name: "Wallbox",
            quantity: 1,
            unit: "Stk",
            unitPriceNet: 1000,
            purchasePriceNet: 600,
            discountPercent: 0,
            vatCategory: "REGEL",
            specs: {},
          },
        ],
        kwpOverride: 0,
      }),
    );
    expect(result.investment).toBe(1190);
  });

  it("lässt ein registriertes Ertragsmodell die Produktion bestimmen", () => {
    registerYieldProvider({
      id: "test-double",
      label: "Test",
      estimate: (input) => ({
        providerId: "test-double",
        annualKwh: input.kwp * input.specificYieldKwhPerKwp * 2,
        monthlyKwh: Array.from({ length: 12 }, () => 0),
        specificYieldKwhPerKwp: input.specificYieldKwhPerKwp * 2,
        description: "Test",
      }),
    });
    const result = calculateOffer(sample({ yieldProvider: "test-double" }));
    expect(result.yield.annualKwh).toBe(20000);
    expect(result.yield.providerId).toBe("test-double");
  });
});

describe("Finanzierung", () => {
  it("trifft die Annuität für 10.000 Euro, 4 Prozent, 10 Jahre", () => {
    expect(paymentForPeriods(10000, 0.04 / 12, 120)).toBeCloseTo(101.25, 2);
    const plan = financePlan({
      mode: "FINANZIERUNG",
      customerPays: 10000,
      downPayment: 0,
      financeYears: 10,
      financeInterestPct: 4,
      instalmentCount: 12,
      instalmentIntervalMonths: 1,
      instalmentInterestPct: 0,
    });
    expect(plan.payment).toBeCloseTo(101.25, 2);
    expect(plan.totalInterest).toBeGreaterThan(2000);
    expect(plan.totalPaid).toBeGreaterThan(10000);
  });

  it("teilt zinsfreie Raten gleichmäßig und zieht die Anzahlung ab", () => {
    const plan = financePlan({
      mode: "RATEN",
      customerPays: 12000,
      downPayment: 2000,
      financeYears: 10,
      financeInterestPct: 4,
      instalmentCount: 10,
      instalmentIntervalMonths: 1,
      instalmentInterestPct: 0,
    });
    expect(plan.principal).toBe(10000);
    expect(plan.payment).toBe(1000);
    expect(plan.totalInterest).toBe(0);
    expect(plan.totalPaid).toBe(12000);
  });

  it("findet 10 Prozent internen Zins bei einer einjährigen Rückzahlung", () => {
    expect(internalRateOfReturn([-100, 110])).toBeCloseTo(0.1, 6);
  });
});
