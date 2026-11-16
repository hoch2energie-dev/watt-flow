"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sanitizeOffer } from "@/lib/sanitize-offer";
import { nextNumber } from "@/lib/sequence";
import { ensureSettings, variantDefaultsFromSettings } from "@/lib/settings";

const offerInclude = {
  variants: { include: { lines: true }, orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.OfferInclude;

export async function createOffer(requestId: string) {
  const user = await requireUser();
  const request = await prisma.request.findUnique({ where: { id: requestId } });
  if (!request) throw new Error("Anfrage nicht gefunden.");
  const settings = await ensureSettings();
  const defaults = variantDefaultsFromSettings(settings);
  const stage = await prisma.kanbanStage.findFirst({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const validUntil = new Date();
  validUntil.setUTCDate(validUntil.getUTCDate() + settings.offerValidityDays);

  const offer = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, "AG");
    const created = await tx.offer.create({
      data: {
        number,
        requestId,
        title: request.title,
        stageId: stage?.id,
        authorId: user.id,
        electricityPriceEur: settings.defaultElectricityPrice,
        priceIncreasePct: settings.defaultPriceIncrease,
        vatZeroEligible: request.segment === "HAUSHALT",
        vatDeductible: request.segment === "GEWERBE",
        validUntil,
        buildingType: request.segment === "GEWERBE" ? "Gewerbe" : "Einfamilienhaus",
      },
    });
    await tx.offerVariant.create({
      data: {
        offerId: created.id,
        name: "Standard",
        sortOrder: 0,
        recommended: true,
        specificYield: defaults.specificYield,
        degradationPct: defaults.degradationPct,
        horizonYears: defaults.horizonYears,
        eegTariffEur: defaults.eegTariffEur,
        postEegTariffEur: defaults.postEegTariffEur,
        opexEurPerYear: defaults.opexEurPerYear,
        batteryCyclesPerYear: defaults.batteryCyclesPerYear,
      },
    });
    if (!["GEWONNEN", "VERLOREN", "UNGEEIGNET"].includes(request.status)) {
      await tx.request.update({ where: { id: requestId }, data: { status: "ANGEBOT_ERSTELLT" } });
    }
    return created;
  });

  revalidatePath("/angebote");
  revalidatePath("/board");
  revalidatePath(`/anfragen/${requestId}`);
  redirect(`/angebote/${offer.id}`);
}

export async function saveOffer(input: unknown) {
  const user = await requireUser();
  let offer;
  try {
    offer = sanitizeOffer(input);
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Ungültige Daten." };
  }
  const existing = await prisma.offer.findUnique({ where: { id: offer.id }, include: offerInclude });
  if (!existing) return { ok: false as const, error: "Angebot nicht gefunden." };
  if (existing.status === "ANGENOMMEN" && user.role !== "ADMIN") {
    return { ok: false as const, error: "Angenommene Angebote sind gesperrt." };
  }
  if (existing.status === "ANGENOMMEN") {
    return { ok: false as const, error: "Bitte heben Sie zuerst die Sperre auf." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.offer.update({
      where: { id: offer.id },
      data: {
        title: offer.title,
        householdKwh: offer.householdKwh,
        heatPumpElectricKwh: offer.heatPumpElectricKwh,
        heatPumpThermalKwh: offer.heatPumpThermalKwh,
        evKwh: offer.evKwh,
        otherKwh: offer.otherKwh,
        electricityPriceEur: offer.electricityPriceEur,
        priceIncreasePct: offer.priceIncreasePct,
        buildingType: offer.buildingType,
        buildingYear: offer.buildingYear,
        roofType: offer.roofType,
        orientation: offer.orientation,
        tiltDeg: offer.tiltDeg,
        roofAreaM2: offer.roofAreaM2,
        monumentProtected: offer.monumentProtected,
        buildingNote: offer.buildingNote,
        existingPvKwp: offer.existingPvKwp,
        existingBatteryKwh: offer.existingBatteryKwh,
        existingWallbox: offer.existingWallbox,
        existingHeating: offer.existingHeating,
        latitude: offer.latitude,
        longitude: offer.longitude,
        locationSource: offer.locationSource,
        locationLabel: offer.locationLabel,
        vatZeroEligible: offer.vatZeroEligible,
        vatDeductible: offer.vatDeductible,
        validUntil: offer.validUntil ? new Date(`${offer.validUntil}T12:00:00.000Z`) : null,
      },
    });

    await tx.roofFace.deleteMany({ where: { variant: { offerId: offer.id } } });
    await tx.offerLine.deleteMany({ where: { variant: { offerId: offer.id } } });
    const ids = offer.variants.map((variant) => variant.id);
    await tx.offerVariant.deleteMany({ where: { offerId: offer.id, id: { notIn: ids } } });

    for (const variant of offer.variants) {
      const foreign = await tx.offerVariant.findUnique({ where: { id: variant.id } });
      if (foreign && foreign.offerId !== offer.id) {
        throw new Error("Eine Variante gehört zu einem anderen Angebot.");
      }
      const data = {
        offerId: offer.id,
        name: variant.name,
        sortOrder: variant.sortOrder,
        recommended: variant.recommended,
        specificYield: variant.specificYield,
        yieldProvider: variant.yieldProvider || "specific",
        degradationPct: variant.degradationPct,
        horizonYears: variant.horizonYears,
        eegTariffEur: variant.eegTariffEur,
        postEegTariffEur: variant.postEegTariffEur,
        opexEurPerYear: variant.opexEurPerYear,
        batteryCyclesPerYear: variant.batteryCyclesPerYear,
        paymentMode: variant.paymentMode,
        rebateNet: variant.rebateNet,
        downPayment: variant.downPayment,
        financeYears: variant.financeYears,
        financeInterestPct: variant.financeInterestPct,
        instalmentCount: variant.instalmentCount,
        instalmentIntervalMonths: variant.instalmentIntervalMonths,
        instalmentInterestPct: variant.instalmentInterestPct,
        kwpOverride: variant.kwpOverride,
        kwpManual: variant.kwpManual,
        yieldAnnualKwh: variant.yieldAnnualKwh,
        yieldMonthlyKwh: variant.yieldMonthlyKwh ?? Prisma.JsonNull,
        yieldNotice: variant.yieldNotice,
        yieldKey: variant.yieldKey,
        yieldCalculatedAt: variant.yieldProvider === "pvgis" ? new Date() : null,
      };
      await tx.offerVariant.upsert({ where: { id: variant.id }, create: { id: variant.id, ...data }, update: data });
      if (variant.faces.length > 0) {
        await tx.roofFace.createMany({
          data: variant.faces.map((face, index) => ({
            id: face.id,
            variantId: variant.id,
            name: face.name,
            sortOrder: index,
            kwp: face.kwp,
            tiltDeg: face.tiltDeg,
            azimuthDeg: face.azimuthDeg,
            mounting: face.mounting,
            lossesPercent: face.lossesPercent,
            geometry: face.geometry ? (face.geometry as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          })),
        });
      }
      if (variant.lines.length > 0) {
        await tx.offerLine.createMany({
          data: variant.lines.map((line) => ({
            id: line.id,
            variantId: variant.id,
            catalogItemId: line.catalogItemId,
            typeKey: line.typeKey,
            section: line.section,
            name: line.name,
            description: line.description,
            quantity: line.quantity,
            unit: line.unit,
            unitPriceNet: line.unitPriceNet,
            purchasePriceNet: line.purchasePriceNet,
            discountPercent: line.discountPercent,
            vatCategory: line.vatCategory,
            specs: line.specs as Prisma.InputJsonValue,
            sortOrder: line.sortOrder,
          })),
        });
      }
    }
  });

  revalidatePath(`/angebote/${offer.id}`);
  revalidatePath("/angebote");
  revalidatePath("/board");
  return { ok: true as const };
}

export async function setOfferStatus(id: string, status: "ENTWURF" | "VERSENDET" | "ABGELEHNT") {
  await requireUser();
  const offer = await prisma.offer.findUnique({ where: { id } });
  if (!offer) return { ok: false as const, error: "Angebot nicht gefunden." };
  if (offer.status === "ANGENOMMEN") return { ok: false as const, error: "Das Angebot ist angenommen und gesperrt." };
  await prisma.offer.update({ where: { id }, data: { status } });
  revalidatePath(`/angebote/${id}`);
  revalidatePath("/board");
  return { ok: true as const };
}

export async function unlockOffer(id: string) {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false as const, error: "Nur die Administration kann die Sperre aufheben." };
  await prisma.offer.update({ where: { id }, data: { status: "ENTWURF" } });
  revalidatePath(`/angebote/${id}`);
  return { ok: true as const };
}

export async function deleteOffer(id: string) {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Nur die Administration kann Angebote löschen.");
  const offer = await prisma.offer.findUnique({ where: { id } });
  if (!offer) throw new Error("Angebot nicht gefunden.");
  if (offer.status === "ANGENOMMEN") throw new Error("Angenommene Angebote bleiben erhalten.");
  await prisma.offer.delete({ where: { id } });
  revalidatePath("/angebote");
  revalidatePath("/board");
  redirect("/angebote");
}

export async function moveOffer(id: string, stageId: string) {
  await requireUser();
  const stage = await prisma.kanbanStage.findUnique({ where: { id: stageId } });
  if (!stage || !stage.active) return { ok: false as const, error: "Diese Spalte gibt es nicht." };
  await prisma.offer.update({ where: { id }, data: { stageId } });
  revalidatePath("/board");
  revalidatePath(`/angebote/${id}`);
  return { ok: true as const };
}
