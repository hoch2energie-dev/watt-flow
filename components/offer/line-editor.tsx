"use client";

import { SECTION_TYPES } from "@/lib/catalog";
import { catalogTypeLabel } from "@/lib/catalog";
import type { CatalogOption, LineDTO } from "@/lib/domain";
import { formatEuro, formatPercent } from "@/lib/format";
import { NumberField, TextInput } from "@/components/fields";

export function LineEditor({
  section,
  lines,
  catalog,
  onChange,
}: {
  section: string;
  lines: LineDTO[];
  catalog: CatalogOption[];
  onChange: (lines: LineDTO[]) => void;
}) {
  const visible = lines.filter((line) => line.section === section);
  const allowed = new Set(SECTION_TYPES[section] ?? []);
  const choices = catalog.filter((item) => item.active && (section === "extra" || allowed.has(item.typeKey)));

  function replace(id: string, patch: Partial<LineDTO>) {
    onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function addFromCatalog(id: string) {
    const item = catalog.find((entry) => entry.id === id);
    if (!item) return;
    onChange([
      ...lines,
      {
        id: crypto.randomUUID(),
        catalogItemId: item.id,
        typeKey: item.typeKey,
        section,
        name: item.name,
        description: item.description,
        quantity: 1,
        unit: item.unit,
        unitPriceNet: item.salesPriceNet,
        purchasePriceNet: item.purchasePriceNet,
        discountPercent: 0,
        vatCategory: item.vatCategory,
        specs: item.specs,
        sortOrder: lines.length,
      },
    ]);
  }

  function addFree() {
    onChange([
      ...lines,
      {
        id: crypto.randomUUID(),
        catalogItemId: null,
        typeKey: null,
        section,
        name: "Freie Position",
        description: null,
        quantity: 1,
        unit: "Stk",
        unitPriceNet: 0,
        purchasePriceNet: 0,
        discountPercent: 0,
        vatCategory: section === "wallbox" || section === "heatpump" || section === "extra" ? "REGEL" : "PV_NULL",
        specs: {},
        sortOrder: lines.length,
      },
    ]);
  }

  return (
    <div className="space-y-3">
      {visible.length === 0 ? <p className="text-sm text-muted">Noch keine Position. Wählen Sie einen Katalogartikel oder eine freie Position.</p> : null}
      {visible.map((line) => {
        const net = line.quantity * line.unitPriceNet * (1 - line.discountPercent / 100);
        const margin = net > 0 ? (net - line.quantity * line.purchasePriceNet) / net : 0;
        return (
          <div key={line.id} className="rounded-2xl bg-surface p-3 ring-1 ring-black/[0.04]">
            <div className="grid gap-2 md:grid-cols-12">
              <TextInput aria-label="Bezeichnung" className="md:col-span-5" value={line.name} onChange={(event) => replace(line.id, { name: event.target.value })} />
              <NumberField ariaLabel="Menge" className="md:col-span-2" digits={line.quantity % 1 === 0 ? 0 : 1} value={line.quantity} onChange={(quantity) => replace(line.id, { quantity })} />
              <TextInput aria-label="Einheit" className="md:col-span-1" value={line.unit} onChange={(event) => replace(line.id, { unit: event.target.value })} />
              <NumberField ariaLabel="Verkauf netto" className="md:col-span-2" value={line.unitPriceNet} onChange={(unitPriceNet) => replace(line.id, { unitPriceNet })} />
              <NumberField ariaLabel="Rabatt Prozent" className="md:col-span-1" digits={0} value={line.discountPercent} onChange={(discountPercent) => replace(line.id, { discountPercent })} />
              <button type="button" className="text-sm font-semibold text-danger md:col-span-1" onClick={() => onChange(lines.filter((entry) => entry.id !== line.id))}>Entfernen</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>{line.typeKey ? catalogTypeLabel(line.typeKey) : "Freie Position"}</span>
              <span>Einkauf {formatEuro(line.purchasePriceNet)}</span>
              <span>Netto {formatEuro(net)}</span>
              <span>Marge {formatPercent(margin)}</span>
              <label className="flex items-center gap-1">
                Steuer
                <select className="rounded-md border border-line bg-white px-1.5 py-0.5" value={line.vatCategory} onChange={(event) => replace(line.id, { vatCategory: event.target.value === "PV_NULL" ? "PV_NULL" : "REGEL" })}>
                  <option value="PV_NULL">0 % Vorlage</option>
                  <option value="REGEL">19 %</option>
                </select>
              </label>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <select className="field max-w-md" defaultValue="" onChange={(event) => { if (event.target.value) { addFromCatalog(event.target.value); event.target.value = ""; } }}>
          <option value="">Aus dem Katalog hinzufügen</option>
          {choices.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatEuro(item.salesPriceNet)}</option>)}
        </select>
        <button type="button" className="h-[2.625rem] rounded-full bg-surface px-4 text-sm font-semibold shadow-raise hover:bg-brand-soft" onClick={addFree}>Freie Position</button>
      </div>
    </div>
  );
}
