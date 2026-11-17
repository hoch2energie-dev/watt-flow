"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { loadHorizon, locateAddress, suggestLod2 } from "@/app/actions/roof";
import { saveOffer } from "@/app/actions/offers";
import { calculatePvgis } from "@/app/actions/yield";
import { Field, NumberField, SelectInput, TextInput } from "@/components/fields";
import { RoofMap, type MapShape } from "@/components/roof/map-view";
import { Button, Notice, PageHeader } from "@/components/ui";

const RoofScene = dynamic(() => import("@/components/roof/scene-view").then((mod) => mod.RoofScene), {
  ssr: false,
  loading: () => <p className="rounded-xl bg-[#d5e3da] px-4 py-16 text-center text-sm text-muted">3D-Ansicht wird geladen…</p>,
});
import { resolveKwp } from "@/lib/calc/offer";
import { toCalcInput, type CatalogOption, type OfferDTO, type VariantDTO } from "@/lib/domain";
import { formatNumber } from "@/lib/format";
import { azimuthFromRing, centroidLngLat, toLngLat, toLocal, type LngLat } from "@/lib/roof/geo";
import { layoutModules } from "@/lib/roof/layout";
import { applyShading } from "@/lib/roof/shading";
import { ESRI_ATTRIBUTION, inNrw, NRW_DOP_ATTRIBUTION, NRW_LOD2_ATTRIBUTION } from "@/lib/roof/sources";
import { moduleSize, syncModuleLines, syncPlannedFaces } from "@/lib/roof/sync";
import { activeModuleCount, blankGeometry, layoutKwp, type ModulePlacement } from "@/lib/roof/types";
import type { RoofFaceInput } from "@/lib/pvgis/types";

type Mode = "navigate" | "face" | "obstacle";

