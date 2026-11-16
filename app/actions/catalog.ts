"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type VatCategory } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { CATALOG_TYPES, catalogType } from "@/lib/catalog";
import { parseCsv, parseCsvNumber } from "@/lib/csv";
import { asSpecs, type Specs } from "@/lib/domain";
import { prisma } from "@/lib/db";

function clean(value: string, max = 200): string {
  return value.trim().slice(0, max);
}

function vatOf(value: string, fallback: VatCategory): VatCategory {
  const token = value.trim().toLowerCase();
  if (["pv_null", "0", "0%", "nullsatz", "null"].includes(token)) return "PV_NULL";
  if (["regel", "19", "19%", "normal"].includes(token)) return "REGEL";
  return fallback;
}

export async function saveCatalogItem(input: {
  id?: string;
  typeKey: string;
  manufacturer: string;
  model: string;
  name: string;
  sku: string;
  unit: string;
  purchasePriceNet: number;
  salesPriceNet: number;
  vatCategory: VatCategory;
  description: string;
  active: boolean;
  specs: Specs;
}) {
  await requireUser();
  const type = catalogType(input.typeKey);
  if (!type) return { ok: false as const, error: "Unbekannter Komponententyp." };
  const name = clean(input.name, 180);
  if (!name) return { ok: false as const, error: "Der Name fehlt." };
  const data = {
    typeKey: type.key,
    manufacturer: clean(input.manufacturer, 120) || "–",
    model: clean(input.model, 120),
    name,
    sku: clean(input.sku, 60) || null,
    unit: clean(input.unit, 40) || type.defaultUnit,
    purchasePriceNet: Math.max(0, Number(input.purchasePriceNet) || 0),
    salesPriceNet: Math.max(0, Number(input.salesPriceNet) || 0),
    vatCategory: (input.vatCategory === "PV_NULL" ? "PV_NULL" : "REGEL") as VatCategory,
    description: clean(input.description, 2000) || null,
    active: input.active,
    specs: asSpecs(input.specs) as Prisma.InputJsonValue,
  };
  const item = input.id
    ? await prisma.catalogItem.update({ where: { id: input.id }, data })
    : await prisma.catalogItem.create({ data });
  revalidatePath("/katalog");
  revalidatePath(`/katalog/${item.id}`);
  return { ok: true as const, id: item.id };
}

export async function createCatalogAndOpen(input: Parameters<typeof saveCatalogItem>[0]) {
  const result = await saveCatalogItem(input);
  if (!result.ok) return result;
  redirect(`/katalog/${result.id}`);
}

export async function archiveCatalogItem(id: string, active: boolean) {
  await requireUser();
  await prisma.catalogItem.update({ where: { id }, data: { active } });
  revalidatePath("/katalog");
  revalidatePath(`/katalog/${id}`);
  return { ok: true as const };
}

const HEADER_MAP: Record<string, string> = {
  typ: "typeKey",
  type: "typeKey",
  hersteller: "manufacturer",
  manufacturer: "manufacturer",
  modell: "model",
  model: "model",
  name: "name",
  artikelnummer: "sku",
  sku: "sku",
  einheit: "unit",
  unit: "unit",
  einkauf_netto: "purchase",
  einkauf: "purchase",
  verkauf_netto: "sales",
  verkauf: "sales",
  steuerkategorie: "vat",
  steuer: "vat",
  aktiv: "active",
  beschreibung: "description",
};

export async function importCatalog(form: FormData) {
  await requireUser();
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false as const, error: "Bitte eine CSV-Datei wählen." };
  const text = await file.text();
  const table = parseCsv(text);
  if (table.length < 2) return { ok: false as const, error: "Die Datei enthält keine Datenzeilen." };
  const headers = table[0].map((header) => header.trim().toLowerCase());
  const specKeyByLower = new Map(
    CATALOG_TYPES.flatMap((type) => type.fields.map((field) => [field.key.toLowerCase(), field.key] as const)),
  );
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let index = 1; index < table.length; index += 1) {
    const row = table[index];
    const record: Record<string, string> = {};
    const specs: Specs = {};
    headers.forEach((header, column) => {
      const value = (row[column] ?? "").trim();
      const mapped = HEADER_MAP[header];
      if (mapped) record[mapped] = value;
      else if (specKeyByLower.has(header) && value) {
        const key = specKeyByLower.get(header)!;
        specs[key] = /^-?\d+(?:[.,]\d+)?$/.test(value) ? parseCsvNumber(value) : value;
      }
    });
    const type = catalogType(record.typeKey);
    if (!type) {
      errors.push(`Zeile ${index + 1}: unbekannter Typ „${record.typeKey || "–"}“.`);
      continue;
    }
    if (!record.name) {
      errors.push(`Zeile ${index + 1}: Name fehlt.`);
      continue;
    }
    const data = {
      typeKey: type.key,
      manufacturer: record.manufacturer || "–",
      model: record.model || "",
      name: record.name,
      sku: record.sku || null,
      unit: record.unit || type.defaultUnit,
      purchasePriceNet: Math.max(0, parseCsvNumber(record.purchase || "0")),
      salesPriceNet: Math.max(0, parseCsvNumber(record.sales || "0")),
      vatCategory: vatOf(record.vat || "", type.defaultVat) as VatCategory,
      description: record.description || null,
      active: !["nein", "0", "false", "inaktiv"].includes((record.active || "ja").toLowerCase()),
      specs: specs as Prisma.InputJsonValue,
    };
    const sku = data.sku;
    const existing = sku ? await prisma.catalogItem.findFirst({ where: { sku } }) : null;
    if (existing) {
      await prisma.catalogItem.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.catalogItem.create({ data });
      created += 1;
    }
  }

  revalidatePath("/katalog");
  return { ok: true as const, created, updated, errors };
}
