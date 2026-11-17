import { centroidXY, type XY } from "@/lib/roof/geo";
import { buildRoof, type BuildingSpec } from "@/lib/roof3d/building";
import { faceFrame, type FacePlan, type PlanModule } from "@/lib/roof3d/plans";

/**
 * Strings: welche Module in Reihe hängen, in welcher Reihenfolge, und an welchem Wechselrichter
 * und MPP-Tracker der String liegt.
 *
 * Die Zugehörigkeit steht am Modul selbst (`string`, `order` am Platz des Rasters). So wandert sie
 * mit, wenn ein Gebäude verschoben oder eine Fläche neu gerastert wird. Die Liste der Strings und
 * der Wechselrichter gilt für die ganze Variante, denn ein Wechselrichter kann Module mehrerer
 * Gebäude tragen.
 *
 * Die elektrische Prüfung rechnet mit Datenblattwerten bei −10 °C und 70 °C Zelltemperatur. Sie ist
 * eine Plausibilitätsprüfung und ersetzt nicht die Auslegung mit dem Werkzeug des Herstellers.
 */
export type StringSpec = {
  id: string;
  name: string;
  color: string;
  /** Kennung eines Wechselrichters aus `Wiring.inverters`, oder `null`. */
  inverter: string | null;
  /** MPP-Tracker am Wechselrichter, ab 1 gezählt. */
  tracker: number | null;
};

/** Ein Wechselrichter in der Planung. Zwei gleiche Geräte sind zwei Einträge. */
export type InverterUnit = { id: string; catalogItemId: string };

export type Wiring = { inverters: InverterUnit[]; strings: StringSpec[] };
export const NO_WIRING: Wiring = { inverters: [], strings: [] };

/** So liegt die Verschaltung an der Variante des Angebots. */
export type VariantPlanning = { version: 1 } & Wiring;

export type ModuleRef = { building: string; edge: number; index: number };

export const WIRING_LIMITS = { strings: 60, inverters: 12, trackers: 12 };
export const DESIGN_TEMPS = { coldC: -10, hotC: 70 };
/** Module je String, solange Datenblattwerte für eine Rechnung fehlen. */
export const DEFAULT_PER_STRING = 16;

/** Gut unterscheidbare Farben auf dunklen Modulen und auf dem Luftbild. */
export const STRING_COLORS = ["#f2a516", "#3fb6e8", "#e8573f", "#7ccf5a", "#c58af9", "#f478b4", "#35c9a5", "#ff8a3d", "#9fb4ff", "#d6d04a"];

/* ---------- Lesen ---------- */

function eachCell(buildings: BuildingSpec[], visit: (cell: PlanModule, ref: ModuleRef, plan: FacePlan) => void) {
  for (const building of buildings) {
    for (const [edge, plan] of Object.entries(building.plans ?? {})) {
      plan.modules.forEach((cell, index) => visit(cell, { building: building.id, edge: Number(edge), index }, plan));
    }
  }
}

/** Module je String in der Reihenfolge der Verschaltung, dazu die belegten Module ohne String. */
export function membership(buildings: BuildingSpec[]): { byString: Map<string, ModuleRef[]>; free: ModuleRef[] } {
  const found = new Map<string, { ref: ModuleRef; order: number }[]>();
  const free: ModuleRef[] = [];
  eachCell(buildings, (cell, ref) => {
    if (!cell.active) return;
    if (!cell.string) return void free.push(ref);
    const list = found.get(cell.string) ?? [];
    list.push({ ref, order: cell.order ?? Number.MAX_SAFE_INTEGER });
    found.set(cell.string, list);
  });
  const byString = new Map<string, ModuleRef[]>();
  for (const [id, list] of found) byString.set(id, list.sort((a, b) => a.order - b.order).map((entry) => entry.ref));
  return { byString, free };
}

/* ---------- Ändern ---------- */

