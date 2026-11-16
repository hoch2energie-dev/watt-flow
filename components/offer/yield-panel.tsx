"use client";

import { useEffect, useState } from "react";
import { calculatePvgis } from "@/app/actions/yield";
import { Field, NumberField, SelectInput, TextInput } from "@/components/fields";
import { Button, ButtonLink, Notice } from "@/components/ui";
import { resolveKwp } from "@/lib/calc/offer";
import { toCalcInput, type OfferDTO, type VariantDTO } from "@/lib/domain";
import { formatNumber } from "@/lib/format";
import { defaultRoofFaces } from "@/lib/pvgis/faces";
import { PVGIS_SOURCE_NOTE, type RoofFaceInput } from "@/lib/pvgis/types";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function YieldPanel({
  offer,
  variant,
  address,
  onOffer,
  onVariant,
  onPlan,
}: {
  offer: OfferDTO;
  variant: VariantDTO;
  address: string;
  onOffer: (patch: Partial<OfferDTO>) => void;
  onVariant: (patch: Partial<VariantDTO>) => void;
  /** Öffnet die 3D-Planung, nachdem der Aufrufer gespeichert hat. Ohne Angabe ein einfacher Link. */
  onPlan?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const faces = variant.faces;
  const systemKwp = resolveKwp(toCalcInput(offer, variant));

  useEffect(() => {
    if (variant.faces.length > 0) return;
    onVariant({ faces: defaultRoofFaces({ kwp: systemKwp, tiltDeg: offer.tiltDeg, orientation: offer.orientation }) });
    // Nur beim Wechsel der Variante eine Ausgangsfläche vorschlagen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant.id]);

  function patchFace(id: string, patch: Partial<RoofFaceInput>) {
    onVariant({ faces: faces.map((face) => (face.id === id ? { ...face, ...patch } : face)) });
  }

  async function calculate() {
    setBusy(true);
    const result = await calculatePvgis({
      offerId: offer.id,
      variantId: variant.id,
      address,
      latitude: offer.latitude === 0 && offer.longitude === 0 ? null : offer.latitude,
      longitude: offer.latitude === 0 && offer.longitude === 0 ? null : offer.longitude,
      systemKwp,
      faces,
    });
    setBusy(false);
    if (!result.ok) {
      onVariant({ yieldProvider: "specific", yieldMonthlyKwh: null, yieldKey: "", yieldNotice: result.notice });
      return;
    }
    onOffer({
      latitude: result.latitude,
      longitude: result.longitude,
      locationLabel: result.locationLabel,
      locationSource: result.locationSource,
    });
    onVariant({
      specificYield: result.specificYield,
      yieldProvider: "pvgis",
      yieldAnnualKwh: result.annualKwh,
      yieldMonthlyKwh: result.monthlyKwh,
      yieldKey: result.yieldKey,
      yieldNotice: "",
      faces,
    });
  }

  const max = Math.max(...(variant.yieldMonthlyKwh ?? [1]), 1);

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-white p-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-semibold">Dachflächen und PVGIS</h3>
          <p className="text-xs text-muted">Kompassrose: 0 Nord, 90 Ost, 180 Süd, 270 West. Mehrere Flächen werden addiert. Die Dachplanung setzt Grundriss, Module und Verschattung auf dieselben Flächen.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onPlan ? (
            <Button type="button" size="sm" onClick={onPlan}>3D-Planung</Button>
          ) : (
            <ButtonLink href={`/angebote/${offer.id}/dach3d?variante=${variant.id}`} size="sm">3D-Planung</ButtonLink>
          )}
          <ButtonLink href={`/angebote/${offer.id}/dach?variante=${variant.id}`} variant="secondary" size="sm">Dach planen</ButtonLink>
          <Button type="button" size="sm" disabled={busy} onClick={() => void calculate()}>{busy ? "PVGIS rechnet…" : "Ertrag berechnen (PVGIS)"}</Button>
        </div>
      </div>
      {variant.yieldNotice ? <Notice tone="warn">{variant.yieldNotice} Es gilt der spezifische Ertrag.</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Breite" hint="Leer lassen, dann wird die Objektadresse gesucht.">
          <NumberField digits={5} value={offer.latitude ?? 0} onChange={(latitude) => onOffer({ latitude: latitude === 0 ? null : latitude, locationSource: latitude === 0 ? offer.locationSource : "manuell" })} />
        </Field>
        <Field label="Länge">
          <NumberField digits={5} value={offer.longitude ?? 0} onChange={(longitude) => onOffer({ longitude: longitude === 0 ? null : longitude, locationSource: longitude === 0 ? offer.locationSource : "manuell" })} />
        </Field>
      </div>
      {offer.locationLabel ? <p className="text-xs text-muted">Gefunden: {offer.locationLabel}</p> : <p className="text-xs text-muted">Objektadresse: {address || "keine hinterlegt"}</p>}
      <div className="space-y-2">
        {faces.map((face, index) => (
          <div key={face.id} className="grid gap-2 rounded-xl bg-bg p-2 md:grid-cols-6">
            <TextInput aria-label="Name der Fläche" value={face.name} onChange={(event) => patchFace(face.id, { name: event.target.value })} />
            <NumberField ariaLabel="Leistung kWp" digits={2} value={face.kwp} onChange={(kwp) => patchFace(face.id, { kwp })} />
            <NumberField ariaLabel="Neigung" digits={0} value={face.tiltDeg} onChange={(tiltDeg) => patchFace(face.id, { tiltDeg })} />
            <NumberField ariaLabel="Azimut Kompass" digits={0} value={face.azimuthDeg} onChange={(azimuthDeg) => patchFace(face.id, { azimuthDeg })} />
            <SelectInput aria-label="Montage" value={face.mounting} onChange={(event) => patchFace(face.id, { mounting: event.target.value === "frei" ? "frei" : "gebaeude" })}>
              <option value="gebaeude">Auf dem Gebäude</option>
              <option value="frei">Freistehend</option>
            </SelectInput>
            <div className="flex items-center gap-2">
              <NumberField ariaLabel="Verluste Prozent" digits={1} value={face.lossesPercent} onChange={(lossesPercent) => patchFace(face.id, { lossesPercent })} />
              <button type="button" className="text-xs font-semibold text-danger" onClick={() => onVariant({ faces: faces.filter((entry) => entry.id !== face.id) })}>Weg</button>
            </div>
            <p className="md:col-span-6 text-[11px] text-muted">Fläche {index + 1}: kWp, Neigung °, Azimut, Montage, Verluste % inklusive Verschattung. Anlagenverluste ohne Schatten 14 %.</p>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="text-sm font-semibold text-brand"
        onClick={() => onVariant({
          faces: [...faces, { id: crypto.randomUUID(), name: `Fläche ${faces.length + 1}`, kwp: 0, tiltDeg: offer.tiltDeg || 30, azimuthDeg: 180, mounting: "gebaeude", lossesPercent: 14, geometry: null }],
        })}
      >
        Weitere Fläche
      </button>
      {variant.yieldProvider === "pvgis" && variant.yieldMonthlyKwh ? (
        <div>
          <p className="text-sm">PVGIS: {formatNumber(variant.yieldAnnualKwh ?? 0, 0)} kWh/Jahr, {formatNumber(variant.specificYield, 0)} kWh/kWp.</p>
          <div className="mt-2 flex h-24 items-end gap-1">
            {variant.yieldMonthlyKwh.map((value, index) => (
              <div key={MONTHS[index]} className="flex flex-1 flex-col items-center justify-end">
                <div className="w-full rounded-t bg-brand" style={{ height: `${Math.max(4, (value / max) * 100)}%` }} title={`${formatNumber(value, 0)} kWh`} />
                <span className="text-[10px] text-muted">{MONTHS[index]}</span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">{PVGIS_SOURCE_NOTE}</p>
        </div>
      ) : null}
    </div>
  );
}
