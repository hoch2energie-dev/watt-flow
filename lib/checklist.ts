export type CheckItem = { key: string; label: string; checked: boolean; note: string };
export type Qualification = { items: CheckItem[] };

export const DEFAULT_CHECKS: { key: string; label: string }[] = [
  { key: "owner", label: "Eigentum oder Zustimmung liegt vor" },
  { key: "roof", label: "Dachfläche und Eindeckung sind bekannt" },
  { key: "consumption", label: "Stromverbrauch der letzten 12 Monate liegt vor" },
  { key: "meter", label: "Zählerschrank ist eingeschätzt" },
  { key: "monument", label: "Denkmalschutz und Vorgaben der Gemeinde sind geklärt" },
  { key: "scope", label: "Gewünschte Gewerke sind benannt" },
  { key: "timeline", label: "Zeitraum der Umsetzung ist bekannt" },
  { key: "contact", label: "Ansprechperson ist erreichbar" },
];

export function emptyQualification(): Qualification {
  return { items: DEFAULT_CHECKS.map((item) => ({ ...item, checked: false, note: "" })) };
}

export function parseQualification(value: unknown): Qualification {
  const base = emptyQualification();
  if (!value || typeof value !== "object" || !("items" in value)) return base;
  const rawItems = (value as { items?: unknown }).items;
  if (!Array.isArray(rawItems)) return base;
  const byKey = new Map<string, CheckItem>();
  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<CheckItem>;
    if (typeof item.key !== "string" || typeof item.label !== "string") continue;
    byKey.set(item.key, {
      key: item.key,
      label: item.label,
      checked: Boolean(item.checked),
      note: typeof item.note === "string" ? item.note : "",
    });
  }
  const stored = [...byKey.values()];
  for (const item of base.items) {
    if (!byKey.has(item.key)) stored.push(item);
  }
  return { items: stored };
}

export function qualificationProgress(value: Qualification): { done: number; total: number } {
  return { done: value.items.filter((item) => item.checked).length, total: value.items.length };
}