export function RoofPlanner({
  initial,
  catalog,
  variantId,
  siteAddress,
  customerName,
  locked,
}: {
  initial: OfferDTO;
  catalog: CatalogOption[];
  variantId: string;
  siteAddress: string;
  customerName: string;
  locked: boolean;
}) {
  const modules = catalog.filter((item) => item.typeKey === "pv_module" && item.active);
  const [offer, setOffer] = useState(initial);
  const [currentId, setCurrentId] = useState(offer.variants.some((variant) => variant.id === variantId) ? variantId : offer.variants[0]?.id);
  const variant = offer.variants.find((entry) => entry.id === currentId) ?? offer.variants[0];
  const [faces, setFaces] = useState<RoofFaceInput[]>(variant?.faces ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(faces.find((face) => (face.geometry?.ring.length ?? 0) >= 3)?.id ?? faces[0]?.id ?? null);
  const [address, setAddress] = useState(siteAddress);
  const [latitude, setLatitude] = useState<number | null>(initial.latitude);
  const [longitude, setLongitude] = useState<number | null>(initial.longitude);
  const [label, setLabel] = useState(initial.locationLabel);
  const [source, setSource] = useState(initial.locationSource);
  const [centerToken, setCenterToken] = useState(0);
  const [basemap, setBasemap] = useState<"nrw" | "esri">(initial.latitude != null && initial.longitude != null && inNrw(initial.latitude, initial.longitude) ? "nrw" : "esri");
  const [mode, setMode] = useState<Mode>("navigate");
  const [draft, setDraft] = useState<LngLat[]>([]);
  const [catalogId, setCatalogId] = useState(modules[0]?.id ?? "");
  const [portrait, setPortrait] = useState(true);
  const [setback, setSetback] = useState(0.3);
  const [gap, setGap] = useState(0.02);
  const [obstacleHeight, setObstacleHeight] = useState(1.5);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [annual, setAnnual] = useState<number | null>(variant?.yieldAnnualKwh ?? null);

  const selected = faces.find((face) => face.id === selectedId) ?? null;
  const located = latitude != null && longitude != null;
  const moduleTotal = faces.reduce((sum, face) => sum + activeModuleCount(face.geometry), 0);
  const kwpTotal = faces.reduce((sum, face) => sum + face.kwp, 0);
  const ringless = faces.filter((face) => (face.geometry?.ring.length ?? 0) < 3 && face.kwp > 0);

  const shapes = useMemo<MapShape[]>(() => faces.map((face) => shapeOf(face, face.id === selectedId)), [faces, selectedId]);

  function replaceVariant(nextFaces: RoofFaceInput[], patch: Partial<VariantDTO> = {}) {
    setFaces(nextFaces);
    setOffer((current) => ({
      ...current,
      variants: current.variants.map((entry) => (entry.id === variant.id ? { ...entry, ...patch, faces: nextFaces } : entry)),
    }));
  }

  function patchFace(id: string, patch: Partial<RoofFaceInput>) {
    const next = faces.map((face) => (face.id === id ? { ...face, ...patch } : face));
    replaceVariant(next);
  }

  function switchVariant(id: string) {
    if (id === variant.id) return;
    const next = offer.variants.find((entry) => entry.id === id);
    if (!next) return;
    setCurrentId(id);
    setFaces(next.faces);
    setSelectedId(next.faces[0]?.id ?? null);
    setAnnual(next.yieldAnnualKwh);
    setDraft([]);
    setMode("navigate");
  }

  async function search() {
    setBusy("Adresse");
    setError(null);
    const result = await locateAddress(address);
    setBusy(null);
    if (!result.ok) {
      setError(result.notice);
      return;
    }
    setLatitude(result.latitude);
    setLongitude(result.longitude);
    setLabel(result.label);
    setSource(result.source);
    setCenterToken((value) => value + 1);
    if (inNrw(result.latitude, result.longitude)) setBasemap("nrw");
    setMessage(result.label);
  }

  function onMapClick(longitudeValue: number, latitudeValue: number) {
    if (locked) return;
    if (mode === "navigate") {
      const hit = faces.find((face) => {
        const ring = face.geometry?.ring;
        if (!ring || ring.length < 3) return false;
        const origin = centroidLngLat(ring);
        return pointInside(toLocal([longitudeValue, latitudeValue], origin), ring.map((point) => toLocal(point, origin)));
      });
      if (hit) setSelectedId(hit.id);
      return;
    }
    if (draft.length >= 3) {
      const origin = centroidLngLat(draft);
      const first = toLocal(draft[0], origin);
      const current = toLocal([longitudeValue, latitudeValue], origin);
      if (Math.hypot(first[0] - current[0], first[1] - current[1]) < 0.8) {
        closeDraft();
        return;
      }
    }
    setDraft((current) => [...current, [longitudeValue, latitudeValue]]);
  }

  function closeDraft() {
    if (draft.length < 3) {
      setError("Mindestens drei Punkte setzen.");
      return;
    }
    setError(null);
    if (mode === "obstacle") {
      if (!selected?.geometry || selected.geometry.ring.length < 3) {
        setError("Zuerst eine gezeichnete Dachfläche auswählen.");
        return;
      }
      const obstacle = { id: crypto.randomUUID(), ring: draft, heightM: obstacleHeight };
      patchFace(selected.id, { geometry: { ...selected.geometry, obstacles: [...selected.geometry.obstacles, obstacle] } });
      setMessage("Hindernis liegt als Sperrfläche auf der gewählten Dachfläche.");
    } else {
      const azimuth = azimuthFromRing(draft) ?? 180;
      const face: RoofFaceInput = {
        id: crypto.randomUUID(),
        name: `Fläche ${faces.length + 1}`,
        kwp: 0,
        tiltDeg: offer.tiltDeg && offer.tiltDeg > 0 ? offer.tiltDeg : 30,
        azimuthDeg: azimuth,
        mounting: "gebaeude",
        lossesPercent: 14,
        geometry: blankGeometry(draft),
      };
      const next = [...faces, face];
      replaceVariant(next);
      setSelectedId(face.id);
      setMessage(`Fläche geschlossen. Azimut ${formatNumber(azimuth, 0)} aus der längsten Kante, südliche Richtung. Bei Bedarf umdrehen.`);
    }
    setDraft([]);
    setMode("navigate");
  }

  function fillSelected() {
    if (!selected) {
      setError("Bitte eine Dachfläche auswählen.");
      return;
    }
    const item = modules.find((entry) => entry.id === catalogId);
    const size = item ? moduleSize(item.specs) : null;
    if (!item || !size) {
      setError("Dem Modul fehlen Breite, Höhe oder Leistung im Katalog.");
      return;
    }
    const placement: ModulePlacement = {
      catalogItemId: item.id,
      powerWp: size.powerWp,
      widthM: size.widthM,
      heightM: size.heightM,
      portrait,
      setbackM: setback,
      gapM: gap,
    };
    const nextFace = fillFace(selected, placement);
    const count = activeModuleCount(nextFace.geometry);
    replaceVariant(faces.map((face) => (face.id === selected.id ? nextFace : face)));
    setError(null);
    setMessage(count > 0 ? `${count} Module auf ${selected.name}. Ein Klick auf ein Modul nimmt es heraus oder setzt es wieder.` : "Auf diese Fläche passt so kein Modul. Randabstand verkleinern oder die Fläche größer zeichnen.");
  }

  async function shade() {
    if (!located || latitude == null || longitude == null) {
      setError("Für die Verschattung fehlen die Koordinaten.");
      return;
    }
    setBusy("Horizont");
    setError(null);
    const horizon = await loadHorizon(latitude, longitude);
    const samples = horizon.ok ? horizon.samples : null;
    replaceVariant(faces.map((face) => applyShading(face, samples)));
    setBusy(null);
    setMessage(horizon.ok ? "Verschattung aus Hindernissen und PVGIS-Horizont ist in den Verlusten enthalten." : `${horizon.notice} Hindernisse wurden trotzdem gerechnet.`);
  }

  async function loadLod2() {
    if (!located || latitude == null || longitude == null) {
      setError("Zuerst die Adresse suchen.");
      return;
    }
    if (faces.some((face) => (face.geometry?.ring.length ?? 0) >= 3) && !window.confirm("Gezeichnete Dachflächen dieser Variante werden durch LoD2 ersetzt.")) return;
    setBusy("LoD2");
    setError(null);
    const result = await suggestLod2(latitude, longitude);
    setBusy(null);
    if (!result.ok) {
      setMessage(result.notice);
      return;
    }
    replaceVariant(result.faces);
    setSelectedId(result.faces[0]?.id ?? null);
    setMessage(result.notice);
  }

  async function persist() {
    if (locked) return;
    const synced = syncPlannedFaces(faces);
    const withPower = synced.filter((face) => face.kwp > 0);
    if (ringless.length > 0 && synced.some((face) => (face.geometry?.ring.length ?? 0) >= 3)) {
      const proceed = window.confirm("Es gibt noch Dachflächen ohne Grundriss mit Leistung. Die zählen beim Ertrag mit. Trotzdem speichern?");
      if (!proceed) return;
    }
    const lines = syncModuleLines(variant.lines, synced, catalog);
    const nextVariant: VariantDTO = { ...variant, faces: synced, lines, kwpManual: false, kwpOverride: null };
    const systemKwp = withPower.length > 0 ? resolveKwp(toCalcInput(offer, nextVariant)) || withPower.reduce((sum, face) => sum + face.kwp, 0) : 0;
    const nextOffer: OfferDTO = {
      ...offer,
      latitude,
      longitude,
      locationLabel: label,
      locationSource: source || (latitude != null ? "manuell" : ""),
      variants: offer.variants.map((entry) => (entry.id === variant.id ? nextVariant : entry)),
    };
    setBusy("Speichern");
    setError(null);
    const saved = await saveOffer(nextOffer);
    if (!saved.ok) {
      setBusy(null);
      setError(saved.error);
      return;
    }
    if (withPower.length === 0) {
      setBusy(null);
      replaceVariant(synced, { lines, kwpManual: false, kwpOverride: null });
      setMessage("Dachflächen gespeichert. Sobald Module liegen, kann der Ertrag gerechnet werden.");
      return;
    }
    const result = await calculatePvgis({
      offerId: offer.id,
      variantId: variant.id,
      address,
      latitude,
      longitude,
      systemKwp,
      faces: synced,
    });
    setBusy(null);
    if (!result.ok) {
      replaceVariant(synced, { lines, kwpManual: false, kwpOverride: null, yieldProvider: "specific", yieldMonthlyKwh: null, yieldKey: "", yieldNotice: result.notice });
      setError(result.notice);
      return;
    }
    setLatitude(result.latitude);
    setLongitude(result.longitude);
    if (result.locationLabel) setLabel(result.locationLabel);
    setSource(result.locationSource);
    setAnnual(result.annualKwh);
    replaceVariant(synced, {
      lines,
      kwpManual: false,
      kwpOverride: null,
      specificYield: result.specificYield,
      yieldProvider: "pvgis",
      yieldAnnualKwh: result.annualKwh,
      yieldMonthlyKwh: result.monthlyKwh,
      yieldKey: result.yieldKey,
      yieldNotice: "",
    });
    setOffer((current) => ({
      ...current,
      latitude: result.latitude,
      longitude: result.longitude,
      locationLabel: result.locationLabel || current.locationLabel,
      locationSource: result.locationSource,
    }));
    setMessage(`Gespeichert. Jahresertrag ${formatNumber(result.annualKwh, 0)} kWh. Die Modulzahl steht in der Variante, die Zeichnung im PDF.`);
  }

  function dropRingless() {
    const next = faces.filter((face) => (face.geometry?.ring.length ?? 0) >= 3 || face.kwp <= 0);
    replaceVariant(next);
    if (!next.some((face) => face.id === selectedId)) setSelectedId(next[0]?.id ?? null);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={offer.number}
        title="Dachplanung"
        description={`${customerName}. Flächen, Module und Verschattung schreiben in die Variante ${variant?.name ?? ""}.`}
        actions={<Link href={`/angebote/${offer.id}`} className="text-sm font-semibold text-brand">Zurück zum Angebot</Link>}
      />
      {locked ? <Notice>Das angenommene Angebot ist gesperrt. Die Planung lässt sich ansehen, nicht speichern.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {message ? <Notice tone="ok">{message}</Notice> : null}

      <section className="grid gap-3 rounded-2xl border border-line bg-elevated p-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <Field label="Objektadresse" hint="Suche über OpenStreetMap. Die Koordinaten lassen sich auch von Hand setzen.">
          <TextInput value={address} onChange={(event) => setAddress(event.target.value)} aria-label="Objektadresse" />
        </Field>
        <div className="flex items-end">
          <Button type="button" variant="secondary" disabled={busy != null} onClick={() => void search()}>{busy === "Adresse" ? "Suche…" : "Adresse suchen"}</Button>
        </div>
        <Field label="Breite">
          <NumberField digits={5} value={latitude ?? 0} onChange={(value) => { setLatitude(value === 0 ? null : value); setSource("manuell"); setCenterToken((token) => token + 1); }} />
        </Field>
        <Field label="Länge">
          <NumberField digits={5} value={longitude ?? 0} onChange={(value) => { setLongitude(value === 0 ? null : value); setSource("manuell"); setCenterToken((token) => token + 1); }} />
        </Field>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={mode === "face" ? "primary" : "secondary"} disabled={locked || !located} onClick={() => { setMode("face"); setDraft([]); }}>Fläche zeichnen</Button>
            <Button type="button" size="sm" variant={mode === "obstacle" ? "primary" : "secondary"} disabled={locked || !selected} onClick={() => { setMode("obstacle"); setDraft([]); }}>Hindernis zeichnen</Button>
            <Button type="button" size="sm" variant="secondary" disabled={draft.length === 0} onClick={() => setDraft((current) => current.slice(0, -1))}>Punkt zurück</Button>
            <Button type="button" size="sm" variant="secondary" disabled={draft.length < 3} onClick={closeDraft}>Fläche schließen</Button>
            <Button type="button" size="sm" variant="secondary" disabled={locked || !located || busy != null} onClick={() => void loadLod2()}>{busy === "LoD2" ? "LoD2 lädt…" : "LoD2 vorschlagen"}</Button>
            <SelectInput aria-label="Luftbild" value={basemap} onChange={(event) => setBasemap(event.target.value === "esri" ? "esri" : "nrw")} className="max-w-48">
              <option value="nrw">Orthofoto NRW</option>
              <option value="esri">Esri Welt</option>
            </SelectInput>
          </div>
          {mode !== "navigate" ? <p className="text-sm text-muted">Punkte auf das Dach setzen. Nahe am ersten Punkt oder mit „Fläche schließen“ wird das Polygon fertig. {draft.length} Punkte.</p> : null}
          {located && latitude != null && longitude != null ? (
            <RoofMap
              center={{ latitude, longitude }}
              centerToken={centerToken}
              basemap={basemap}
              shapes={shapes}
              draft={draft}
              drawing={mode !== "navigate"}
              onMapClick={onMapClick}
              onModuleClick={(faceId, index) => {
                if (locked) return;
                const next = faces.map((face) => {
                  if (face.id !== faceId || !face.geometry) return face;
                  const modulesOnFace = face.geometry.modules.map((panel, panelIndex) => (panelIndex === index ? { ...panel, active: !panel.active } : panel));
                  const geometry = { ...face.geometry, modules: modulesOnFace };
                  return { ...face, geometry, kwp: layoutKwp(geometry) ?? 0 };
                });
                replaceVariant(next);
                setSelectedId(faceId);
              }}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-line px-4 py-16 text-center text-sm text-muted">Zuerst die Adresse suchen oder Breite und Länge eintragen. Danach liegt das Luftbild unter der Planung.</p>
          )}
          <p className="text-xs text-muted">{basemap === "nrw" ? NRW_DOP_ATTRIBUTION : ESRI_ATTRIBUTION} {NRW_LOD2_ATTRIBUTION}</p>
          <div>
            <h2 className="mb-2 font-semibold">3D-Ansicht</h2>
            <RoofScene faces={faces} />
          </div>
        </div>

        <aside className="space-y-3">
          {offer.variants.length > 1 ? (
            <Field label="Variante">
              <SelectInput value={variant.id} onChange={(event) => switchVariant(event.target.value)} aria-label="Variante">
                {offer.variants.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </SelectInput>
            </Field>
          ) : null}
          <div className="rounded-2xl border border-line bg-elevated p-4">
            <p className="text-sm text-muted">Summe</p>
            <p className="font-display text-3xl">{formatNumber(kwpTotal, 2)} kWp</p>
            <p className="text-sm">{moduleTotal} Module{annual != null ? ` · ${formatNumber(annual, 0)} kWh/Jahr` : ""}</p>
          </div>
          <div className="space-y-2">
            {faces.map((face) => (
              <button key={face.id} type="button" onClick={() => setSelectedId(face.id)} className={`w-full rounded-xl border px-3 py-2 text-left ${face.id === selectedId ? "border-brand bg-white" : "border-line bg-elevated"}`}>
                <span className="block font-semibold">{face.name}</span>
                <span className="text-xs text-muted">
                  {activeModuleCount(face.geometry)} Module · {formatNumber(face.kwp, 2)} kWp · {formatNumber(face.tiltDeg, 0)}° · Azimut {formatNumber(face.azimuthDeg, 0)}
                  {(face.geometry?.ring.length ?? 0) < 3 ? " · ohne Grundriss" : ""}
                </span>
              </button>
            ))}
            {faces.length === 0 ? <p className="text-sm text-muted">Noch keine Dachfläche. Zeichnen oder LoD2 vorschlagen.</p> : null}
          </div>
          {ringless.length > 0 ? (
            <Button type="button" size="sm" variant="secondary" disabled={locked} onClick={dropRingless}>Flächen ohne Grundriss entfernen</Button>
          ) : null}
          {selected ? (
            <div className="space-y-3 rounded-2xl border border-line bg-elevated p-4">
              <Field label="Name">
                <TextInput value={selected.name} onChange={(event) => patchFace(selected.id, { name: event.target.value })} aria-label="Name der Fläche" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Neigung °">
                  <NumberField digits={1} value={selected.tiltDeg} onChange={(tiltDeg) => patchFace(selected.id, { tiltDeg })} />
                </Field>
                <Field label="Azimut" hint="0 Nord, 180 Süd">
                  <NumberField digits={1} value={selected.azimuthDeg} onChange={(azimuthDeg) => patchFace(selected.id, { azimuthDeg: ((azimuthDeg % 360) + 360) % 360 })} />
                </Field>
              </div>
              <Button type="button" size="sm" variant="secondary" disabled={locked} onClick={() => patchFace(selected.id, { azimuthDeg: (selected.azimuthDeg + 180) % 360 })}>Azimut umdrehen</Button>
              <Field label="Modul">
                <SelectInput value={catalogId} onChange={(event) => setCatalogId(event.target.value)} aria-label="Modul">
                  {modules.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </SelectInput>
              </Field>
              <Field label="Ausrichtung der Module">
                <SelectInput value={portrait ? "portrait" : "landscape"} onChange={(event) => setPortrait(event.target.value === "portrait")} aria-label="Hoch- oder Querformat">
                  <option value="portrait">Hochformat</option>
                  <option value="landscape">Querformat</option>
                </SelectInput>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Randabstand m">
                  <NumberField digits={2} value={setback} onChange={setSetback} />
                </Field>
                <Field label="Abstand m">
                  <NumberField digits={2} value={gap} onChange={setGap} />
                </Field>
              </div>
              <Button type="button" size="sm" disabled={locked} onClick={fillSelected}>Module füllen</Button>
              <Field label="Hindernishöhe m" hint="Kamin, Gaube oder Fenster. Gilt für das nächste Hindernis.">
                <NumberField digits={1} value={obstacleHeight} onChange={setObstacleHeight} />
              </Field>
              {(selected.geometry?.obstacles.length ?? 0) > 0 ? (
                <ul className="space-y-1 text-sm">
                  {selected.geometry?.obstacles.map((obstacle, index) => (
                    <li key={obstacle.id} className="flex items-center justify-between gap-2">
                      <span>Hindernis {index + 1}, {formatNumber(obstacle.heightM, 1)} m</span>
                      <button type="button" className="text-danger" onClick={() => selected.geometry && patchFace(selected.id, { geometry: { ...selected.geometry, obstacles: selected.geometry.obstacles.filter((entry) => entry.id !== obstacle.id) } })}>Entfernen</button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {selected.geometry?.shading ? (
                <p className="text-xs text-muted">
                  Verluste {formatNumber(selected.lossesPercent, 1)} %: System {formatNumber(selected.geometry.shading.systemLossPercent, 1)} %, Hindernisse {formatNumber(selected.geometry.shading.obstacleLossPercent, 1)} %, Horizont {formatNumber(selected.geometry.shading.horizonLossPercent, 1)} %.
                </p>
              ) : null}
              <Button type="button" size="sm" variant="danger" disabled={locked} onClick={() => {
                const next = faces.filter((face) => face.id !== selected.id);
                replaceVariant(next);
                setSelectedId(next[0]?.id ?? null);
              }}>Fläche löschen</Button>
            </div>
          ) : null}
          <Button type="button" variant="secondary" disabled={locked || busy != null} onClick={() => void shade()}>{busy === "Horizont" ? "Horizont…" : "Verschattung berechnen"}</Button>
          <Button type="button" disabled={locked || busy != null} onClick={() => void persist()}>{busy === "Speichern" ? "Speichert…" : "Speichern und Ertrag berechnen"}</Button>
          <p className="text-xs text-muted">Beim Speichern wird die Modulposition der Variante auf die geplante Stückzahl gesetzt. PVGIS rechnet mit Neigung, Azimut, Leistung und den Verlusten inklusive Verschattung.</p>
        </aside>
      </div>
    </div>
  );
}

function fillFace(face: RoofFaceInput, placement: ModulePlacement): RoofFaceInput {
  if (!face.geometry || face.geometry.ring.length < 3) return face;
  const origin = centroidLngLat(face.geometry.ring);
  const polygon = face.geometry.ring.map((point) => toLocal(point, origin));
  const obstacles = face.geometry.obstacles.map((obstacle) => obstacle.ring.map((point) => toLocal(point, origin)));
  const modules = layoutModules({
    polygon,
    obstacles,
    azimuthDeg: face.azimuthDeg,
    moduleWidthM: placement.widthM,
    moduleHeightM: placement.heightM,
    portrait: placement.portrait,
    setbackM: placement.setbackM,
    gapM: placement.gapM,
  });
  const geometry = { ...face.geometry, placement, modules };
  return { ...face, geometry, kwp: layoutKwp(geometry) ?? 0 };
}

function shapeOf(face: RoofFaceInput, selected: boolean): MapShape {
  const ring = face.geometry?.ring ?? [];
  const origin = ring.length >= 3 ? centroidLngLat(ring) : null;
  return {
    id: face.id,
    ring,
    selected,
    obstacles: (face.geometry?.obstacles ?? []).map((obstacle) => ({ id: obstacle.id, ring: obstacle.ring })),
    modules: origin
      ? (face.geometry?.modules ?? []).map((module, index) => ({
          index,
          active: module.active,
          ring: module.corners.map((corner) => toLngLat(corner, origin)),
        }))
      : [],
  };
}

function pointInside(point: [number, number], polygon: [number, number][]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];
    const crosses = current[1] > point[1] !== prior[1] > point[1];
    if (crosses && point[0] < ((prior[0] - current[0]) * (point[1] - current[1])) / (prior[1] - current[1]) + current[0]) inside = !inside;
  }
  return inside;
}
