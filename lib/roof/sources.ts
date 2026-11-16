/** Nordrhein-Westfalen, grob. Reicht, um das Orthofoto vorzuschlagen. */
export function inNrw(latitude: number, longitude: number): boolean {
  return latitude >= 50.3 && latitude <= 52.6 && longitude >= 5.8 && longitude <= 9.5;
}

export const ESRI_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const NRW_DOP_WMS = "https://www.wms.nrw.de/geobasis/wms_nw_dop";

export const ESRI_ATTRIBUTION =
  "Luftbild: Esri, Maxar, Earthstar Geographics und die GIS User Community. Die Kacheln werden beim Ansehen geladen und nicht bei uns gespeichert.";
export const NRW_DOP_ATTRIBUTION =
  "Orthofoto: © Geobasis NRW, Bezirksregierung Köln. Datenlizenz Deutschland – Zero – Version 2.0 (https://www.govdata.de/dl-de/zero-2-0).";
export const NRW_LOD2_ATTRIBUTION =
  "3D-Gebäude: LoD2 NRW über https://ogc-api.nrw.de/3dg/v1, Datenlizenz Deutschland – Zero – Version 2.0. Übernommen nur, wenn das Gebäude an der gesuchten Stelle liegt.";

export const LOD2_COLLECTION = "https://ogc-api.nrw.de/3dg/v1/collections/building/items";

export function lod2ItemsUrl(latitude: number, longitude: number): string {
  const pad = 0.0012;
  const bbox = [longitude - pad, latitude - pad, longitude + pad, latitude + pad].map((value) => value.toFixed(6)).join(",");
  const url = new URL(LOD2_COLLECTION);
  url.searchParams.set("bbox", bbox);
  url.searchParams.set("limit", "8");
  url.searchParams.set("f", "cityjson");
  return url.toString();
}
