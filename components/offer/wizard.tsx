"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { deleteOffer, moveOffer, saveOffer, setOfferStatus, unlockOffer } from "@/app/actions/offers";
import { locateAddress } from "@/app/actions/roof";
import { Field, NumberField, SelectInput, TextArea, TextInput } from "@/components/fields";
import { PlanningHub } from "@/components/offer/hub";
import { LineEditor } from "@/components/offer/line-editor";
import { LocationDialog } from "@/components/offer/location-dialog";
import { ResultsView } from "@/components/offer/results";
import { TenantPowerDialog, type TenantDialogTab } from "@/components/offer/tenant-power";
import { FigureStrip, OfferTabs } from "@/components/offer/tabs";
import { YieldPanel } from "@/components/offer/yield-panel";
import { Badge, Button, Notice } from "@/components/ui";
import { calculateOffer, resolveKwp } from "@/lib/calc/offer";
import { BUILDING_TYPES, HEATING_TYPES, ORIENTATIONS, ROOF_TYPES } from "@/lib/content";
import { annualConsumption, blankVariant, toCalcInput, type CatalogOption, type OfferDTO, type VariantDefaults, type VariantDTO } from "@/lib/domain";
import { formatEuro, formatNumber, formatPercent } from "@/lib/format";
import { OFFER_STATUS_LABEL, PAYMENT_LABEL } from "@/lib/labels";
import { navigate } from "@/lib/navigate";
import { TABS, TOPIC_LABEL, isPlanTopic, type TabId, type TopicId } from "@/lib/offer-overview";
import type { TenantPower } from "@/lib/tenant-power";

type Meta = {
  customerName: string;
  customerId: string;
  customerEmail: string;
  customerPhone: string;
  requestId: string;
  requestNumber: string;
  siteAddress: string;
  segment: "HAUSHALT" | "GEWERBE";
  locked: boolean;
  isAdmin: boolean;
  stages: { id: string; name: string }[];
  defaults: VariantDefaults;
  /** Browser-Schlüssel für Googles Karte. Ohne ihn gibt es den Knopf „Auf der Karte prüfen" nicht. */
  mapsKey: string | null;
};

/**
 * Angebotsseite. Oben die Reiter Allgemein, Planung, Simulation, Abschluss. Der Reiter Planung
 * zeigt die Themenhubs und die Kacheln der Variante; eine Kachel öffnet ihren Bearbeitungsbereich.
 */
