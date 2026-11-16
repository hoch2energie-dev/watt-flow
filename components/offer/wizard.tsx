"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { deleteOffer, moveOffer, saveOffer, setOfferStatus, unlockOffer } from "@/app/actions/offers";
import { Field, NumberField, SelectInput, TextArea, TextInput } from "@/components/fields";
import { OfferHub } from "@/components/offer/hub";
import { LineEditor } from "@/components/offer/line-editor";
import { OfferRail } from "@/components/offer/rail";
import { ResultsView } from "@/components/offer/results";
import { YieldPanel } from "@/components/offer/yield-panel";
import { Badge, Button, Notice } from "@/components/ui";
import { calculateOffer, resolveKwp } from "@/lib/calc/offer";
import { BUILDING_TYPES, HEATING_TYPES, ORIENTATIONS, ROOF_TYPES } from "@/lib/content";
import { annualConsumption, blankVariant, toCalcInput, type CatalogOption, type OfferDTO, type VariantDefaults, type VariantDTO } from "@/lib/domain";
import { formatEuro, formatNumber, formatPercent } from "@/lib/format";
import { OFFER_STATUS_LABEL, PAYMENT_LABEL } from "@/lib/labels";
import { navigate } from "@/lib/navigate";
import { STEP_ORDER } from "@/lib/offer-overview";

type Meta = {
  customerName: string;
  requestId: string;
  requestNumber: string;
  siteAddress: string;
  segment: "HAUSHALT" | "GEWERBE";
  locked: boolean;
  isAdmin: boolean;
  stages: { id: string; name: string }[];
  defaults: VariantDefaults;
};

