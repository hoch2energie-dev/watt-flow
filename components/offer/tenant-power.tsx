"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Handshake, Plus, Trash2, UtilityPole, X, type LucideIcon } from "lucide-react";
import { Field, NumberField, SelectInput, TextInput } from "@/components/fields";
import { Badge, Button, Notice } from "@/components/ui";
import { formatEuro, formatNumber } from "@/lib/format";
import {
  FEED_LABEL,
  KIND_LABEL,
  TARIFF_LABEL,
  TENANT_LIMITS,
  TENANT_MODELS,
  newTenantGroup,
  newTenantPower,
  parseTenantPower,
  suggestedSharePct,
  tenantGaps,
  tenantSummary,
  type FeedMode,
  type GeneralLoad,
  type TenantGroup,
  type TenantKind,
  type TenantModel,
  type TenantPower,
} from "@/lib/tenant-power";

export type TenantDialogTab = "allgemein" | "zusammenfassung";

const MODEL_ICON: Record<TenantModel, LucideIcon> = { volleinspeisung: UtilityPole, direkt: Handshake, versorger: Building2 };
const uid = () => crypto.randomUUID();
const ct = (value: number, digits = 2) => `${formatNumber(value, digits)} ct`;
const kwh = (value: number) => `${formatNumber(value, 0)} kWh`;

/**
 * Dialog „Mieterstrom". Zuerst das Modell wählen, dann Tarif, Mieter und Allgemeinstrom
 * eintragen; der zweite Reiter zeigt die Zusammenfassung für Betreiber und Mieter.
 * Gearbeitet wird auf einer Kopie, erst „Speichern" übernimmt sie ins Angebot.
 */
