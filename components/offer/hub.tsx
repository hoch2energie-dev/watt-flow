"use client";

import { ArrowRight, Check, Circle } from "lucide-react";
import { Button } from "@/components/ui";
import type { CalcResult } from "@/lib/calc/offer";
import type { OfferDTO, VariantDTO } from "@/lib/domain";
import { formatEuro, formatNumber, formatPercent } from "@/lib/format";
import { PAYMENT_LABEL } from "@/lib/labels";
import { solarProgress, stepItems, stepNet, stepValue, type StepId } from "@/lib/offer-overview";

/**
 * Übersicht des Angebots in Kacheln: je Thema der Stand, der Preis und der Weg in die Bearbeitung.
 * Zeigt dieselben Daten wie die Schritte, nur nebeneinander.
 */
export function OfferHub({
  offer,
  variant,
  result,
  locked,
  onOpen,
  onPlan,
}: {
  offer: OfferDTO;
  variant: VariantDTO;
  result: CalcResult;
  locked: boolean;
  onOpen: (step: StepId) => void;
  /** Speichert und öffnet die 3D-Planung. */
  onPlan: () => void;
}) {
  const progress = solarProgress(variant);
  const solarNet = stepNet(result, "solar");
  const systems: { id: StepId; title: string; empty: string }[] = [
    { id: "speicher", title: "Speicher", empty: "Noch kein Speicher im Angebot." },
    { id: "wallbox", title: "Wallbox", empty: "Noch keine Wallbox im Angebot." },
    { id: "waerme", title: "Wärmepumpe", empty: "Noch keine Wärmepumpe im Angebot." },
    { id: "extras", title: "Extras", empty: "Zusätzliche Positionen wie Gerüst oder Zählerschrank." },
  ];
  return (
    <div className="mt-4 space-y-6">
      <section aria-labelledby="hub-grundlagen">
        <h2 id="hub-grundlagen" className="mb-2 font-display text-xl">Grundlagen</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {([["verbrauch", "Verbrauch", "Stromverbrauch und Strompreis"], ["gebaeude", "Gebäude", "Gebäudetyp, Dach und Besonderheiten"], ["bestand", "Bestand", "Vorhandene Anlagen und Heizung"]] as const).map(([id, title, hint]) => {
            const value = stepValue(id, offer, variant, result);
            return (
              <Tile key={id} title={title} filled={Boolean(value)}>
                <p className={value ? "text-lg font-semibold" : "text-sm text-muted"}>{value || hint}</p>
                <TileAction onClick={() => onOpen(id)}>{value ? "Bearbeiten" : "Eintragen"}</TileAction>
              </Tile>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="hub-planung">
        <h2 id="hub-planung" className="mb-2 font-display text-xl">Planung · {variant.name}</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Tile title="Photovoltaik" filled={progress.roof || progress.modules || result.kwp > 0} className="md:row-span-2">
            <p className="text-lg font-semibold">{result.kwp > 0 ? `${formatNumber(result.kwp, 2)} kWp geplant` : "Noch nicht geplant"}</p>
            {solarNet > 0 ? <p className="text-sm text-muted">{formatEuro(solarNet)} netto</p> : null}
            <ul className="mt-3 space-y-1.5 text-sm">
              <Step done={progress.roof}>Dach in der 3D-Planung</Step>
              <Step done={progress.modules}>Module gewählt</Step>
              <Step done={progress.inverter}>Wechselrichter gewählt</Step>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={onPlan}>Zur 3D-Planung <ArrowRight size={15} aria-hidden /></Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => onOpen("solar")}>Komponenten</Button>
            </div>
          </Tile>
          {systems.map((system) => {
            const count = stepItems(variant, system.id);
            const net = stepNet(result, system.id);
            return (
              <Tile key={system.id} title={system.title} filled={count > 0}>
                {count > 0 ? (
                  <>
                    <p className="text-lg font-semibold">{formatEuro(net)}</p>
                    <p className="text-sm text-muted">{count === 1 ? "1 Position" : `${count} Positionen`}, netto</p>
                  </>
                ) : (
                  <p className="text-sm text-muted">{system.empty}</p>
                )}
                <TileAction onClick={() => onOpen(system.id)}>{count > 0 ? "Bearbeiten" : locked ? "Ansehen" : "Planung starten"}</TileAction>
              </Tile>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="hub-abschluss">
        <h2 id="hub-abschluss" className="mb-2 font-display text-xl">Abschluss</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Tile title="Zahlung" filled>
            <p className="text-lg font-semibold">{formatEuro(result.financing.customerPays)}</p>
            <p className="text-sm text-muted">
              {PAYMENT_LABEL[variant.paymentMode]}
              {result.financing.mode !== "BAR" ? ` · Rate ${formatEuro(result.financing.payment)}` : ""}
              {variant.rebateNet > 0 ? ` · Rabatt ${formatEuro(variant.rebateNet)} netto` : ""}
            </p>
            <TileAction onClick={() => onOpen("zahlung")}>Bearbeiten</TileAction>
          </Tile>
          <Tile title="Ergebnisse" filled={result.kwp > 0}>
            {result.kwp > 0 ? (
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <Figure label="Amortisation" value={result.kpis.breakEvenYears == null ? "–" : `${formatNumber(result.kpis.breakEvenYears, 1)} Jahre`} />
                <Figure label="Autarkie" value={formatPercent(result.self.autarkyRatio, 0)} />
                <Figure label="Eigenverbrauch" value={formatPercent(result.self.selfConsumptionRatio, 0)} />
              </dl>
            ) : (
              <p className="text-sm text-muted">Wirtschaftlichkeit und Energiebilanz erscheinen, sobald eine Anlagengröße steht.</p>
            )}
            <TileAction onClick={() => onOpen("ergebnisse")}>Ansehen</TileAction>
          </Tile>
        </div>
      </section>
    </div>
  );
}

function Tile({ title, filled, className = "", children }: { title: string; filled: boolean; className?: string; children: React.ReactNode }) {
  return (
    <article className={`flex flex-col rounded-2xl border p-4 ${filled ? "border-line bg-white" : "border-dashed border-line bg-elevated"} ${className}`}>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">{title}</h3>
      {children}
    </article>
  );
}

function TileAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <div className="mt-auto pt-3">
      <Button type="button" size="sm" variant="secondary" onClick={onClick}>{children}</Button>
    </div>
  );
}

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-2 ${done ? "text-ink" : "text-muted"}`}>
      {done ? <Check size={16} className="text-ok" aria-hidden /> : <Circle size={16} aria-hidden />}
      <span>{children}</span>
      <span className="sr-only">{done ? "erledigt" : "offen"}</span>
    </li>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