export function OfferWizard({ initial, catalog, meta }: { initial: OfferDTO; catalog: CatalogOption[]; meta: Meta }) {
  const [offer, setOffer] = useState(initial);
  const [variantId, setVariantId] = useState(initial.variants.find((variant) => variant.recommended)?.id ?? initial.variants[0]?.id);
  /* Einstieg ist die Planung: Dort liegt die Arbeit, und dorthin kehrt man aus der 3D-Planung zurück. */
  const [tab, setTab] = useState<TabId>("planung");
  /* Bearbeitungsbereich im Reiter Planung. Ohne Angabe zeigt der Reiter die Kacheln. */
  const [topic, setTopic] = useState<TopicId | null>(null);
  const [editVariant, setEditVariant] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /* Der Stand, der zuletzt gespeichert wurde. Die Meldung „Gespeichert" gilt nur, solange er unverändert ist. */
  const [savedOffer, setSavedOffer] = useState<OfferDTO | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  /* Dialog „Mieterstrom": geschlossen oder offen mit dem Reiter, der zuerst gezeigt wird. */
  const [tenantTab, setTenantTab] = useState<TenantDialogTab | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const actions = useRef<HTMLDetailsElement>(null);
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

  /** Speichert den Stand der Seite oder einen ausdrücklich übergebenen, der gerade erst gesetzt wurde. */
  async function persist(next: OfferDTO = offer) {
    setSaving(true);
    setError(null);
    const response = await saveOffer(next);
    setSaving(false);
    if (!response.ok) {
      setError(response.error);
      setMessage(null);
      return false;
    }
    setMessage("Gespeichert");
    setSavedOffer(next);
    return true;
  }

  if (!variant || !result) return <p>Dem Angebot fehlt eine Variante.</p>;

  /** Speichert, falls erlaubt. Gesperrte Angebote gelten als gespeichert. */
  const saved = async () => meta.locked || (await persist());

  /** Speichert zuerst, damit in der 3D-Planung der aktuelle Stand liegt, und öffnet sie dann. */
  async function openPlanner() {
    if (await saved()) navigate(`/angebote/${offer.id}/dach3d?variante=${variant.id}`);
  }
  async function openPdf() {
    if (await saved()) window.open(`/api/offers/${offer.id}/pdf?variant=${variant.id}`, "_blank");
  }
  function mark(status: "VERSENDET" | "ABGELEHNT") {
    void setOfferStatus(offer.id, status).then(() => setOffer((current) => ({ ...current, status })));
  }
  /** Übernimmt den Mieterstrom aus dem Dialog, speichert und schließt ihn, wenn das geklappt hat. */
  async function saveTenant(tenantPower: TenantPower | null) {
    const next = { ...offer, tenantPower };
    setOffer(next);
    if (await persist(next)) setTenantTab(null);
  }
  function show(next: TabId) {
    setTab(next);
    setTopic(null);
    window.scrollTo({ top: 0 });
  }
  async function locate() {
    setLocating(true);
    setLocateNote(null);
    const found = await locateAddress(meta.siteAddress);
    setLocating(false);
    if (!found.ok) return setLocateNote(found.notice);
    patchOffer({ latitude: found.latitude, longitude: found.longitude, locationLabel: found.label, locationSource: "adresse" });
    if (found.approximate) setLocateNote(`Die Adresse wurde nur ungefähr gefunden, nicht das Gebäude selbst. Bitte den Standort ${meta.mapsKey ? "auf der Karte" : "in der 3D-Planung"} prüfen.`);
  }
  /** Übernimmt den Punkt unter dem Fadenkreuz der Karte als Standort des Angebots. */
  function pickLocation(latitude: number, longitude: number) {
    const round = (value: number) => Math.round(value * 1e6) / 1e6;
    patchOffer({ latitude: round(latitude), longitude: round(longitude), locationSource: "karte", locationLabel: offer.locationLabel || meta.siteAddress || "Auf der Karte gesetzt" });
    setLocateNote(null);
    setMapOpen(false);
  }
  function addVariant(copy: boolean) {
    const created = blankVariant(copy ? `${variant.name} Kopie` : `Variante ${offer.variants.length + 1}`, offer.variants.length, meta.defaults);
    const next: VariantDTO = copy
      ? {
          ...variant,
          id: created.id,
          name: created.name,
          sortOrder: offer.variants.length,
          recommended: false,
          lines: variant.lines.map((line) => ({ ...line, id: crypto.randomUUID() })),
          faces: variant.faces.map((face) => ({ ...face, id: crypto.randomUUID() })),
        }
      : created;
    setOffer({ ...offer, variants: [...offer.variants, next] });
    setVariantId(next.id);
  }
  function removeVariant() {
    const remaining = offer.variants.filter((entry) => entry.id !== variant.id);
    if (remaining.length === 0) return;
    const kept = remaining.some((entry) => entry.recommended) ? remaining : remaining.map((entry, index) => ({ ...entry, recommended: index === 0 }));
    setOffer({ ...offer, variants: kept });
    setVariantId(kept[0].id);
    setEditVariant(false);
  }

  const located = offer.latitude != null && offer.longitude != null && !(offer.latitude === 0 && offer.longitude === 0);
  const nextTab = TABS[TABS.findIndex((entry) => entry.id === tab) + 1]?.id ?? null;
  const wallboxes = variant.lines.filter((line) => line.section === "wallbox").reduce((sum, line) => sum + line.quantity, 0);

  /** Varianten wählen. Mit `manage` auch anlegen, kopieren, umbenennen, löschen. */
  const variantBar = (manage: boolean) => (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Varianten">
      {offer.variants.map((entry) => (
        <button
          key={entry.id}
          type="button"
          aria-pressed={entry.id === variant.id}
          onClick={() => setVariantId(entry.id)}
          className={`rounded-full border px-3 py-1 text-sm font-semibold ${entry.id === variant.id ? "border-brand bg-white text-brand" : "border-transparent bg-white/60 text-ink hover:bg-white"}`}
        >
          {entry.name}{entry.recommended ? " · empfohlen" : ""}
        </button>
      ))}
      {manage && !meta.locked ? (
        <>
          <button type="button" className="rounded-full bg-white/60 px-3 py-1 text-sm font-semibold text-brand hover:bg-white" onClick={() => addVariant(false)}>+ Neue Variante</button>
          <button type="button" className="text-sm font-semibold text-brand" onClick={() => addVariant(true)}>Kopie</button>
          <button type="button" className="text-sm font-semibold text-brand" aria-expanded={editVariant} onClick={() => setEditVariant((open) => !open)}>Variante bearbeiten</button>
        </>
      ) : null}
    </div>
  );

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{offer.number}</p>
          <input aria-label="Angebotsname" className="mt-1 w-full max-w-xl bg-transparent outline-none" style={{ fontFamily: "var(--font-display)", fontSize: "1.875rem", lineHeight: 1.2 }} value={offer.title} disabled={meta.locked} onChange={(event) => patchOffer({ title: event.target.value })} />
          <p className="text-sm text-muted">{meta.customerName}{meta.siteAddress ? ` · ${meta.siteAddress}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={offer.status === "ANGENOMMEN" ? "ok" : "info"}>{OFFER_STATUS_LABEL[offer.status]}</Badge>
          <select aria-label="Spalte im Board" className="field" style={{ width: "auto", maxWidth: "14rem" }} value={offer.stageId ?? ""} onChange={(event) => { patchOffer({ stageId: event.target.value }); void moveOffer(offer.id, event.target.value); }}>
            {meta.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
          </select>
          <details ref={actions} className="relative" onToggle={() => setDeleteArmed(false)}>
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              Aktionen <ChevronDown size={15} aria-hidden />
            </summary>
            <div className="absolute right-0 z-20 mt-1 flex w-60 flex-col rounded-xl border border-line bg-white p-1 text-sm shadow-lg">
              <MenuItem onClick={() => { actions.current?.removeAttribute("open"); void openPdf(); }}>PDF öffnen</MenuItem>
              {offer.status !== "ANGENOMMEN" ? (
                <>
                  <MenuItem onClick={() => { actions.current?.removeAttribute("open"); mark("VERSENDET"); }}>Als versendet markieren</MenuItem>
                  <MenuItem onClick={() => { actions.current?.removeAttribute("open"); mark("ABGELEHNT"); }}>Als abgelehnt markieren</MenuItem>
                </>
              ) : null}
              {meta.locked && meta.isAdmin ? <MenuItem onClick={() => void unlockOffer(offer.id).then(() => window.location.reload())}>Sperre aufheben</MenuItem> : null}
              {meta.isAdmin && offer.status !== "ANGENOMMEN" ? (
                <MenuItem danger onClick={() => (deleteArmed ? void deleteOffer(offer.id) : setDeleteArmed(true))}>{deleteArmed ? "Wirklich löschen? Noch einmal klicken" : "Angebot löschen"}</MenuItem>
              ) : null}
            </div>
          </details>
        </div>
      </div>

      {meta.locked ? <div className="mt-3"><Notice tone="ok">Dieses Angebot ist angenommen und gesperrt. {meta.isAdmin ? "Die Administration kann die Sperre unter Aktionen aufheben." : ""}</Notice></div> : null}
      {error ? <div className="mt-3"><Notice tone="danger">{error}</Notice></div> : null}

      <OfferTabs active={tab} onChange={show} request={{ href: `/anfragen/${meta.requestId}`, number: meta.requestNumber }} />
      <FigureStrip result={result} variantName={variant.name} />

      {tab === "allgemein" ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Card title="Kunde">
            <dl className="space-y-1 text-sm">
              <Row label="Name">{meta.customerName}</Row>
              <Row label="E-Mail">{meta.customerEmail ? <a className="text-brand" href={`mailto:${meta.customerEmail}`}>{meta.customerEmail}</a> : "–"}</Row>
              <Row label="Telefon">{meta.customerPhone ? <a className="text-brand" href={`tel:${meta.customerPhone.replace(/\s+/g, "")}`}>{meta.customerPhone}</a> : "–"}</Row>
              <Row label="Kundenart">{meta.segment === "GEWERBE" ? "Gewerbe" : "Haushalt"}</Row>
            </dl>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
              <Link className="text-brand" href={`/kunden/${meta.customerId}`}>Kunde öffnen</Link>
              <Link className="text-brand" href={`/anfragen/${meta.requestId}`}>Anfrage {meta.requestNumber} öffnen</Link>
            </p>
          </Card>
          <Card title="Objekt und Standort">
            <dl className="space-y-1 text-sm">
              <Row label="Objektadresse">{meta.siteAddress || "Keine hinterlegt"}</Row>
              <Row label="Standort">
                {located ? `${offer.locationLabel || "Festgelegt"} (${formatNumber(offer.latitude ?? 0, 5)}, ${formatNumber(offer.longitude ?? 0, 5)})` : "Noch nicht festgelegt"}
              </Row>
            </dl>
            <p className="mt-2 text-xs text-muted">Der Standort bestimmt das Luftbild der 3D-Planung und die Ertragsrechnung. Die Adresse selbst steht in der Anfrage.</p>
            {locateNote ? <div className="mt-2"><Notice>{locateNote}</Notice></div> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" disabled={meta.locked || locating || !meta.siteAddress} onClick={() => void locate()}>
                {locating ? "Sucht…" : located ? "Standort neu aus der Adresse suchen" : "Standort aus der Adresse suchen"}
              </Button>
              {meta.mapsKey ? <Button type="button" size="sm" variant="secondary" onClick={() => setMapOpen(true)}>Auf der Karte prüfen</Button> : null}
            </div>
          </Card>
          <fieldset disabled={meta.locked} className="rounded-2xl border border-line bg-elevated p-4 disabled:opacity-80 sm:p-5 lg:col-span-2">
            <legend className="sr-only">Gebäude</legend>
            <h2 className="mb-3 font-display text-xl">Gebäude</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Gebäudetyp"><SelectInput value={offer.buildingType} onChange={(event) => patchOffer({ buildingType: event.target.value })}>{BUILDING_TYPES.map((item) => <option key={item}>{item}</option>)}<option value="">–</option></SelectInput></Field>
              <Field label="Baujahr"><NumberField digits={0} value={offer.buildingYear ?? 0} onChange={(value) => patchOffer({ buildingYear: value > 0 ? Math.round(value) : null })} /></Field>
              <Field label="Dacheindeckung"><SelectInput value={offer.roofType} onChange={(event) => patchOffer({ roofType: event.target.value })}><option value="">–</option>{ROOF_TYPES.map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
              <Field label="Ausrichtung" hint="Vorschlag, solange kein Dach in der 3D-Planung gezeichnet ist."><SelectInput value={offer.orientation} onChange={(event) => patchOffer({ orientation: event.target.value })}><option value="">–</option>{ORIENTATIONS.map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
              <Field label="Neigung Grad"><NumberField digits={0} value={offer.tiltDeg ?? 0} onChange={(tiltDeg) => patchOffer({ tiltDeg })} /></Field>
              <Field label="Nutzbare Fläche m²"><NumberField digits={0} value={offer.roofAreaM2 ?? 0} onChange={(roofAreaM2) => patchOffer({ roofAreaM2 })} /></Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3"><input type="checkbox" checked={offer.monumentProtected} onChange={(event) => patchOffer({ monumentProtected: event.target.checked })} /> Denkmalschutz oder Gestaltungsvorgabe</label>
              <div className="sm:col-span-2 lg:col-span-3">
                <Field label="Notiz zum Gebäude"><TextArea value={offer.buildingNote} onChange={(event) => patchOffer({ buildingNote: event.target.value })} /></Field>
              </div>
            </div>
          </fieldset>
        </div>
      ) : null}

      {tab === "planung" && !topic ? (
        <>
          <PlanningHub offer={offer} variant={variant} result={result} locked={meta.locked} variantBar={variantBar(true)} onOpen={(next) => { setTopic(next); window.scrollTo({ top: 0 }); }} onPlan={() => void openPlanner()} onTenant={(next) => { setError(null); setTenantTab(next); }} />
          {editVariant && !meta.locked ? (
            <div className="mt-4 flex flex-wrap items-end gap-4 rounded-2xl border border-line bg-elevated p-4">
              <Field label="Variantenname">
                <TextInput value={variant.name} onChange={(event) => patchVariant({ name: event.target.value })} />
              </Field>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" checked={variant.recommended} onChange={() => setOffer({ ...offer, variants: offer.variants.map((entry) => ({ ...entry, recommended: entry.id === variant.id })) })} />
                Empfohlen
              </label>
              {offer.variants.length > 1 ? <button type="button" className="pb-2 text-sm font-semibold text-danger" onClick={removeVariant}>Variante löschen</button> : null}
              <button type="button" className="pb-2 text-sm font-semibold text-brand" onClick={() => setEditVariant(false)}>Schließen</button>
            </div>
          ) : null}
        </>
      ) : null}

      {tab === "planung" && topic ? (
        <section aria-labelledby="topic-title" className="mt-5">
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-brand" onClick={() => setTopic(null)}>
              <ArrowLeft size={16} aria-hidden /> Zurück zur Planung
            </button>
            <h2 id="topic-title" className="font-display text-2xl">{TOPIC_LABEL[topic]}</h2>
            {isPlanTopic(topic) ? <span className="text-sm text-muted">Variante {variant.name}</span> : null}
          </div>
          <fieldset disabled={meta.locked} className="rounded-2xl border border-line bg-elevated p-4 disabled:opacity-80 sm:p-5">
            <legend className="sr-only">{TOPIC_LABEL[topic]}</legend>

            {topic === "strom" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Haushaltsstrom kWh/Jahr"><NumberField digits={0} value={offer.householdKwh} onChange={(householdKwh) => patchOffer({ householdKwh })} /></Field>
                <Field label="Weiterer Strom kWh/Jahr"><NumberField digits={0} value={offer.otherKwh} onChange={(otherKwh) => patchOffer({ otherKwh })} /></Field>
                <Field label="Arbeitspreis €/kWh"><NumberField digits={3} value={offer.electricityPriceEur} onChange={(electricityPriceEur) => patchOffer({ electricityPriceEur })} /></Field>
                <Field label="Preissteigerung % pro Jahr"><NumberField digits={1} value={offer.priceIncreasePct} onChange={(priceIncreasePct) => patchOffer({ priceIncreasePct })} /></Field>
                <p className="text-sm sm:col-span-2">
                  Stromverbrauch gesamt: <strong>{formatNumber(annualConsumption(offer), 0)} kWh/Jahr</strong>
                  <span className="text-muted"> · darin Wärmepumpe {formatNumber(offer.heatPumpElectricKwh, 0)} kWh und E-Auto {formatNumber(offer.evKwh, 0)} kWh, einzutragen unter Wärme und Mobilität.</span>
                </p>
                <h3 className="mt-2 font-semibold sm:col-span-2">Bestehende Anlagen</h3>
                <Field label="Bestehende PV kWp"><NumberField digits={2} value={offer.existingPvKwp} onChange={(existingPvKwp) => patchOffer({ existingPvKwp })} /></Field>
                <Field label="Bestehender Speicher kWh"><NumberField digits={1} value={offer.existingBatteryKwh} onChange={(existingBatteryKwh) => patchOffer({ existingBatteryKwh })} /></Field>
                <p className="text-sm text-muted sm:col-span-2">Bestehende Anlagen werden dokumentiert. Die Ertragsrechnung betrachtet die neue Anlage und den eingetragenen Stromverbrauch.</p>
              </div>
            ) : null}

            {topic === "waerme" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Bestehende Heizung"><SelectInput value={offer.existingHeating} onChange={(event) => patchOffer({ existingHeating: event.target.value })}><option value="">–</option>{HEATING_TYPES.map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
                <span className="hidden sm:block" />
                <Field label="Wärmepumpe elektrisch kWh/Jahr" hint="Zählt zum Stromverbrauch."><NumberField digits={0} value={offer.heatPumpElectricKwh} onChange={(heatPumpElectricKwh) => patchOffer({ heatPumpElectricKwh })} /></Field>
                <Field label="Wärmepumpe thermisch kWh/Jahr" hint="Nur eine Notiz, geht nicht in die Rechnung ein."><NumberField digits={0} value={offer.heatPumpThermalKwh} onChange={(heatPumpThermalKwh) => patchOffer({ heatPumpThermalKwh })} /></Field>
              </div>
            ) : null}

            {topic === "mobilitaet" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="E-Auto kWh/Jahr" hint="Ladestrom zu Hause. Zählt zum Stromverbrauch."><NumberField digits={0} value={offer.evKwh} onChange={(evKwh) => patchOffer({ evKwh })} /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={offer.existingWallbox} onChange={(event) => patchOffer({ existingWallbox: event.target.checked })} /> Wallbox vorhanden</label>
              </div>
            ) : null}

            {topic === "pv" ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3">
                  <p className="text-sm">Dach, Aufbauten und Module planen Sie in der 3D-Planung. Hier stehen Preise, Dachflächen und Ertrag.</p>
                  <Button type="button" size="sm" onClick={() => void openPlanner()}>Zur 3D-Planung</Button>
                </div>
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

            {topic === "speicher" ? <LineEditor section="storage" lines={variant.lines} catalog={catalog} onChange={setLines} /> : null}
            {topic === "wallbox" ? (
              <div className="space-y-3">
                {wallboxes > 1 ? <Notice>Mehr als eine Wallbox. Bitte Hausanschluss und Lastmanagement prüfen.</Notice> : null}
                <LineEditor section="wallbox" lines={variant.lines} catalog={catalog} onChange={setLines} />
              </div>
            ) : null}
            {topic === "waermepumpe" ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">Hier stehen die angebotenen Geräte. Den elektrischen Jahresverbrauch der Wärmepumpe tragen Sie im Themenbereich Wärme ein.</p>
                <LineEditor section="heatpump" lines={variant.lines} catalog={catalog} onChange={setLines} />
              </div>
            ) : null}
            {topic === "extras" ? <LineEditor section="extra" lines={variant.lines} catalog={catalog} onChange={setLines} /> : null}
          </fieldset>
        </section>
      ) : null}

      {tab === "simulation" ? (
        <div className="mt-5 space-y-4">
          {variantBar(false)}
          {variant.lines.some((line) => line.section === "heatpump" && line.quantity > 0) && offer.heatPumpElectricKwh <= 0 ? <Notice>Es ist eine Wärmepumpe angeboten, aber kein Wärmepumpenstrom im Themenbereich Wärme eingetragen.</Notice> : null}
          {result.kwp <= 0 ? <Notice>Es ist noch keine Anlagengröße geplant. Die Wirtschaftlichkeit erscheint, sobald Module stehen.</Notice> : null}
          <fieldset disabled={meta.locked} className="disabled:opacity-80">
            <legend className="sr-only">Annahmen der Wirtschaftlichkeit</legend>
            <details className="rounded-xl bg-elevated p-3 text-sm">
              <summary className="cursor-pointer font-semibold">Annahmen</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="EEG-Vergütung €/kWh, 20 Jahre"><NumberField digits={4} value={variant.eegTariffEur} onChange={(eegTariffEur) => patchVariant({ eegTariffEur })} /></Field>
                <Field label="Vergütung danach €/kWh"><NumberField digits={4} value={variant.postEegTariffEur} onChange={(postEegTariffEur) => patchVariant({ postEegTariffEur })} /></Field>
                <Field label="Betrachtung Jahre"><NumberField digits={0} value={variant.horizonYears} onChange={(horizonYears) => patchVariant({ horizonYears })} /></Field>
                <Field label="Degradation % pro Jahr"><NumberField digits={2} value={variant.degradationPct} onChange={(degradationPct) => patchVariant({ degradationPct })} /></Field>
                <Field label="Betriebskosten € pro Jahr"><NumberField value={variant.opexEurPerYear} onChange={(opexEurPerYear) => patchVariant({ opexEurPerYear })} /></Field>
                <Field label="Speicher-Vollzyklen pro Jahr"><NumberField digits={0} value={variant.batteryCyclesPerYear} onChange={(batteryCyclesPerYear) => patchVariant({ batteryCyclesPerYear })} /></Field>
              </div>
            </details>
          </fieldset>
          <ResultsView result={result} horizon={variant.horizonYears} />
        </div>
      ) : null}

      {tab === "abschluss" ? (
        <div className="mt-5 space-y-4">
          {variantBar(false)}
          <fieldset disabled={meta.locked} className="rounded-2xl border border-line bg-elevated p-4 disabled:opacity-80 sm:p-5">
            <legend className="sr-only">Zahlung</legend>
            <h2 className="mb-3 font-display text-xl">Zahlung</h2>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={offer.vatZeroEligible} onChange={(event) => patchOffer({ vatZeroEligible: event.target.checked })} /> Nullsteuersatz § 12 Abs. 3 UStG für PV-Positionen anwenden</label>
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={offer.vatDeductible} onChange={(event) => patchOffer({ vatDeductible: event.target.checked })} /> Kunde ist vorsteuerabzugsberechtigt, Wirtschaftlichkeit rechnet netto</label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Gültig bis"><TextInput type="date" value={offer.validUntil ?? ""} onChange={(event) => patchOffer({ validUntil: event.target.value || null })} /></Field>
                <Field label="Rabatt netto"><NumberField value={variant.rebateNet} onChange={(rebateNet) => patchVariant({ rebateNet })} /></Field>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Zahlungsart">
                {(["BAR", "FINANZIERUNG", "RATEN"] as const).map((mode) => (
                  <button key={mode} type="button" aria-pressed={variant.paymentMode === mode} className={`rounded-full px-3 py-1 text-sm font-semibold ${variant.paymentMode === mode ? "bg-brand text-white" : "bg-white"}`} onClick={() => patchVariant({ paymentMode: mode })}>{PAYMENT_LABEL[mode]}</button>
                ))}
              </div>
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
          </fieldset>
          <Card title="Angebot ausgeben">
            <p className="text-sm text-muted">Das PDF enthält die Variante {variant.name}. Vor dem Öffnen wird gespeichert.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => void openPdf()}>PDF öffnen</Button>
              {offer.status !== "ANGENOMMEN" ? (
                <>
                  <Button type="button" variant="secondary" onClick={() => mark("VERSENDET")}>Als versendet markieren</Button>
                  <Button type="button" variant="secondary" onClick={() => mark("ABGELEHNT")}>Als abgelehnt markieren</Button>
                </>
              ) : null}
              <span className="text-sm text-muted">Status: {OFFER_STATUS_LABEL[offer.status]}</span>
            </div>
          </Card>
          {offer.status !== "ANGENOMMEN" ? (
            <form action="/api/attachments" method="post" encType="multipart/form-data" className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-line p-4">
              <input type="hidden" name="offerId" value={offer.id} />
              <input type="hidden" name="kind" value="signatur" />
              <p className="text-sm">Unterschriebenes PDF hochladen und als angenommen markieren.</p>
              <input type="file" name="file" accept="application/pdf,image/png,image/jpeg" required className="text-sm" />
              <Button type="submit" size="sm">Annahme speichern</Button>
            </form>
          ) : null}
        </div>
      ) : null}

      {mapOpen && meta.mapsKey ? (
        <LocationDialog apiKey={meta.mapsKey} latitude={located ? offer.latitude : null} longitude={located ? offer.longitude : null} locked={meta.locked} onPick={pickLocation} onClose={() => setMapOpen(false)} />
      ) : null}

      {tenantTab ? (
        <TenantPowerDialog
          initial={offer.tenantPower}
          startTab={tenantTab}
          suggest={{ currentPriceCt: offer.electricityPriceEur * 100, feedInCt: variant.eegTariffEur * 100 }}
          variant={{ name: variant.name, annualYieldKwh: result.yield.annualKwh, batteryKwh: result.batteryKwh, batteryCycles: variant.batteryCyclesPerYear }}
          locked={meta.locked}
          saving={saving}
          saveError={error}
          onSave={(next) => void saveTenant(next)}
          onClose={() => setTenantTab(null)}
        />
      ) : null}

      <div className="sticky bottom-3 z-10 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <div className="text-sm">
          <strong>{formatEuro(result.investment)}</strong>
          <span className="text-muted"> · Marge {formatEuro(result.pricing.margin)}</span>
          {message && offer === savedOffer ? <span className="ml-2 text-ok" role="status">{message}</span> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {!meta.locked ? <Button type="button" variant="secondary" disabled={saving} onClick={() => void persist()}>{saving ? "Speichert…" : "Speichern"}</Button> : null}
          {tab === "planung" && topic ? (
            <Button type="button" onClick={async () => { if (await saved()) setTopic(null); }}>Fertig</Button>
          ) : nextTab ? (
            <Button type="button" onClick={async () => { if (await saved()) show(nextTab); }}>Weiter zu {TABS.find((entry) => entry.id === nextTab)?.label}</Button>
          ) : (
            <Button type="button" onClick={() => void openPdf()}>PDF öffnen</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
      <h2 className="mb-3 font-display text-xl">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function MenuItem({ danger = false, onClick, children }: { danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-lg px-3 py-2 text-left hover:bg-bg ${danger ? "text-danger" : "text-ink"}`}>
      {children}
    </button>
  );
}
