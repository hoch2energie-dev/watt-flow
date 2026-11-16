import { NextResponse } from "next/server";
import { CATALOG_TYPES } from "@/lib/catalog";
import { toCsv } from "@/lib/csv";
import { asSpecs } from "@/lib/domain";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const template = new URL(request.url).searchParams.get("vorlage") === "1";
  const specKeys = [...new Set(CATALOG_TYPES.flatMap((type) => type.fields.map((field) => field.key)))];
  const headers = ["typ", "hersteller", "modell", "name", "artikelnummer", "einheit", "einkauf_netto", "verkauf_netto", "steuerkategorie", "aktiv", "beschreibung", ...specKeys];
  const rows = [headers];
  if (!template) {
    const items = await prisma.catalogItem.findMany({ orderBy: [{ typeKey: "asc" }, { name: "asc" }] });
    for (const item of items) {
      const specs = asSpecs(item.specs);
      rows.push([
        item.typeKey,
        item.manufacturer,
        item.model,
        item.name,
        item.sku ?? "",
        item.unit,
        formatNumber(Number(item.purchasePriceNet), 2),
        formatNumber(Number(item.salesPriceNet), 2),
        item.vatCategory,
        item.active ? "ja" : "nein",
        item.description ?? "",
        ...specKeys.map((key) => (specs[key] == null ? "" : String(specs[key]))),
      ]);
    }
  }
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${template ? "katalog-vorlage" : "katalog"}.csv"`,
    },
  });
}
