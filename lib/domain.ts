import type { CalcInput, CalcLine } from "@/lib/calc/offer";
import type { Qualification } from "@/lib/checklist";
import { yieldRequestKey } from "@/lib/pvgis/faces";
import type { RoofFaceInput } from "@/lib/pvgis/types";
import type { TenantPower } from "@/lib/tenant-power";

export type VatCategory = "PV_NULL" | "REGEL";
export type Segment = "HAUSHALT" | "GEWERBE";
export type PaymentMode = "BAR" | "FINANZIERUNG" | "RATEN";
export type OfferStatus = "ENTWURF" | "VERSENDET" | "ANGENOMMEN" | "ABGELEHNT";
export type Specs = Record<string, string | number | boolean | null>;

export type LineDTO = {
  id: string;
  catalogItemId: string | null;
  typeKey: string | null;
  section: string;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unitPriceNet: number;
  purchasePriceNet: number;
  discountPercent: number;
  vatCategory: VatCategory;
  specs: Specs;
  sortOrder: number;
};

export type VariantDTO = {
  id: string;
  name: string;
  sortOrder: number;
  recommended: boolean;
  specificYield: number;
  yieldProvider: string;
  degradationPct: number;
  horizonYears: number;
  eegTariffEur: number;
  postEegTariffEur: number;
  opexEurPerYear: number;
  batteryCyclesPerYear: number;
  paymentMode: PaymentMode;
  rebateNet: number;
  downPayment: number;
  financeYears: number;
  financeInterestPct: number;
  instalmentCount: number;
  instalmentIntervalMonths: number;
  instalmentInterestPct: number;
  kwpOverride: number | null;
  kwpManual: boolean;
  faces: RoofFaceInput[];
  yieldAnnualKwh: number | null;
  yieldMonthlyKwh: number[] | null;
  yieldNotice: string;
  yieldKey: string;
  lines: LineDTO[];
};

export type OfferDTO = {
  id: string;
  number: string;
  title: string;
  status: OfferStatus;
  stageId: string | null;
  requestId: string;
  householdKwh: number;
  heatPumpElectricKwh: number;
  heatPumpThermalKwh: number;
  evKwh: number;
  otherKwh: number;
  electricityPriceEur: number;
  priceIncreasePct: number;
  buildingType: string;
  buildingYear: number | null;
  roofType: string;
  orientation: string;
  tiltDeg: number | null;
  roofAreaM2: number | null;
  monumentProtected: boolean;
  buildingNote: string;
  existingPvKwp: number;
  existingBatteryKwh: number;
  existingWallbox: boolean;
  existingHeating: string;
  latitude: number | null;
  longitude: number | null;
  locationSource: string;
  locationLabel: string;
  vatZeroEligible: boolean;
  vatDeductible: boolean;
  validUntil: string | null;
  signedAt: string | null;
  /** Mieterstrom-Einstellungen. `null`, solange keine angelegt sind. */
  tenantPower: TenantPower | null;
  variants: VariantDTO[];
};

export type CatalogOption = {
  id: string;
  typeKey: string;
  manufacturer: string;
  model: string;
  name: string;
  unit: string;
  purchasePriceNet: number;
  salesPriceNet: number;
  vatCategory: VatCategory;
  specs: Specs;
  description: string | null;
  active: boolean;
};

export function asSpecs(value: unknown): Specs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const specs: Specs = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean" || entry === null) {
      specs[key] = entry;
    }
  }
  return specs;
}

export function toCalcInput(offer: OfferDTO, variant: VariantDTO): CalcInput {
  const lines: CalcLine[] = variant.lines.map((line) => ({
    id: line.id,
    section: line.section,
    name: line.name,
    quantity: line.quantity,
    unit: line.unit,
    unitPriceNet: line.unitPriceNet,
    purchasePriceNet: line.purchasePriceNet,
    discountPercent: line.discountPercent,
    vatCategory: line.vatCategory,
    specs: line.specs,
  }));
  return {
    zeroRateEligible: offer.vatZeroEligible,
    vatDeductible: offer.vatDeductible,
    rebateNet: variant.rebateNet,
    householdKwh: offer.householdKwh,
    heatPumpElectricKwh: offer.heatPumpElectricKwh,
    evKwh: offer.evKwh,
    otherKwh: offer.otherKwh,
    electricityPriceEur: offer.electricityPriceEur,
    priceIncreasePct: offer.priceIncreasePct,
    lines,
    specificYield: variant.specificYield,
    yieldProvider: freshYield(offer, variant) ? "pvgis" : variant.yieldProvider === "pvgis" ? "specific" : variant.yieldProvider,
    storedMonthlyKwh: freshYield(offer, variant) ? variant.yieldMonthlyKwh : null,
    kwpOverride: variant.kwpOverride,
    kwpManual: variant.kwpManual,
    degradationPct: variant.degradationPct,
    horizonYears: variant.horizonYears,
    eegTariffEur: variant.eegTariffEur,
    postEegTariffEur: variant.postEegTariffEur,
    opexEurPerYear: variant.opexEurPerYear,
    batteryCyclesPerYear: variant.batteryCyclesPerYear,
    paymentMode: variant.paymentMode,
    downPayment: variant.downPayment,
    financeYears: variant.financeYears,
    financeInterestPct: variant.financeInterestPct,
    instalmentCount: variant.instalmentCount,
    instalmentIntervalMonths: variant.instalmentIntervalMonths,
    instalmentInterestPct: variant.instalmentInterestPct,
  };
}

export type VariantDefaults = {
  specificYield: number;
  degradationPct: number;
  horizonYears: number;
  eegTariffEur: number;
  postEegTariffEur: number;
  opexEurPerYear: number;
  batteryCyclesPerYear: number;
};

export function blankVariant(name: string, sortOrder: number, defaults: VariantDefaults, recommended = false): VariantDTO {
  return {
    id: crypto.randomUUID(),
    name,
    sortOrder,
    recommended,
    specificYield: defaults.specificYield,
    yieldProvider: "specific",
    degradationPct: defaults.degradationPct,
    horizonYears: defaults.horizonYears,
    eegTariffEur: defaults.eegTariffEur,
    postEegTariffEur: defaults.postEegTariffEur,
    opexEurPerYear: defaults.opexEurPerYear,
    batteryCyclesPerYear: defaults.batteryCyclesPerYear,
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
    lines: [],
  };
}

export function freshYield(offer: Pick<OfferDTO, "latitude" | "longitude">, variant: Pick<VariantDTO, "yieldProvider" | "yieldKey" | "yieldMonthlyKwh" | "faces">): boolean {
  if (variant.yieldProvider !== "pvgis" || offer.latitude == null || offer.longitude == null) return false;
  if (!variant.yieldMonthlyKwh || variant.yieldMonthlyKwh.length !== 12) return false;
  return variant.yieldKey === yieldRequestKey(offer.latitude, offer.longitude, variant.faces);
}

export function annualConsumption(offer: Pick<OfferDTO, "householdKwh" | "heatPumpElectricKwh" | "evKwh" | "otherKwh">): number {
  return Math.max(0, offer.householdKwh + offer.heatPumpElectricKwh + offer.evKwh + offer.otherKwh);
}

export type QualificationState = Qualification;