/** Ändert einzelne Plätze. Was unverändert bleibt, bleibt dasselbe Objekt, bis hinauf zur Liste der Gebäude. */
function mapCells(buildings: BuildingSpec[], change: (cell: PlanModule, ref: ModuleRef) => PlanModule): BuildingSpec[] {
  const next = buildings.map((building) => {
    if (!building.plans) return building;
    let touched = false;
    const plans: Record<number, FacePlan> = {};
    for (const [edge, plan] of Object.entries(building.plans)) {
      let changed = false;
      const modules = plan.modules.map((cell, index) => {
        const next = change(cell, { building: building.id, edge: Number(edge), index });
        if (next !== cell) changed = true;
        return next;
      });
      plans[Number(edge)] = changed ? { ...plan, modules } : plan;
      touched ||= changed;
    }
    return touched ? { ...building, plans } : building;
  });
  return next.some((building, index) => building !== buildings[index]) ? next : buildings;
}

const bare = (cell: PlanModule): PlanModule => (cell.string == null && cell.order == null ? cell : { corners: cell.corners, active: cell.active });

/**
 * Bringt Module und Stringliste in Einklang: Leere Plätze und Module unbekannter Strings verlieren
 * ihre Zugehörigkeit, die Reihenfolge je String läuft lückenlos ab 1, Strings an einem Wechselrichter,
 * den es nicht mehr gibt, sind wieder frei.
 */
export function tidyWiring(buildings: BuildingSpec[], wiring: Wiring): { buildings: BuildingSpec[]; wiring: Wiring } {
  const known = new Set(wiring.strings.map((entry) => entry.id));
  const cleared = mapCells(buildings, (cell) => (cell.string != null && (!cell.active || !known.has(cell.string)) ? bare(cell) : cell.string == null && cell.order != null ? bare(cell) : cell));
  const place = new Map<string, number>();
  for (const [id, refs] of membership(cleared).byString) refs.forEach((ref, index) => place.set(`${id}|${ref.building}|${ref.edge}|${ref.index}`, index + 1));
  const ordered = mapCells(cleared, (cell, ref) => {
    if (!cell.string) return cell;
    const order = place.get(`${cell.string}|${ref.building}|${ref.edge}|${ref.index}`) ?? 1;
    return cell.order === order ? cell : { ...cell, order };
  });
  const units = new Set(wiring.inverters.map((unit) => unit.id));
  const dangling = wiring.strings.some((entry) => entry.inverter != null && !units.has(entry.inverter));
  const strings = dangling ? wiring.strings.map((entry) => (entry.inverter != null && !units.has(entry.inverter) ? { ...entry, inverter: null, tracker: null } : entry)) : wiring.strings;
  return { buildings: ordered, wiring: strings === wiring.strings ? wiring : { ...wiring, strings } };
}

/** Name für den nächsten String: A bis Z, danach AA, AB und so weiter. Freie Buchstaben werden wieder vergeben. */
export function nextStringName(strings: StringSpec[]): string {
  const taken = new Set(strings.map((entry) => entry.name));
  for (let number = 0; number < 702; number += 1) {
    const name = number < 26 ? String.fromCharCode(65 + number) : String.fromCharCode(64 + Math.floor(number / 26)) + String.fromCharCode(65 + (number % 26));
    if (!taken.has(name)) return name;
  }
  return `S${strings.length + 1}`;
}

export function nextStringColor(strings: StringSpec[]): string {
  const used = new Map<string, number>();
  for (const entry of strings) used.set(entry.color, (used.get(entry.color) ?? 0) + 1);
  return STRING_COLORS.reduce((best, color) => ((used.get(color) ?? 0) < (used.get(best) ?? 0) ? color : best), STRING_COLORS[0]);
}

export function newString(id: string, strings: StringSpec[]): StringSpec {
  return { id, name: nextStringName(strings), color: nextStringColor(strings), inverter: null, tracker: null };
}

