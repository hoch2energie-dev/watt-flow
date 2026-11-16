import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { downloadMime, safeStoredPath } from "@/lib/upload";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const { id } = await context.params;
  const file = await prisma.attachment.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "Datei nicht gefunden." }, { status: 404 });
  const buffer = await fs.readFile(safeStoredPath(file.storedName));
  const disposition = downloadMime(file.mime);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": disposition.mime,
      "Content-Disposition": `${disposition.inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.originalName)}"`,
    },
  });
}
