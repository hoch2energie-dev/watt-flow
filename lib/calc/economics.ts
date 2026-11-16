import { clamp, roundCents } from "@/lib/calc/money";

/**
 * Eigenverbrauch für ein Wohngebäude mit üblichem Lastprofil.
 *
 * Ohne Speicher:
 *   x = Jahresproduktion / Jahresverbrauch
 *   Direktquote der Produktion = 1 / (1 + ALPHA * x)
 *
 * Mit Speicher kommt ein Zuschlag dazu, begrenzt durch den Überschuss,
 * die noch offene Last und nutzbare Kapazität × angenommene Vollzyklen.
 *
 * Das ist eine Beratungsschätzung, keine Lastgangsimulation.
 */
export const SELF_CONSUMPTION_ALPHA = 1.45;
export const BATTERY_SURPLUS_FACTOR = 0.8;

export type SelfConsumptionInput = {
  annualProductionKwh: number;
  annualConsumptionKwh: number;
  batteryUsableKwh: number;
  batteryCyclesPerYear: number;
};

export type SelfConsumption = {
  productionKwh: number;
  consumptionKwh: number;
  directKwh: number;
  batteryKwh: number;
  selfConsumedKwh: number;
  feedInKwh: number;
  selfConsumptionRatio: number;
  autarkyRatio: number;
};

export function estimateSelfConsumption(input: SelfConsumptionInput): SelfConsumption {
  const production = Math.max(0, input.annualProductionKwh);
  const consumption = Math.max(0, input.annualConsumptionKwh);
  const empty: SelfConsumption = {
    productionKwh: production,
    consumptionKwh: consumption,
    directKwh: 0,
    batteryKwh: 0,
    selfConsumedKwh: 0,
    feedInKwh: production,
    selfConsumptionRatio: 0,
    autarkyRatio: 0,
  };
  if (production <= 0 || consumption <= 0) return empty;

  const ratio = production / consumption;
  const directRatio = 1 / (1 + SELF_CONSUMPTION_ALPHA * ratio);
  const direct = Math.min(production, consumption, production * directRatio);
  const surplus = Math.max(0, production - direct);
  const remainingLoad = Math.max(0, consumption - direct);
  const batteryCapacity = Math.max(0, input.batteryUsableKwh) * Math.max(0, input.batteryCyclesPerYear);
  const battery = Math.min(surplus * BATTERY_SURPLUS_FACTOR, batteryCapacity, remainingLoad);
  const selfConsumed = Math.min(production, consumption, direct + battery);
  const feedIn = Math.max(0, production - selfConsumed);

  return {
    productionKwh: production,
    consumptionKwh: consumption,
    directKwh: direct,
    batteryKwh: battery,
    selfConsumedKwh: selfConsumed,
    feedInKwh: feedIn,
    selfConsumptionRatio: selfConsumed / production,
    autarkyRatio: selfConsumed / consumption,
  };
}

export type CashflowYear = {
  year: number;
  productionKwh: number;
  selfConsumedKwh: number;
  feedInKwh: number;
  electricityPrice: number;
  feedInTariff: number;
  energyBenefit: number;
  opex: number;
  cashflow: number;
  cumulative: number;
};

export type CashflowInput = {
  investment: number;
  annualProductionKwh: number;
  annualConsumptionKwh: number;
  batteryUsableKwh: number;
  batteryCyclesPerYear: number;
  electricityPriceEur: number;
  priceIncreasePct: number;
  eegTariffEur: number;
  postEegTariffEur: number;
  degradationPct: number;
  opexEurPerYear: number;
  horizonYears: number;
};

export function buildCashflow(input: CashflowInput): CashflowYear[] {
  const horizon = clamp(Math.round(input.horizonYears), 1, 40);
  const degradation = clamp(input.degradationPct, 0, 20) / 100;
  const growth = clamp(input.priceIncreasePct, -20, 30) / 100;
  const investment = Math.max(0, input.investment);
  const opex = Math.max(0, input.opexEurPerYear);
  const rows: CashflowYear[] = [
    {
      year: 0,
      productionKwh: 0,
      selfConsumedKwh: 0,
      feedInKwh: 0,
      electricityPrice: Math.max(0, input.electricityPriceEur),
      feedInTariff: Math.max(0, input.eegTariffEur),
      energyBenefit: 0,
      opex: 0,
      cashflow: -investment,
      cumulative: -investment,
    },
  ];

  for (let year = 1; year <= horizon; year += 1) {
    const production = Math.max(0, input.annualProductionKwh) * Math.pow(1 - degradation, year - 1);
    const self = estimateSelfConsumption({
      annualProductionKwh: production,
      annualConsumptionKwh: input.annualConsumptionKwh,
      batteryUsableKwh: input.batteryUsableKwh,
      batteryCyclesPerYear: input.batteryCyclesPerYear,
    });
    const price = Math.max(0, input.electricityPriceEur) * Math.pow(1 + growth, year - 1);
    const tariff = year <= 20 ? Math.max(0, input.eegTariffEur) : Math.max(0, input.postEegTariffEur);
    const energyBenefit = self.selfConsumedKwh * price + self.feedInKwh * tariff;
    const cashflow = energyBenefit - opex;
    const cumulative = rows[rows.length - 1].cumulative + cashflow;
    rows.push({
      year,
      productionKwh: production,
      selfConsumedKwh: self.selfConsumedKwh,
      feedInKwh: self.feedInKwh,
      electricityPrice: price,
      feedInTariff: tariff,
      energyBenefit,
      opex,
      cashflow,
      cumulative,
    });
  }
  return rows;
}