/** Hängt Module einer Dachfläche in der genannten Reihenfolge an einen String an. Nur belegte Plätze ohne String zählen. */
export function assignCells(buildings: BuildingSpec[], target: { building: string; edge: number }, indexes: number[], stringId: string): BuildingSpec[] {
  let order = membership(buildings).byString.get(stringId)?.length ?? 0;
  const rank = new Map<number, number>();
  const plan = buildings.find((building) => building.id === target.building)?.plans?.[target.edge];
  for (const index of indexes) {
    const cell = plan?.modules[index];
    if (!cell || !cell.active || cell.string || rank.has(index)) continue;
    order += 1;
    rank.set(index, order);
  }
  if (rank.size === 0) return buildings;
  return mapCells(buildings, (cell, ref) => (ref.building === target.building && ref.edge === target.edge && rank.has(ref.index) ? { ...cell, string: stringId, order: rank.get(ref.index) } : cell));
}

/** Nimmt Module einer Dachfläche aus ihrem String. Die übrigen rücken in der Reihenfolge nach. */
export function releaseCells(buildings: BuildingSpec[], wiring: Wiring, target: { building: string; edge: number }, indexes: number[]): BuildingSpec[] {
  const drop = new Set(indexes);
  const next = mapCells(buildings, (cell, ref) => (ref.building === target.building && ref.edge === target.edge && drop.has(ref.index) ? bare(cell) : cell));
  return tidyWiring(next, wiring).buildings;
}

/** Löscht einen String. Seine Module bleiben liegen und sind wieder frei. */
export function removeString(buildings: BuildingSpec[], wiring: Wiring, id: string): { buildings: BuildingSpec[]; wiring: Wiring } {
  return tidyWiring(buildings, { ...wiring, strings: wiring.strings.filter((entry) => entry.id !== id) });
}

/** Leert einen String, behält ihn aber mit Name, Farbe und Zuordnung. */
export function clearString(buildings: BuildingSpec[], id: string): BuildingSpec[] {
  return mapCells(buildings, (cell) => (cell.string === id ? bare(cell) : cell));
}

/**
 * Verstringt die freien Module einer Dachfläche in Schlangenlinie: unterste Reihe von links nach
 * rechts, die nächste zurück. Bei mehr als `perString` Modulen entstehen gleich lange Strings.
 */
export function autoString(buildings: BuildingSpec[], wiring: Wiring, target: { building: string; edge: number }, perString: number, newId: () => string): { buildings: BuildingSpec[]; wiring: Wiring; created: string[] } {
  const building = buildings.find((entry) => entry.id === target.building);
  const face = building ? buildRoof(building).faces.find((entry) => entry.edge === target.edge) : undefined;
  const plan = building?.plans?.[target.edge];
  if (!building || !face || !plan) return { buildings, wiring, created: [] };
  const frame = faceFrame(building, face);
  const spots = plan.modules.flatMap((cell, index) => {
    if (!cell.active || cell.string) return [];
    const center = centroidXY(cell.corners);
    const dx = center[0] - frame.origin[0];
    const dy = center[1] - frame.origin[1];
    const up = (point: XY) => (point[0] - frame.origin[0]) * frame.inward[0] + (point[1] - frame.origin[1]) * frame.inward[1];
    const ups = cell.corners.map(up);
    return [{ index, along: dx * frame.along[0] + dy * frame.along[1], up: dx * frame.inward[0] + dy * frame.inward[1], depth: Math.max(...ups) - Math.min(...ups) }];
  });
  if (spots.length === 0) return { buildings, wiring, created: [] };
  spots.sort((a, b) => a.up - b.up);
  const rows: (typeof spots)[] = [];
  for (const spot of spots) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(spot.up - row[0].up) < Math.max(0.1, spot.depth / 2)) row.push(spot);
    else rows.push([spot]);
  }
  const snake = rows.flatMap((row, number) => row.sort((a, b) => (number % 2 === 0 ? a.along - b.along : b.along - a.along)).map((spot) => spot.index));
  const limit = Math.max(1, Math.round(perString));
  const count = Math.ceil(snake.length / limit);
  const base = Math.floor(snake.length / count);
  const longer = snake.length % count;
  let strings = wiring.strings;
  let next = buildings;
  const created: string[] = [];
  let from = 0;
  for (let number = 0; number < count && strings.length < WIRING_LIMITS.strings; number += 1) {
    const size = base + (number < longer ? 1 : 0);
    const added = newString(newId(), strings);
    strings = [...strings, added];
    next = assignCells(next, target, snake.slice(from, from + size), added.id);
    created.push(added.id);
    from += size;
  }
  return { buildings: next, wiring: { ...wiring, strings }, created };
}

