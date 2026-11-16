import { describe, expect, it } from "vitest";
import { getYieldProvider } from "@/lib/calc/yield";
import "@/lib/calc/pvgis-provider";
import { compassToPvgisAspect } from "@/lib/pvgis/azimuth";
import { fetchPvgisHourly, fetchPvgisPlane, pvgisCacheKey } from "@/lib/pvgis/client";
import { sumFaceYields } from "@/lib/pvgis/faces";
import { parsePvcalc, parseSeriesHourly } from "@/lib/pvgis/parse";

function pvcalcBody(monthly: number[], annual: number) {
  return {
    outputs: {
      monthly: { fixed: monthly.map((energy, index) => ({ month: index + 1, E_m: energy })) },
      totals: { fixed: { E_y: annual } },
    },
  };
}

describe("PVGIS Aspekt", () => {
  it("rechnet die Kompassrose auf Süd = 0 um", () => {
    expect(compassToPvgisAspect(180)).toBe(0);
    expect(compassToPvgisAspect(270)).toBe(90);
    expect(compassToPvgisAspect(90)).toBe(-90);
    expect(compassToPvgisAspect(0)).toBe(180);
    expect(compassToPvgisAspect(225)).toBe(45);
    expect(compassToPvgisAspect(360)).toBe(180);
  });
});

describe("mehrere Dachflächen", () => {
  it("addiert Jahres- und Monatserträge", () => {
    const south = { annualKwh: 5000, monthlyKwh: [100, 200, 300, 400, 500, 600, 700, 600, 500, 400, 400, 300] };
    const west = { annualKwh: 3200, monthlyKwh: [80, 120, 200, 280, 320, 360, 400, 360, 300, 260, 280, 240] };
    const sum = sumFaceYields([south, west]);
    expect(sum.annualKwh).toBe(8200);
    expect(sum.monthlyKwh[0]).toBe(180);
    expect(sum.monthlyKwh[6]).toBe(1100);
    expect(sum.monthlyKwh).toHaveLength(12);
  });
});

describe("PVGIS-Client", () => {
  it("liest PVcalc und legt gleiche Anfragen auf denselben Cache-Schlüssel", () => {
    const monthly = [100, 150, 300, 450, 550, 600, 620, 560, 430, 280, 140, 90];
    const parsed = parsePvcalc(pvcalcBody(monthly, 4270));
    expect(parsed.annualKwh).toBe(4270);
    expect(parsed.monthlyKwh[5]).toBe(600);
    const plane = { latitude: 51.0912, longitude: 6.8924, kwp: 4.5, tiltDeg: 35, azimuthDeg: 180, lossesPercent: 14, mounting: "gebaeude" as const };
    expect(pvgisCacheKey(plane)).toBe(pvgisCacheKey({ ...plane, latitude: 51.09124 }));
    expect(pvgisCacheKey(plane)).not.toBe(pvgisCacheKey({ ...plane, azimuthDeg: 225 }));
  });

  it("fragt PVGIS über eine nachgestellte HTTP-Antwort ab", async () => {
    const monthly = Array.from({ length: 12 }, (_, index) => (index + 1) * 10);
    const fetchImpl = async () => new Response(JSON.stringify(pvcalcBody(monthly, 780)), { status: 200 });
    const result = await fetchPvgisPlane(
      { latitude: 51.1, longitude: 6.9, kwp: 1, tiltDeg: 30, azimuthDeg: 180, lossesPercent: 14, mounting: "gebaeude" },
      fetchImpl,
    );
    expect(result.annualKwh).toBe(780);
    expect(result.monthlyKwh[11]).toBe(120);
  });

  it("meldet eine Zeitüberschreitung als Fehler", async () => {
    const fetchImpl = async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    };
    await expect(
      fetchPvgisPlane(
        { latitude: 51, longitude: 7, kwp: 2, tiltDeg: 20, azimuthDeg: 90, lossesPercent: 14, mounting: "frei" },
        fetchImpl,
        50,
      ),
    ).rejects.toThrow(/nicht rechtzeitig/);
  });

  it("liest eine Stundenreihe für die spätere Lastprofilrechnung", () => {
    const hours = parseSeriesHourly({ outputs: { hourly: [{ P: 0 }, { P: 1500 }, { P: 500 }] } });
    expect(hours).toEqual([0, 1.5, 0.5]);
  });

  it("kann die Stundenreihe abrufen, ohne sie im Assistenten zu speichern", async () => {
    const fetchImpl = async (url: string) => {
      expect(url).toContain("/seriescalc");
      return new Response(JSON.stringify({ outputs: { hourly: [{ P: 1000 }, { P: 0 }] } }), { status: 200 });
    };
    const hours = await fetchPvgisHourly(
      { latitude: 51, longitude: 7, kwp: 3, tiltDeg: 30, azimuthDeg: 180, lossesPercent: 14, mounting: "gebaeude" },
      fetchImpl,
    );
    expect(hours).toEqual([1, 0]);
  });
});

describe("PVGIS im Ertragsmodell", () => {
  it("benutzt gespeicherte Monatswerte und sonst den spezifischen Ertrag", () => {
    const provider = getYieldProvider("pvgis");
    const stored = provider.estimate({
      kwp: 5,
      specificYieldKwhPerKwp: 900,
      storedMonthlyKwh: [100, 100, 200, 300, 400, 500, 500, 400, 300, 200, 100, 100],
    });
    expect(stored.providerId).toBe("pvgis");
    expect(stored.annualKwh).toBe(3200);
    expect(stored.description).toContain("Dachflächen");
    const fallback = provider.estimate({ kwp: 5, specificYieldKwhPerKwp: 900, fallbackNotice: "PVGIS nicht erreichbar." });
    expect(fallback.annualKwh).toBe(4500);
    expect(fallback.description).toBe("PVGIS nicht erreichbar.");
  });
});
