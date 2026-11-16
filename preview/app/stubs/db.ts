import { demoOffer } from "../../demo-data";

/** Merkt sich das Beispielangebot, solange die Vorschau offen ist. */
export const db = { offer: demoOffer() };

export const listeners = new Set<(text: string) => void>();
export function toast(text: string) {
  listeners.forEach((listener) => listener(text));
}

/** Leitet Programmadressen auf die zwei Ansichten der Vorschau um. */
export function route(url: string) {
  if (url.includes("/dach3d")) window.location.hash = "planung";
  else if (/^\/angebote\/[^/?#]+\/?$/.test(url.split("?")[0])) window.location.hash = "angebot";
  else toast("Diese Seite gibt es in der Vorschau nicht.");
}
