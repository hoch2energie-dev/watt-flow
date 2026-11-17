import type { OfferDTO, Specs, VariantDTO } from "@/lib/domain";
import { yieldRequestKey } from "@/lib/pvgis/faces";
import { normalizeMounting, type RoofFaceInput } from "@/lib/pvgis/types";
import { parseRoofGeometry } from "@/lib/roof/parse";
import { parseTenantPower } from "@/lib/tenant-power";

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function specsOf(value: unknown): Specs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const specs: Specs = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "number" && Number.isFinite(entry)) specs[key.slice(0, 40)] = entry;
    else if (typeof entry === "string") specs[key.slice(0, 40)] = entry.slice(0, 200);
    else if (typeof entry === "boolean" || entry === null) specs[key.slice(0, 40)] = entry;
  }
  return specs;
}

export function sanitizeOffer(input: unknown): OfferDTO {
  if (!input || typeof input !== "object") throw new Error("Die Angebotsdaten sind unvollständig.");
  const raw = input as Partial<OfferDTO>;
  if (!Array.isArray(raw.variants) || raw.variants.length === 0) {
    throw new Error("Ein Angebot braucht mindestens eine Variante.");
  }
  if (raw.variants.length > 8) throw new Error("Mehr als acht Varianten sind nicht vorgesehen.");

  const variants = raw.variants.map((variant, index) => sanitizeVariant(variant, index));
  const latitude = raw.latitude == null || raw.latitude === ("" as unknown) ? null : clamp(num(raw.latitude), -90, 90);
  const longitude = raw.longitude == null || raw.longitude === ("" as unknown) ? null : clamp(num(raw.longitude), -180, 180);
  for (const variant of variants) alignYield(variant, latitude, longitude);
  if (!variants.some((variant) => variant.recommended)) variants[0].recommended = true;
  let recommendedSeen = false;
  for (const variant of variants) {
    if (variant.recommended && recommendedSeen) variant.recommended = false;
    if (variant.recommended) recommendedSeen = true;
  }

  const year = raw.buildingYear == null || raw.buildingYear === ("" as unknown) ? null : Math.round(num(raw.buildingYear));
  return {
    id: text(raw.id, 80),
    number: text(raw.number, 40),
    title: text(raw.title, 180) || "Angebot",
    status: raw.status ?? "ENTWURF",
    stageId: raw.stageId ? text(raw.stageId, 80) : null,
    requestId: text(raw.requestId, 80),
    householdKwh: clamp(num(raw.householdKwh), 0, 500000),
    heatPumpElectricKwh: clamp(num(raw.heatPumpElectricKwh), 0, 500000),
    heatPumpThermalKwh: clamp(num(raw.heatPumpThermalKwh), 0, 1000000),
    evKwh: clamp(num(raw.evKwh), 0, 200000),
    otherKwh: clamp(num(raw.otherKwh), 0, 500000),
    electricityPriceEur: clamp(num(raw.electricityPriceEur, 0.32), 0, 2),
    priceIncreasePct: clamp(num(raw.priceIncreasePct, 3), -10, 20),
    buildingType: text(raw.buildingType, 80),
    buildingYear: year != null && year >= 1800 && year <= 2100 ? year : null,
    roofType: text(raw.roofType, 80),
    orientation: text(raw.orientation, 40),
    tiltDeg: raw.tiltDeg == null ? null : clamp(num(raw.tiltDeg), 0, 90),
    roofAreaM2: raw.roofAreaM2 == null ? null : clamp(num(raw.roofAreaM2), 0, 100000),
    monumentProtected: Boolean(raw.monumentProtected),
    buildingNote: text(raw.buildingNote, 2000),
    existingPvKwp: clamp(num(raw.existingPvKwp), 0, 5000),
    existingBatteryKwh: clamp(num(raw.existingBatteryKwh), 0, 5000),
    existingWallbox: Boolean(raw.existingWallbox),
    existingHeating: text(raw.existingHeating, 80),
    latitude: raw.latitude == null || raw.latitude === ("" as unknown) ? null : clamp(num(raw.latitude), -90, 90),
    longitude: raw.longitude == null || raw.longitude === ("" as unknown) ? null : clamp(num(raw.longitude), -180, 180),
    locationSource: text(raw.locationSource, 40),
    locationLabel: text(raw.locationLabel, 240),
    vatZeroEligible: Boolean(raw.vatZeroEligible),
    vatDeductible: Boolean(raw.vatDeductible),
    validUntil: typeof raw.validUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.validUntil) ? raw.validUntil : null,
    signedAt: null,
    tenantPower: parseTenantPower(raw.tenantPower),
    variants,
  };
}

