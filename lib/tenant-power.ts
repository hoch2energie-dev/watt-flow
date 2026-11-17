/**
 * Mieterstrom: wie der Solarstrom im Gebäude vermarktet wird, mit welchem Tarif und an wen.
 * Gespeichert als ein JSON-Feld am Angebot. Hier stehen die Datenform, die Eingabeprüfung
 * und die Zusammenfassung aus Sicht des Betreibers und der Mieter.
 *
 * Alle Preise des Mieterstromtarifs sind netto, die Mehrwertsteuer kommt über `vatPct` dazu.
 * Die bisherigen Tarife der Mieter und der Grundversorgungstarif sind brutto, so wie sie auf
 * der Stromrechnung stehen.
 */
import { estimateSelfConsumption } from "@/lib/calc/economics";

export type TenantModel = "volleinspeisung" | "direkt" | "versorger";
export type TariffMode = "zweitarif" | "mischtarif";
export type FeedMode = "einspeiseverguetung" | "direktvermarktung";
export type TenantKind = "privat" | "gewerbe";

export type TenantGroup = {
  id: string;
  name: string;
  kind: TenantKind;
  /** Zahl der Mietparteien mit diesem Verbrauch und Tarif. */
  count: number;
  /** Jahresverbrauch je Mietpartei. */
  annualKwh: number;
  /** Bisheriger Arbeitspreis, brutto. */
  currentPriceCt: number;
  /** Bisheriger Grundpreis je Monat, brutto. */
  currentBaseEur: number;
};

export type GeneralLoad = { id: string; name: string; annualKwh: number; priceCt: number };

export type TenantPower = {
  model: TenantModel;
  tariffMode: TariffMode;
  /** Zweitarif: Preis für Solarstrom, netto. Im Modell „direkt" der einzige Arbeitspreis. */
  pvPriceCt: number;
  /** Zweitarif: Preis für Reststrom aus dem Netz, netto. */
  gridPriceCt: number;
  /** Mischtarif: ein Preis für jede Kilowattstunde, netto. */
  mixedPriceCt: number;
  /** Grundpreis je Mietpartei und Monat, netto. */
  baseFeeEur: number;
  /** Mehrwertsteuer auf den Mieterstromtarif: 19, oder 0 für Kleinunternehmer. */
  vatPct: number;
  /** Erwarteter Anteil des Solarstroms am Verbrauch der Mieter. */
  pvSharePct: number;
  /** Einkaufspreis für Reststrom, netto. */
  gridPurchaseCt: number;
  feedMode: FeedMode;
  /** Vergütung für eingespeisten Überschuss. */
  feedInCt: number;
  /** Mieterstromzuschlag nach EEG je Kilowattstunde, die an Mieter geliefert wird. */
  surchargeCt: number;
  /** Grundversorgungstarif im Netzgebiet, brutto: Arbeitspreis und Grundpreis je Monat. */
  basicPriceCt: number;
  basicBaseEur: number;
  tenants: TenantGroup[];
  general: GeneralLoad[];
};

export const TENANT_MODELS: { id: TenantModel; label: string; text: string }[] = [
  { id: "volleinspeisung", label: "Volleinspeisung", text: "Die gesamte erzeugte Energie wird ins Netz eingespeist und vergütet. Die Mieter bleiben bei ihrem Stromanbieter." },
  { id: "direkt", label: "Direkte Vermarktung", text: "Der Solarstrom wird an die Mieter verkauft, der Überschuss eingespeist. Ihren übrigen Strom beziehen die Mieter weiter selbst aus dem Netz (gemeinschaftliche Gebäudeversorgung)." },
  { id: "versorger", label: "Energieversorger", text: "Gefördertes Mieterstrommodell: Der Betreiber versorgt die Mieter vollständig. Er liefert Solarstrom, kauft den Reststrom im Netz ein und verkauft ihn weiter." },
];

export const TARIFF_LABEL: Record<TariffMode, string> = { zweitarif: "Zweitarif", mischtarif: "Mischtarif" };
export const FEED_LABEL: Record<FeedMode, string> = { einspeiseverguetung: "Einspeisevergütung", direktvermarktung: "Direktvermarktung" };
export const KIND_LABEL: Record<TenantKind, string> = { privat: "Privat", gewerbe: "Gewerblich" };
export const TENANT_LIMITS = { groups: 40, general: 20 };

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

function number(value: unknown, min: number, max: number, digits: number, fallback = 0): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return round(Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : fallback)), digits);
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const price = (value: unknown) => number(value, 0, 300, 2);
const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

