/**
 * Ertragsrechnung.
 *
 * Stufe 1 kennt nur den spezifischen Ertrag (kWh/kWp), den das Team selbst setzt.
 * Ein späteres PVGIS-Modell registriert sich über registerYieldProvider und liefert
 * dieselbe Struktur (Jahresertrag + 12 Monatswerte). Wirtschaftlichkeit und PDF
 * hängen nur an diesem Ergebnis, nicht am Rechenweg.
 */

export const GERMAN_PV_MONTHLY_SHARE = [
  0.03, 0.045, 0.08, 0.105, 0.12, 0.13, 0.135, 0.12, 0.095, 0.07, 0.04, 0.03,
];

export type YieldInput = {
  kwp: number;
  specificYieldKwhPerKwp: number;
  latitude?: number;
  longitude?: number;
  tiltDeg?: number;
  azimuthDeg?: number;
  /** Gespeicherte PVGIS-Monatswerte. Lieferung 2 kann zusätzlich eine Stundenreihe übergeben. */
  storedMonthlyKwh?: number[] | null;
  hourlyKwh?: number[] | null;
  fallbackNotice?: string;
};

export type YieldEstimate = {
  providerId: string;
  annualKwh: number;
  monthlyKwh: number[];
  specificYieldKwhPerKwp: number;
  description: string;
};

export interface YieldProvider {
  id: string;
  label: string;
  estimate(input: YieldInput): YieldEstimate;
}

export class SpecificYieldProvider implements YieldProvider {
  id = "specific";
  label = "Spezifischer Ertrag";

  estimate(input: YieldInput): YieldEstimate {
    const kwp = Math.max(0, Number.isFinite(input.kwp) ? input.kwp : 0);
    const specific = Math.max(0, Number.isFinite(input.specificYieldKwhPerKwp) ? input.specificYieldKwhPerKwp : 0);
    const annualKwh = kwp * specific;
    const shares = GERMAN_PV_MONTHLY_SHARE;
    const shareSum = shares.reduce((sum, value) => sum + value, 0);
    const monthlyKwh = shares.slice(0, -1).map((share) => (annualKwh * share) / shareSum);
    const used = monthlyKwh.reduce((sum, value) => sum + value, 0);
    monthlyKwh.push(annualKwh - used);
    return {
      providerId: this.id,
      annualKwh,
      monthlyKwh,
      specificYieldKwhPerKwp: specific,
      description:
        "Jahresertrag = Anlagengröße × spezifischer Ertrag. Die Monatswerte sind eine typische deutsche Verteilung und keine standortgenaue Simulation.",
    };
  }
}

const providers: Record<string, YieldProvider> = {
  specific: new SpecificYieldProvider(),
};

export function registerYieldProvider(provider: YieldProvider): void {
  providers[provider.id] = provider;
}

export function getYieldProvider(id = "specific"): YieldProvider {
  return providers[id] ?? providers.specific;
}