/** Erstes Jahr, in dem die Summe der Vorteile die Investition erreicht. Zwischen Jahre interpoliert. */
export function breakEvenYear(rows: Pick<CashflowYear, "year" | "cumulative">[]): number | null {
  if (rows.length === 0) return null;
  if (rows[0].cumulative >= 0) return 0;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (previous.cumulative < 0 && current.cumulative >= 0) {
      const span = current.cumulative - previous.cumulative;
      if (span <= 0) return current.year;
      return previous.year + -previous.cumulative / span;
    }
  }
  return null;
}

/** Interner Zinsfuß per Newton-Verfahren. Rückgabe als Dezimalzahl (0.08 = 8 %). */
export function internalRateOfReturn(cashflows: number[]): number | null {
  if (cashflows.length < 2) return null;
  if (!cashflows.some((value) => value > 0) || !cashflows.some((value) => value < 0)) return null;
  let rate = 0.08;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    let npv = 0;
    let derivative = 0;
    for (let year = 0; year < cashflows.length; year += 1) {
      const denominator = Math.pow(1 + rate, year);
      npv += cashflows[year] / denominator;
      if (year > 0) derivative -= (year * cashflows[year]) / Math.pow(1 + rate, year + 1);
    }
    if (!Number.isFinite(npv) || !Number.isFinite(derivative) || Math.abs(derivative) < 1e-12) return null;
    const next = rate - npv / derivative;
    if (!Number.isFinite(next)) return null;
    if (Math.abs(next - rate) < 1e-8) return next;
    rate = Math.min(5, Math.max(-0.9, next));
  }
  return Number.isFinite(rate) ? rate : null;
}

export type FinanceMode = "BAR" | "FINANZIERUNG" | "RATEN";

export type FinancePlan = {
  mode: FinanceMode;
  customerPays: number;
  downPayment: number;
  principal: number;
  periods: number;
  intervalMonths: number;
  interestPct: number;
  payment: number;
  totalPaid: number;
  totalInterest: number;
};

export function paymentForPeriods(principal: number, periodInterestRate: number, periods: number): number {
  if (principal <= 0 || periods <= 0) return 0;
  if (periodInterestRate <= 0) return roundCents(principal / periods);
  const factor = Math.pow(1 + periodInterestRate, periods);
  return roundCents((principal * (periodInterestRate * factor)) / (factor - 1));
}

export function financePlan(input: {
  mode: FinanceMode;
  customerPays: number;
  downPayment: number;
  financeYears: number;
  financeInterestPct: number;
  instalmentCount: number;
  instalmentIntervalMonths: number;
  instalmentInterestPct: number;
}): FinancePlan {
  const customerPays = roundCents(Math.max(0, input.customerPays));
  if (input.mode === "BAR") {
    return {
      mode: "BAR",
      customerPays,
      downPayment: 0,
      principal: customerPays,
      periods: 1,
      intervalMonths: 0,
      interestPct: 0,
      payment: customerPays,
      totalPaid: customerPays,
      totalInterest: 0,
    };
  }

  if (input.mode === "FINANZIERUNG") {
    const years = clamp(Math.round(input.financeYears), 1, 30);
    const periods = years * 12;
    const downPayment = roundCents(clamp(input.downPayment, 0, customerPays));
    const principal = roundCents(customerPays - downPayment);
    const interestPct = clamp(input.financeInterestPct, 0, 25);
    const payment = paymentForPeriods(principal, interestPct / 100 / 12, periods);
    const paidToLender = roundCents(payment * periods);
    return {
      mode: "FINANZIERUNG",
      customerPays,
      downPayment,
      principal,
      periods,
      intervalMonths: 1,
      interestPct,
      payment,
      totalPaid: roundCents(paidToLender + downPayment),
      totalInterest: roundCents(paidToLender - principal),
    };
  }

  const periods = clamp(Math.round(input.instalmentCount), 1, 120);
  const intervalMonths = clamp(Math.round(input.instalmentIntervalMonths), 1, 12);
  const downPayment = roundCents(clamp(input.downPayment, 0, customerPays));
  const principal = roundCents(customerPays - downPayment);
  const interestPct = clamp(input.instalmentInterestPct, 0, 25);
  const payment = paymentForPeriods(principal, (interestPct / 100) * (intervalMonths / 12), periods);
  const paid = roundCents(payment * periods);
  return {
    mode: "RATEN",
    customerPays,
    downPayment,
    principal,
    periods,
    intervalMonths,
    interestPct,
    payment,
    totalPaid: roundCents(paid + downPayment),
    totalInterest: roundCents(paid - principal),
  };
}
