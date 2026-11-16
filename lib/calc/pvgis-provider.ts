import { getYieldProvider, registerYieldProvider, type YieldEstimate, type YieldInput, type YieldProvider } from "@/lib/calc/yield";
import { PVGIS_SOURCE_NOTE } from "@/lib/pvgis/types";

function storedMonthly(input: YieldInput): number[] | null {
  const monthly = input.storedMonthlyKwh;
  if (!monthly || monthly.length !== 12) return null;
  if (!monthly.every((value) => Number.isFinite(value) && value >= 0)) return null;
  return monthly;
}

export class PvgisYieldProvider implements YieldProvider {
  id = "pvgis";
  label = "PVGIS";

  estimate(input: YieldInput): YieldEstimate {
    const monthly = storedMonthly(input);
    const kwp = Math.max(0, input.kwp);
    if (!monthly) {
      const fallback = getYieldProvider("specific").estimate(input);
      return {
        ...fallback,
        description: input.fallbackNotice || fallback.description,
      };
    }
    const annualKwh = monthly.reduce((sum, value) => sum + value, 0);
    return {
      providerId: this.id,
      annualKwh,
      monthlyKwh: monthly,
      specificYieldKwhPerKwp: kwp > 0 ? annualKwh / kwp : 0,
      description: "Standortbezogene Rechnung für die eingetragenen Dachflächen.",
    };
  }
}

let registered = false;

export function ensurePvgisProvider(): void {
  if (registered) return;
  registerYieldProvider(new PvgisYieldProvider());
  registered = true;
}

ensurePvgisProvider();
