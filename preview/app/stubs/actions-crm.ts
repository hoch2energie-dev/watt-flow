import { toast } from "./db";

export async function saveCustomer() {
  toast("In der Vorschau wird kein Kontakt gespeichert.");
  return { ok: true as const };
}