/* ---------- Rechnen ---------- */

/** Datenblattwerte eines Moduls bei Standardbedingungen. */
export type ModuleElectrical = { vocV: number; iscA: number; vmppV: number; imppA: number; tempCoeffVocPct: number };

/** Datenblattwerte eines Wechselrichters. Fehlende Angaben sind `null`, die zugehörige Prüfung entfällt dann. */
export type InverterElectrical = {
  name: string;
  acPowerKw: number | null;
  trackers: number;
  stringsPerTracker: number | null;
  maxDcVoltageV: number | null;
  mppMinV: number | null;
  mppMaxV: number | null;
  maxInputCurrentA: number | null;
  maxShortCircuitCurrentA: number | null;
  maxDcPowerKw: number | null;
};

const positive = (value: unknown): number | null => {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value.replace(",", ".")) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
};

/** Liest die Datenblattwerte eines Moduls aus den technischen Daten des Katalogs. `null`, solange einer fehlt. */
export function moduleElectricalOf(specs: Record<string, unknown>): ModuleElectrical | null {
  const vocV = positive(specs.vocV);
  const iscA = positive(specs.iscA);
  const vmppV = positive(specs.vmppV);
  const imppA = positive(specs.imppA);
  const coefficient = typeof specs.tempCoeffVocPct === "number" ? Math.abs(specs.tempCoeffVocPct) : positive(specs.tempCoeffVocPct);
  if (vocV == null || iscA == null || vmppV == null || imppA == null || coefficient == null || coefficient === 0) return null;
  return { vocV, iscA, vmppV, imppA, tempCoeffVocPct: coefficient };
}

export function inverterElectricalOf(name: string, specs: Record<string, unknown>): InverterElectrical {
  const whole = (value: unknown) => {
    const number = positive(value);
    return number == null ? null : Math.max(1, Math.round(number));
  };
  return {
    name,
    acPowerKw: positive(specs.acPowerKw),
    trackers: Math.min(WIRING_LIMITS.trackers, whole(specs.mppt) ?? 1),
    stringsPerTracker: whole(specs.stringsPerMppt),
    maxDcVoltageV: positive(specs.maxDcVoltageV),
    mppMinV: positive(specs.mppMinV),
    mppMaxV: positive(specs.mppMaxV),
    maxInputCurrentA: positive(specs.maxInputCurrentA),
    maxShortCircuitCurrentA: positive(specs.maxShortCircuitCurrentA),
    maxDcPowerKw: positive(specs.maxDcPowerKw),
  };
}

/** Spannung bei anderer Zelltemperatur. Der Koeffizient ist negativ gemeint, egal mit welchem Vorzeichen er eingetragen ist. */
export function voltageAt(voltageV: number, tempCoeffPct: number, cellTempC: number): number {
  return voltageV * (1 - (Math.abs(tempCoeffPct) / 100) * (cellTempC - 25));
}

/** Wie viele Module in Reihe passen: höchstens wegen der Leerlaufspannung bei Kälte, mindestens wegen des MPP-Bereichs bei Hitze. */
export function modulesPerString(module: ModuleElectrical | null, inverter: InverterElectrical | null): { max: number | null; min: number | null } {
  if (!module || !inverter) return { max: null, min: null };
  const cold = voltageAt(module.vocV, module.tempCoeffVocPct, DESIGN_TEMPS.coldC);
  const hot = voltageAt(module.vmppV, module.tempCoeffVocPct, DESIGN_TEMPS.hotC);
  return {
    max: inverter.maxDcVoltageV && cold > 0 ? Math.max(1, Math.floor(inverter.maxDcVoltageV / cold)) : null,
    min: inverter.mppMinV && hot > 0 ? Math.max(1, Math.ceil(inverter.mppMinV / hot)) : null,
  };
}

