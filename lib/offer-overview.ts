import type { CalcResult } from "@/lib/calc/offer";
import { annualConsumption, type OfferDTO, type VariantDTO } from "@/lib/domain";
import { formatEuro, formatNumber, formatPercent } from "@/lib/format";
import { activeModuleCount } from "@/lib/roof/types";
import { TARIFF_LABEL, TENANT_MODELS, tenantGaps, tenantSummary, type TenantPower } from "@/lib/tenant-power";

/**
 * Gliederung der Angebotsseite: Reiter oben, im Reiter Planung die Themenhubs
 * (Strom, Wärme, Mobilität) mit der Ausgangslage beim Kunden und darunter die
 * Planungskacheln je Variante. Hier steht, was wo erscheint und mit welchem Wert.
 */
export type TabId = "allgemein" | "planung" | "simulation" | "abschluss";

export const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: "allgemein", label: "Allgemein", hint: "Kunde, Objekt und Gebäude" },
  { id: "planung", label: "Planung", hint: "Verbrauch, Bestand und Anlagen" },
  { id: "simulation", label: "Simulation", hint: "Ertrag und Wirtschaftlichkeit" },
  { id: "abschluss", label: "Abschluss", hint: "Zahlung, PDF und Status" },
];

export type ThemeId = "strom" | "waerme" | "mobilitaet";

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: "strom", label: "Strom" },
  { id: "waerme", label: "Wärme" },
  { id: "mobilitaet", label: "Mobilität" },
];

/** Spalten des Hubs: die drei Themen und der Mieterstrom, der in einem eigenen Dialog bearbeitet wird. */
export type HubColumnId = ThemeId | "mieterstrom";

/** Bearbeitungsbereiche im Reiter Planung. Die ersten drei gelten fürs ganze Angebot, die übrigen je Variante. */
export type TopicId = "strom" | "waerme" | "mobilitaet" | "pv" | "speicher" | "waermepumpe" | "wallbox" | "extras";
export type PlanTopic = Exclude<TopicId, ThemeId>;

export const TOPIC_LABEL: Record<TopicId, string> = {
  strom: "Strom: Verbrauch und Bestand",
  waerme: "Wärme: Heizung und Wärmepumpenstrom",
  mobilitaet: "Mobilität: E-Auto und Wallbox",
  pv: "Photovoltaik",
  speicher: "Speicher",
  waermepumpe: "Wärmepumpe",
  wallbox: "Wallbox",
  extras: "Extras",
};

/** Planungskacheln, geordnet nach dem Thema, unter dem sie stehen. */
export const PLAN_TOPICS: Record<ThemeId, PlanTopic[]> = {
  strom: ["pv", "speicher"],
  waerme: ["waermepumpe", "extras"],
  mobilitaet: ["wallbox"],
};

/** Abschnitte der Positionen, die zu einer Planungskachel gehören. */
export const TOPIC_SECTIONS: Record<PlanTopic, string[]> = {
  pv: ["module", "inverter", "mounting"],
  speicher: ["storage"],
  waermepumpe: ["heatpump"],
  wallbox: ["wallbox"],
  extras: ["extra"],
};

export function isPlanTopic(topic: TopicId): topic is PlanTopic {
  return topic in TOPIC_SECTIONS;
}

/** Nettosumme der Positionen einer Planungskachel vor dem Gesamtrabatt. */
export function topicNet(result: CalcResult, topic: PlanTopic): number {
  const sections = TOPIC_SECTIONS[topic];
  return result.pricing.lines.filter((line) => sections.includes(line.section)).reduce((sum, line) => sum + line.netBeforeRebate, 0);
}

export function topicItems(variant: VariantDTO, topic: PlanTopic): number {
  const sections = TOPIC_SECTIONS[topic];
  return variant.lines.filter((line) => sections.includes(line.section) && line.quantity > 0).length;
}

/** Eine Kachel der Ausgangslage: was beim Kunden vorhanden ist oder verbraucht wird. */
export type BaselineTile = {
  id: string;
  topic: ThemeId;
  title: string;
  /** Hauptwert. Leer heißt: noch nichts eingetragen, die Kachel zeigt `empty`. */
  value: string;
  detail: string;
  empty: string;
};

const cents = (euro: number) => `${formatNumber(euro * 100, 1).replace(/,0$/, "")} ct/kWh`;

