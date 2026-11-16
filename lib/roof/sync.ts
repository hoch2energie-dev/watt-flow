import type { CatalogOption, LineDTO } from "@/lib/domain";
import type { Specs } from "@/lib/domain";
import { layoutKwp } from "@/lib/roof/types";
import type { RoofFaceInput } from "@/lib/pvgis/types";

export function moduleSize(specs: Specs): { powerWp: number; widthM: number; heightM: number } | null {
  const powerWp = Number(specs.powerWp);
  const widthMm = Number(specs.widthMm);
  const heightMm = Number(specs.heightMm);
  if (!Number.isFinite(powerWp) || powerWp < 1 || !Number.isFinite(widthMm) || !Number.isFinite(heightMm)) return null;
  if (widthMm < 200 || heightMm < 200 || widthMm > 4000 || heightMm > 4000) return null;
  return { powerWp, widthM: widthMm / 1000, heightM: heightMm / 1000 };
}

export function syncPlannedFaces(faces: RoofFaceInput[]): RoofFaceInput[] {
  return faces.map((face) => {
    const kwp = layoutKwp(face.geometry);
    return kwp == null ? face : { ...face, kwp };
  });
}

/**
 * Setzt die Modulposition auf die geplante Stückzahl.
 * Eine Modulart übernimmt die vorhandene Modulzeile. Mehrere Arten ergänzen je eine Zeile.
 */
export function syncModuleLines(lines: LineDTO[], faces: RoofFaceInput[], catalog: CatalogOption[]): LineDTO[] {
  const counts = new Map<string, number>();
  for (const face of faces) {
    const catalogItemId = face.geometry?.placement?.catalogItemId;
    if (!catalogItemId) continue;
    const count = face.geometry?.modules.filter((module) => module.active).length ?? 0;
    if (count <= 0) continue;
    counts.set(catalogItemId, (counts.get(catalogItemId) ?? 0) + count);
  }
  if (counts.size === 0) return lines;
  const next = lines.map((line) => ({ ...line, specs: { ...line.specs } }));
  if (counts.size === 1) {
    const [catalogItemId, quantity] = [...counts.entries()][0];
    const item = catalog.find((entry) => entry.id === catalogItemId);
    if (!item) return next;
    const same = next.findIndex((line) => line.section === "module" && line.catalogItemId === catalogItemId);
    const first = next.findIndex((line) => line.section === "module");
    const index = same >= 0 ? same : first;
    if (index >= 0) {
      next[index] = lineFromCatalog(next[index], item, quantity);
      return next;
    }
    return [...next, newLine(item, quantity, next.length)];
  }
  for (const [catalogItemId, quantity] of counts) {
    const item = catalog.find((entry) => entry.id === catalogItemId);
    if (!item) continue;
    const index = next.findIndex((line) => line.section === "module" && line.catalogItemId === catalogItemId);
    if (index >= 0) next[index] = lineFromCatalog(next[index], item, quantity);
    else next.push(newLine(item, quantity, next.length));
  }
  return next;
}

function lineFromCatalog(line: LineDTO, item: CatalogOption, quantity: number): LineDTO {
  return {
    ...line,
    catalogItemId: item.id,
    typeKey: "pv_module",
    section: "module",
    name: item.name,
    quantity,
    unit: item.unit || "Stk",
    unitPriceNet: item.salesPriceNet,
    purchasePriceNet: item.purchasePriceNet,
    vatCategory: item.vatCategory,
    specs: { ...item.specs },
  };
}

function newLine(item: CatalogOption, quantity: number, sortOrder: number): LineDTO {
  return {
    id: crypto.randomUUID(),
    catalogItemId: item.id,
    typeKey: "pv_module",
    section: "module",
    name: item.name,
    description: item.description,
    quantity,
    unit: item.unit || "Stk",
    unitPriceNet: item.salesPriceNet,
    purchasePriceNet: item.purchasePriceNet,
    discountPercent: 0,
    vatCategory: item.vatCategory,
    specs: { ...item.specs },
    sortOrder,
  };
}