export type StringFacts = {
  id: string;
  count: number;
  kwp: number;
  /** Leerlaufspannung bei −10 °C, Spannung im Arbeitspunkt bei 70 °C und bei 25 °C. `null`, wenn Datenblattwerte fehlen. */
  vocColdV: number | null;
  vmppHotV: number | null;
  vmppV: number | null;
  iscA: number | null;
  imppA: number | null;
  /** Module zeigen in verschiedene Richtungen oder sind verschieden geneigt. */
  mixedOrientation: boolean;
  mixedModules: boolean;
};

export type TrackerFacts = { number: number; strings: string[]; capacity: number | null; imppA: number | null; iscA: number | null };
export type InverterFacts = { id: string; catalogItemId: string; name: string; known: boolean; dcKwp: number; acKw: number | null; ratioPct: number | null; trackers: TrackerFacts[] };
export type Finding = { level: "fehler" | "warnung" | "hinweis"; text: string; string?: string; inverter?: string };
export type WiringReport = { strings: Map<string, StringFacts>; inverters: InverterFacts[]; findings: Finding[]; modules: number; wired: number; free: number };

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;
const volts = (value: number) => `${String(round(value, 0)).replace(".", ",")} V`;
const amps = (value: number) => `${round(value, 1).toFixed(1).replace(".", ",")} A`;

/**
 * Kennwerte je String und Wechselrichter und die Liste der Auffälligkeiten.
 * `moduleOf` und `inverterOf` liefern die Datenblattwerte zu einem Katalogartikel oder `null`.
 */
