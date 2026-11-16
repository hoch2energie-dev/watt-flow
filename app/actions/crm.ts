"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { emptyQualification, parseQualification, type Qualification } from "@/lib/checklist";
import { prisma } from "@/lib/db";
import { nextNumber } from "@/lib/sequence";
import { formString } from "@/app/actions/helpers";

function clean(value: string, max = 200): string {
  return value.trim().slice(0, max);
}

export async function createRequest(form: FormData) {
  const user = await requireUser();
  const segment = formString(form, "segment") === "GEWERBE" ? "GEWERBE" : "HAUSHALT";
  const title = clean(formString(form, "title"), 160);
  const mode = formString(form, "customerMode");
  if (!title) return { ok: false as const, error: "Bitte einen Titel für die Anfrage eintragen." };

  let customerId = formString(form, "customerId");
  if (mode === "neu" || !customerId) {
    const firstName = clean(formString(form, "firstName"), 80);
    const lastName = clean(formString(form, "lastName"), 80);
    if (!firstName || !lastName) return { ok: false as const, error: "Vor- und Nachname der Kontaktperson fehlen." };
    const customer = await prisma.customer.create({
      data: {
        segment,
        companyName: clean(formString(form, "companyName"), 160) || null,
        firstName,
        lastName,
        email: clean(formString(form, "email"), 160) || null,
        phone: clean(formString(form, "phone"), 60) || null,
        street: clean(formString(form, "street"), 160) || null,
        zip: clean(formString(form, "zip"), 12) || null,
        city: clean(formString(form, "city"), 80) || null,
      },
    });
    customerId = customer.id;
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { ok: false as const, error: "Der Kontakt wurde nicht gefunden." };

  const sameAddress = form.get("sameAddress") === "on" || formString(form, "sameAddress") === "ja";
  const request = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, "AN");
    return tx.request.create({
      data: {
        number,
        customerId,
        segment,
        title,
        source: clean(formString(form, "source"), 80) || null,
        assigneeId: formString(form, "assigneeId") || user.id,
        street: sameAddress ? customer.street : clean(formString(form, "siteStreet"), 160) || null,
        zip: sameAddress ? customer.zip : clean(formString(form, "siteZip"), 12) || null,
        city: sameAddress ? customer.city : clean(formString(form, "siteCity"), 80) || null,
        qualification: emptyQualification() as unknown as Prisma.InputJsonValue,
      },
    });
  });

  revalidatePath("/anfragen");
  revalidatePath("/kunden");
  redirect(`/anfragen/${request.id}`);
}

export async function updateRequest(form: FormData) {
  await requireUser();
  const id = formString(form, "id");
  const status = formString(form, "status");
  const allowed = ["NEU", "IN_QUALIFIZIERUNG", "QUALIFIZIERT", "ANGEBOT_ERSTELLT", "GEWONNEN", "VERLOREN", "UNGEEIGNET"];
  await prisma.request.update({
    where: { id },
    data: {
      title: clean(formString(form, "title"), 160),
      segment: formString(form, "segment") === "GEWERBE" ? "GEWERBE" : "HAUSHALT",
      source: clean(formString(form, "source"), 80) || null,
      status: allowed.includes(status) ? (status as never) : undefined,
      assigneeId: formString(form, "assigneeId") || null,
      street: clean(formString(form, "street"), 160) || null,
      zip: clean(formString(form, "zip"), 12) || null,
      city: clean(formString(form, "city"), 80) || null,
    },
  });
  revalidatePath(`/anfragen/${id}`);
  revalidatePath("/anfragen");
}

export async function saveQualification(requestId: string, qualification: Qualification) {
  await requireUser();
  const parsed = parseQualification(qualification);
  await prisma.request.update({
    where: { id: requestId },
    data: { qualification: parsed as unknown as Prisma.InputJsonValue },
  });
  revalidatePath(`/anfragen/${requestId}`);
  return { ok: true as const };
}

export async function addNote(form: FormData) {
  const user = await requireUser();
  const body = clean(formString(form, "body"), 4000);
  const requestId = formString(form, "requestId") || null;
  const customerId = formString(form, "customerId") || null;
  const offerId = formString(form, "offerId") || null;
  if (!body) return;
  await prisma.note.create({ data: { body, authorId: user.id, requestId, customerId, offerId } });
  if (requestId) revalidatePath(`/anfragen/${requestId}`);
  if (customerId) revalidatePath(`/kunden/${customerId}`);
  if (offerId) revalidatePath(`/angebote/${offerId}`);
}

export async function saveCustomer(form: FormData) {
  await requireUser();
  const id = formString(form, "id");
  const firstName = clean(formString(form, "firstName"), 80);
  const lastName = clean(formString(form, "lastName"), 80);
  if (!firstName || !lastName) return { ok: false as const, error: "Vor- und Nachname fehlen." };
  const data = {
    segment: formString(form, "segment") === "GEWERBE" ? "GEWERBE" as const : "HAUSHALT" as const,
    companyName: clean(formString(form, "companyName"), 160) || null,
    firstName,
    lastName,
    email: clean(formString(form, "email"), 160) || null,
    phone: clean(formString(form, "phone"), 60) || null,
    street: clean(formString(form, "street"), 160) || null,
    zip: clean(formString(form, "zip"), 12) || null,
    city: clean(formString(form, "city"), 80) || null,
    notes: clean(formString(form, "notes"), 4000) || null,
  };
  if (id) {
    await prisma.customer.update({ where: { id }, data });
    revalidatePath(`/kunden/${id}`);
    revalidatePath("/kunden");
    return { ok: true as const, id };
  }
  const created = await prisma.customer.create({ data });
  revalidatePath("/kunden");
  redirect(`/kunden/${created.id}`);
}

export async function deleteRequest(id: string) {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Nur die Administration kann Anfragen löschen.");
  const offers = await prisma.offer.count({ where: { requestId: id } });
  if (offers > 0) throw new Error("Zuerst die zugehörigen Angebote löschen.");
  await prisma.request.delete({ where: { id } });
  revalidatePath("/anfragen");
  redirect("/anfragen");
}
