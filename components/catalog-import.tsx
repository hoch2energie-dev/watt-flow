"use client";

import { useState } from "react";
import { importCatalog } from "@/app/actions/catalog";
import { Notice } from "@/components/ui";

export function CatalogImport() {
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <form
      className="rounded-2xl border border-line bg-elevated p-4"
      action={async (formData) => {
        const result = await importCatalog(formData);
        if (!result.ok) {
          setMessage(result.error);
          setErrors([]);
          return;
        }
        setMessage(`${result.created} neu, ${result.updated} aktualisiert.`);
        setErrors(result.errors);
      }}
    >
      <h2 className="font-display text-xl">CSV-Import</h2>
      <p className="mt-1 text-sm text-muted">Semikolon, Kommazahlen, Spalten wie in der exportierten Datei. Gleiche Artikelnummer aktualisiert den Bestand.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
        <button className="h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white" type="submit">Importieren</button>
        <a className="text-sm font-semibold text-brand" href="/api/catalog/export">Export</a>
        <a className="text-sm font-semibold text-brand" href="/api/catalog/export?vorlage=1">Leere Vorlage</a>
      </div>
      {message ? <div className="mt-3"><Notice tone={errors.length ? "warn" : "ok"}>{message}</Notice></div> : null}
      {errors.length > 0 ? <ul className="mt-2 list-disc pl-5 text-sm text-danger">{errors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}</ul> : null}
    </form>
  );
}