export function checkWiring(
  buildings: BuildingSpec[],
  wiring: Wiring,
  moduleOf: (catalogItemId: string | null) => ModuleElectrical | null,
  inverterOf: (catalogItemId: string) => InverterElectrical | null,
): WiringReport {
  const { byString, free } = membership(buildings);
  const lookup = new Map<string, { plan: FacePlan; tilt: number; azimuth: number }>();
  for (const building of buildings) {
    for (const face of buildRoof(building).faces) {
      const plan = building.plans?.[face.edge];
      if (plan) lookup.set(`${building.id}|${face.edge}`, { plan, tilt: face.tiltDeg, azimuth: face.azimuthDeg });
    }
  }
  const findings: Finding[] = [];
  const strings = new Map<string, StringFacts>();
  let noData = false;
  for (const spec of wiring.strings) {
    const refs = byString.get(spec.id) ?? [];
    let watts = 0;
    let voc: number | null = 0;
    let vmpp: number | null = 0;
    let hot: number | null = 0;
    let isc: number | null = null;
    let impp: number | null = null;
    const directions = new Set<string>();
    const kinds = new Set<string>();
    for (const ref of refs) {
      const face = lookup.get(`${ref.building}|${ref.edge}`);
      const placement = face?.plan.placement;
      if (!face || !placement) continue;
      watts += placement.powerWp;
      directions.add(`${Math.round(face.tilt)}|${Math.round(face.azimuth)}`);
      kinds.add(placement.catalogItemId ?? `${placement.powerWp}`);
      const data = moduleOf(placement.catalogItemId);
      if (!data) {
        voc = vmpp = hot = null;
        continue;
      }
      if (voc != null) voc += voltageAt(data.vocV, data.tempCoeffVocPct, DESIGN_TEMPS.coldC);
      if (vmpp != null) vmpp += data.vmppV;
      if (hot != null) hot += voltageAt(data.vmppV, data.tempCoeffVocPct, DESIGN_TEMPS.hotC);
      /* In Reihe bestimmt das schwächste Modul den Strom, für die Absicherung zählt der größte Kurzschlussstrom. */
      isc = isc == null ? data.iscA : Math.max(isc, data.iscA);
      impp = impp == null ? data.imppA : Math.min(impp, data.imppA);
    }
    const known = refs.length > 0 && voc != null;
    if (refs.length > 0 && !known) noData = true;
    const facts: StringFacts = {
      id: spec.id,
      count: refs.length,
      kwp: Math.round(watts) / 1000,
      vocColdV: known ? voc : null,
      vmppHotV: known ? hot : null,
      vmppV: known ? vmpp : null,
      iscA: known ? isc : null,
      imppA: known ? impp : null,
      mixedOrientation: directions.size > 1,
      mixedModules: kinds.size > 1,
    };
    strings.set(spec.id, facts);
    if (refs.length === 0) findings.push({ level: "hinweis", text: `String ${spec.name} hat noch keine Module.`, string: spec.id });
    if (facts.mixedOrientation) findings.push({ level: "warnung", text: `String ${spec.name} verbindet Module mit unterschiedlicher Ausrichtung oder Neigung. Das kostet Ertrag, wenn keine Optimierer verbaut sind.`, string: spec.id });
    if (facts.mixedModules) findings.push({ level: "warnung", text: `String ${spec.name} mischt verschiedene Module.`, string: spec.id });
    if (refs.length > 0 && spec.inverter == null) findings.push({ level: "hinweis", text: `String ${spec.name} ist noch keinem Wechselrichter zugeordnet.`, string: spec.id });
  }
  if (free.length > 0) findings.push({ level: "hinweis", text: `${free.length === 1 ? "Ein Modul liegt" : `${free.length} Module liegen`} in keinem String.` });
  if (noData) findings.push({ level: "hinweis", text: "Für mindestens ein Modul fehlen Datenblattwerte im Katalog (Voc, Isc, Vmpp, Impp, Temperaturkoeffizient). Spannung und Strom werden für diese Strings nicht geprüft." });

  const inverters: InverterFacts[] = wiring.inverters.map((unit, position) => {
    const data = inverterOf(unit.catalogItemId);
    const label = `${data?.name ?? "Wechselrichter"}${wiring.inverters.length > 1 ? ` (${position + 1})` : ""}`;
    const own = wiring.strings.filter((entry) => entry.inverter === unit.id);
    const dcKwp = round(own.reduce((sum, entry) => sum + (strings.get(entry.id)?.kwp ?? 0), 0), 3);
    const count = Math.max(1, Math.min(WIRING_LIMITS.trackers, data?.trackers ?? 1));
    const trackers: TrackerFacts[] = Array.from({ length: count }, (_, index) => {
      const here = own.filter((entry) => entry.tracker === index + 1);
      const facts = here.map((entry) => strings.get(entry.id));
      const sum = (pick: (entry: StringFacts) => number | null) => (facts.length > 0 && facts.every((entry) => entry && pick(entry) != null) ? facts.reduce((total, entry) => total + (pick(entry as StringFacts) ?? 0), 0) : null);
      return { number: index + 1, strings: here.map((entry) => entry.id), capacity: data?.stringsPerTracker ?? null, imppA: sum((entry) => entry.imppA), iscA: sum((entry) => entry.iscA) };
    });
    const acKw = data?.acPowerKw ?? null;
    const ratioPct = acKw && acKw > 0 && dcKwp > 0 ? Math.round((dcKwp / acKw) * 100) : null;
    const tag = { inverter: unit.id };
    if (!data) findings.push({ level: "hinweis", text: `${label} fehlt im Katalog oder ist nicht mehr aktiv. Seine Grenzwerte werden nicht geprüft.`, ...tag });
    if (own.length === 0) findings.push({ level: "hinweis", text: `An ${label} hängt noch kein String.`, ...tag });
    for (const entry of own) {
      if (entry.tracker == null || entry.tracker > count) findings.push({ level: "hinweis", text: `String ${entry.name} braucht noch einen MPP-Tracker an ${label}.`, string: entry.id, ...tag });
    }
    if (data) {
      if (ratioPct != null && ratioPct > 150) findings.push({ level: "warnung", text: `${label} ist für ${String(dcKwp).replace(".", ",")} kWp deutlich zu klein (${ratioPct} % der AC-Leistung).`, ...tag });
      else if (ratioPct != null && ratioPct > 130) findings.push({ level: "hinweis", text: `${label} ist knapp bemessen (${ratioPct} % der AC-Leistung). Üblich sind 100 bis 130 %.`, ...tag });
      else if (ratioPct != null && ratioPct < 70) findings.push({ level: "hinweis", text: `${label} ist groß gewählt (${ratioPct} % der AC-Leistung).`, ...tag });
      if (data.maxDcPowerKw != null && dcKwp > data.maxDcPowerKw + 1e-6) findings.push({ level: "fehler", text: `${label}: ${String(dcKwp).replace(".", ",")} kWp liegen über der zulässigen DC-Leistung von ${String(data.maxDcPowerKw).replace(".", ",")} kW.`, ...tag });
      for (const entry of own) {
        const facts = strings.get(entry.id);
        if (!facts || facts.vocColdV == null || facts.vmppHotV == null || facts.vmppV == null) continue;
        const where = { string: entry.id, ...tag };
        if (data.maxDcVoltageV != null && facts.vocColdV > data.maxDcVoltageV) findings.push({ level: "fehler", text: `String ${entry.name}: ${volts(facts.vocColdV)} Leerlaufspannung bei ${DESIGN_TEMPS.coldC} °C liegen über den ${volts(data.maxDcVoltageV)} von ${label}. Weniger Module in Reihe.`, ...where });
        if (data.mppMinV != null && facts.vmppHotV < data.mppMinV) findings.push({ level: "warnung", text: `String ${entry.name}: ${volts(facts.vmppHotV)} bei ${DESIGN_TEMPS.hotC} °C liegen unter dem MPP-Bereich von ${label} (ab ${volts(data.mppMinV)}). Mehr Module in Reihe.`, ...where });
        if (data.mppMaxV != null && facts.vmppV > data.mppMaxV) findings.push({ level: "warnung", text: `String ${entry.name}: ${volts(facts.vmppV)} im Arbeitspunkt liegen über dem MPP-Bereich von ${label} (bis ${volts(data.mppMaxV)}).`, ...where });
      }
      for (const tracker of trackers) {
        const names = tracker.strings.map((id) => wiring.strings.find((entry) => entry.id === id)?.name ?? "?").join(", ");
        const at = `${label}, MPP-Tracker ${tracker.number}`;
        if (tracker.capacity != null && tracker.strings.length > tracker.capacity) findings.push({ level: "fehler", text: `${at}: ${tracker.strings.length} Strings (${names}), Platz ist für ${tracker.capacity}.`, ...tag });
        if (data.maxInputCurrentA != null && tracker.imppA != null && tracker.imppA > data.maxInputCurrentA + 1e-6) findings.push({ level: "warnung", text: `${at}: ${amps(tracker.imppA)} Betriebsstrom liegen über dem Eingangsstrom von ${amps(data.maxInputCurrentA)}. Der Wechselrichter regelt dann ab.`, ...tag });
        if (data.maxShortCircuitCurrentA != null && tracker.iscA != null && tracker.iscA > data.maxShortCircuitCurrentA + 1e-6) findings.push({ level: "fehler", text: `${at}: ${amps(tracker.iscA)} Kurzschlussstrom liegen über den zulässigen ${amps(data.maxShortCircuitCurrentA)}.`, ...tag });
        const parallel = tracker.strings.map((id) => strings.get(id)).filter((entry): entry is StringFacts => entry != null && entry.count > 0);
        if (parallel.length > 1 && new Set(parallel.map((entry) => entry.count)).size > 1) findings.push({ level: "warnung", text: `${at}: Die Strings ${names} sind unterschiedlich lang. Parallel an einem Tracker sollten sie gleich viele Module haben.`, ...tag });
      }
    }
    return { id: unit.id, catalogItemId: unit.catalogItemId, name: label, known: Boolean(data), dcKwp, acKw, ratioPct, trackers };
  });
  const wired = [...byString.values()].reduce((sum, refs) => sum + refs.length, 0);
  if (wired > 0 && wiring.inverters.length === 0) findings.push({ level: "hinweis", text: "Es ist noch kein Wechselrichter gewählt." });
  const rank = { fehler: 0, warnung: 1, hinweis: 2 } as const;
  findings.sort((a, b) => rank[a.level] - rank[b.level]);
  return { strings, inverters, findings, modules: wired + free.length, wired, free: free.length };
}

