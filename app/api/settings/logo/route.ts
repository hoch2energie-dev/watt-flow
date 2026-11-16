import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publicUrl } from "@/lib/public-url";
import { ensureUploadDir, extensionOf, safeStoredPath } from "@/lib/upload";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(publicUrl(request, "/login"), 303);
  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || user.role !== "ADMIN") return NextResponse.redirect(publicUrl(request, "/einstellungen"), 303);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.redirect(publicUrl(request, "/einstellungen"), 303);
  const allowed = new Set(["image/png", "image/jpeg", "image/webp"]);
  if (!allowed.has(file.type) || file.size > 4 * 1024 * 1024) {
    return NextResponse.redirect(publicUrl(request, "/einstellungen?hinweis=logo"), 303);
  }
  const storedName = `logo-${randomUUID()}${extensionOf(file.name) || ".png"}`;
  const dir = await ensureUploadDir();
  await fs.writeFile(`${dir}/${storedName}`, Buffer.from(await file.arrayBuffer()));
  const settings = await prisma.companySettings.findUnique({ where: { id: "default" } });
  if (settings?.logoStoredName) {
    await fs.rm(safeStoredPath(settings.logoStoredName), { force: true });
  }
  await prisma.companySettings.update({ where: { id: "default" }, data: { logoStoredName: storedName } });
  return NextResponse.redirect(publicUrl(request, "/einstellungen"), 303);
}
