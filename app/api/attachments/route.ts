import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publicUrl } from "@/lib/public-url";
import { ensureUploadDir, extensionOf } from "@/lib/upload";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(publicUrl(request, "/login"), 303);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.redirect(publicUrl(request, "/uebersicht?hinweis=datei"), 303);
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.redirect(publicUrl(request, "/uebersicht?hinweis=gross"), 303);
  }
  const requestId = String(form.get("requestId") ?? "") || null;
  const customerId = String(form.get("customerId") ?? "") || null;
  const offerId = String(form.get("offerId") ?? "") || null;
  const kind = String(form.get("kind") ?? "datei") === "signatur" ? "signatur" : "datei";
  const storedName = `${randomUUID()}${extensionOf(file.name)}`;
  const dir = await ensureUploadDir();
  await fs.writeFile(`${dir}/${storedName}`, Buffer.from(await file.arrayBuffer()));
  const attachment = await prisma.attachment.create({
    data: {
      originalName: file.name.slice(0, 180),
      storedName,
      mime: file.type || "application/octet-stream",
      size: file.size,
      kind,
      requestId,
      customerId,
      offerId,
      uploadedById: session.sub,
    },
  });

  let back = "/uebersicht";
  if (kind === "signatur" && offerId) {
    const won = await prisma.kanbanStage.findFirst({ where: { active: true, isWon: true }, orderBy: { sortOrder: "asc" } });
    const offer = await prisma.offer.update({
      where: { id: offerId },
      data: { status: "ANGENOMMEN", signedAt: new Date(), signedAttachmentId: attachment.id, stageId: won?.id },
    });
    await prisma.request.update({ where: { id: offer.requestId }, data: { status: "GEWONNEN" } });
    back = `/angebote/${offerId}`;
  } else if (requestId) back = `/anfragen/${requestId}`;
  else if (customerId) back = `/kunden/${customerId}`;
  else if (offerId) back = `/angebote/${offerId}`;
  return NextResponse.redirect(publicUrl(request, back), 303);
}