/**
 * Verteilt Strings ohne Platz der Reihe nach auf freie MPP-Tracker. Ohne Angabe im Katalog gilt ein String je Tracker.
 * Mit `only` bekommen nur die genannten Strings einen Platz, etwa die mit Modulen.
 */
export function autoAssign(wiring: Wiring, inverterOf: (catalogItemId: string) => InverterElectrical | null, only?: (stringId: string) => boolean): Wiring {
  const load = new Map<string, number>();
  const slots = wiring.inverters.flatMap((unit) => {
    const data = inverterOf(unit.catalogItemId);
    const trackers = Math.max(1, Math.min(WIRING_LIMITS.trackers, data?.trackers ?? 1));
    return Array.from({ length: trackers }, (_, index) => ({ inverter: unit.id, tracker: index + 1, capacity: Math.max(1, data?.stringsPerTracker ?? 1) }));
  });
  for (const entry of wiring.strings) {
    if (entry.inverter != null && entry.tracker != null) load.set(`${entry.inverter}|${entry.tracker}`, (load.get(`${entry.inverter}|${entry.tracker}`) ?? 0) + 1);
  }
  let changed = false;
  const strings = wiring.strings.map((entry) => {
    if ((entry.inverter != null && entry.tracker != null) || (only && !only(entry.id))) return entry;
    const slot = slots.find((candidate) => (entry.inverter == null || candidate.inverter === entry.inverter) && (load.get(`${candidate.inverter}|${candidate.tracker}`) ?? 0) < candidate.capacity);
    if (!slot) return entry;
    load.set(`${slot.inverter}|${slot.tracker}`, (load.get(`${slot.inverter}|${slot.tracker}`) ?? 0) + 1);
    changed = true;
    return { ...entry, inverter: slot.inverter, tracker: slot.tracker };
  });
  return changed ? { ...wiring, strings } : wiring;
}

