import type { CalcResult } from "@/lib/calc/offer";
import { annualConsumption, type OfferDTO, type VariantDTO } from "@/lib/domain";
import { formatEuro, formatNumber, formatPercent } from "@/lib/format";
import { PAYMENT_LABEL } from "@/lib/labels";

/**
 * Gliederung und Kurzwerte der Angebotsseite. Schrittleiste und Kachelübersicht
 * zeigen dieselben Angaben, deshalb stehen sie hier an einer Stelle.
 */
export type StepId = "verbrauch" | "gebaeude" | "bestand" | "solar" | "speicher" | "wallbox" | "waerme" | "extras" | "zahlung" | "ergebnisse";

export type StepGroup = { id: "grundlagen" | "planung" | "abschluss"; label: string; steps: { id: StepId; label: string }[] };

export const STEP_GROUPS: StepGroup[] = [
  {
    id: "grundlagen",
    label: "Grundlagen",
    steps: [
      { id: "verbrauch", label: "Verbrauch" },
      { id: "gebaeude", label: "Gebäude" },
      { id: "bestand", label: "Bestand" },
    ],
  },
  {
    id: "planung",
    label: "Planung",
    steps: [
      { id: "solar", label: "Solar" },
      { id: "speicher", label: "Speicher" },
      { id: "wallbox", label: "Wallbox" },
      { id: "waerme", label: "Wärmepumpe" },
      { id: "extras", label: "Extras" },
    ],
  },
  {
    id: "abschluss",
    label: "Abschluss",
    steps: [
      { id: "zahlung", label: "Zahlung" },
      { id: "ergebnisse", label: "Ergebnisse" },
    ],
  },
];

export const STEP_ORDER: StepId[] = STEP_GROUPS.flatMap((group) => group.steps.map((step) => step.id));

/** Abschnitte der Positionen, die zu einem Schritt gehören. */
export const STEP_SECTIONS: Record<StepId, string[]> = {
  verbrauch: [],
  gebaeude: [],
  bestand: [],
  solar: ["module", "inverter", "mounting"],
  speicher: ["storage"],
  wallbox: ["wallbox"],
  waerme: ["heatpump"],
  extras: ["extra"],
  zahlung: [],
  ergebnisse: [],
};

/** Nettosumme der Positionen eines Schritts vor dem Gesamtrabatt. */
export function stepNet(result: CalcResult, step: StepId): number {
  const sections = STEP_SECTIONS[step];
  return result.pricing.lines.filter((line) => sections.includes(line.section)).reduce((sum, line) => sum + line.netBeforeRebate, 0);
}

export function stepItems(variant: VariantDTO, step: StepId): number {
  const sections = STEP_SECTIONS[step];
  return variant.lines.filter((line) => sections.includes(line.section) && line.quantity > 0).length;
}

/** Kurzwert für die Schrittleiste. Leerer Text heißt: noch nichts eingetragen. */
export function stepValue(step: StepId, offer: OfferDTO, variant: VariantDTO, result: CalcResult): string {
  const net = stepNet(result, step);
  const price = net > 0 ? formatEuro(net) : "";
  switch (step) {
    case "verbrauch": {
      const kwh = annualConsumption(offer);
      return kwh > 0 ? `${formatNumber(kwh, 0)} kWh` : "";
    }
    case "gebaeude":
      return offer.buildingType || "";
    case "bestand": {
      const parts = [
        offer.existingPvKwp > 0 ? `PV ${formatNumber(offer.existingPvKwp, 1)} kWp` : "",
        offer.existingBatteryKwh > 0 ? `Speicher ${formatNumber(offer.existingBatteryKwh, 1)} kWh` : "",
        offer.existingWallbox ? "Wallbox" : "",
        offer.existingHeating,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : "Keine Anlagen";
    }
    case "solar":
      return [result.kwp > 0 ? `${formatNumber(result.kwp, 2)} kWp` : "", price].filter(Boolean).join(" · ");
    case "speicher":
      return [result.batteryKwh > 0 ? `${formatNumber(result.batteryKwh, 1)} kWh` : "", price].filter(Boolean).join(" · ");
    case "wallbox":
    case "waerme":
    case "extras":
      return price;
    case "zahlung":
      return PAYMENT_LABEL[variant.paymentMode];
    case "ergebnisse":
      return result.kpis.breakEvenYears == null ? "" : `${formatNumber(result.kpis.breakEvenYears, 1)} Jahre`;
  }
}

export type SolarProgress = { roof: boolean; modules: boolean; inverter: boolean };

/** Was an der Photovoltaik schon steht: Dach in der Planung, Module und Wechselrichter in den Positionen. */
export function solarProgress(variant: VariantDTO): SolarProgress {
  const has = (section: string) => variant.lines.some((line) => line.section === section && line.quantity > 0);
  return {
    roof: variant.faces.some((face) => (face.geometry?.ring.length ?? 0) >= 3),
    modules: has("module"),
    inverter: has("inverter"),
  };
}

/** Kennzahlen, die neben den Schritten immer sichtbar sind. */
export function keyFigures(result: CalcResult): { label: string; value: string }[] {
  const dash = "–";
  const produces = result.yield.annualKwh > 0;
  return [
    { label: "Investition", value: formatEuro(result.investment) },
    { label: "Marge", value: result.pricing.net > 0 ? `${formatEuro(result.pricing.margin)} · ${formatPercent(result.pricing.marginPercent, 0)}` : dash },
    { label: "Amortisation", value: result.kpis.breakEvenYears == null ? dash : `${formatNumber(result.kpis.breakEvenYears, 1)} Jahre` },
    { label: "Rendite", value: result.kpis.irr == null ? dash : formatPercent(result.kpis.irr) },
    { label: "Produktion", value: produces ? `${formatNumber(result.yield.annualKwh, 0)} kWh/Jahr` : dash },
    { label: "Autarkie", value: produces ? formatPercent(result.self.autarkyRatio, 0) : dash },
    { label: "Eigenverbrauch", value: produces ? formatPercent(result.self.selfConsumptionRatio, 0) : dash },
  ];
}
