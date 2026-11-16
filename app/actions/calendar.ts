"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formString } from "@/app/actions/helpers";

export async function saveAppointment(form: FormData) {
  const user = await requireUser();
  const id = formString(form, "id");
  const title = formString(form, "title").slice(0, 160);
  const start = formString(form, "startAt");
  const end = formString(form, "endAt");
  if (!title || !start || !end) return { ok: false as const, error: "Titel, Beginn und Ende werden gebraucht." };
  const startAt = new Date(start);
  const endAt = new Date(end);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return { ok: false as const, error: "Der Zeitraum ist ungültig." };
  }
  const data = {
    title,
    startAt,
    endAt,
    location: formString(form, "location").slice(0, 160) || null,
    notes: formString(form, "notes").slice(0, 2000) || null,
    userId: formString(form, "userId") || user.id,
    customerId: formString(form, "customerId") || null,
    offerId: formString(form, "offerId") || null,
    requestId: formString(form, "requestId") || null,
  };
  if (id) await prisma.appointment.update({ where: { id }, data });
  else await prisma.appointment.create({ data });
  revalidatePath("/kalender");
  revalidatePath("/uebersicht");
  return { ok: true as const };
}

export async function deleteAppointment(id: string) {
  await requireUser();
  await prisma.appointment.delete({ where: { id } });
  revalidatePath("/kalender");
  revalidatePath("/uebersicht");
  return { ok: true as const };
}
