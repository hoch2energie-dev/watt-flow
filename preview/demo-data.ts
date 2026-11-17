import type { CatalogOption, LineDTO, OfferDTO, VariantDefaults } from "@/lib/domain";

/** Erfundene Beispieldaten für Vorschau und Tests. Keine echten Kunden, keine echten Preise. */
export const demoDefaults: VariantDefaults = {
  specificYield: 950,
  degradationPct: 0.5,
  horizonYears: 20,
  eegTariffEur: 0.078,
  postEegTariffEur: 0.04,
  opexEurPerYear: 150,
  batteryCyclesPerYear: 220,
};

function line(sortOrder: number, section: string, typeKey: string, name: string, quantity: number, unitPriceNet: number, purchasePriceNet: number, specs: LineDTO["specs"] = {}, unit = "Stk"): LineDTO {
  return {
    id: `demo-line-${sortOrder}`,
    catalogItemId: null,
    typeKey,
    section,
    name,
    description: null,
    quantity,
    unit,
    unitPriceNet,
    purchasePriceNet,
    discountPercent: 0,
    vatCategory: "PV_NULL",
    specs,
    sortOrder,
  };
}

export function demoOffer(): OfferDTO {
  return {
    id: "demo",
    number: "A-2026-0042",
    title: "PV mit Speicher, Musterweg 12",
    status: "ENTWURF",
    stageId: "s2",
    requestId: "demo-anfrage",
    householdKwh: 4500,
    heatPumpElectricKwh: 0,
    heatPumpThermalKwh: 0,
    evKwh: 2000,
    otherKwh: 0,
    electricityPriceEur: 0.36,
    priceIncreasePct: 3,
    buildingType: "Einfamilienhaus",
    buildingYear: 1998,
    roofType: "Ziegel",
    orientation: "Süd",
    tiltDeg: 30,
    roofAreaM2: 110,
    monumentProtected: false,
    buildingNote: "",
    existingPvKwp: 0,
    existingBatteryKwh: 0,
    existingWallbox: false,
    existingHeating: "Gas",
    latitude: 50.9413,
    longitude: 6.9583,
    locationSource: "manuell",
    locationLabel: "Beispielstandort",
    vatZeroEligible: true,
    vatDeductible: false,
    validUntil: null,
    signedAt: null,
    variants: [
      {
        id: "demo-variante",
        name: "Standard",
        sortOrder: 0,
        recommended: true,
        specificYield: demoDefaults.specificYield,
        yieldProvider: "specific",
        degradationPct: demoDefaults.degradationPct,
        horizonYears: demoDefaults.horizonYears,
        eegTariffEur: demoDefaults.eegTariffEur,
        postEegTariffEur: demoDefaults.postEegTariffEur,
        opexEurPerYear: demoDefaults.opexEurPerYear,
        batteryCyclesPerYear: demoDefaults.batteryCyclesPerYear,
        paymentMode: "BAR",
        rebateNet: 0,
        downPayment: 0,
        financeYears: 15,
        financeInterestPct: 4.5,
        instalmentCount: 12,
        instalmentIntervalMonths: 1,
        instalmentInterestPct: 0,
        kwpOverride: null,
        kwpManual: false,
        faces: [],
        yieldAnnualKwh: null,
        yieldMonthlyKwh: null,
        yieldNotice: "",
        yieldKey: "",
        lines: [
          line(0, "module", "pv_module", "Beispielmodul 450 Wp Glas-Glas", 24, 185, 118, { powerWp: 450, widthMm: 1134, heightMm: 1762 }),
          line(1, "inverter", "inverter", "Beispiel-Hybridwechselrichter 10 kW", 1, 1890, 1420, { acPowerKw: 10, phases: "3", mppt: 2 }),
          line(2, "mounting", "mounting_roof", "Montagesystem Ziegeldach und Elektroinstallation", 1, 3400, 2500, {}, "Pauschale"),
          line(3, "storage", "battery", "Beispielspeicher 10 kWh", 1, 5200, 4100, { usableKwh: 10 }),
          line(4, "extra", "scaffolding", "Gerüst", 1, 950, 700, {}, "Pauschale"),
        ],
      },
    ],
  };
}

function option(id: string, typeKey: string, name: string, salesPriceNet: number, purchasePriceNet: number, specs: CatalogOption["specs"], vatCategory: CatalogOption["vatCategory"] = "PV_NULL"): CatalogOption {
  return { id, typeKey, manufacturer: "Beispiel", model: name, name, unit: "Stk", purchasePriceNet, salesPriceNet, vatCategory, specs, description: null, active: true };
}

export const demoCatalog: CatalogOption[] = [
  option("k1", "pv_module", "Beispielmodul 450 Wp Glas-Glas", 185, 118, { powerWp: 450, widthMm: 1134, heightMm: 1762 }),
  option("k2", "pv_module", "Beispielmodul 430 Wp schwarz", 172, 109, { powerWp: 430, widthMm: 1134, heightMm: 1722 }),
  option("k3", "inverter", "Beispiel-Hybridwechselrichter 10 kW", 1890, 1420, { acPowerKw: 10, phases: "3", mppt: 2 }),
  option("k4", "battery", "Beispielspeicher 10 kWh", 5200, 4100, { usableKwh: 10 }),
  option("k5", "wallbox", "Beispiel-Wallbox 11 kW", 890, 610, { powerKw: 11, phases: "3" }, "REGEL"),
  option("k6", "heat_pump", "Beispiel-Luftwärmepumpe 8 kW", 14900, 11200, { heatingPowerKw: 8 }, "REGEL"),
];

export const demoMeta = {
  customerName: "Marlene Beispiel",
  customerId: "demo-kunde",
  customerEmail: "marlene@beispiel.example",
  customerPhone: "0221 5550100",
  requestId: "demo-anfrage",
  requestNumber: "R-2026-0031",
  siteAddress: "Musterweg 12, 50667 Köln",
  segment: "HAUSHALT" as const,
  locked: false,
  isAdmin: true,
  stages: [
    { id: "s1", name: "Neu" },
    { id: "s2", name: "In Arbeit" },
    { id: "s3", name: "Warten auf Rückmeldung" },
  ],
  defaults: demoDefaults,
};
