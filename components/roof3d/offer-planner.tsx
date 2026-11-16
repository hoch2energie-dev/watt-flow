"use client";

import { useMemo, useState } from "react";
import { saveOffer } from "@/app/actions/offers";
import { locateAddress } from "@/app/actions/roof";
import { Planner3D, type GroundSource } from "@/components/roof3d/planner3d";
import type { OfferDTO } from "@/lib/domain";
import type { LngLat } from "@/lib/roof/geo";
import { AERIAL_SIZE_M, aerialSources } from "@/lib/roof3d/aerial";
import type { BuildingSpec } from "@/lib/roof3d/building";
import { MAX_FACES, buildingsFromFaces, facesFromBuildings, resetFaces } from "@/lib/roof3d/faces";

type Place = { latitude: number | null; longitude: number | null; label: string; source: string };

/** Die 3D-Planung an einem Angebot: lädt die Gebäude einer Variante und speichert sie als Dachflächen zurück. */
export function OfferPlanner3D({
  initial,
  variantId,
  siteAddress,
  customerName,
  locked,
  groundOverride,
}: {
  initial: OfferDTO;
  variantId: string;
  siteAddress: string;
  customerName: string;
  locked: boolean;
  /** Ersetzt das Luftbild. Nur für Vorschau und Tests, die keine Bildserver erreichen. */
  groundOverride?: GroundSource;
}) {
  const [offer, setOffer] = useState(initial);
  const [place, setPlace] = useState<Place>({ latitude: initial.latitude, longitude: initial.longitude, label: initial.locationLabel, source: initial.locationSource });
  const [sourceIndex, setSourceIndex] = useState(0);
  const variant = offer.variants.find((entry) => entry.id === variantId) ?? offer.variants[0] ?? null;
  const backHref = `/angebote/${offer.id}`;

  const { latitude, longitude } = place;
  const origin = useMemo<LngLat | null>(() => (latitude != null && longitude != null ? [longitude, latitude] : null), [latitude, longitude]);
  /* Reihenfolge der Versuche: Orthofoto NRW direkt, dann über den eigenen Server, dann das Weltluftbild. */
  const sources = useMemo(() => {
    if (!origin) return [];
    const direct = aerialSources(origin);
    const nrw = direct.find((source) => source.provider === "nrw");
    if (!nrw) return direct;
    return [nrw, { ...nrw, url: `/api/roof/aerial?lat=${origin[1]}&lon=${origin[0]}` }, ...direct.filter((source) => source !== nrw)];
  }, [origin]);
  const ground = useMemo<GroundSource>(() => {
    if (groundOverride) return groundOverride;
    const source = sources[sourceIndex];
    return source ? { kind: "image", url: source.url, sizeM: AERIAL_SIZE_M, credit: source.credit } : { kind: "none" };
  }, [groundOverride, sources, sourceIndex]);
  /* Nur beim Öffnen und bei neuem Standort lesen. Danach führt die Planung selbst Buch. */
  const firstFaces = useMemo(() => variant?.faces ?? [], [variant?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const buildings = useMemo(() => (origin ? buildingsFromFaces(firstFaces, origin) : []), [firstFaces, origin]);

  if (!variant) return <div className="r3d-screen"><div className="r3d-locate"><p>Dem Angebot fehlt eine Variante. <a href={backHref}>Zurück zum Angebot</a></p></div></div>;
  if (!origin) return <Locate address={siteAddress} backHref={backHref} locked={locked} onFound={setPlace} />;

  async function save(next: BuildingSpec[]): Promise<string> {
    if (!origin || !variant) throw new Error("Der Standort fehlt.");
    const faces = facesFromBuildings(next, origin, variant.faces, variant.id);
    if (faces.length > MAX_FACES) {
      throw new Error(`Nicht gespeichert: Die Variante hätte ${faces.length} Dachflächen, möglich sind ${MAX_FACES}. Bitte ein Gebäude entfernen oder ein Walmdach als Satteldach führen.`);
    }
    const emptied = resetFaces(variant.faces, faces);
    const nextOffer: OfferDTO = {
      ...offer,
      latitude: place.latitude,
      longitude: place.longitude,
      locationLabel: place.label,
      locationSource: place.source || "manuell",
      variants: offer.variants.map((entry) => (entry.id === variant.id ? { ...entry, faces } : entry)),
    };
    const result = await saveOffer(nextOffer);
    if (!result.ok) throw new Error(result.error);
    setOffer(nextOffer);
    const planned = faces.filter((face) => face.geometry?.building).length;
    const base = planned === 0 ? "Gespeichert. Es liegt kein Dach in der Planung." : `Gespeichert. ${planned} ${planned === 1 ? "Dachfläche steht" : "Dachflächen stehen"} mit Neigung und Ausrichtung im Schritt Solar.`;
    if (emptied.length > 0) return `${base} ${emptied.length === 1 ? "Eine Fläche wurde" : `${emptied.length} Flächen wurden`} neu angelegt, dort fehlen Module und Leistung wieder.`;
    const open = faces.some((face) => face.geometry?.building && face.kwp <= 0);
    return open && planned > 0 ? `${base} Die Leistung je Fläche (kWp) wird dort eingetragen, bis die Modulbelegung in 3D folgt.` : base;
  }

  return (
    <div className="r3d-screen">
      <Planner3D
        key={`${origin[0]},${origin[1]}`}
        title="3D-Planung"
        subtitle={[customerName, variant.name].filter(Boolean).join(" · ")}
        initial={buildings}
        ground={ground}
        locked={locked}
        onSave={save}
        onGroundError={() => setSourceIndex((index) => index + 1)}
        closeHref={backHref}
      />
    </div>
  );
}

function Locate({ address, backHref, locked, onFound }: { address: string; backHref: string; locked: boolean; onFound: (place: Place) => void }) {
  const [text, setText] = useState(address);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="r3d-screen">
      <div className="r3d-locate">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            const result = await locateAddress(text);
            setBusy(false);
            if (result.ok) onFound({ latitude: result.latitude, longitude: result.longitude, label: result.label, source: "nominatim" });
            else setError(result.notice);
          }}
        >
          <h1>Wo steht das Gebäude?</h1>
          <p>Die 3D-Planung braucht den Standort für das Luftbild. Gespeichert wird er mit dem ersten Speichern der Planung.</p>
          <label className="sr-only" htmlFor="r3d-address">Objektadresse</label>
          <input id="r3d-address" value={text} onChange={(event) => setText(event.target.value)} placeholder="Straße, Hausnummer, PLZ, Ort" />
          {error ? <p className="is-error" role="alert">{error}</p> : null}
          <div>
            <button type="submit" disabled={busy || locked || text.trim().length < 3}>{busy ? "Suche…" : "Adresse suchen"}</button>
            <a href={backHref}>Zurück zum Angebot</a>
          </div>
        </form>
      </div>
    </div>
  );
}
