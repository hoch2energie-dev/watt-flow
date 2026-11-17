"use server";

import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findLocation } from "@/lib/locate";
import { horizonUrl, parseHorizon } from "@/lib/roof/horizon";
import { roofsFromCityJson } from "@/lib/roof/lod2";
import { inNrw, lod2ItemsUrl } from "@/lib/roof/sources";
import { blankGeometry } from "@/lib/roof/types";
import type { HorizonSample } from "@/lib/roof/types";
import { DEFAULT_SYSTEM_LOSSES, type RoofFaceInput } from "@/lib/pvgis/types";

const USER_AGENT = "Hoch2Angebote/1.0 (https://angebote.hoch2energie.de)";

type Located = { ok: true; latitude: number; longitude: number; label: string; source: "google" | "nominatim"; approximate: boolean } | { ok: false; notice: string };

/**
 * Sucht die Koordinaten zu einer Anschrift. Ist Google eingerichtet, fragt der Server dort an
 * (trifft in der Regel das Gebäude) und übernimmt nur Breite und Länge. Ohne Google, oder wenn
 * Google ausfällt, sucht OpenStreetMap.
 */
export async function locateAddress(address: string): Promise<Located> {
  await requireUser();
  if (address.trim().length < 3) return { ok: false, notice: "Bitte eine vollständigere Adresse eingeben." };
  try {
    const hit = await findLocation(address);
    if (!hit) return { ok: false, notice: "Die Adresse wurde nicht gefunden. Bitte Breite und Länge eintragen." };
    return { ok: true, ...hit };
  } catch (error) {
    return { ok: false, notice: error instanceof Error ? error.message : "Die Adresssuche ist nicht erreichbar." };
  }
}

export async function suggestLod2(latitude: number, longitude: number) {
  await requireUser();
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false as const, notice: "Für LoD2 fehlen die Koordinaten." };
  }
  if (!inNrw(latitude, longitude)) {
    return { ok: false as const, notice: "LoD2 ist hier für Nordrhein-Westfalen eingebunden. Außerhalb bitte die Dachflächen auf dem Luftbild zeichnen." };
  }
  try {
    const response = await fetch(lod2ItemsUrl(latitude, longitude), {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      return { ok: false as const, notice: "Die LoD2-Schnittstelle hat nicht geantwortet. Bitte die Dachflächen zeichnen." };
    }
    const parsed = roofsFromCityJson(await response.json(), [longitude, latitude]);
    if (parsed.roofs.length === 0) return { ok: false as const, notice: parsed.notice };
    const faces: RoofFaceInput[] = parsed.roofs.map((roof, index) => ({
      id: crypto.randomUUID(),
      name: `Dach ${index + 1}`,
      kwp: 0,
      tiltDeg: roof.tiltDeg,
      azimuthDeg: roof.azimuthDeg,
      mounting: "gebaeude",
      lossesPercent: DEFAULT_SYSTEM_LOSSES,
      geometry: blankGeometry(roof.ring),
    }));
    return {
      ok: true as const,
      faces,
      notice: `LoD2: ${faces.length} Dachflächen. Neigung und Azimut kommen aus dem Gebäudemodell und lassen sich ändern.`,
    };
  } catch {
    return { ok: false as const, notice: "Die LoD2-Schnittstelle ist gerade nicht erreichbar. Bitte die Dachflächen zeichnen." };
  }
}

export async function loadHorizon(latitude: number, longitude: number) {
  await requireUser();
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false as const, notice: "Für den Horizont fehlen die Koordinaten." };
  }
  const cacheKey = `pvgis-v5.3-horizon|${latitude.toFixed(3)}|${longitude.toFixed(3)}`;
  const cached = await prisma.pvgisCache.findUnique({ where: { cacheKey } });
  const cachedSamples = samplesOf(cached?.response);
  if (cachedSamples) return { ok: true as const, samples: cachedSamples };
  try {
    const response = await fetch(horizonUrl(latitude, longitude), {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return { ok: false as const, notice: "PVGIS hat den Horizont nicht geliefert." };
    const samples = parseHorizon(await response.json());
    if (!samples) return { ok: false as const, notice: "Das Horizontprofil ließ sich nicht lesen." };
    await prisma.pvgisCache.upsert({
      where: { cacheKey },
      create: { cacheKey, response: { samples } as unknown as Prisma.InputJsonValue },
      update: { response: { samples } as unknown as Prisma.InputJsonValue },
    });
    return { ok: true as const, samples };
  } catch {
    return { ok: false as const, notice: "PVGIS hat den Horizont nicht rechtzeitig geliefert." };
  }
}

function samplesOf(value: unknown): HorizonSample[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const samples = (value as { samples?: unknown }).samples;
  if (!Array.isArray(samples) || samples.length < 8) return null;
  const parsed = samples
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const azimuthDeg = Number((entry as { azimuthDeg?: unknown }).azimuthDeg);
      const heightDeg = Number((entry as { heightDeg?: unknown }).heightDeg);
      if (!Number.isFinite(azimuthDeg) || !Number.isFinite(heightDeg)) return null;
      return { azimuthDeg, heightDeg };
    })
    .filter((entry): entry is HorizonSample => entry != null);
  return parsed.length >= 8 ? parsed : null;
}
