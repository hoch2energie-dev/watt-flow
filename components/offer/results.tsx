"use client";

import type { CalcResult } from "@/lib/calc/offer";
import { formatEuro, formatNumber, formatPercent } from "@/lib/format";
import { PVGIS_SOURCE_NOTE } from "@/lib/pvgis/types";
import { PAYMENT_LABEL } from "@/lib/labels";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function ResultsView({ result, horizon }: { result: CalcResult; horizon: number }) {
  const max = Math.max(...result.yield.monthlyKwh, 1);
  const kpis = [
    ["Jahresertrag", `${formatNumber(result.yield.annualKwh, 0)} kWh`],
    ["Eigenverbrauch", formatPercent(result.self.selfConsumptionRatio)],
    ["Autarkie", formatPercent(result.self.autarkyRatio)],
    ["Ersparnis im ersten Jahr", formatEuro(result.kpis.annualSavingsYear1)],
    ["Amortisation", result.kwp <= 0 ? "–" : result.kpis.breakEvenYears == null ? "nicht im Zeitraum" : `${formatNumber(result.kpis.breakEvenYears, 1)} Jahre`],
    ["Interner Zinsfuß", result.kpis.irr == null ? "–" : formatPercent(result.kpis.irr)],
    ["Überschuss nach " + horizon + " Jahren", formatEuro(result.kpis.netProfit)],
    ["Stromgestehungskosten", result.kpis.lcoePerKwh == null ? "–" : `${formatNumber(result.kpis.lcoePerKwh * 100, 1)} ct/kWh`],
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-white px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1 font-display text-2xl">{value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-line p-4">
        <h3 className="font-semibold">Monatlicher Ertrag</h3>
        <p className="text-xs text-muted">{result.yield.providerId === "pvgis" ? PVGIS_SOURCE_NOTE : "Typische deutsche Verteilung, skaliert auf den Jahresertrag. Keine standortgenaue Simulation."}</p>
        <div className="mt-3 flex h-36 items-end gap-1">
          {result.yield.monthlyKwh.map((value, index) => (
            <div key={MONTHS[index]} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div className="w-full rounded-t bg-brand" style={{ height: `${Math.max(4, (value / max) * 100)}%` }} title={`${formatNumber(value, 0)} kWh`} />
              <span className="text-[10px] text-muted">{MONTHS[index]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-line p-4 text-sm">
        <h3 className="font-semibold">Zahlung</h3>
        <p className="mt-1">{PAYMENT_LABEL[result.financing.mode]}: Kunde zahlt {formatEuro(result.financing.customerPays)}.</p>
        {result.financing.mode !== "BAR" ? (
          <p className="mt-1">
            {result.financing.periods} Zahlungen zu {formatEuro(result.financing.payment)}
            {result.financing.mode === "RATEN" ? ` alle ${result.financing.intervalMonths} Monate` : ""}.
            Zinsen {formatEuro(result.financing.totalInterest)}.
          </p>
        ) : null}
        <p className="mt-2 text-xs text-muted">Die Wirtschaftlichkeit rechnet den Kaufpreis. Zinsen einer Finanzierung stehen separat und verlängern die Amortisation.</p>
      </div>
      <div className="max-h-80 overflow-auto rounded-2xl border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="sticky top-0 bg-elevated">
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2">Jahr</th>
              <th className="px-3 py-2">Ertrag</th>
              <th className="px-3 py-2">Eigenverbrauch</th>
              <th className="px-3 py-2">Einspeisung</th>
              <th className="px-3 py-2">Nutzen</th>
              <th className="px-3 py-2">Summe</th>
            </tr>
          </thead>
          <tbody>
            {result.cashflow.map((row) => (
              <tr key={row.year} className="border-t border-line">
                <td className="px-3 py-1.5">{row.year}</td>
                <td className="px-3 py-1.5">{row.year === 0 ? "–" : formatNumber(row.productionKwh, 0)}</td>
                <td className="px-3 py-1.5">{row.year === 0 ? "–" : formatNumber(row.selfConsumedKwh, 0)}</td>
                <td className="px-3 py-1.5">{row.year === 0 ? "–" : formatNumber(row.feedInKwh, 0)}</td>
                <td className="px-3 py-1.5">{formatEuro(row.year === 0 ? row.cashflow : row.energyBenefit - row.opex)}</td>
                <td className="px-3 py-1.5">{formatEuro(row.cumulative)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        Näherung für die Beratung. Der Ertrag ist Anlagengröße mal spezifischer Ertrag. Eigenverbrauch und Autarkie folgen einer vereinfachten Formel aus Direktverbrauch und pauschalen Speicherzyklen. Das ist keine Ertragsgarantie. Ein späteres PVGIS-Modell kann den Ertrag ersetzen, ohne diese Ansicht neu zu bauen.
      </p>
    </div>
  );
}