/* ---------- Speichern ---------- */

const ID = /^[A-Za-z0-9:_-]{1,60}$/;

/** Prüft gespeicherte oder vom Browser gesendete Verschaltung. Unbrauchbares ergibt `null`. */
export function parsePlanning(value: unknown): VariantPlanning | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return null;
  const inverters: InverterUnit[] = [];
  for (const entry of Array.isArray(raw.inverters) ? raw.inverters.slice(0, WIRING_LIMITS.inverters) : []) {
    const item = entry as Record<string, unknown> | null;
    if (!item || typeof item.id !== "string" || !ID.test(item.id) || typeof item.catalogItemId !== "string" || !ID.test(item.catalogItemId)) continue;
    if (!inverters.some((unit) => unit.id === item.id)) inverters.push({ id: item.id, catalogItemId: item.catalogItemId });
  }
  const strings: StringSpec[] = [];
  for (const entry of Array.isArray(raw.strings) ? raw.strings.slice(0, WIRING_LIMITS.strings) : []) {
    const item = entry as Record<string, unknown> | null;
    if (!item || typeof item.id !== "string" || !ID.test(item.id) || strings.some((known) => known.id === item.id)) continue;
    const inverter = typeof item.inverter === "string" && inverters.some((unit) => unit.id === item.inverter) ? item.inverter : null;
    const tracker = Number(item.tracker);
    strings.push({
      id: item.id,
      name: (typeof item.name === "string" ? item.name.trim().slice(0, 12) : "") || nextStringName(strings),
      color: typeof item.color === "string" && /^#[0-9a-fA-F]{6}$/.test(item.color) ? item.color.toLowerCase() : nextStringColor(strings),
      inverter,
      tracker: inverter && Number.isInteger(tracker) && tracker >= 1 && tracker <= WIRING_LIMITS.trackers ? tracker : null,
    });
  }
  return inverters.length === 0 && strings.length === 0 ? null : { version: 1, inverters, strings };
}