/** Neue Mietergruppe. Der bisherige Arbeitspreis kommt als Vorschlag aus dem Angebot. */
export function newTenantGroup(id: string, currentPriceCt: number, index = 0): TenantGroup {
  return { id, name: `Wohnungen ${index + 1}`, kind: "privat", count: 1, annualKwh: 2500, currentPriceCt: price(currentPriceCt), currentBaseEur: 0 };
}

/** Ausgangswerte für ein Modell. Tarif und Zuschlag bleiben leer, sie sind je Projekt verschieden. */
export function newTenantPower(model: TenantModel, suggest: { currentPriceCt: number; feedInCt: number }, id: () => string): TenantPower {
  return {
    model,
    tariffMode: "zweitarif",
    pvPriceCt: 0,
    gridPriceCt: 0,
    mixedPriceCt: 0,
    baseFeeEur: 0,
    vatPct: 19,
    pvSharePct: 35,
    gridPurchaseCt: 0,
    feedMode: "einspeiseverguetung",
    feedInCt: price(suggest.feedInCt),
    surchargeCt: 0,
    basicPriceCt: 0,
    basicBaseEur: 0,
    tenants: model === "volleinspeisung" ? [] : [newTenantGroup(id(), suggest.currentPriceCt)],
    general: [],
  };
}

/** Prüft gespeicherte oder vom Browser gesendete Daten. Unbrauchbares ergibt `null`, also kein Mieterstrom. */
export function parseTenantPower(value: unknown): TenantPower | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const model = pick<TenantModel | "">(raw.model, ["volleinspeisung", "direkt", "versorger"], "");
  if (!model) return null;
  const ids = new Set<string>();
  const unique = (candidate: unknown, prefix: string) => {
    let id = text(candidate, 60) || `${prefix}${ids.size + 1}`;
    while (ids.has(id)) id = `${id}x`;
    ids.add(id);
    return id;
  };
  const tenants = (Array.isArray(raw.tenants) ? raw.tenants : []).slice(0, TENANT_LIMITS.groups).flatMap((entry, index): TenantGroup[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    return [{
      id: unique(item.id, "m"),
      name: text(item.name, 80) || `Mieter ${index + 1}`,
      kind: pick<TenantKind>(item.kind, ["privat", "gewerbe"], "privat"),
      count: number(item.count, 0, 2000, 0, 1),
      annualKwh: number(item.annualKwh, 0, 5_000_000, 0),
      currentPriceCt: price(item.currentPriceCt),
      currentBaseEur: number(item.currentBaseEur, 0, 1000, 2),
    }];
  });
  const general = (Array.isArray(raw.general) ? raw.general : []).slice(0, TENANT_LIMITS.general).flatMap((entry, index): GeneralLoad[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    return [{ id: unique(item.id, "a"), name: text(item.name, 80) || `Allgemeinstrom ${index + 1}`, annualKwh: number(item.annualKwh, 0, 5_000_000, 0), priceCt: price(item.priceCt) }];
  });
  return {
    model,
    tariffMode: pick<TariffMode>(raw.tariffMode, ["zweitarif", "mischtarif"], "zweitarif"),
    pvPriceCt: price(raw.pvPriceCt),
    gridPriceCt: price(raw.gridPriceCt),
    mixedPriceCt: price(raw.mixedPriceCt),
    baseFeeEur: number(raw.baseFeeEur, 0, 1000, 2),
    vatPct: number(raw.vatPct, 0, 30, 1, 19),
    pvSharePct: number(raw.pvSharePct, 0, 100, 1, 35),
    gridPurchaseCt: price(raw.gridPurchaseCt),
    feedMode: pick<FeedMode>(raw.feedMode, ["einspeiseverguetung", "direktvermarktung"], "einspeiseverguetung"),
    feedInCt: price(raw.feedInCt),
    surchargeCt: price(raw.surchargeCt),
    basicPriceCt: price(raw.basicPriceCt),
    basicBaseEur: number(raw.basicBaseEur, 0, 1000, 2),
    tenants: model === "volleinspeisung" ? [] : tenants,
    general: model === "volleinspeisung" ? [] : general,
  };
}

export type TenantGroupSummary = {
  id: string;
  name: string;
  kind: TenantKind;
  count: number;
  /** Jahreskosten einer Mietpartei, brutto: bisher und mit Mieterstrom. */
  currentEur: number;
  newEur: number;
  savingEur: number;
  savingPct: number | null;
  /** 90 % des Grundversorgungstarifs für diesen Verbrauch. Nur im Modell „versorger" für private Mieter, sonst `null`. */
  capEur: number | null;
  withinCap: boolean | null;
};

