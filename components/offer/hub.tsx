"use client";

import { ArrowRight, Car, Check, Circle, Flame, Plus, Users, Zap, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui";
import type { CalcResult } from "@/lib/calc/offer";
import type { OfferDTO, VariantDTO } from "@/lib/domain";
import { PLAN_TOPICS, THEMES, TOPIC_LABEL, baselineTiles, planSummary, solarProgress, tenantBaseline, tenantOutcome, type HubColumnId, type PlanTopic, type TopicId } from "@/lib/offer-overview";

const THEME_STYLE: Record<HubColumnId, { icon: LucideIcon; chip: string }> = {
  strom: { icon: Zap, chip: "bg-amber-100 text-amber-800" },
  waerme: { icon: Flame, chip: "bg-accent-soft text-accent" },
  mobilitaet: { icon: Car, chip: "bg-sky-100 text-sky-800" },
  mieterstrom: { icon: Users, chip: "bg-emerald-100 text-emerald-800" },
};

/** Spaltenraster des Hubs: vier Themen nebeneinander, auf schmalen Schirmen zwei oder eine. */
const HUB_GRID = "grid gap-x-4 gap-y-6 md:grid-cols-2 xl:grid-cols-4";

const PLAN_EMPTY: Record<PlanTopic, string> = {
  pv: "Dach zeichnen, Module belegen, Wechselrichter wählen.",
  speicher: "Noch kein Speicher im Angebot.",
  waermepumpe: "Noch keine Wärmepumpe im Angebot.",
  wallbox: "Noch keine Wallbox im Angebot.",
  extras: "Zusätzliche Positionen wie Gerüst oder Zählerschrank.",
};

/**
 * Reiter „Planung": oben je Thema die Ausgangslage beim Kunden, darunter die Anlagen
 * der gewählten Variante. Jede Kachel führt in ihren Bearbeitungsbereich; der Mieterstrom
 * öffnet stattdessen seinen Dialog.
 */
export function PlanningHub({
  offer,
  variant,
  result,
  locked,
  variantBar,
  onOpen,
  onPlan,
  onTenant,
}: {
  offer: OfferDTO;
  variant: VariantDTO;
  result: CalcResult;
  locked: boolean;
  /** Auswahl und Verwaltung der Varianten, steht neben der Überschrift „Planung". */
  variantBar: React.ReactNode;
  onOpen: (topic: TopicId) => void;
  /** Speichert und öffnet die 3D-Planung. */
  onPlan: () => void;
  /** Öffnet den Dialog „Mieterstrom", wahlweise gleich mit der Zusammenfassung. */
  onTenant: (tab: "allgemein" | "zusammenfassung") => void;
}) {
  const baseline = baselineTiles(offer);
  const progress = solarProgress(variant);
  const tenant = tenantBaseline(offer.tenantPower);
  const outcome = tenantOutcome(offer.tenantPower, result.yield.annualKwh);
  const TenantIcon = THEME_STYLE.mieterstrom.icon;
  return (
    <div className="mt-5 space-y-8">
      <section aria-labelledby="hub-ausgangslage">
        <h2 id="hub-ausgangslage" className="sr-only">Ausgangslage beim Kunden</h2>
        <div className={HUB_GRID}>
          {THEMES.map((theme) => {
            const { icon: Icon, chip } = THEME_STYLE[theme.id];
            return (
              <div key={theme.id} className="min-w-0 space-y-3" data-theme={theme.id}>
                <h3 className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold ${chip}`}>
                  <Icon size={16} aria-hidden /> {theme.label}
                </h3>
                {baseline[theme.id].map((tile) => (
                  <Tile key={tile.id} id={tile.id} title={tile.title} filled={Boolean(tile.value)}>
                    {tile.value ? (
                      <>
                        <p className="text-xl font-semibold tabular-nums">{tile.value}</p>
                        {tile.detail ? <p className="text-sm text-muted">{tile.detail}</p> : null}
                      </>
                    ) : (
                      <p className="text-sm text-muted">{tile.empty}</p>
                    )}
                    <TileAction>
                      <Button type="button" size="sm" variant="secondary" onClick={() => onOpen(tile.topic)}>
                        {tile.value ? "Bearbeiten" : locked ? "Ansehen" : "Eintragen"} <ArrowRight size={15} aria-hidden />
                      </Button>
                    </TileAction>
                  </Tile>
                ))}
              </div>
            );
          })}
          <div className="min-w-0 space-y-3" data-theme="mieterstrom">
            <h3 className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold ${THEME_STYLE.mieterstrom.chip}`}>
              <TenantIcon size={16} aria-hidden /> Mieterstrom
            </h3>
            <Tile id="mieterstrom" title="Vermarktung und Tarif" filled={Boolean(tenant.value)}>
              {tenant.value ? (
                <>
                  <p className="text-xl font-semibold">{tenant.value}</p>
                  <p className="text-sm text-muted">{tenant.detail}</p>
                  {tenant.note ? <p className="text-sm text-muted">{tenant.note}</p> : null}
                </>
              ) : (
                <p className="text-sm text-muted">Solarstrom an die Mieter verkaufen: Modell wählen, Tarif und Mieter eintragen.</p>
              )}
              <TileAction>
                <Button type="button" size="sm" variant="secondary" onClick={() => onTenant("allgemein")}>
                  {tenant.value ? (locked ? "Ansehen" : "Bearbeiten") : locked ? "Ansehen" : "Einrichten"} <ArrowRight size={15} aria-hidden />
                </Button>
              </TileAction>
            </Tile>
          </div>
        </div>
      </section>

      <section aria-labelledby="hub-planung">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 id="hub-planung" className="font-display text-2xl">Planung</h2>
          {variantBar}
        </div>
        <div className={HUB_GRID}>
          {THEMES.map((theme) => (
            <div key={theme.id} className="min-w-0 space-y-4" data-plan-theme={theme.id}>
              {PLAN_TOPICS[theme.id].map((topic) => {
                const summary = planSummary(topic, variant, result);
                if (topic === "pv") {
                  return (
                    <Tile key={topic} id={topic} title="Photovoltaikanlage" filled={summary.filled}>
                      <p className="text-xl font-semibold tabular-nums">{summary.value || "Noch nicht geplant"}</p>
                      {summary.detail ? <p className="text-sm text-muted">{summary.detail}</p> : null}
                      <ul className="mt-3 space-y-1.5 border-l border-line pl-3 text-sm">
                        <Step done={progress.roof}>Gebäude gezeichnet</Step>
                        <Step done={progress.layout}>Modulbelegung</Step>
                        <Step done={progress.inverter}>Wechselrichter gewählt</Step>
                        <Step done={progress.strings}>Strings zugeordnet</Step>
                      </ul>
                      {progress.modules && !progress.layout ? <p className="mt-2 text-xs text-muted">Module stehen in den Positionen, sind aber noch nicht auf dem Dach belegt.</p> : null}
                      <TileAction>
                        <Button type="button" size="sm" onClick={onPlan}>Zur 3D-Planung <ArrowRight size={15} aria-hidden /></Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => onOpen("pv")}>Preise und Ertrag</Button>
                      </TileAction>
                    </Tile>
                  );
                }
                return (
                  <Tile key={topic} id={topic} title={TOPIC_LABEL[topic]} filled={summary.filled}>
                    {summary.filled ? (
                      <>
                        <p className="text-xl font-semibold tabular-nums">{summary.value}</p>
                        {summary.detail ? <p className="text-sm text-muted">{summary.detail}</p> : null}
                      </>
                    ) : (
                      <p className="text-sm text-muted">{PLAN_EMPTY[topic]}</p>
                    )}
                    <TileAction>
                      <Button type="button" size="sm" variant="secondary" onClick={() => onOpen(topic)}>
                        {summary.filled ? "Bearbeiten" : locked ? "Ansehen" : <><Plus size={15} aria-hidden /> Planung starten</>}
                      </Button>
                    </TileAction>
                  </Tile>
                );
              })}
            </div>
          ))}
          <div className="min-w-0 space-y-4" data-plan-theme="mieterstrom">
            <Tile id="mieterstrom-ergebnis" title="Mieterstrom-Überschlag" filled={Boolean(outcome.value)}>
              {outcome.value ? <p className="text-xl font-semibold tabular-nums">{outcome.value}</p> : null}
              <p className="text-sm text-muted">{outcome.detail}</p>
              {outcome.note ? <p className={`mt-1 text-sm ${outcome.warn ? "font-semibold text-warn" : "text-muted"}`}>{outcome.note}</p> : null}
              {offer.tenantPower ? (
                <TileAction>
                  <Button type="button" size="sm" variant="secondary" onClick={() => onTenant(outcome.value ? "zusammenfassung" : "allgemein")}>
                    {outcome.value ? "Zusammenfassung" : "Angaben ergänzen"} <ArrowRight size={15} aria-hidden />
                  </Button>
                </TileAction>
              ) : null}
            </Tile>
          </div>
        </div>
      </section>
    </div>
  );
}

function Tile({ id, title, filled, children }: { id: string; title: string; filled: boolean; children: React.ReactNode }) {
  return (
    <article data-tile={id} className={`flex flex-col rounded-2xl border p-4 ${filled ? "border-line bg-white shadow-sm" : "border-dashed border-line bg-elevated"}`}>
      <h4 className="mb-1 font-semibold">{title}</h4>
      {children}
    </article>
  );
}

function TileAction({ children }: { children: React.ReactNode }) {
  return <div className="mt-auto flex flex-wrap justify-end gap-2 pt-4">{children}</div>;
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
