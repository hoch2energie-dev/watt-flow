export function parseDeNumber(raw: string): number {
  const trimmed = raw.trim().replace(/\s/g, "");
  if (!trimmed) return 0;
  let normalized = trimmed;
  if (trimmed.includes(",") && trimmed.includes(".")) {
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (trimmed.includes(",")) {
    normalized = trimmed.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(trimmed)) {
    normalized = trimmed.replace(/\./g, "");
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "–";
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatEuro(value: number): string {
  if (!Number.isFinite(value)) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "–";
  return `${formatNumber(value * 100, digits)} %`;
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "–";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" }).format(date);
}

export function formatDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}

export function formatKwh(value: number, digits = 0): string {
  return `${formatNumber(value, digits)} kWh`;
}

export function customerName(person: {
  companyName?: string | null;
  firstName: string;
  lastName: string;
}): string {
  const personName = `${person.firstName} ${person.lastName}`.trim();
  if (person.companyName) return personName ? `${person.companyName} · ${personName}` : person.companyName;
  return personName;
}

export function addressLine(place: { street?: string | null; zip?: string | null; city?: string | null }): string {
  const cityLine = [place.zip, place.city].filter(Boolean).join(" ");
  return [place.street, cityLine].filter(Boolean).join(", ");
}

export function isoDateInput(value: Date | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