export type TenantSummary = {
  /** Preise aus Sicht der Mieter, brutto. `effectiveCt` ist der Durchschnitt über Solar- und Reststrom. */
  gross: { pvCt: number; gridCt: number; mixedCt: number; effectiveCt: number; baseFeeEur: number };
  /** Erlös je Kilowattstunde Solarstrom an Mieter und Marge je Kilowattstunde Reststrom, netto. */
  pvRevenueCt: number;
  gridMarginCt: number | null;
  tenantCount: number;
  demandKwh: number;
  generalKwh: number;
  /** Solaranteil, mit dem gerechnet wurde. Kleiner als eingegeben, wenn die Anlage nicht so viel erzeugt. */
  sharePct: number;
  limited: boolean;
  pvToTenantsKwh: number;
  gridToTenantsKwh: number;
  pvToGeneralKwh: number;
  feedInKwh: number;
  /** Überschlag pro Jahr aus Sicht des Betreibers, netto, vor Kosten für Messung, Abrechnung und Betrieb. */
  yearly: { label: string; eur: number }[];
  yearlyTotal: number;
  groups: TenantGroupSummary[];
};

/**
 * Zusammenfassung für Betreiber und Mieter. `annualYieldKwh` ist der Jahresertrag der geplanten
 * Anlage; ist noch keine geplant (0), wird nur mit dem eingegebenen Solaranteil gerechnet.
 */
export function tenantSummary(config: TenantPower, annualYieldKwh: number): TenantSummary {
  const vat = 1 + config.vatPct / 100;
  const supplies = config.model !== "volleinspeisung";
  const full = config.model === "versorger";
  const mixed = full && config.tariffMode === "mischtarif";
  const tenantCount = supplies ? config.tenants.reduce((sum, group) => sum + group.count, 0) : 0;
  const demandKwh = supplies ? config.tenants.reduce((sum, group) => sum + group.count * group.annualKwh, 0) : 0;
  const generalKwh = supplies ? config.general.reduce((sum, load) => sum + load.annualKwh, 0) : 0;

  const wanted = ((demandKwh + generalKwh) * config.pvSharePct) / 100;
  const limited = annualYieldKwh > 0 && wanted > annualYieldKwh + 1e-6;
  const share = wanted > 0 ? (config.pvSharePct / 100) * (limited ? annualYieldKwh / wanted : 1) : 0;
  const pvToTenantsKwh = demandKwh * share;
  const gridToTenantsKwh = full ? demandKwh - pvToTenantsKwh : 0;
  const pvToGeneralKwh = generalKwh * share;
  const feedInKwh = annualYieldKwh > 0 ? Math.max(0, annualYieldKwh - pvToTenantsKwh - pvToGeneralKwh) : 0;

  const gross = {
    pvCt: config.pvPriceCt * vat,
    gridCt: config.gridPriceCt * vat,
    mixedCt: config.mixedPriceCt * vat,
    effectiveCt: mixed ? config.mixedPriceCt * vat : full ? (share * config.pvPriceCt + (1 - share) * config.gridPriceCt) * vat : config.pvPriceCt * vat,
    baseFeeEur: config.baseFeeEur * vat,
  };
  const unitCt = mixed ? config.mixedPriceCt : config.pvPriceCt;
  const pvRevenueCt = supplies ? unitCt + (full ? config.surchargeCt : 0) : 0;
  const gridMarginCt = full ? (mixed ? config.mixedPriceCt : config.gridPriceCt) - config.gridPurchaseCt : null;

  const yearly: { label: string; eur: number }[] = [];
  const add = (label: string, eur: number) => {
    if (Math.abs(eur) >= 0.005) yearly.push({ label, eur: round(eur, 2) });
  };
  if (mixed) {
    add("Strom an Mieter (Mischtarif)", (demandKwh * config.mixedPriceCt) / 100);
  } else if (supplies) {
    add("Solarstrom an Mieter", (pvToTenantsKwh * config.pvPriceCt) / 100);
    if (full) add("Reststrom an Mieter", (gridToTenantsKwh * config.gridPriceCt) / 100);
  }
  if (supplies) add("Grundpreise", tenantCount * 12 * config.baseFeeEur);
  if (full) {
    add("Mieterstromzuschlag", (pvToTenantsKwh * config.surchargeCt) / 100);
    add("Einkauf Reststrom", (-gridToTenantsKwh * config.gridPurchaseCt) / 100);
  }
  if (supplies) add("Ersparnis beim Allgemeinstrom", config.general.reduce((sum, load) => sum + (load.annualKwh * share * load.priceCt) / 100, 0));
  add(supplies ? "Einspeisung des Überschusses" : "Einspeisung", (feedInKwh * config.feedInCt) / 100);

  const groups = (supplies ? config.tenants : []).map((group): TenantGroupSummary => {
    const currentEur = (group.annualKwh * group.currentPriceCt) / 100 + 12 * group.currentBaseEur;
    /* Vollversorgung ersetzt den bisherigen Vertrag. Bei direkter Vermarktung läuft er für den Reststrom weiter. */
    const newEur = full
      ? (group.annualKwh * gross.effectiveCt) / 100 + 12 * gross.baseFeeEur
      : (group.annualKwh * share * gross.pvCt) / 100 + (group.annualKwh * (1 - share) * group.currentPriceCt) / 100 + 12 * (group.currentBaseEur + gross.baseFeeEur);
    const checked = full && group.kind === "privat" && config.basicPriceCt > 0;
    const capEur = checked ? 0.9 * ((group.annualKwh * config.basicPriceCt) / 100 + 12 * config.basicBaseEur) : null;
    return {
      id: group.id,
      name: group.name,
      kind: group.kind,
      count: group.count,
      currentEur: round(currentEur, 2),
      newEur: round(newEur, 2),
      savingEur: round(currentEur - newEur, 2),
      savingPct: currentEur > 0 ? round(((currentEur - newEur) / currentEur) * 100, 1) : null,
      capEur: capEur == null ? null : round(capEur, 2),
      withinCap: capEur == null ? null : newEur <= capEur + 0.005,
    };
  });

  return {
    gross,
    pvRevenueCt,
    gridMarginCt,
    tenantCount,
    demandKwh,
    generalKwh,
    sharePct: round(share * 100, 1),
    limited,
    pvToTenantsKwh,
    gridToTenantsKwh,
    pvToGeneralKwh,
    feedInKwh,
    yearly,
    yearlyTotal: round(yearly.reduce((sum, line) => sum + line.eur, 0), 2),
    groups,
  };
}

