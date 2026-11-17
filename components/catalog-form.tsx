"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { archiveCatalogItem, saveCatalogItem } from "@/app/actions/catalog";
import { Field, NumberField, TextArea, TextInput } from "@/components/fields";
import { Button, Notice, Panel } from "@/components/ui";
import { CATALOG_TYPES, VAT_HELP, catalogType } from "@/lib/catalog";
import type { Specs } from "@/lib/domain";

export function CatalogForm({
  initial,
}: {
  initial?: {
    id: string;
    typeKey: string;
    manufacturer: string;
    model: string;
    name: string;
    sku: string;
    unit: string;
    purchasePriceNet: number;
    salesPriceNet: number;
    vatCategory: "PV_NULL" | "REGEL";
    description: string;
    active: boolean;
    specs: Specs;
  };
}) {
  const router = useRouter();
  const [typeKey, setTypeKey] = useState(initial?.typeKey ?? "pv_module");
  const [specs, setSpecs] = useState<Specs>(initial?.specs ?? {});
  const [purchase, setPurchase] = useState(initial?.purchasePriceNet ?? 0);
  const [sales, setSales] = useState(initial?.salesPriceNet ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const type = catalogType(typeKey) ?? CATALOG_TYPES[0];
  const margin = useMemo(() => (sales > 0 ? (sales - purchase) / sales : 0), [sales, purchase]);

  return (
    <form
      className="grid gap-4 lg:grid-cols-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const result = await saveCatalogItem({
          id: initial?.id,
          typeKey,
          manufacturer: String(form.get("manufacturer") ?? ""),
          model: String(form.get("model") ?? ""),
          name: String(form.get("name") ?? ""),
          sku: String(form.get("sku") ?? ""),
          unit: String(form.get("unit") ?? ""),
          purchasePriceNet: purchase,
          salesPriceNet: sales,
          vatCategory: String(form.get("vatCategory")) === "PV_NULL" ? "PV_NULL" : "REGEL",
          description: String(form.get("description") ?? ""),
          active: form.get("active") === "on",
          specs,
        });
        if (!result.ok) {
          setError(result.error);
          setSaved(false);
          return;
        }
        setError(null);
        setSaved(true);
        if (!initial) router.push(`/katalog/${result.id}`);
        else router.refresh();
      }}
    >
      <Panel className="space-y-3">
        <Field label="Typ">
          <select className="field" value={typeKey} onChange={(event) => setTypeKey(event.target.value)}>
            {CATALOG_TYPES.map((entry) => (
              <option key={entry.key} value={entry.key}>{entry.group} · {entry.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Name"><TextInput name="name" required defaultValue={initial?.name} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Hersteller"><TextInput name="manufacturer" defaultValue={initial?.manufacturer} /></Field>
          <Field label="Modell"><TextInput name="model" defaultValue={initial?.model} /></Field>
          <Field label="Artikelnummer"><TextInput name="sku" defaultValue={initial?.sku} /></Field>
          <Field label="Einheit"><TextInput name="unit" defaultValue={initial?.unit ?? type.defaultUnit} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Einkauf netto"><NumberField value={purchase} onChange={setPurchase} /></Field>
          <Field label="Verkauf netto"><NumberField value={sales} onChange={setSales} /></Field>
        </div>
        <p className="text-sm text-muted">Marge {(margin * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %</p>
        <Field label="Steuerkategorie" hint={VAT_HELP}>
          <select name="vatCategory" className="field" defaultValue={initial?.vatCategory ?? type.defaultVat}>
            <option value="PV_NULL">PV_NULL · 0 % wenn begünstigt</option>
            <option value="REGEL">REGEL · 19 %</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={initial?.active ?? true} /> Im Katalog auswählbar</label>
        <Field label="Beschreibung"><TextArea name="description" defaultValue={initial?.description} /></Field>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {saved ? <p className="text-sm text-ok">Gespeichert.</p> : null}
        <div className="flex gap-2">
          <Button type="submit">Speichern</Button>
          {initial ? (
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                await archiveCatalogItem(initial.id, !initial.active);
                router.refresh();
              }}
            >
              {initial.active ? "Archivieren" : "Wieder aktivieren"}
            </Button>
          ) : null}
        </div>
      </Panel>
      <Panel>
        <h2 className="font-display text-xl">Datenblatt</h2>
        <p className="mt-1 text-sm text-muted">Diese Werte wandern ins Angebot, sobald die Position gewählt wird. Spätere Katalogänderungen ändern bestehende Angebote nicht.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {type.fields.map((field) => (
            <Field key={field.key} label={field.unit ? `${field.label} (${field.unit})` : field.label}>
              {field.kind === "select" ? (
                <select
                  className="field"
                  value={String(specs[field.key] ?? "")}
                  onChange={(event) => setSpecs({ ...specs, [field.key]: event.target.value })}
                >
                  <option value="">–</option>
                  {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : field.kind === "number" ? (
                <NumberField
                  digits={field.digits ?? (field.key === "scop" || field.key === "efficiencyPercent" ? 1 : 0)}
                  value={typeof specs[field.key] === "number" ? (specs[field.key] as number) : 0}
                  onChange={(value) => setSpecs({ ...specs, [field.key]: value })}
                />
              ) : (
                <TextInput value={String(specs[field.key] ?? "")} onChange={(event) => setSpecs({ ...specs, [field.key]: event.target.value })} />
              )}
            </Field>
          ))}
          {type.fields.length === 0 ? <p className="text-sm text-muted">Für diesen Typ gibt es keine technischen Pflichtfelder.</p> : null}
        </div>
      </Panel>
    </form>
  );
}