function sanitizeVariant(input: unknown, index: number): VariantDTO {
  if (!input || typeof input !== "object") throw new Error("Eine Variante ist unvollständig.");
  const raw = input as Partial<VariantDTO>;
  const id = text(raw.id, 80);
  if (!id) throw new Error("Einer Variante fehlt die Kennung.");
  const lines = Array.isArray(raw.lines) ? raw.lines.slice(0, 80) : [];
  const mode = raw.paymentMode === "FINANZIERUNG" || raw.paymentMode === "RATEN" ? raw.paymentMode : "BAR";
  return {
    id,
    name: text(raw.name, 80) || `Variante ${index + 1}`,
    sortOrder: index,
    recommended: Boolean(raw.recommended),
    specificYield: clamp(num(raw.specificYield, 950), 0, 2500),
    yieldProvider: text(raw.yieldProvider, 40) || "specific",
    degradationPct: clamp(num(raw.degradationPct, 0.5), 0, 5),
    horizonYears: clamp(Math.round(num(raw.horizonYears, 20)), 10, 30),
    eegTariffEur: clamp(num(raw.eegTariffEur, 0.08), 0, 1),
    postEegTariffEur: clamp(num(raw.postEegTariffEur, 0.04), 0, 1),
    opexEurPerYear: clamp(num(raw.opexEurPerYear), 0, 20000),
    batteryCyclesPerYear: clamp(Math.round(num(raw.batteryCyclesPerYear, 220)), 0, 400),
    paymentMode: mode,
    rebateNet: clamp(num(raw.rebateNet), 0, 1000000),
    downPayment: clamp(num(raw.downPayment), 0, 2000000),
    financeYears: clamp(Math.round(num(raw.financeYears, 15)), 1, 30),
    financeInterestPct: clamp(num(raw.financeInterestPct, 4.5), 0, 20),
    instalmentCount: clamp(Math.round(num(raw.instalmentCount, 12)), 1, 120),
    instalmentIntervalMonths: clamp(Math.round(num(raw.instalmentIntervalMonths, 1)), 1, 12),
    instalmentInterestPct: clamp(num(raw.instalmentInterestPct), 0, 20),
    kwpOverride: raw.kwpOverride == null ? null : clamp(num(raw.kwpOverride), 0, 5000),
    kwpManual: Boolean(raw.kwpManual),
    faces: Array.isArray(raw.faces) ? raw.faces.slice(0, 16).map(sanitizeFace) : [],
    yieldAnnualKwh: raw.yieldAnnualKwh == null ? null : clamp(num(raw.yieldAnnualKwh), 0, 5000000),
    yieldMonthlyKwh: monthly(raw.yieldMonthlyKwh),
    yieldNotice: text(raw.yieldNotice, 400),
    yieldKey: text(raw.yieldKey, 400),
    lines: lines.map((line, lineIndex) => {
      const entry = line as VariantDTO["lines"][number];
      const lineId = text(entry?.id, 80);
      if (!lineId) throw new Error("Einer Position fehlt die Kennung.");
      const name = text(entry.name, 180);
      if (!name) throw new Error("Eine Position hat keinen Namen.");
      return {
        id: lineId,
        catalogItemId: entry.catalogItemId ? text(entry.catalogItemId, 80) : null,
        typeKey: entry.typeKey ? text(entry.typeKey, 40) : null,
        section: text(entry.section, 40) || "extra",
        name,
        description: text(entry.description, 500) || null,
        quantity: clamp(num(entry.quantity, 1), 0, 100000),
        unit: text(entry.unit, 40) || "Stk",
        unitPriceNet: clamp(num(entry.unitPriceNet), 0, 1000000),
        purchasePriceNet: clamp(num(entry.purchasePriceNet), 0, 1000000),
        discountPercent: clamp(num(entry.discountPercent), 0, 100),
        vatCategory: entry.vatCategory === "PV_NULL" ? "PV_NULL" : "REGEL",
        specs: specsOf(entry.specs),
        sortOrder: lineIndex,
      };
    }),
  };
}

function sanitizeFace(input: unknown, index: number): RoofFaceInput {
  const raw = (input ?? {}) as Partial<RoofFaceInput>;
  return {
    id: text(raw.id, 80) || `face-${index}`,
    name: text(raw.name, 80) || `Fläche ${index + 1}`,
    kwp: clamp(num(raw.kwp), 0, 5000),
    tiltDeg: clamp(num(raw.tiltDeg, 30), 0, 90),
    azimuthDeg: ((num(raw.azimuthDeg, 180) % 360) + 360) % 360,
    mounting: normalizeMounting(raw.mounting),
    lossesPercent: clamp(num(raw.lossesPercent, 14), 0, 40),
    geometry: parseRoofGeometry(raw.geometry),
  };
}

function monthly(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== 12) return null;
  const numbers = value.map((entry) => clamp(num(entry), 0, 200000));
  return numbers.every((entry) => Number.isFinite(entry)) ? numbers : null;
}

function alignYield(variant: VariantDTO, latitude: number | null, longitude: number | null) {
  const key = latitude != null && longitude != null ? yieldRequestKey(latitude, longitude, variant.faces) : "";
  const fresh = variant.yieldProvider === "pvgis" && variant.yieldKey === key && variant.yieldMonthlyKwh?.length === 12;
  if (fresh) return;
  if (variant.yieldProvider === "pvgis") {
    variant.yieldNotice = variant.yieldNotice || "Die Dachflächen oder der Standort haben sich geändert. Bitte den Ertrag neu berechnen.";
  }
  variant.yieldProvider = variant.yieldProvider === "pvgis" ? "specific" : variant.yieldProvider || "specific";
  if (!fresh) {
    variant.yieldMonthlyKwh = variant.yieldProvider === "pvgis" ? variant.yieldMonthlyKwh : null;
    if (variant.yieldProvider !== "pvgis") variant.yieldKey = "";
  }
}
