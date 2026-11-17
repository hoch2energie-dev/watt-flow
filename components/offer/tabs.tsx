"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { CalcResult } from "@/lib/calc/offer";
import { TABS, keyFigures, type TabId } from "@/lib/offer-overview";

/** Reiter des Angebots als Schalter in einer Schiene. Davor steht die Anfrage, aus der es entstanden ist. */
export function OfferTabs({ active, onChange, request }: { active: TabId; onChange: (tab: TabId) => void; request: { href: string; number: string } }) {
  return (
    <nav aria-label="Bereiche des Angebots" className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
      <Link href={request.href} className="shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-sm text-muted hover:bg-surface/70 hover:text-ink" title="Zur Anfrage">
        Anfrage {request.number}
      </Link>
      <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
      <div className="ml-1 flex shrink-0 gap-1 rounded-full bg-line/80 p-1">
        {TABS.map((tab) => {
          const on = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              title={tab.hint}
              aria-current={on ? "page" : undefined}
              onClick={() => onChange(tab.id)}
              className={`h-9 whitespace-nowrap rounded-full px-4 text-sm ${on ? "bg-surface font-semibold text-ink shadow-raise" : "text-ink hover:bg-surface/60"}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Kennzahlen der gewählten Variante in einer Zeile unter den Reitern. */
export function FigureStrip({ result, variantName }: { result: CalcResult; variantName: string }) {
  return (
    <dl aria-label={`Kennzahlen der Variante ${variantName}`} className="mt-4 flex overflow-x-auto rounded-3xl bg-elevated px-2 py-3.5 shadow-panel">
      {keyFigures(result).map((figure) => (
        <div key={figure.label} className="min-w-fit flex-1 shrink-0 border-l border-line px-4 first:border-l-0">
          <dt className="whitespace-nowrap text-xs text-muted">{figure.label}</dt>
          <dd className="mt-0.5 whitespace-nowrap text-[1.0625rem] font-medium tabular-nums">{figure.value}</dd>
        </div>
      ))}
    </dl>
  );
}