/** Was für eine belastbare Zusammenfassung noch fehlt, in Worten. Leer heißt: vollständig. */
export function tenantGaps(config: TenantPower): string[] {
  const gaps: string[] = [];
  if (config.model === "volleinspeisung") {
    if (config.feedInCt <= 0) gaps.push("Vergütung für die Einspeisung");
    return gaps;
  }
  const full = config.model === "versorger";
  if (full && config.tariffMode === "mischtarif") {
    if (config.mixedPriceCt <= 0) gaps.push("Mischpreis");
  } else {
    if (config.pvPriceCt <= 0) gaps.push("Preis für Solarstrom");
    if (full && config.gridPriceCt <= 0) gaps.push("Preis für Reststrom");
  }
  if (full && config.gridPurchaseCt <= 0) gaps.push("Einkaufspreis für Reststrom");
  const active = config.tenants.filter((group) => group.count > 0 && group.annualKwh > 0);
  if (active.length === 0) gaps.push("Mieter mit Verbrauch");
  else if (active.some((group) => group.currentPriceCt <= 0)) gaps.push("bisheriger Strompreis der Mieter");
  return gaps;
}

/**
 * Vorschlag für den Solaranteil: wie viel des Verbrauchs von Mietern und Allgemeinstrom die Anlage
 * übers Jahr decken kann. Gleiche Beratungsschätzung wie beim Eigenverbrauch im Angebot, keine
 * Lastgangsimulation. `null`, solange Ertrag oder Verbrauch fehlen.
 */
export function suggestedSharePct(config: Pick<TenantPower, "tenants" | "general">, annualYieldKwh: number, batteryUsableKwh: number, batteryCyclesPerYear: number): number | null {
  const demand = config.tenants.reduce((sum, group) => sum + group.count * group.annualKwh, 0) + config.general.reduce((sum, load) => sum + load.annualKwh, 0);
  if (annualYieldKwh <= 0 || demand <= 0) return null;
  const estimate = estimateSelfConsumption({ annualProductionKwh: annualYieldKwh, annualConsumptionKwh: demand, batteryUsableKwh, batteryCyclesPerYear });
  return Math.round(estimate.autarkyRatio * 100);
}