export function baselineTiles(offer: OfferDTO): Record<ThemeId, BaselineTile[]> {
  const total = annualConsumption(offer);
  const own = [
    offer.existingPvKwp > 0 ? `PV ${formatNumber(offer.existingPvKwp, 1)} kWp` : "",
    offer.existingBatteryKwh > 0 ? `Speicher ${formatNumber(offer.existingBatteryKwh, 1)} kWh` : "",
  ].filter(Boolean);
  const price = [
    offer.electricityPriceEur > 0 ? cents(offer.electricityPriceEur) : "",
    offer.priceIncreasePct !== 0 ? `${offer.priceIncreasePct > 0 ? "+" : ""}${formatNumber(offer.priceIncreasePct, 1).replace(/,0$/, "")} % Preisänderung pro Jahr` : "",
  ].filter(Boolean);
  return {
    strom: [
      { id: "verbrauch", topic: "strom", title: "Stromverbrauch", value: total > 0 ? `${formatNumber(total, 0)} kWh` : "", detail: price.join(" · "), empty: "Jahresverbrauch und Strompreis eintragen." },
      { id: "bestand", topic: "strom", title: "Bestehende Anlagen", value: own.join(" · "), detail: own.length > 0 ? "Wird dokumentiert, gerechnet wird die neue Anlage." : "", empty: "Keine PV-Anlage und kein Speicher vorhanden." },
    ],
    waerme: [
      { id: "heizung", topic: "waerme", title: "Bestehende Heizung", value: offer.existingHeating, detail: "", empty: "Heizung des Gebäudes eintragen." },
      {
        id: "wp-strom",
        topic: "waerme",
        title: "Wärmepumpenstrom",
        value: offer.heatPumpElectricKwh > 0 ? `${formatNumber(offer.heatPumpElectricKwh, 0)} kWh` : "",
        detail: offer.heatPumpThermalKwh > 0 ? `${formatNumber(offer.heatPumpThermalKwh, 0)} kWh Wärme pro Jahr` : "Zählt zum Stromverbrauch.",
        empty: "Strom für eine vorhandene oder geplante Wärmepumpe eintragen.",
      },
    ],
    mobilitaet: [
      {
        id: "e-auto",
        topic: "mobilitaet",
        title: "E-Auto",
        value: offer.evKwh > 0 ? `${formatNumber(offer.evKwh, 0)} kWh` : "",
        detail: offer.existingWallbox ? "Ladestrom pro Jahr · Wallbox vorhanden" : "Ladestrom pro Jahr",
        empty: offer.existingWallbox ? "Wallbox vorhanden, noch kein Ladestrom eingetragen." : "Ladestrom für ein E-Auto eintragen.",
      },
    ],
  };
}

/** Kachel zum Mieterstrom. Leerer `value` heißt: nichts zu zeigen, die Kachel erklärt mit `detail`, was fehlt. */
export type TenantTile = { value: string; detail: string; note: string; warn: boolean };

const ct = (value: number) => `${formatNumber(value, 1)} ct`;
const parties = (count: number) => (count === 1 ? "1 Mietpartei" : `${formatNumber(count, 0)} Mietparteien`);

/** Ausgangslage: gewähltes Modell, Mieter und der vorgesehene Tarif in Bruttopreisen. */
export function tenantBaseline(config: TenantPower | null): TenantTile {
  if (!config) return { value: "", detail: "", note: "", warn: false };
  const value = TENANT_MODELS.find((model) => model.id === config.model)?.label ?? "";
  if (config.model === "volleinspeisung") {
    return { value, detail: config.feedInCt > 0 ? `Vergütung ${ct(config.feedInCt)}/kWh` : "Vergütung noch offen", note: "", warn: false };
  }
  const summary = tenantSummary(config, 0);
  const detail = summary.tenantCount > 0 ? `${parties(summary.tenantCount)} · ${formatNumber(summary.demandKwh, 0)} kWh pro Jahr` : "Noch keine Mieter eingetragen";
  let note = "Tarif noch offen";
  if (config.model === "versorger" && config.tariffMode === "mischtarif") {
    if (config.mixedPriceCt > 0) note = `${TARIFF_LABEL.mischtarif}: ${ct(summary.gross.mixedCt)}/kWh brutto`;
  } else if (config.model === "versorger") {
    if (config.pvPriceCt > 0 && config.gridPriceCt > 0) note = `${TARIFF_LABEL.zweitarif}: ${ct(summary.gross.pvCt)} Solar · ${ct(summary.gross.gridCt)} Rest, brutto`;
    else if (config.pvPriceCt > 0 || config.gridPriceCt > 0) note = "Tarif noch unvollständig";
  } else if (config.pvPriceCt > 0) {
    note = `Solarstrom: ${ct(summary.gross.pvCt)}/kWh brutto`;
  }
  return { value, detail, note, warn: false };
}

