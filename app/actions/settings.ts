"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { parsePdfPages, type PdfPageSetting } from "@/lib/content";
import { prisma } from "@/lib/db";
import { formBool, formNumber, formString } from "@/app/actions/helpers";
import { Prisma } from "@prisma/client";

async function admin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") return null;
  return user;
}

export async function saveCompany(form: FormData) {
  if (!(await admin())) return { ok: false as const, error: "Nur die Administration ändert die Betriebsdaten." };
  const companyName = formString(form, "companyName");
  if (!companyName) return { ok: false as const, error: "Der Betriebsname fehlt." };
  await prisma.companySettings.update({
    where: { id: "default" },
    data: {
      companyName,
      street: formString(form, "street"),
      zip: formString(form, "zip"),
      city: formString(form, "city"),
      phone: formString(form, "phone"),
      email: formString(form, "email"),
      website: formString(form, "website"),
      taxNumber: formString(form, "taxNumber"),
      vatId: formString(form, "vatId"),
      bankName: formString(form, "bankName"),
      iban: formString(form, "iban"),
      bic: formString(form, "bic"),
      primaryColor: /^#[0-9a-fA-F]{6}$/.test(formString(form, "primaryColor")) ? formString(form, "primaryColor") : "#1e5c42",
      accentColor: /^#[0-9a-fA-F]{6}$/.test(formString(form, "accentColor")) ? formString(form, "accentColor") : "#c65b2e",
    },
  });
  revalidatePath("/einstellungen");
  return { ok: true as const };
}

export async function saveCalculationDefaults(form: FormData) {
  if (!(await admin())) return { ok: false as const, error: "Nur die Administration ändert die Rechenvorgaben." };
  await prisma.companySettings.update({
    where: { id: "default" },
    data: {
      defaultSpecificYield: formNumber(form, "defaultSpecificYield", 950),
      defaultEegTariff: formNumber(form, "defaultEegTariff", 0.078),
      defaultPostEeg: formNumber(form, "defaultPostEeg", 0.04),
      defaultElectricityPrice: formNumber(form, "defaultElectricityPrice", 0.32),
      defaultPriceIncrease: formNumber(form, "defaultPriceIncrease", 3),
      defaultDegradation: formNumber(form, "defaultDegradation", 0.5),
      defaultHorizonYears: Math.round(formNumber(form, "defaultHorizonYears", 20)),
      defaultOpex: formNumber(form, "defaultOpex", 150),
      defaultBatteryCycles: Math.round(formNumber(form, "defaultBatteryCycles", 220)),
      offerValidityDays: Math.round(formNumber(form, "offerValidityDays", 30)),
    },
  });
  revalidatePath("/einstellungen");
  return { ok: true as const };
}

export async function saveDocumentSettings(input: { pages: PdfPageSetting[]; aboutText: string; legalText: string; coverSubtitle: string }) {
  if (!(await admin())) return { ok: false as const, error: "Nur die Administration ändert die Angebotsseiten." };
  await prisma.companySettings.update({
    where: { id: "default" },
    data: {
      pdfPages: parsePdfPages(input.pages) as unknown as Prisma.InputJsonValue,
      aboutText: input.aboutText.slice(0, 8000),
      legalText: input.legalText.slice(0, 12000),
      coverSubtitle: input.coverSubtitle.slice(0, 180),
    },
  });
  revalidatePath("/einstellungen");
  return { ok: true as const };
}

export async function saveStages(stages: { id?: string; name: string; color: string; isWon: boolean; isLost: boolean; active: boolean }[]) {
  if (!(await admin())) return { ok: false as const, error: "Nur die Administration ändert das Board." };
  const clean = stages
    .map((stage) => ({ ...stage, name: stage.name.trim() }))
    .filter((stage) => stage.name.length > 0)
    .slice(0, 16);
  if (clean.length === 0) return { ok: false as const, error: "Mindestens eine Spalte bleibt nötig." };
  await prisma.$transaction(async (tx) => {
    const ids = clean.map((stage) => stage.id).filter((id): id is string => Boolean(id));
    await tx.kanbanStage.updateMany({ where: { id: { notIn: ids } }, data: { active: false } });
    for (const [index, stage] of clean.entries()) {
      const data = {
        name: stage.name.slice(0, 80),
        color: /^#[0-9a-fA-F]{6}$/.test(stage.color) ? stage.color : "#1e5c42",
        sortOrder: index,
        isWon: stage.isWon,
        isLost: stage.isLost,
        active: stage.active,
      };
      if (stage.id) await tx.kanbanStage.update({ where: { id: stage.id }, data });
      else await tx.kanbanStage.create({ data });
    }
  });
  revalidatePath("/einstellungen");
  revalidatePath("/board");
  return { ok: true as const };
}

export async function changePassword(form: FormData) {
  const user = await requireUser();
  const current = formString(form, "current");
  const next = formString(form, "next");
  const repeat = formString(form, "repeat");
  if (next.length < 10) return { ok: false as const, error: "Das neue Passwort braucht mindestens 10 Zeichen." };
  if (next !== repeat) return { ok: false as const, error: "Die Wiederholung stimmt nicht." };
  const matches = await bcrypt.compare(current, user.passwordHash);
  if (!matches) return { ok: false as const, error: "Das bisherige Passwort stimmt nicht." };
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 10), mustChangePassword: false },
  });
  revalidatePath("/einstellungen");
  return { ok: true as const };
}

export async function createUser(form: FormData) {
  if (!(await admin())) return { ok: false as const, error: "Nur die Administration legt Konten an." };
  const name = formString(form, "name");
  const email = formString(form, "email").toLowerCase();
  const password = formString(form, "password");
  const role = formString(form, "role") === "ADMIN" ? "ADMIN" : "USER";
  if (!name || !email.includes("@") || password.length < 10) {
    return { ok: false as const, error: "Name, gültige E-Mail und ein Passwort mit mindestens 10 Zeichen werden gebraucht." };
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { ok: false as const, error: "Diese E-Mail ist schon vergeben." };
  await prisma.user.create({
    data: { name, email, role, passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true },
  });
  revalidatePath("/einstellungen");
  return { ok: true as const };
}

export async function updateUser(form: FormData) {
  const actor = await admin();
  if (!actor) return { ok: false as const, error: "Nur die Administration ändert Konten." };
  const id = formString(form, "id");
  const role = formString(form, "role") === "ADMIN" ? "ADMIN" : "USER";
  const active = formBool(form, "active");
  if (id === actor.id && !active) return { ok: false as const, error: "Sie können das eigene Konto nicht deaktivieren." };
  if (role !== "ADMIN") {
    const admins = await prisma.user.count({ where: { role: "ADMIN", active: true, id: { not: id } } });
    if (admins === 0) return { ok: false as const, error: "Es muss mindestens ein aktives Administrationskonto bleiben." };
  }
  const password = formString(form, "password");
  await prisma.user.update({
    where: { id },
    data: {
      name: formString(form, "name") || undefined,
      role,
      active,
      ...(password.length >= 10 ? { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true } : {}),
    },
  });
  revalidatePath("/einstellungen");
  return { ok: true as const };
}
