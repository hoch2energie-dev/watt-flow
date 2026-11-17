export async function locateAddress() {
  return { ok: true as const, latitude: 50.9413, longitude: 6.9583, label: "Beispielstandort", source: "nominatim" as const, approximate: false };
}
export async function suggestLod2() {
  return { ok: false as const, notice: "In der Vorschau gibt es keinen LoD2-Vorschlag.", faces: [] };
}
export async function loadHorizon() {
  return { ok: false as const, notice: "In der Vorschau gibt es kein Horizontprofil.", samples: [] };
}
