"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { CalcResult } from "@/lib/calc/offer";
import { TABS, keyFigures, type TabId } from "@/lib/offer-overview";

/** Reiterleiste des Angebots. Davor steht die Anfrage, aus der es entstanden ist. */
export function OfferTabs({ active, onChange, request }: { active: TabId; onChange: (tab: TabId) => void; request: { href: string; number: string } }) {
  return (
    <nav aria-label="Bereiche des Angebots" className="mt-4 flex items-center gap-1 overflow-x-auto border-b border-line">
      <Link href={request.href} className="shrink-0 whitespace-nowrap px-2 py-2.5 text-sm text-muted hover:text-ink" title="Zur Anfrage">
        Anfrage {request.number}
      </Link>
      <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
      {TABS.map((tab) => {
        const on = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            title={tab.hint}
            aria-current={on ? "page" : undefined}
            onClick={() => onChange(tab.id)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${on ? "border-brand font-semibold text-brand" : "border-transparent text-ink hover:border-line hover:text-brand"}`}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

/** Kennzahlen der gewählten Variante in einer schmalen Zeile unter den Reitern. */
export function FigureStrip({ result, variantName }: { result: CalcResult; variantName: string }) {
  return (
    <dl aria-label={`Kennzahlen der Variante ${variantName}`} className="mt-3 flex gap-x-6 gap-y-1 overflow-x-auto rounded-xl bg-elevated px-4 py-2 text-sm">
      {keyFigures(result).map((figure) => (
        <div key={figure.label} className="shrink-0">
          <dt className="text-xs text-muted">{figure.label}</dt>
          <dd className="font-semibold tabular-nums">{figure.value}</dd>
        </div>
      ))}
    </dl>
  );
}