export function OfferWizard({ initial, catalog, meta }: { initial: OfferDTO; catalog: CatalogOption[]; meta: Meta }) {
  const [offer, setOffer] = useState(initial);
  const [variantId, setVariantId] = useState(initial.variants.find((variant) => variant.recommended)?.id ?? initial.variants[0]?.id);
  const [step, setStep] = useState(0);
  /* Die Übersicht ist der Einstieg. Ein Klick auf einen Schritt wechselt in die Bearbeitung. */
  const [view, setView] = useState<"hub" | "steps">("hub");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const variant = offer.variants.find((entry) => entry.id === variantId) ?? offer.variants[0];

  function patchOffer(patch: Partial<OfferDTO>) {
    setOffer((current) => ({ ...current, ...patch }));
  }
  function patchVariant(patch: Partial<VariantDTO>) {
    setOffer((current) => ({
      ...current,
      variants: current.variants.map((entry) => (entry.id === variant.id ? { ...entry, ...patch } : entry)),
    }));
  }
  function setLines(lines: VariantDTO["lines"]) {
    patchVariant({ lines });
  }

  const result = useMemo(() => (variant ? calculateOffer(toCalcInput(offer, variant)) : null), [offer, variant]);
  const current = { id: STEP_ORDER[step] };

  async function persist() {
    setSaving(true);
    setError(null);
    const response = await saveOffer(offer);
    setSaving(false);
    if (!response.ok) {
      setError(response.error);
      setMessage(null);
      return false;
    }
    setMessage("Gespeichert");
    return true;
  }

  if (!variant || !result) return <p>Dem Angebot fehlt eine Variante.</p>;

  /** Speichert zuerst, damit in der 3D-Planung der aktuelle Stand liegt, und öffnet sie dann. */
  async function openPlanner() {
    if (!meta.locked) {
      const ok = await persist();
      if (!ok) return;
    }
    navigate(`/angebote/${offer.id}/dach3d?variante=${variant.id}`);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[250px_1fr]">
      <OfferRail
        offer={offer}
        variant={variant}
        result={result}
        active={view === "hub" ? "hub" : current.id}
        onOpen={(target) => {
          if (target === "hub") return setView("hub");
          setStep(STEP_ORDER.indexOf(target));
          setView("steps");
        }}
      />
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{offer.number}</p>
            <input className="mt-1 w-full max-w-xl bg-transparent font-display text-3xl outline-none" value={offer.title} disabled={meta.locked} onChange={(event) => patchOffer({ title: event.target.value })} />
            <p className="text-sm text-muted">
              <Link className="font-semibold text-brand" href={`/anfragen/${meta.requestId}`}>{meta.requestNumber}</Link>
              {" · "}{meta.customerName}{meta.siteAddress ? ` · ${meta.siteAddress}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={offer.status === "ANGENOMMEN" ? "ok" : "info"}>{OFFER_STATUS_LABEL[offer.status]}</Badge>
            <select className="field w-auto" value={offer.stageId ?? ""} onChange={(event) => { patchOffer({ stageId: event.target.value }); void moveOffer(offer.id, event.target.value); }}>
              {meta.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
            </select>
          </div>
        </div>

        {meta.locked ? <Notice tone="ok">Dieses Angebot ist angenommen und gesperrt. {meta.isAdmin ? "Die Administration kann die Sperre aufheben." : ""}</Notice> : null}
        {error ? <div className="mt-3"><Notice tone="danger">{error}</Notice></div> : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {offer.variants.map((entry) => (
            <button key={entry.id} type="button" onClick={() => setVariantId(entry.id)} className={`rounded-full px-3 py-1 text-sm font-semibold ${entry.id === variant.id ? "bg-ink text-white" : "bg-white"}`}>
              {entry.name}{entry.recommended ? " · empfohlen" : ""}
            </button>
          ))}
          {!meta.locked ? (
            <>
              <button type="button" className="text-sm font-semibold text-brand" onClick={() => {
                const created = blankVariant(`Variante ${offer.variants.length + 1}`, offer.variants.length, meta.defaults);
                setOffer({ ...offer, variants: [...offer.variants, created] });
                setVariantId(created.id);
              }}>Leere Variante</button>
              <button type="button" className="text-sm font-semibold text-brand" onClick={() => {
                const created = blankVariant(`${variant.name} Kopie`, offer.variants.length, meta.defaults);
                created.lines = variant.lines.map((line) => ({ ...line, id: crypto.randomUUID() }));
                created.recommended = false;
                Object.assign(created, { ...variant, id: created.id, name: created.name, sortOrder: created.sortOrder, recommended: false, lines: created.lines });
                setOffer({ ...offer, variants: [...offer.variants, { ...variant, id: created.id, name: `${variant.name} Kopie`, sortOrder: offer.variants.length, recommended: false, lines: variant.lines.map((line) => ({ ...line, id: crypto.randomUUID() })), faces: variant.faces.map((face) => ({ ...face, id: crypto.randomUUID() })) }] });
                setVariantId(created.id);
              }}>Kopie</button>
            </>
          ) : null}
        </div>

        {view === "hub" ? (
          <OfferHub
            offer={offer}
            variant={variant}
            result={result}
            locked={meta.locked}
            onOpen={(target) => {
              setStep(STEP_ORDER.indexOf(target));
              setView("steps");
            }}
            onPlan={() => void openPlanner()}
          />
        ) : (
        <fieldset disabled={meta.locked} className="mt-4 rounded-2xl border border-line bg-elevated p-4 sm:p-5 disabled:opacity-80">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <Field label="Variantenname">
              <TextInput value={variant.name} onChange={(event) => patchVariant({ name: event.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={variant.recommended} onChange={() => setOffer({ ...offer, variants: offer.variants.map((entry) => ({ ...entry, recommended: entry.id === variant.id })) })} />
              Empfohlen
            </label>
            {offer.variants.length > 1 && !meta.locked ? (
              <button type="button" className="text-sm text-danger" onClick={() => {
                const remaining = offer.variants.filter((entry) => entry.id !== variant.id);
                if (!remaining.some((entry) => entry.recommended)) remaining[0].recommended = true;
                setOffer({ ...offer, variants: remaining });
                setVariantId(remaining[0].id);
              }}>Variante löschen</button>
            ) : null}
          </div>

          {current.id === "verbrauch" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Haushaltsstrom kWh/Jahr"><NumberField digits={0} value={offer.householdKwh} onChange={(householdKwh) => patchOffer({ householdKwh })} /></Field>
              <Field label="Wärmepumpe elektrisch kWh/Jahr" hint="Zählt zum Stromverbrauch. Die thermische Menge ist nur eine Notiz."><NumberField digits={0} value={offer.heatPumpElectricKwh} onChange={(heatPumpElectricKwh) => patchOffer({ heatPumpElectricKwh })} /></Field>
              <Field label="Wärmepumpe thermisch kWh/Jahr"><NumberField digits={0} value={offer.heatPumpThermalKwh} onChange={(heatPumpThermalKwh) => patchOffer({ heatPumpThermalKwh })} /></Field>
              <Field label="E-Auto kWh/Jahr"><NumberField digits={0} value={offer.evKwh} onChange={(evKwh) => patchOffer({ evKwh })} /></Field>
              <Field label="Weiterer Strom kWh/Jahr"><NumberField digits={0} value={offer.otherKwh} onChange={(otherKwh) => patchOffer({ otherKwh })} /></Field>
              <Field label="Arbeitspreis €/kWh"><NumberField digits={3} value={offer.electricityPriceEur} onChange={(electricityPriceEur) => patchOffer({ electricityPriceEur })} /></Field>
              <Field label="Preissteigerung % pro Jahr"><NumberField digits={1} value={offer.priceIncreasePct} onChange={(priceIncreasePct) => patchOffer({ priceIncreasePct })} /></Field>
              <p className="sm:col-span-2 text-sm">Stromverbrauch gesamt: <strong>{formatNumber(annualConsumption(offer), 0)} kWh/Jahr</strong></p>
            </div>
          ) : null}

          {current.id === "gebaeude" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Gebäudetyp"><SelectInput value={offer.buildingType} onChange={(event) => patchOffer({ buildingType: event.target.value })}>{BUILDING_TYPES.map((item) => <option key={item}>{item}</option>)}<option value="">–</option></SelectInput></Field>
              <Field label="Baujahr"><NumberField digits={0} value={offer.buildingYear ?? 0} onChange={(value) => patchOffer({ buildingYear: value > 0 ? Math.round(value) : null })} /></Field>
              <Field label="Dacheindeckung"><SelectInput value={offer.roofType} onChange={(event) => patchOffer({ roofType: event.target.value })}><option value="">–</option>{ROOF_TYPES.map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
              <Field label="Ausrichtung" hint="Wird als Vorschlag für die Dachflächen im Schritt Solar verwendet."><SelectInput value={offer.orientation} onChange={(event) => patchOffer({ orientation: event.target.value })}><option value="">–</option>{ORIENTATIONS.map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
              <Field label="Neigung Grad"><NumberField digits={0} value={offer.tiltDeg ?? 0} onChange={(tiltDeg) => patchOffer({ tiltDeg })} /></Field>
              <Field label="Nutzbare Fläche m²"><NumberField digits={0} value={offer.roofAreaM2 ?? 0} onChange={(roofAreaM2) => patchOffer({ roofAreaM2 })} /></Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={offer.monumentProtected} onChange={(event) => patchOffer({ monumentProtected: event.target.checked })} /> Denkmalschutz oder Gestaltungsvorgabe</label>
              <Field label="Notiz, zum Beispiel Mieterstrom"><TextArea value={offer.buildingNote} onChange={(event) => patchOffer({ buildingNote: event.target.value })} /></Field>
            </div>
          ) : null}

          {current.id === "bestand" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bestehende PV kWp"><NumberField digits={2} value={offer.existingPvKwp} onChange={(existingPvKwp) => patchOffer({ existingPvKwp })} /></Field>
              <Field label="Bestehender Speicher kWh"><NumberField digits={1} value={offer.existingBatteryKwh} onChange={(existingBatteryKwh) => patchOffer({ existingBatteryKwh })} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={offer.existingWallbox} onChange={(event) => patchOffer({ existingWallbox: event.target.checked })} /> Wallbox vorhanden</label>
              <Field label="Bestehende Heizung"><SelectInput value={offer.existingHeating} onChange={(event) => patchOffer({ existingHeating: event.target.value })}><option value="">–</option>{HEATING_TYPES.map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
              <p className="sm:col-span-2 text-sm text-muted">Bestehende Anlagen werden dokumentiert. Die Ertragsrechnung betrachtet die neue Anlage und den eingetragenen Stromverbrauch.</p>
            </div>
          ) : null}

          {current.id === "solar" ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Spezifischer Ertrag kWh/kWp" hint="Fallback, wenn PVGIS nicht erreichbar ist. Eine erfolgreiche PVGIS-Rechnung überschreibt diesen Wert."><NumberField digits={0} value={variant.specificYield} onChange={(specificYield) => patchVariant({ specificYield, yieldProvider: "specific", yieldMonthlyKwh: null, yieldKey: "", yieldNotice: "" })} /></Field>
                <Field label="Anlagengröße kWp">
                  <NumberField digits={2} value={resolveKwp(toCalcInput(offer, variant))} onChange={(kwpOverride) => patchVariant({ kwpManual: true, kwpOverride })} />
                </Field>
                <div className="text-sm">
                  <p>Wechselrichter {formatNumber(result.inverterKw, 1)} kW</p>
                  <p>DC/AC {result.dcAcRatio == null ? "–" : formatPercent(result.dcAcRatio)}</p>
                  <p>Jahresertrag {formatNumber(result.yield.annualKwh, 0)} kWh</p>
                  {variant.kwpManual ? <button type="button" className="mt-1 font-semibold text-brand" onClick={() => patchVariant({ kwpManual: false })}>Aus den Modulen rechnen</button> : null}
                </div>
              </div>
              <YieldPanel offer={offer} variant={variant} address={meta.siteAddress} onOffer={patchOffer} onVariant={patchVariant} onPlan={() => void openPlanner()} />
              <h3 className="font-semibold">Module</h3>
              <LineEditor section="module" lines={variant.lines} catalog={catalog} onChange={setLines} />
              <h3 className="font-semibold">Wechselrichter</h3>
              <LineEditor section="inverter" lines={variant.lines} catalog={catalog} onChange={setLines} />
              <h3 className="font-semibold">Montage und Elektro der PV-Anlage</h3>
              <LineEditor section="mounting" lines={variant.lines} catalog={catalog} onChange={setLines} />
            </div>
          ) : null}

          {current.id === "speicher" ? <LineEditor section="storage" lines={variant.lines} catalog={catalog} onChange={setLines} /> : null}
          {current.id === "wallbox" ? (
            <div className="space-y-3">
              {variant.lines.filter((line) => line.section === "wallbox").reduce((sum, line) => sum + line.quantity, 0) > 1 ? <Notice>Mehr als eine Wallbox. Bitte Hausanschluss und Lastmanagement prüfen.</Notice> : null}
              <LineEditor section="wallbox" lines={variant.lines} catalog={catalog} onChange={setLines} />
            </div>
          ) : null}
          {current.id === "waerme" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">Den elektrischen Jahresverbrauch der Wärmepumpe tragen Sie im Schritt Verbrauch ein. Hier stehen die angebotenen Geräte.</p>
              <LineEditor section="heatpump" lines={variant.lines} catalog={catalog} onChange={setLines} />
            </div>
          ) : null}
          {current.id === "extras" ? <LineEditor section="extra" lines={variant.lines} catalog={catalog} onChange={setLines} /> : null}

          {current.id === "zahlung" ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={offer.vatZeroEligible} onChange={(event) => patchOffer({ vatZeroEligible: event.target.checked })} /> Nullsteuersatz § 12 Abs. 3 UStG für PV-Positionen anwenden</label>
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={offer.vatDeductible} onChange={(event) => patchOffer({ vatDeductible: event.target.checked })} /> Kunde ist vorsteuerabzugsberechtigt, Wirtschaftlichkeit rechnet netto</label>
              </div>
              <Field label="Gültig bis"><TextInput type="date" value={offer.validUntil ?? ""} onChange={(event) => patchOffer({ validUntil: event.target.value || null })} /></Field>
              <div className="flex flex-wrap gap-2">
                {(["BAR", "FINANZIERUNG", "RATEN"] as const).map((mode) => (
                  <button key={mode} type="button" className={`rounded-full px-3 py-1 text-sm font-semibold ${variant.paymentMode === mode ? "bg-brand text-white" : "bg-white"}`} onClick={() => patchVariant({ paymentMode: mode })}>{PAYMENT_LABEL[mode]}</button>
                ))}
              </div>
              <Field label="Rabatt netto"><NumberField value={variant.rebateNet} onChange={(rebateNet) => patchVariant({ rebateNet })} /></Field>
              {variant.paymentMode !== "BAR" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Anzahlung"><NumberField value={variant.downPayment} onChange={(downPayment) => patchVariant({ downPayment })} /></Field>
                  {variant.paymentMode === "FINANZIERUNG" ? (
                    <>
                      <Field label="Zinssatz %"><NumberField digits={2} value={variant.financeInterestPct} onChange={(financeInterestPct) => patchVariant({ financeInterestPct })} /></Field>
                      <Field label="Laufzeit Jahre"><NumberField digits={0} value={variant.financeYears} onChange={(financeYears) => patchVariant({ financeYears })} /></Field>
                    </>
                  ) : (
                    <>
                      <Field label="Anzahl Raten"><NumberField digits={0} value={variant.instalmentCount} onChange={(instalmentCount) => patchVariant({ instalmentCount })} /></Field>
                      <Field label="Abstand in Monaten"><NumberField digits={0} value={variant.instalmentIntervalMonths} onChange={(instalmentIntervalMonths) => patchVariant({ instalmentIntervalMonths })} /></Field>
                      <Field label="Zinssatz %"><NumberField digits={2} value={variant.instalmentInterestPct} onChange={(instalmentInterestPct) => patchVariant({ instalmentInterestPct })} /></Field>
                    </>
                  )}
                </div>
              ) : null}
              <div className="rounded-xl bg-bg p-3 text-sm">
                <p>Netto {formatEuro(result.pricing.net)} · Steuer {formatEuro(result.pricing.vat)} · Brutto {formatEuro(result.pricing.gross)}</p>
                <p>Kunde zahlt {formatEuro(result.financing.customerPays)}{result.financing.mode !== "BAR" ? ` · Rate ${formatEuro(result.financing.payment)}` : ""}</p>
                <p>Deckungsbeitrag {formatEuro(result.pricing.margin)} · {formatPercent(result.pricing.marginPercent)}</p>
              </div>
            </div>
          ) : null}

          {current.id === "ergebnisse" ? (
            <div className="space-y-4">
              <details className="rounded-xl bg-bg p-3 text-sm">
                <summary className="cursor-pointer font-semibold">Annahmen</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="EEG-Vergütung €/kWh, 20 Jahre"><NumberField digits={4} value={variant.eegTariffEur} onChange={(eegTariffEur) => patchVariant({ eegTariffEur })} /></Field>
                  <Field label="Vergütung danach €/kWh"><NumberField digits={4} value={variant.postEegTariffEur} onChange={(postEegTariffEur) => patchVariant({ postEegTariffEur })} /></Field>
                  <Field label="Betrachtung Jahre"><NumberField digits={0} value={variant.horizonYears} onChange={(horizonYears) => patchVariant({ horizonYears })} /></Field>
                  <Field label="Degradation % pro Jahr"><NumberField digits={2} value={variant.degradationPct} onChange={(degradationPct) => patchVariant({ degradationPct })} /></Field>
                  <Field label="Betriebskosten € pro Jahr"><NumberField value={variant.opexEurPerYear} onChange={(opexEurPerYear) => patchVariant({ opexEurPerYear })} /></Field>
                  <Field label="Speicher-Vollzyklen pro Jahr"><NumberField digits={0} value={variant.batteryCyclesPerYear} onChange={(batteryCyclesPerYear) => patchVariant({ batteryCyclesPerYear })} /></Field>
                </div>
              </details>
              {variant.lines.some((line) => line.section === "heatpump") && offer.heatPumpElectricKwh <= 0 ? <Notice>Es ist eine Wärmepumpe angeboten, aber kein Wärmepumpenstrom im Verbrauch.</Notice> : null}
              <ResultsView result={result} horizon={variant.horizonYears} />
            </div>
          ) : null}
        </fieldset>
        )}

        <div className="sticky bottom-3 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
          <div className="text-sm">
            <strong>{formatEuro(result.investment)}</strong>
            <span className="text-muted"> · Marge {formatEuro(result.pricing.margin)}</span>
            {message ? <span className="ml-2 text-ok">{message}</span> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {view === "steps" ? <Button type="button" variant="secondary" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>Zurück</Button> : null}
            {!meta.locked ? <Button type="button" variant="secondary" disabled={saving} onClick={() => void persist()}>{saving ? "Speichert…" : "Speichern"}</Button> : null}
            {view === "hub" ? null : step < STEP_ORDER.length - 1 ? (
              <Button type="button" onClick={async () => {
                if (!meta.locked) {
                  const ok = await persist();
                  if (!ok) return;
                }
                setStep((value) => value + 1);
              }}>Weiter</Button>
            ) : (
              <Button type="button" onClick={async () => { if (!meta.locked) { const ok = await persist(); if (!ok) return; } window.open(`/api/offers/${offer.id}/pdf?variant=${variant.id}`, "_blank"); }}>PDF öffnen</Button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {offer.status !== "ANGENOMMEN" ? (
            <>
              <Button type="button" size="sm" variant="secondary" onClick={() => void setOfferStatus(offer.id, "VERSENDET").then(() => setOffer({ ...offer, status: "VERSENDET" }))}>Als versendet markieren</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => void setOfferStatus(offer.id, "ABGELEHNT").then(() => setOffer({ ...offer, status: "ABGELEHNT" }))}>Abgelehnt</Button>
            </>
          ) : null}
          {meta.locked && meta.isAdmin ? <Button type="button" size="sm" variant="secondary" onClick={() => void unlockOffer(offer.id).then(() => window.location.reload())}>Sperre aufheben</Button> : null}
          {meta.isAdmin && offer.status !== "ANGENOMMEN" ? <Button type="button" size="sm" variant="danger" onClick={() => void deleteOffer(offer.id)}>Angebot löschen</Button> : null}
        </div>
        {offer.status !== "ANGENOMMEN" ? (
          <form action="/api/attachments" method="post" encType="multipart/form-data" className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line p-3">
            <input type="hidden" name="offerId" value={offer.id} />
            <input type="hidden" name="kind" value="signatur" />
            <p className="text-sm">Unterschriebenes PDF hochladen und als angenommen markieren.</p>
            <input type="file" name="file" accept="application/pdf,image/png,image/jpeg" required className="text-sm" />
            <Button type="submit" size="sm">Annahme speichern</Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
