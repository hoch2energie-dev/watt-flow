import { sanitizeOffer } from "@/lib/sanitize-offer";
import { db, toast } from "./db";

/** Wie im Programm läuft die echte Prüfung der Eingaben, nur ohne Datenbank dahinter. */
export async function saveOffer(input: unknown) {
  try {
    db.offer = sanitizeOffer(input);
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Ungültige Daten." };
  }
  return { ok: true as const };
}
export async function moveOffer() {}
export async function setOfferStatus() {
  toast("In der Vorschau bleibt der Status unverändert.");
}
export async function unlockOffer() {}
export async function deleteOffer() {
  toast("In der Vorschau wird nichts gelöscht.");
}
export async function createOffer() {}
