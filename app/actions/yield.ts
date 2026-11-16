"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fetchPvgisPlane, pvgisCacheKey, type PlaneRequest } from "@/lib/pvgis/client";
import { sumFaceYields, yieldRequestKey } from "@/lib/pvgis/faces";
import { geocodeAddress } from "@/lib/pvgis/geocode";
import { normalizeMounting, type RoofFaceInput } from "@/lib/pvgis/types";

export type YieldComputation = {
  ok: true;
  latitude: number;
  longitude: number;
  locationLabel: string;
  locationSource: string;
  annualKwh: number;
  monthlyKwh: number[];
  specificYield: number;
  yieldKey: string;
  notice: string;
};

function planeOf(face: RoofFaceInput, latitude: number, longitude: number): PlaneRequest {
  return {
    latitude,
    longitude,
    kwp: face.kwp,
    tiltDeg: face.tiltDeg,
    azimuthDeg: face.azimuthDeg,
    lossesPercent: face.lossesPercent,
    mounting: face.mounting,
  };
}

async function cachedPlane(input: PlaneRequest) {
  const cacheKey = pvgisCacheKey(input);
  const cached = await prisma.pvgisCache.findUnique({ where: { cacheKey } });
  if (cached && cached.response && typeof cached.response === "object") {
    const stored = cached.response as { annualKwh?: unknown; monthlyKwh?: unknown };
    if (typeof stored.annualKwh === "number" && Array.isArray(stored.monthlyKwh)) {
      return { annualKwh: stored.annualKwh, monthlyKwh: stored.monthlyKwh.map(Number) };
    }
  }
  const result = await fetchPvgisPlane(input);
  await prisma.pvgisCache.upsert({
    where: { cacheKey },
    create: { cacheKey, response: result as unknown as Prisma.InputJsonValue },
    update: { response: result as unknown as Prisma.InputJsonValue },
  });
  return result;
}

async function resolveLocation(address: string, latitude: number | null, longitude: number | null) {
  if (latitude != null && longitude != null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
    return { latitude, longitude, label: "", source: "manuell" as const };
  }
  const query = address.trim().toLowerCase();
  if (!query) throw new Error("Für PVGIS fehlt der Standort. Tragen Sie Breite und Länge ein oder hinterlegen Sie die Objektadresse.");
  const cached = await prisma.geocodeCache.findUnique({ where: { query } });
  if (cached?.found && cached.latitude != null && cached.longitude != null) {
    return { latitude: Number(cached.latitude), longitude: Number(cached.longitude), label: cached.label, source: "nominatim" as const };
  }
  if (cached && !cached.found) throw new Error("Die Adresse wurde nicht gefunden. Bitte Breite und Länge von Hand eintragen.");
  const hit = await geocodeAddress(address);
  await prisma.geocodeCache.upsert({
    where: { query },
    create: {
      query,
      found: Boolean(hit),
      latitude: hit?.latitude,
      longitude: hit?.longitude,
      label: hit?.label ?? "",
    },
    update: {},
  });
  if (!hit) throw new Error("Die Adresse wurde nicht gefunden. Bitte Breite und Länge von Hand eintragen.");
  return { latitude: hit.latitude, longitude: hit.longitude, label: hit.label, source: "nominatim" as const };
}

export async function calculatePvgis(input: {
  offerId: string;
  variantId: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  systemKwp: number;
  faces: RoofFaceInput[];
}) {
  await requireUser();
  const offer = await prisma.offer.findUnique({ where: { id: input.offerId }, select: { id: true, status: true } });
  if (!offer) return { ok: false as const, notice: "Angebot nicht gefunden." };
  if (offer.status === "ANGENOMMEN") return { ok: false as const, notice: "Das angenommene Angebot ist gesperrt." };
  const variant = await prisma.offerVariant.findUnique({ where: { id: input.variantId }, select: { offerId: true } });
  if (!variant || variant.offerId !== offer.id) return { ok: false as const, notice: "Variante nicht gefunden." };
  const faces = input.faces.map((face) => ({ ...face, mounting: normalizeMounting(face.mounting) })).filter((face) => face.kwp > 0);
  if (faces.length === 0) return { ok: false as const, notice: "Bitte mindestens eine Dachfläche mit einer Leistung größer als 0 eintragen." };

  try {
    const location = await resolveLocation(input.address, input.latitude, input.longitude);
    const parts = [];
    for (const face of faces) parts.push(await cachedPlane(planeOf(face, location.latitude, location.longitude)));
    const summed = sumFaceYields(parts);
    const basis = input.systemKwp > 0 ? input.systemKwp : faces.reduce((sum, face) => sum + face.kwp, 0);
    const specificYield = basis > 0 ? summed.annualKwh / basis : 0;
    const yieldKey = yieldRequestKey(location.latitude, location.longitude, faces);
    await prisma.$transaction(async (tx) => {
      await tx.offer.update({
        where: { id: input.offerId },
        data: {
          latitude: location.latitude,
          longitude: location.longitude,
          locationSource: location.source,
          locationLabel: location.label,
        },
      });
      await tx.roofFace.deleteMany({ where: { variantId: input.variantId } });
      await tx.roofFace.createMany({
        data: input.faces.map((face, index) => ({
          id: face.id,
          variantId: input.variantId,
          name: face.name || `Fläche ${index + 1}`,
          sortOrder: index,
          kwp: face.kwp,
          tiltDeg: face.tiltDeg,
          azimuthDeg: face.azimuthDeg,
          mounting: normalizeMounting(face.mounting),
          lossesPercent: face.lossesPercent,
          geometry: face.geometry ? (face.geometry as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        })),
      });
      await tx.offerVariant.update({
        where: { id: input.variantId },
        data: {
          yieldProvider: "pvgis",
          specificYield,
          yieldAnnualKwh: summed.annualKwh,
          yieldMonthlyKwh: summed.monthlyKwh,
          yieldNotice: "",
          yieldKey,
          yieldCalculatedAt: new Date(),
        },
      });
    });
    revalidatePath(`/angebote/${input.offerId}`);
    const result: YieldComputation = {
      ok: true,
      latitude: location.latitude,
      longitude: location.longitude,
      locationLabel: location.label,
      locationSource: location.source,
      annualKwh: summed.annualKwh,
      monthlyKwh: summed.monthlyKwh,
      specificYield,
      yieldKey,
      notice: "",
    };
    return result;
  } catch (error) {
    const notice = error instanceof Error ? error.message : "PVGIS ist nicht erreichbar. Es gilt der spezifische Ertrag.";
    await prisma.offerVariant.update({
      where: { id: input.variantId },
      data: { yieldProvider: "specific", yieldNotice: notice, yieldMonthlyKwh: Prisma.JsonNull, yieldKey: "" },
    }).catch(() => undefined);
    return { ok: false as const, notice };
  }
}
