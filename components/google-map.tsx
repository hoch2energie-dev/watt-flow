"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, onMapsAuthFailure, type GoogleMap as MapInstance } from "@/lib/google/maps-loader";

export type MapView = { latitude: number; longitude: number; zoom: number };
type Status = "laden" | "bereit" | "abgelehnt" | "fehler";

/**
 * Googles interaktive Karte mit Satellitenbild. In der Mitte steht ein Fadenkreuz; `onView` meldet
 * bei jeder Bewegung, wohin es zeigt. Die Karte zeigt nur das Bild und das Fadenkreuz, keine Adresse.
 */
export function GoogleMap({ apiKey, start, onView, className }: { apiKey: string; start: MapView; onView?: (view: MapView) => void; className?: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("laden");
  /* Start und Rückmeldung in Refs: Die Karte wird einmal angelegt und nicht bei jedem Rendern neu. */
  const first = useRef(start);
  const report = useRef(onView);
  report.current = onView;

  useEffect(() => {
    let cancelled = false;
    let map: MapInstance | null = null;
    let clear: (() => void) | null = null;
    const element = holder.current;
    const stopAuth = onMapsAuthFailure(() => setStatus("abgelehnt"));
    loadGoogleMaps(apiKey)
      .then(async (api) => {
        const { Map } = await api.importLibrary("maps");
        if (cancelled || !element) return;
        const view = first.current;
        map = new Map(element, {
          center: { lat: view.latitude, lng: view.longitude },
          zoom: view.zoom,
          mapTypeId: "hybrid",
          tilt: 0,
          gestureHandling: "greedy",
          clickableIcons: false,
          streetViewControl: false,
          rotateControl: false,
          fullscreenControl: false,
        });
        const created = map;
        const tell = () => {
          const center = created.getCenter();
          if (center) report.current?.({ latitude: center.lat(), longitude: center.lng(), zoom: created.getZoom() ?? view.zoom });
        };
        created.addListener("center_changed", tell);
        created.addListener("zoom_changed", tell);
        clear = () => api.event?.clearInstanceListeners(created);
        setStatus((current) => (current === "abgelehnt" ? current : "bereit"));
      })
      .catch(() => {
        if (!cancelled) setStatus("fehler");
      });
    return () => {
      cancelled = true;
      stopAuth();
      clear?.();
      if (element) element.replaceChildren();
    };
  }, [apiKey]);

  return (
    <div className={`relative overflow-hidden rounded-xl bg-[#d5ddd8] ${className ?? ""}`} data-map={status}>
      <div ref={holder} className="absolute inset-0" />
      {status === "bereit" ? (
        <svg aria-hidden viewBox="0 0 48 48" className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2">
          <circle cx="24" cy="24" r="9" fill="none" stroke="#fff" strokeWidth="4" />
          <circle cx="24" cy="24" r="9" fill="none" stroke="#c65b2e" strokeWidth="2" />
          <path d="M24 2v13M24 33v13M2 24h13M33 24h13" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
          <path d="M24 2v13M24 33v13M2 24h13M33 24h13" stroke="#c65b2e" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : null}
      {status !== "bereit" ? (
        <p className="absolute inset-0 flex items-center justify-center bg-elevated/95 px-6 text-center text-sm" role={status === "laden" ? "status" : "alert"}>
          {status === "laden"
            ? "Karte wird geladen…"
            : status === "abgelehnt"
              ? "Google hat den Schlüssel für die Karte abgelehnt. Bitte in der Google Cloud prüfen: Ist die „Maps JavaScript API“ aktiviert, und erlaubt die Beschränkung des Schlüssels diese Internetadresse?"
              : "Google Maps ließ sich nicht laden. Bitte Internetverbindung und Werbeblocker prüfen."}
        </p>
      ) : null}
    </div>
  );
}