export function TenantPowerDialog({
  initial,
  startTab,
  suggest,
  variant,
  locked,
  saving,
  saveError,
  onSave,
  onClose,
}: {
  initial: TenantPower | null;
  startTab: TenantDialogTab;
  /** Vorschläge aus dem Angebot für neue Einträge: bisheriger Strompreis und Einspeisevergütung. */
  suggest: { currentPriceCt: number; feedInCt: number };
  /** Gewählte Variante: mit ihrem Jahresertrag und Speicher rechnet die Zusammenfassung. */
  variant: { name: string; annualYieldKwh: number; batteryKwh: number; batteryCycles: number };
  locked: boolean;
  saving: boolean;
  saveError: string | null;
  onSave: (next: TenantPower | null) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<TenantPower | null>(initial);
  const [choosing, setChoosing] = useState(initial == null);
  const [tab, setTab] = useState<TenantDialogTab>(initial ? startTab : "allgemein");
  const [discard, setDiscard] = useState(false);
  const [removeArmed, setRemoveArmed] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  /* Jeder Reiter und die Modellwahl beginnen oben, nicht an der Stelle, bis zu der vorher geblättert wurde. */
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [tab, choosing]);

  const dirty = !locked && JSON.stringify(draft) !== JSON.stringify(initial);
  const requestClose = () => (dirty ? setDiscard(true) : onClose());
  const set = (patch: Partial<TenantPower>) => setDraft((current) => (current ? { ...current, ...patch } : current));

  function choose(model: TenantModel) {
    setDraft((current) => {
      if (!current) return newTenantPower(model, suggest, uid);
      /* Beim Wechsel bleiben die Eingaben erhalten. Ein Modell mit Mietern bekommt mindestens eine Gruppe. */
      const tenants = model !== "volleinspeisung" && current.tenants.length === 0 ? [newTenantGroup(uid(), suggest.currentPriceCt)] : current.tenants;
      return { ...current, model, tenants };
    });
    setChoosing(false);
    setTab("allgemein");
  }

  const model = draft ? TENANT_MODELS.find((entry) => entry.id === draft.model) : undefined;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="tenant-title"
      className="m-auto w-[60rem]"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={onClose}
    >
      <div className="flex max-h-[calc(100dvh-4rem)] flex-col overflow-hidden rounded-3xl bg-elevated text-ink shadow-2xl">
        <header className="flex items-start justify-between gap-3 px-6 pb-3 pt-5">
          <div className="min-w-0">
            <h2 id="tenant-title" className="title-lg">Mieterstrom</h2>
            {draft && model && !choosing ? (
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <Badge tone="ok">{model.label}</Badge>
                {!locked ? <button type="button" className="font-semibold text-brand" onClick={() => setChoosing(true)}>Modell ändern</button> : null}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">Wie soll der Solarstrom des Gebäudes vermarktet werden?</p>
            )}
          </div>
          <button type="button" aria-label="Schließen" className="grid size-10 shrink-0 place-items-center rounded-full bg-surface shadow-raise hover:bg-brand-soft" onClick={requestClose}>
            <X size={18} aria-hidden />
          </button>
        </header>

        {draft && !choosing ? (
          <nav aria-label="Bereiche des Mieterstroms" className="mx-6 mb-3 flex gap-1 self-start rounded-full bg-line/80 p-1">
            {(["allgemein", "zusammenfassung"] as const).map((entry) => (
              <button
                key={entry}
                type="button"
                aria-current={tab === entry ? "page" : undefined}
                onClick={() => setTab(entry)}
                className={`h-9 rounded-full px-4 text-sm ${tab === entry ? "bg-surface font-semibold text-ink shadow-raise" : "text-ink hover:bg-surface/60"}`}
              >
                {entry === "allgemein" ? "Allgemein" : "Zusammenfassung"}
              </button>
            ))}
          </nav>
        ) : null}

        <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-1">
          {!draft || choosing ? (
            <div className="grid gap-3 md:grid-cols-3">
              {TENANT_MODELS.map((entry) => {
                const Icon = MODEL_ICON[entry.id];
                const on = draft?.model === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    data-model={entry.id}
                    aria-pressed={on}
                    disabled={locked}
                    onClick={() => choose(entry.id)}
                    className={`flex flex-col rounded-2xl bg-surface p-4 text-left ring-1 transition hover:ring-brand ${on ? "ring-2 ring-brand" : "ring-black/[0.05]"}`}
                  >
                    <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon size={20} aria-hidden /></span>
                    <span className="font-semibold">{entry.label}</span>
                    <span className="mt-1 text-sm text-muted">{entry.text}</span>
                  </button>
                );
              })}
            </div>
          ) : tab === "allgemein" ? (
            <fieldset disabled={locked} className="space-y-4 disabled:opacity-80">
              <legend className="sr-only">Angaben zum Mieterstrom</legend>
              <General draft={draft} set={set} suggest={suggest} variant={variant} />
            </fieldset>
          ) : (
            <Summary config={draft} variant={variant} />
          )}
        </div>

        <footer className="border-t border-line px-6 py-3.5">
          {saveError ? <div className="mb-3"><Notice tone="danger">Nicht gespeichert: {saveError}</Notice></div> : null}
          {discard ? (
            <div className="flex flex-wrap items-center justify-end gap-2" role="alert">
              <span className="mr-auto text-sm">Die Änderungen sind noch nicht gespeichert. Verwerfen?</span>
              <Button type="button" variant="secondary" onClick={() => setDiscard(false)}>Weiter bearbeiten</Button>
              <Button type="button" variant="danger" onClick={onClose}>Verwerfen</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {initial && !locked && !choosing ? (
                <button type="button" className="mr-auto text-sm font-semibold text-danger" onClick={() => (removeArmed ? onSave(null) : setRemoveArmed(true))}>
                  {removeArmed ? "Wirklich entfernen? Noch einmal klicken" : "Mieterstrom entfernen"}
                </button>
              ) : null}
              {choosing && draft ? <Button type="button" variant="secondary" onClick={() => setChoosing(false)}>Zurück</Button> : null}
              <Button type="button" variant="secondary" onClick={requestClose}>{locked ? "Schließen" : "Abbrechen"}</Button>
              {draft && !choosing && !locked ? (
                <Button type="button" disabled={saving} onClick={() => onSave(parseTenantPower(draft))}>{saving ? "Speichert…" : "Speichern"}</Button>
              ) : null}
            </div>
          )}
        </footer>
      </div>
    </dialog>
  );
}

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section data-section={id} className="rounded-2xl bg-surface p-4 ring-1 ring-black/[0.04]">
      <h3 className="font-semibold">{title}</h3>
      {hint ? <p className="mt-0.5 text-sm text-muted">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function General({
  draft,
  set,
  suggest,
  variant,
}: {
  draft: TenantPower;
  set: (patch: Partial<TenantPower>) => void;
  suggest: { currentPriceCt: number; feedInCt: number };
  variant: { name: string; annualYieldKwh: number; batteryKwh: number; batteryCycles: number };
}) {
  const full = draft.model === "versorger";
  const supplies = draft.model !== "volleinspeisung";
  const mixed = full && draft.tariffMode === "mischtarif";
  const gross = tenantSummary(draft, variant.annualYieldKwh).gross;
  const suggestion = supplies ? suggestedSharePct(draft, variant.annualYieldKwh, variant.batteryKwh, variant.batteryCycles) : null;

  const setTenant = (id: string, patch: Partial<TenantGroup>) => set({ tenants: draft.tenants.map((group) => (group.id === id ? { ...group, ...patch } : group)) });
  const setLoad = (id: string, patch: Partial<GeneralLoad>) => set({ general: draft.general.map((load) => (load.id === id ? { ...load, ...patch } : load)) });

  const feedIn = (
    <>
      <Field label="Vergütungsmodus">
        <SelectInput value={draft.feedMode} onChange={(event) => set({ feedMode: event.target.value as FeedMode })}>
          {(Object.keys(FEED_LABEL) as FeedMode[]).map((mode) => <option key={mode} value={mode}>{FEED_LABEL[mode]}</option>)}
        </SelectInput>
      </Field>
      <Field label={supplies ? "Vergütung für Überschuss ct/kWh" : "Vergütung ct/kWh"} hint={draft.feedMode === "direktvermarktung" ? "Erwarteter Erlös aus der Direktvermarktung." : "Vergütungssatz bei Inbetriebnahme."}>
        <NumberField digits={2} value={draft.feedInCt} onChange={(feedInCt) => set({ feedInCt })} />
      </Field>
    </>
  );

  if (!supplies) {
    return (
      <Section id="verguetung" title="Einspeisung" hint="Der gesamte Solarstrom geht ins Netz. Die Mieter behalten ihren Stromvertrag, für sie ändert sich nichts.">
        <div className="grid gap-3 sm:grid-cols-2">{feedIn}</div>
      </Section>
    );
  }

  return (
    <>
      <Section
        id="tarif"
        title={full ? "Mieterstromtarif" : "Preis für Solarstrom"}
        hint={full ? "Was die Mieter künftig zahlen. Eingabe netto, die Bruttopreise stehen darunter." : "Was die Mieter für Solarstrom vom Dach zahlen. Eingabe netto, die Bruttopreise stehen darunter."}
      >
        {full ? (
          <>
            <div className="inline-flex flex-wrap gap-1 rounded-[1.375rem] bg-line/80 p-1" role="group" aria-label="Tarifart">
              {(["zweitarif", "mischtarif"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  data-tariff={mode}
                  aria-pressed={draft.tariffMode === mode}
                  className={`h-9 rounded-full px-4 text-sm ${draft.tariffMode === mode ? "bg-surface font-semibold text-ink shadow-raise" : "text-ink hover:bg-surface/60"}`}
                  onClick={() => set({ tariffMode: mode })}
                >
                  {TARIFF_LABEL[mode]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted">
              {mixed
                ? "Ein Arbeitspreis für jede Kilowattstunde, gleich ob sie vom Dach oder aus dem Netz kommt."
                : "Zwei Arbeitspreise: einer für Solarstrom vom Dach, einer für Reststrom aus dem Netz."}
            </p>
          </>
        ) : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {mixed ? (
            <Field label="Mischpreis ct/kWh"><NumberField digits={2} value={draft.mixedPriceCt} onChange={(mixedPriceCt) => set({ mixedPriceCt })} /></Field>
          ) : (
            <Field label="Solarstrom ct/kWh"><NumberField digits={2} value={draft.pvPriceCt} onChange={(pvPriceCt) => set({ pvPriceCt })} /></Field>
          )}
          {full && !mixed ? <Field label="Reststrom ct/kWh"><NumberField digits={2} value={draft.gridPriceCt} onChange={(gridPriceCt) => set({ gridPriceCt })} /></Field> : null}
          <Field label="Grundpreis € je Monat"><NumberField digits={2} value={draft.baseFeeEur} onChange={(baseFeeEur) => set({ baseFeeEur })} /></Field>
          <Field label="Mehrwertsteuer %" hint="0 bei Kleinunternehmern."><NumberField digits={0} value={draft.vatPct} onChange={(vatPct) => set({ vatPct })} /></Field>
        </div>
        <p className="mt-3 rounded-xl bg-elevated px-3 py-2 text-sm" data-gross>
          Brutto für die Mieter:{" "}
          <strong>
            {mixed ? `${ct(gross.mixedCt)}/kWh` : full ? `${ct(gross.pvCt)} Solarstrom · ${ct(gross.gridCt)} Reststrom` : `${ct(gross.pvCt)}/kWh`}
            {draft.baseFeeEur > 0 ? ` · ${formatEuro(gross.baseFeeEur)} Grundpreis je Monat` : ""}
          </strong>
          {full && !mixed ? <span className="text-muted"> · im Schnitt {ct(gross.effectiveCt)}/kWh beim eingetragenen Solaranteil</span> : null}
        </p>
      </Section>

      <Section id="anteil" title="Solaranteil" hint="Welchen Teil ihres Jahresverbrauchs Mieter und Allgemeinstrom vom Dach decken.">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44"><Field label="Erwarteter Solaranteil %"><NumberField digits={0} value={draft.pvSharePct} onChange={(pvSharePct) => set({ pvSharePct })} /></Field></div>
          {suggestion != null && suggestion !== draft.pvSharePct ? (
            <Button type="button" size="md" variant="secondary" data-suggest onClick={() => set({ pvSharePct: suggestion })}>Schätzung übernehmen: {suggestion} %</Button>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted">
          {suggestion != null
            ? `Schätzung: ${suggestion} %, aus ${kwh(variant.annualYieldKwh)} Jahresertrag der Variante „${variant.name}" und dem eingetragenen Verbrauch. Beratungsschätzung, keine Lastgangsimulation.`
            : "Eine Schätzung erscheint, sobald eine Anlage geplant und Verbrauch eingetragen ist."}
        </p>
      </Section>

      <Section id="verguetung" title={full ? "Einkauf und Vergütung" : "Vergütung"} hint={full ? "Was der Betreiber für Reststrom zahlt und was er für Solarstrom zusätzlich bekommt." : "Was der Betreiber für eingespeisten Überschuss bekommt."}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {full ? <Field label="Einkauf Reststrom ct/kWh" hint="Netto, mit allen Umlagen und Netzentgelten."><NumberField digits={2} value={draft.gridPurchaseCt} onChange={(gridPurchaseCt) => set({ gridPurchaseCt })} /></Field> : null}
          {feedIn}
          {full ? (
            <Field label="Mieterstromzuschlag ct/kWh" hint="Satz der Bundesnetzagentur, je nach Anlagengröße und Monat der Inbetriebnahme.">
              <NumberField digits={2} value={draft.surchargeCt} onChange={(surchargeCt) => set({ surchargeCt })} />
            </Field>
          ) : null}
        </div>
      </Section>

      {full ? (
        <Section id="grundversorgung" title="Grundversorgung im Netzgebiet" hint="Vergleichswert, brutto. Für Wohnungsmieter darf Mieterstrom höchstens 90 % des Grundversorgungstarifs kosten (§ 42a EnWG).">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Arbeitspreis ct/kWh"><NumberField digits={2} value={draft.basicPriceCt} onChange={(basicPriceCt) => set({ basicPriceCt })} /></Field>
            <Field label="Grundpreis € je Monat"><NumberField digits={2} value={draft.basicBaseEur} onChange={(basicBaseEur) => set({ basicBaseEur })} /></Field>
          </div>
        </Section>
      ) : null}

      <Section id="mieter" title="Mieter" hint="Je Gruppe gleichartiger Mietparteien: Verbrauch und der Tarif, den sie heute zahlen (brutto, wie auf der Stromrechnung).">
        <div className="space-y-3">
          {draft.tenants.map((group, index) => (
            <div key={group.id} data-tenant={index} className="rounded-xl border border-line bg-elevated p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Mietergruppe {index + 1}</p>
                <button type="button" aria-label={`Mietergruppe ${index + 1} entfernen`} className="rounded-lg p-1.5 text-danger hover:bg-red-50" onClick={() => set({ tenants: draft.tenants.filter((entry) => entry.id !== group.id) })}>
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Bezeichnung"><TextInput value={group.name} maxLength={80} onChange={(event) => setTenant(group.id, { name: event.target.value })} /></Field>
                <Field label="Mietertyp">
                  <SelectInput value={group.kind} onChange={(event) => setTenant(group.id, { kind: event.target.value as TenantKind })}>
                    {(Object.keys(KIND_LABEL) as TenantKind[]).map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Anzahl Mietparteien"><NumberField digits={0} value={group.count} onChange={(count) => setTenant(group.id, { count: Math.max(0, Math.round(count)) })} /></Field>
                <Field label="Verbrauch je Partei kWh/Jahr"><NumberField digits={0} value={group.annualKwh} onChange={(annualKwh) => setTenant(group.id, { annualKwh })} /></Field>
                <Field label="Bisheriger Arbeitspreis ct/kWh"><NumberField digits={2} value={group.currentPriceCt} onChange={(currentPriceCt) => setTenant(group.id, { currentPriceCt })} /></Field>
                <Field label="Bisheriger Grundpreis € je Monat"><NumberField digits={2} value={group.currentBaseEur} onChange={(currentBaseEur) => setTenant(group.id, { currentBaseEur })} /></Field>
              </div>
            </div>
          ))}
          {draft.tenants.length === 0 ? <p className="text-sm text-muted">Noch keine Mieter eingetragen.</p> : null}
          {draft.tenants.length < TENANT_LIMITS.groups ? (
            <Button type="button" size="sm" variant="secondary" data-add="mieter" onClick={() => set({ tenants: [...draft.tenants, newTenantGroup(uid(), suggest.currentPriceCt, draft.tenants.length)] })}>
              <Plus size={15} aria-hidden /> Mietergruppe
            </Button>
          ) : null}
        </div>
      </Section>

      <Section id="allgemeinstrom" title="Allgemeinstrom" hint="Strom des Gebäudes selbst, etwa Treppenhaus, Aufzug oder Heizung. Der Solaranteil daran ersetzt Netzbezug des Eigentümers.">
        <div className="space-y-3">
          {draft.general.map((load, index) => (
            <div key={load.id} data-general={index} className="grid items-end gap-3 rounded-xl border border-line bg-elevated p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <Field label="Bezeichnung"><TextInput value={load.name} maxLength={80} onChange={(event) => setLoad(load.id, { name: event.target.value })} /></Field>
              <Field label="Verbrauch kWh/Jahr"><NumberField digits={0} value={load.annualKwh} onChange={(annualKwh) => setLoad(load.id, { annualKwh })} /></Field>
              <Field label="Bisheriger Preis ct/kWh"><NumberField digits={2} value={load.priceCt} onChange={(priceCt) => setLoad(load.id, { priceCt })} /></Field>
              <button type="button" aria-label={`${load.name || "Allgemeinstrom"} entfernen`} className="mb-1 justify-self-start rounded-lg p-1.5 text-danger hover:bg-red-50" onClick={() => set({ general: draft.general.filter((entry) => entry.id !== load.id) })}>
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
          ))}
          {draft.general.length < TENANT_LIMITS.general ? (
            <Button type="button" size="sm" variant="secondary" data-add="allgemein" onClick={() => set({ general: [...draft.general, { id: uid(), name: "Treppenhaus und Keller", annualKwh: 0, priceCt: suggest.currentPriceCt }] })}>
              <Plus size={15} aria-hidden /> Allgemeinstrom
            </Button>
          ) : null}
        </div>
      </Section>
    </>
  );
}

function Summary({ config, variant }: { config: TenantPower; variant: { name: string; annualYieldKwh: number } }) {
  const gaps = tenantGaps(config);
  const summary = tenantSummary(config, variant.annualYieldKwh);
  const full = config.model === "versorger";
  const supplies = config.model !== "volleinspeisung";
  const mixed = full && config.tariffMode === "mischtarif";
  const planned = variant.annualYieldKwh > 0;

  if (gaps.length > 0) {
    return (
      <div data-summary="offen">
        <Notice>Für die Zusammenfassung fehlt noch: {gaps.join(", ")}. Bitte im Reiter Allgemein eintragen.</Notice>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-summary="fertig">
      <p className="text-sm text-muted">
        {planned ? `Gerechnet mit der Variante „${variant.name}": ${kwh(variant.annualYieldKwh)} Jahresertrag.` : "Es ist noch keine Anlage geplant. Gerechnet wird mit dem eingetragenen Solaranteil und ohne Einspeisung."}
      </p>
      {summary.limited ? <Notice>Die Anlage erzeugt weniger, als für {formatNumber(config.pvSharePct, 0)} % Solaranteil nötig wäre. Gerechnet ist mit {formatNumber(summary.sharePct, 1)} %.</Notice> : null}
      {full && config.surchargeCt <= 0 ? <Notice>Der Mieterstromzuschlag ist nicht eingetragen und fehlt in der Rechnung.</Notice> : null}

      <section data-view="betreiber" className="rounded-2xl bg-surface p-4 ring-1 ring-black/[0.04]">
        <h3 className="font-semibold">Aus Sicht des Betreibers</h3>
        <p className="mt-0.5 text-sm text-muted">Überschlag für das erste Jahr, netto. Kosten für Messung, Abrechnung und Betrieb sind nicht abgezogen.</p>
        {supplies ? (
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <Line label="Solarstrom an Mieter">{kwh(summary.pvToTenantsKwh)}</Line>
            {full ? <Line label="Reststrom an Mieter">{kwh(summary.gridToTenantsKwh)}</Line> : null}
            {summary.generalKwh > 0 ? <Line label="Solarstrom für Allgemeinstrom">{kwh(summary.pvToGeneralKwh)}</Line> : null}
            {planned ? <Line label="Einspeisung">{kwh(summary.feedInKwh)}</Line> : null}
            <Line label="Erlös je kWh Solarstrom">{ct(summary.pvRevenueCt)}{full && config.surchargeCt > 0 ? " mit Zuschlag" : ""}</Line>
            {summary.gridMarginCt != null ? <Line label="Marge je kWh Reststrom">{ct(summary.gridMarginCt)}</Line> : null}
          </dl>
        ) : null}
        <table className="mt-3 w-full text-sm">
          <tbody>
            {summary.yearly.map((entry) => (
              <tr key={entry.label} className="border-t border-line">
                <td className="py-1.5">{entry.label}</td>
                <td className={`py-1.5 text-right tabular-nums ${entry.eur < 0 ? "text-danger" : ""}`}>{formatEuro(entry.eur)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink/20 font-semibold">
              <td className="py-2">Überschlag pro Jahr</td>
              <td className="py-2 text-right tabular-nums" data-total>{formatEuro(summary.yearlyTotal)}</td>
            </tr>
          </tbody>
        </table>
        {summary.gridMarginCt != null && summary.gridMarginCt < 0 ? <div className="mt-3"><Notice>Der Reststrom wird unter dem Einkaufspreis verkauft.</Notice></div> : null}
      </section>

      {supplies ? (
        <section data-view="mieter" className="rounded-2xl bg-surface p-4 ring-1 ring-black/[0.04]">
          <h3 className="font-semibold">Aus Sicht der Mieter</h3>
          <p className="mt-0.5 text-sm text-muted">
            Brutto: {mixed ? `${ct(summary.gross.mixedCt)}/kWh` : full ? `${ct(summary.gross.pvCt)} Solarstrom, ${ct(summary.gross.gridCt)} Reststrom, im Schnitt ${ct(summary.gross.effectiveCt)}/kWh` : `${ct(summary.gross.pvCt)}/kWh Solarstrom, Reststrom weiter über den bisherigen Vertrag`}
            {config.baseFeeEur > 0 ? ` · Grundpreis ${formatEuro(summary.gross.baseFeeEur)} je Monat` : ""}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-muted">
                  <th className="py-1.5 pr-3 font-semibold">Mietergruppe</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">Bisher pro Jahr</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">Mit Mieterstrom</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">Ersparnis</th>
                  {full ? <th className="py-1.5 font-semibold">90 % Grundversorgung</th> : null}
                </tr>
              </thead>
              <tbody>
                {summary.groups.map((group) => (
                  <tr key={group.id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-3">{group.name}<span className="text-muted"> · {group.count} × {KIND_LABEL[group.kind]}</span></td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatEuro(group.currentEur)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatEuro(group.newEur)}</td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums ${group.savingEur < 0 ? "text-danger" : "text-ok"}`}>
                      {formatEuro(group.savingEur)}{group.savingPct != null ? ` · ${formatNumber(group.savingPct, 1)} %` : ""}
                    </td>
                    {full ? (
                      <td className="py-1.5">
                        {group.withinCap == null ? (
                          <span className="text-muted">{group.kind === "gewerbe" ? "gilt nicht für Gewerbe" : "Tarif fehlt"}</span>
                        ) : (
                          <Badge tone={group.withinCap ? "ok" : "danger"}>{group.withinCap ? "eingehalten" : "überschritten"} · Grenze {formatEuro(group.capEur ?? 0)}</Badge>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">Kosten je Mietpartei und Jahr, Arbeitspreis und Grundpreis zusammen.</p>
        </section>
      ) : null}

      <p className="text-xs text-muted">Rechenhilfe für die Beratung. Sie ersetzt keine Prüfung des Messkonzepts, der Verträge und der aktuellen Fördersätze.</p>
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}