/** Planung: Überschlag für den Betreiber mit dem Jahresertrag der gewählten Variante und was die Mieter davon haben. */
export function tenantOutcome(config: TenantPower | null, annualYieldKwh: number): TenantTile {
  if (!config) return { value: "", detail: "Erscheint, sobald der Mieterstrom eingerichtet ist.", note: "", warn: false };
  const gaps = tenantGaps(config);
  if (gaps.length > 0) return { value: "", detail: `Es fehlt noch: ${gaps.join(", ")}.`, note: "", warn: false };
  const summary = tenantSummary(config, annualYieldKwh);
  const value = `${formatEuro(summary.yearlyTotal)} pro Jahr`;
  const detail = config.model === "volleinspeisung" ? "Vergütung für die Einspeisung, netto" : "Überschlag für den Betreiber, netto, vor Betriebskosten";
  if (annualYieldKwh <= 0) return { value, detail, note: "Noch keine Anlage geplant, gerechnet ohne Einspeisung.", warn: false };
  const groups = summary.groups.filter((group) => group.count > 0);
  if (groups.length === 0) return { value, detail, note: "", warn: false };
  if (groups.some((group) => group.withinCap === false)) return { value, detail, note: "Tarif liegt über 90 % der Grundversorgung.", warn: true };
  const low = Math.min(...groups.map((group) => group.savingEur));
  const high = Math.max(...groups.map((group) => group.savingEur));
  if (low < 0) return { value, detail, note: "Für mindestens eine Mietergruppe wird der Strom teurer als bisher.", warn: true };
  const range = Math.round(low) === Math.round(high) ? formatEuro(Math.round(high)) : `${formatEuro(Math.round(low))} bis ${formatEuro(Math.round(high))}`;
  return { value, detail, note: `Mieter sparen ${range} pro Jahr und Partei.`, warn: false };
}

/** Kurzwert einer Planungskachel. Leerer `value` heißt: noch nichts geplant. */
export function planSummary(topic: PlanTopic, variant: VariantDTO, result: CalcResult): { value: string; detail: string; filled: boolean } {
  const net = topicNet(result, topic);
  const count = topicItems(variant, topic);
  const price = net > 0 ? `${formatEuro(net)} netto` : "";
  const items = count === 1 ? "1 Position" : `${count} Positionen`;
  if (topic === "pv") {
    const value = result.kwp > 0 ? `${formatNumber(result.kwp, 2)} kWp geplant` : "";
    return { value, detail: price, filled: Boolean(value) || count > 0 || solarProgress(variant).roof };
  }
  if (topic === "speicher" && result.batteryKwh > 0) return { value: `${formatNumber(result.batteryKwh, 1)} kWh`, detail: price, filled: true };
  return { value: count > 0 ? formatEuro(net) : "", detail: count > 0 ? `${items}, netto` : "", filled: count > 0 };
}

export type SolarProgress = { roof: boolean; layout: boolean; modules: boolean; inverter: boolean; strings: boolean };

/**
 * Was an der Photovoltaik schon steht: Gebäude in der 3D-Planung, Module auf dem Dach belegt,
 * Module und Wechselrichter in den Positionen, und ob die Verschaltung vollständig ist.
 */
export function solarProgress(variant: VariantDTO): SolarProgress {
  const has = (section: string) => variant.lines.some((line) => line.section === section && line.quantity > 0);
  const layout = variant.faces.some((face) => Boolean(face.geometry?.placement) && activeModuleCount(face.geometry) > 0);
  /* Vollständig heißt: jedes gelegte Modul hängt in einem String, und jeder dieser Strings an einem MPP-Tracker. */
  const connected = new Set((variant.planning?.strings ?? []).filter((entry) => entry.inverter != null && entry.tracker != null).map((entry) => entry.id));
  const placed = variant.faces.flatMap((face) => (face.geometry?.placement ? face.geometry.modules.filter((module) => module.active) : []));
  return {
    roof: variant.faces.some((face) => (face.geometry?.ring.length ?? 0) >= 3),
    layout,
    modules: has("module"),
    inverter: has("inverter"),
    strings: layout && placed.every((module) => module.string != null && connected.has(module.string)),
  };
}

/** Kennzahlen, die über allen Reitern sichtbar bleiben. */
export function keyFigures(result: CalcResult): { label: string; value: string }[] {
  const dash = "–";
  const produces = result.yield.annualKwh > 0;
  return [
    { label: "Investition", value: formatEuro(result.investment) },
    { label: "Marge", value: result.pricing.net > 0 ? `${formatEuro(result.pricing.margin)} · ${formatPercent(result.pricing.marginPercent, 0)}` : dash },
    { label: "Amortisation", value: result.kpis.breakEvenYears == null ? dash : `${formatNumber(result.kpis.breakEvenYears, 1)} Jahre` },
    { label: "Rendite", value: result.kpis.irr == null ? dash : formatPercent(result.kpis.irr) },
    { label: "Produktion", value: produces ? `${formatNumber(result.yield.annualKwh, 0)} kWh/Jahr` : dash },
    { label: "Autarkie", value: produces ? formatPercent(result.self.autarkyRatio, 0) : dash },
    { label: "Eigenverbrauch", value: produces ? formatPercent(result.self.selfConsumptionRatio, 0) : dash },
  ];
}
