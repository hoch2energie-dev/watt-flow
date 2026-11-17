import type { CatalogItem, Offer, OfferLine, OfferVariant, RoofFace } from "@prisma/client";
import { asSpecs, type CatalogOption, type LineDTO, type OfferDTO, type VariantDTO } from "@/lib/domain";
import { normalizeMounting } from "@/lib/pvgis/types";
import { parseRoofGeometry } from "@/lib/roof/parse";
import { parsePlanning } from "@/lib/roof3d/strings";
import { isoDateInput } from "@/lib/format";
import { parseTenantPower } from "@/lib/tenant-power";

function dec(value: { toString(): string } | number | null | undefined): number {
  if (value == null) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function decOrNull(value: { toString(): string } | number | null | undefined): number | null {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function toLineDTO(line: OfferLine): LineDTO {
  return {
    id: line.id,
    catalogItemId: line.catalogItemId,
    typeKey: line.typeKey,
    section: line.section,
    name: line.name,
    description: line.description,
    quantity: dec(line.quantity),
    unit: line.unit,
    unitPriceNet: dec(line.unitPriceNet),
    purchasePriceNet: dec(line.purchasePriceNet),
    discountPercent: dec(line.discountPercent),
    vatCategory: line.vatCategory,
    specs: asSpecs(line.specs),
    sortOrder: line.sortOrder,
  };
}

function monthlyOf(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== 12) return null;
  const numbers = value.map((entry) => Number(entry));
  return numbers.every((entry) => Number.isFinite(entry)) ? numbers : null;
}

export function toVariantDTO(variant: OfferVariant & { lines: OfferLine[]; faces?: RoofFace[] }): VariantDTO {
  return {
    id: variant.id,
    name: variant.name,
    sortOrder: variant.sortOrder,
    recommended: variant.recommended,
    specificYield: dec(variant.specificYield),
    yieldProvider: variant.yieldProvider,
    degradationPct: dec(variant.degradationPct),
    horizonYears: variant.horizonYears,
    eegTariffEur: dec(variant.eegTariffEur),
    postEegTariffEur: dec(variant.postEegTariffEur),
    opexEurPerYear: dec(variant.opexEurPerYear),
    batteryCyclesPerYear: variant.batteryCyclesPerYear,
    paymentMode: variant.paymentMode,
    rebateNet: dec(variant.rebateNet),
    downPayment: dec(variant.downPayment),
    financeYears: variant.financeYears,
    financeInterestPct: dec(variant.financeInterestPct),
    instalmentCount: variant.instalmentCount,
    instalmentIntervalMonths: variant.instalmentIntervalMonths,
    instalmentInterestPct: dec(variant.instalmentInterestPct),
    kwpOverride: decOrNull(variant.kwpOverride),
    kwpManual: variant.kwpManual,
    faces: [...(variant.faces ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((face) => ({
        id: face.id,
        name: face.name,
        kwp: dec(face.kwp),
        tiltDeg: dec(face.tiltDeg),
        azimuthDeg: dec(face.azimuthDeg),
        mounting: normalizeMounting(face.mounting),
        lossesPercent: dec(face.lossesPercent) || 14,
        geometry: parseRoofGeometry(face.geometry),
      })),
    yieldAnnualKwh: decOrNull(variant.yieldAnnualKwh),
    yieldMonthlyKwh: monthlyOf(variant.yieldMonthlyKwh),
    yieldNotice: variant.yieldNotice,
    yieldKey: variant.yieldKey,
    planning: parsePlanning(variant.planning),
    lines: [...variant.lines].sort((a, b) => a.sortOrder - b.sortOrder).map(toLineDTO),
  };
}

export function toOfferDTO(offer: Offer & { variants: (OfferVariant & { lines: OfferLine[]; faces?: RoofFace[] })[] }): OfferDTO {
  return {
    id: offer.id,
    number: offer.number,
    title: offer.title,
    status: offer.status,
    stageId: offer.stageId,
    requestId: offer.requestId,
    householdKwh: dec(offer.householdKwh),
    heatPumpElectricKwh: dec(offer.heatPumpElectricKwh),
    heatPumpThermalKwh: dec(offer.heatPumpThermalKwh),
    evKwh: dec(offer.evKwh),
    otherKwh: dec(offer.otherKwh),
    electricityPriceEur: dec(offer.electricityPriceEur),
    priceIncreasePct: dec(offer.priceIncreasePct),
    buildingType: offer.buildingType,
    buildingYear: offer.buildingYear,
    roofType: offer.roofType,
    orientation: offer.orientation,
    tiltDeg: decOrNull(offer.tiltDeg),
    roofAreaM2: decOrNull(offer.roofAreaM2),
    monumentProtected: offer.monumentProtected,
    buildingNote: offer.buildingNote,
    existingPvKwp: dec(offer.existingPvKwp),
    existingBatteryKwh: dec(offer.existingBatteryKwh),
    existingWallbox: offer.existingWallbox,
    existingHeating: offer.existingHeating,
    latitude: decOrNull(offer.latitude),
    longitude: decOrNull(offer.longitude),
    locationSource: offer.locationSource,
    locationLabel: offer.locationLabel,
    vatZeroEligible: offer.vatZeroEligible,
    vatDeductible: offer.vatDeductible,
    validUntil: offer.validUntil ? isoDateInput(offer.validUntil) : null,
    signedAt: offer.signedAt ? offer.signedAt.toISOString() : null,
    tenantPower: parseTenantPower(offer.tenantPower),
    variants: [...offer.variants].sort((a, b) => a.sortOrder - b.sortOrder).map(toVariantDTO),
  };
}

export function toCatalogOption(item: CatalogItem): CatalogOption {
  return {
    id: item.id,
    typeKey: item.typeKey,
    manufacturer: item.manufacturer,
    model: item.model,
    name: item.name,
    unit: item.unit,
    purchasePriceNet: dec(item.purchasePriceNet),
    salesPriceNet: dec(item.salesPriceNet),
    vatCategory: item.vatCategory,
    specs: asSpecs(item.specs),
    description: item.description,
    active: item.active,
  };
}
