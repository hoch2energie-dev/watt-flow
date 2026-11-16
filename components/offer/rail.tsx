"use client";

import { LayoutGrid } from "lucide-react";
import type { CalcResult } from "@/lib/calc/offer";
import type { OfferDTO, VariantDTO } from "@/lib/domain";
import { STEP_GROUPS, STEP_ORDER, keyFigures, stepValue, type StepId } from "@/lib/offer-overview";

/** Schrittleiste des Angebots: Übersicht, gegliederte Schritte mit ihrem Wert und darunter die Kennzahlen. */
export function OfferRail({
  offer,
  variant,
  result,
  active,
  onOpen,
}: {
  offer: OfferDTO;
  variant: VariantDTO;
  result: CalcResult;
  active: StepId | "hub";
  onOpen: (target: StepId | "hub") => void;
}) {
  const item = (on: boolean) => `flex items-baseline gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm lg:whitespace-normal ${on ? "bg-brand text-white" : "bg-white text-ink hover:bg-accent-soft"}`;
  return (
    <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
      <nav aria-label="Schritte des Angebots" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-3 lg:overflow-visible lg:pb-0">
        <button type="button" aria-current={active === "hub" ? "page" : undefined} onClick={() => onOpen("hub")} className={`${item(active === "hub")} items-center font-semibold`}>
          <LayoutGrid size={16} aria-hidden /> Übersicht
        </button>
        {STEP_GROUPS.map((group) => (
          <div key={group.id} className="flex gap-2 lg:flex-col lg:gap-1">
            <p className="hidden px-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted lg:block">
              {group.id === "planung" ? `Planung · ${variant.name}` : group.label}
            </p>
            {group.steps.map((step) => {
              const on = active === step.id;
              const value = stepValue(step.id, offer, variant, result);
              return (
                <button key={step.id} type="button" aria-current={on ? "step" : undefined} onClick={() => onOpen(step.id)} className={item(on)}>
                  <span className={`w-4 text-xs font-semibold tabular-nums ${on ? "text-white/70" : "text-muted"}`}>{STEP_ORDER.indexOf(step.id) + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{step.label}</span>
                    {value ? <span className={`hidden text-xs lg:block ${on ? "text-white/80" : "text-muted"}`}>{value}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <dl className="mt-4 hidden rounded-2xl border border-line bg-elevated p-3 text-sm lg:block">
        {keyFigures(result).map((figure) => (
          <div key={figure.label} className="flex items-baseline justify-between gap-3 py-1">
            <dt className="text-muted">{figure.label}</dt>
            <dd className="text-right font-semibold tabular-nums">{figure.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
