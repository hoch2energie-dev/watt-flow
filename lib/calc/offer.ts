import {
  breakEvenYear,
  buildCashflow,
  estimateSelfConsumption,
  financePlan,
  internalRateOfReturn,
  type CashflowYear,
  type FinancePlan,
  type SelfConsumption,
} from "@/lib/calc/economics";
import { priceOffer, type PriceSummary, type VatCategory } from "@/lib/calc/pricing";
import { ensurePvgisProvider } from "@/lib/calc/pvgis-provider";
import { getYieldProvider, type YieldEstimate } from "@/lib/calc/yield";

ensurePvgisProvider();

export type CalcLine = {
  id: string;
  section: string;
  name: string;
  quantity: number;
  unit: string;
  unitPriceNet: number;
  purchasePriceNet: number;
  discountPercent: number;
  vatCategory: VatCategory;
  specs: Record<string, string | number | boolean | null>;
};

export type CalcInput = {
  zeroRateEligible: boolean;
  vatDeductible: boolean;
  rebateNet: number;
  householdKwh: number;
  heatPumpElectricKwh: number;
  evKwh: number;
  otherKwh: number;
  electricityPriceEur: number;
  priceIncreasePct: number;
  lines: CalcLine[];
  specificYield: number;
  yieldProvider: string;
  storedMonthlyKwh?: number[] | null;
  kwpOverride: number | null;
  kwpManual: boolean;
  degradationPct: number;
  horizonYears: number;
  eegTariffEur: number;
  postEegTariffEur: number;
  opexEurPerYear: number;
  batteryCyclesPerYear: number;
  paymentMode: "BAR" | "FINANZIERUNG" | "RATEN";
  downPayment: number;
  financeYears: number;
  financeInterestPct: number;
  instalmentCount: number;
  instalmentIntervalMonths: number;
  instalmentInterestPct: number;
};

export type CalcResult = {
  consumptionKwh: number;
  kwp: number;
  inverterKw: number;
  dcAcRatio: number | null;
  batteryKwh: number;
  yield: YieldEstimate;
  self: SelfConsumption;
  pricing: PriceSummary;
  investment: number;
  financing: FinancePlan;
  cashflow: CashflowYear[];
  kpis: {
    annualSavingsYear1: number;
    breakEvenYears: number | null;
    irr: number | null;
    netProfit: number;
    totalBenefit: number;
    costPerSelfUsedKwh: number | null;
    lcoePerKwh: number | null;
  };
};

function specNumber(specs: CalcLine["specs"], key: string): number {
  const value = specs[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function sumSectionSpec(lines: CalcLine[], section: string, key: string): number {
  return lines
    .filter((line) => line.section === section)
    .reduce((sum, line) => sum + specNumber(line.specs, key) * Math.max(0, line.quantity), 0);
}

export function resolveKwp(input: Pick<CalcInput, "lines" | "kwpManual" | "kwpOverride">): number {
  const fromModules = sumSectionSpec(input.lines, "module", "powerWp") / 1000;
  if (input.kwpManual && input.kwpOverride != null && Number.isFinite(input.kwpOverride)) {
    return Math.max(0, input.kwpOverride);
  }
  if (fromModules > 0) return fromModules;
  return Math.max(0, input.kwpOverride ?? 0);
}

export function resolveBatteryKwh(lines: CalcLine[]): number {
  const usable = sumSectionSpec(lines, "storage", "usableKwh");
  if (usable > 0) return usable;
  return sumSectionSpec(lines, "storage", "capacityKwh");
}

export function calculateOffer(input: CalcInput): CalcResult {
  const consumptionKwh = Math.max(
    0,
    input.householdKwh + input.heatPumpElectricKwh + input.evKwh + input.otherKwh,
  );
  const kwp = resolveKwp(input);
  const inverterKw = sumSectionSpec(input.lines, "inverter", "acPowerKw");
  const dcAcRatio = inverterKw > 0 ? kwp / inverterKw : null;
  const batteryKwh = resolveBatteryKwh(input.lines);
  const yieldEstimate = getYieldProvider(input.yieldProvider).estimate({
    kwp,
    specificYieldKwhPerKwp: input.specificYield,
    storedMonthlyKwh: input.storedMonthlyKwh,
  });
  const self = estimateSelfConsumption({
    annualProductionKwh: yieldEstimate.annualKwh,
    annualConsumptionKwh: consumptionKwh,
    batteryUsableKwh: batteryKwh,
    batteryCyclesPerYear: input.batteryCyclesPerYear,
  });
  const pricing = priceOffer({
    lines: input.lines,
    rebateNet: input.rebateNet,
    zeroRateEligible: input.zeroRateEligible,
  });
  const investment = input.vatDeductible ? pricing.net : pricing.gross;
  const financing = financePlan({
    mode: input.paymentMode,
    customerPays: investment,
    downPayment: input.downPayment,
    financeYears: input.financeYears,
    financeInterestPct: input.financeInterestPct,
    instalmentCount: input.instalmentCount,
    instalmentIntervalMonths: input.instalmentIntervalMonths,
    instalmentInterestPct: input.instalmentInterestPct,
  });
  const cashflow = buildCashflow({
    investment,
    annualProductionKwh: yieldEstimate.annualKwh,
    annualConsumptionKwh: consumptionKwh,
    batteryUsableKwh: batteryKwh,
    batteryCyclesPerYear: input.batteryCyclesPerYear,
    electricityPriceEur: input.electricityPriceEur,
    priceIncreasePct: input.priceIncreasePct,
    eegTariffEur: input.eegTariffEur,
    postEegTariffEur: input.postEegTariffEur,
    degradationPct: input.degradationPct,
    opexEurPerYear: input.opexEurPerYear,
    horizonYears: input.horizonYears,
  });
  const operatingYears = cashflow.filter((row) => row.year > 0);
  const totalBenefit = operatingYears.reduce((sum, row) => sum + row.energyBenefit, 0);
  const totalOpex = operatingYears.reduce((sum, row) => sum + row.opex, 0);
  const selfUsed = operatingYears.reduce((sum, row) => sum + row.selfConsumedKwh, 0);
  const feedInRevenue = operatingYears.reduce((sum, row) => sum + row.feedInKwh * row.feedInTariff, 0);
  const produced = operatingYears.reduce((sum, row) => sum + row.productionKwh, 0);
  const netProfit = cashflow.length > 0 ? cashflow[cashflow.length - 1].cumulative : 0;
  const year1 = operatingYears[0];

  return {
    consumptionKwh,
    kwp,
    inverterKw,
    dcAcRatio,
    batteryKwh,
    yield: yieldEstimate,
    self,
    pricing,
    investment,
    financing,
    cashflow,
    kpis: {
      annualSavingsYear1: year1 ? year1.energyBenefit - year1.opex : 0,
      breakEvenYears: breakEvenYear(cashflow),
      irr: internalRateOfReturn(cashflow.map((row) => row.cashflow)),
      netProfit,
      totalBenefit,
      costPerSelfUsedKwh: selfUsed > 0 ? (investment - feedInRevenue) / selfUsed : null,
      lcoePerKwh: produced > 0 ? (investment + totalOpex) / produced : null,
    },
  };
}
