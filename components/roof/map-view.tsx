"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LngLat } from "@/lib/roof/geo";
import { ESRI_ATTRIBUTION, ESRI_TILES, NRW_DOP_ATTRIBUTION, NRW_DOP_WMS } from "@/lib/roof/sources";

export type MapShape = {
  id: string;
  ring: LngLat[];
  selected: boolean;
  obstacles: { id: string; ring: LngLat[] }[];
  modules: { index: number; ring: LngLat[]; active: boolean }[];
};

export function RoofMap({
  center,
  centerToken,
  basemap,
  shapes,
  draft,
  drawing,
  onMapClick,
  onModuleClick,
}: {
  center: { latitude: number; longitude: number };
  centerToken: number;
  basemap: "nrw" | "esri";
  shapes: MapShape[];
  draft: LngLat[];
  drawing: boolean;
  onMapClick: (longitude: number, latitude: number) => void;
  onModuleClick: (faceId: string, index: number) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const clickRef = useRef(onMapClick);
  const moduleRef = useRef(onModuleClick);
  const drawingRef = useRef(drawing);
  const [ready, setReady] = useState(false);
  clickRef.current = onMapClick;
  moduleRef.current = onModuleClick;
  drawingRef.current = drawing;

  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    let map: LeafletMap | null = null;
    let cancelled = false;
    void (async () => {
      const L = await import("leaflet");
      if (cancelled) return;
      map = L.map(element, { zoomControl: true, attributionControl: true }).setView([center.latitude, center.longitude], 19);
      map.on("click", (event) => clickRef.current(event.latlng.lng, event.latlng.lat));
      mapRef.current = map;
      setReady(true);
      window.setTimeout(() => map?.invalidateSize(), 50);
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // Die Karte wird einmal erzeugt. Der Mittelpunkt folgt über centerToken.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setView([center.latitude, center.longitude], Math.max(map.getZoom(), 18));
  }, [centerToken, ready, center.latitude, center.longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;
    let layer: { remove: () => void } | null = null;
    void (async () => {
      const L = await import("leaflet");
      if (cancelled) return;
      const tiles =
        basemap === "nrw"
          ? L.tileLayer.wms(NRW_DOP_WMS, {
              layers: "nw_dop_rgb",
              format: "image/png",
              version: "1.3.0",
              maxZoom: 20,
              attribution: NRW_DOP_ATTRIBUTION,
            })
          : L.tileLayer(ESRI_TILES, { attribution: ESRI_ATTRIBUTION, maxZoom: 19 });
      tiles.addTo(map);
      layer = tiles;
    })();
    return () => {
      cancelled = true;
      layer?.remove();
    };
  }, [basemap, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;
    let group: { remove: () => void } | null = null;
    void (async () => {
      const L = await import("leaflet");
      if (cancelled) return;
      const overlay = L.layerGroup().addTo(map);
      group = overlay;
      for (const shape of shapes) {
        if (shape.ring.length >= 3) {
          L.polygon(shape.ring.map(([longitude, latitude]) => [latitude, longitude]), {
            color: shape.selected ? "#c65b2e" : "#1e5c42",
            weight: shape.selected ? 3 : 2,
            fillColor: "#1e5c42",
            fillOpacity: 0.12,
          }).addTo(overlay);
        }
        for (const obstacle of shape.obstacles) {
          L.polygon(obstacle.ring.map(([longitude, latitude]) => [latitude, longitude]), {
            color: "#9d2c2c",
            weight: 2,
            fillColor: "#c65b2e",
            fillOpacity: 0.45,
          }).addTo(overlay);
        }
        for (const panel of shape.modules) {
          const polygon = L.polygon(panel.ring.map(([longitude, latitude]) => [latitude, longitude]), {
            color: panel.active ? "#143044" : "#5c6b64",
            weight: 1,
            fillColor: panel.active ? "#1e4d6b" : "#ffffff",
            fillOpacity: panel.active ? 0.85 : 0.15,
          }).addTo(overlay);
          polygon.on("click", (event) => {
            L.DomEvent.stopPropagation(event);
            if (drawingRef.current) return;
            moduleRef.current(shape.id, panel.index);
          });
        }
      }
      if (draft.length > 0) {
        const latlngs = draft.map(([longitude, latitude]) => [latitude, longitude] as [number, number]);
        L.polyline(latlngs, { color: "#c65b2e", weight: 2 }).addTo(overlay);
        for (const point of latlngs) L.circleMarker(point, { radius: 4, color: "#c65b2e", fillOpacity: 1 }).addTo(overlay);
      }
    })();
    return () => {
      cancelled = true;
      group?.remove();
    };
  }, [shapes, draft, ready]);

  return <div id="roof-map" ref={holder} style={{ height: 560 }} className="relative z-0 w-full overflow-hidden rounded-xl border border-line bg-[#d5ddd8]" />;
}
