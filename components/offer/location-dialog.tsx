"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { GoogleMap, type MapView } from "@/components/google-map";
import { Button } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { distanceM } from "@/lib/google/maps-loader";

/** Mitte Deutschlands als Einstieg, solange das Angebot noch keinen Standort hat. */
const GERMANY: MapView = { latitude: 51.16, longitude: 10.45, zoom: 6 };
/** Ab dieser Zoomstufe ist ein einzelnes Gebäude sicher zu treffen. */
const MIN_PICK_ZOOM = 17;

/**
 * Dialog „Standort auf der Karte": Googles Satellitenkarte mit Fadenkreuz. Die Karte wird
 * verschoben, bis das Fadenkreuz auf dem Gebäude liegt; „Übernehmen" setzt den Standort des
 * Angebots dorthin. Der Dialog zeigt nur Karte und Koordinaten.
 */
export function LocationDialog({
  apiKey,
  latitude,
  longitude,
  locked,
  onPick,
  onClose,
}: {
  apiKey: string;
  latitude: number | null;
  longitude: number | null;
  locked: boolean;
  onPick: (latitude: number, longitude: number) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const saved = latitude != null && longitude != null ? { latitude, longitude } : null;
  const start: MapView = saved ? { ...saved, zoom: 19 } : GERMANY;
  const [view, setView] = useState<MapView>(start);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const moved = saved ? distanceM(saved, view) : null;
  const close = view.zoom >= MIN_PICK_ZOOM;
  const changed = moved == null || moved >= 0.5;

  return (
    <dialog ref={dialog} aria-labelledby="location-title" className="m-auto w-[64rem]" onClose={onClose}>
      <div className="flex max-h-[calc(100dvh-4rem)] flex-col overflow-hidden rounded-2xl border border-line bg-bg text-ink shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-line bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 id="location-title" className="font-display text-2xl">Standort auf der Karte</h2>
            <p className="mt-1 text-sm text-muted">Karte verschieben, bis das Fadenkreuz auf dem Gebäude liegt. Dieser Punkt ist die Mitte des Luftbilds in der 3D-Planung und der Ort der Ertragsrechnung.</p>
          </div>
          <button type="button" aria-label="Schließen" className="rounded-lg p-2 hover:bg-black/5" onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 p-3">
          <GoogleMap apiKey={apiKey} start={start} onView={setView} className="h-[min(60dvh,34rem)] w-full" />
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-line bg-white px-5 py-3">
          <p className="mr-auto text-sm" data-coords>
            <span className="tabular-nums">{formatNumber(view.latitude, 5)}, {formatNumber(view.longitude, 5)}</span>
            <span className="text-muted">
              {!close ? " · bitte näher heranzoomen" : moved == null ? " · noch kein Standort gespeichert" : moved < 0.5 ? " · gespeicherter Standort" : ` · ${formatNumber(moved, moved < 10 ? 1 : 0)} m vom gespeicherten Standort`}
            </span>
          </p>
          <Button type="button" variant="secondary" onClick={onClose}>{locked ? "Schließen" : "Abbrechen"}</Button>
          {!locked ? <Button type="button" disabled={!close || !changed} onClick={() => onPick(view.latitude, view.longitude)}>Standort übernehmen</Button> : null}
        </footer>
      </div>
    </dialog>
  );
}
