"use client";

import { useState } from "react";
import { createRequest } from "@/app/actions/crm";
import { AddressFields } from "@/components/address-fields";
import { REQUEST_SOURCES } from "@/lib/content";
import { Button, Notice, Panel } from "@/components/ui";

export function RequestForm({ customers, staff }: { customers: { id: string; label: string }[]; staff: { id: string; name: string }[] }) {
  const [mode, setMode] = useState(customers.length ? "bestand" : "neu");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-4 lg:grid-cols-2"
      action={async (formData) => {
        const result = await createRequest(formData);
        if (result && result.ok === false) setError(result.error);
      }}
    >
      <Panel>
        <h2 className="font-display text-xl">Anfrage</h2>
        <label className="mt-4 block text-sm font-semibold">Titel</label>
        <input name="title" required className="field mt-1" placeholder="Photovoltaik und Speicher" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Bereich
            <select name="segment" className="field mt-1">
              <option value="HAUSHALT">Haushalt</option>
              <option value="GEWERBE">Gewerbe</option>
            </select>
          </label>
          <label className="text-sm font-semibold">Herkunft
            <select name="source" className="field mt-1">
              <option value="">–</option>
              {REQUEST_SOURCES.map((source) => <option key={source}>{source}</option>)}
            </select>
          </label>
        </div>
        <label className="mt-4 block text-sm font-semibold">Zuständig
          <select name="assigneeId" className="field mt-1">
            {staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
        {error ? <div className="mt-4"><Notice tone="danger">{error}</Notice></div> : null}
        <Button className="mt-5" type="submit">Anfrage anlegen</Button>
      </Panel>
      <Panel>
        <h2 className="font-display text-xl">Kontakt</h2>
        <div className="mt-3 flex gap-2 text-sm">
          <button type="button" className={`rounded-full px-3 py-1 ${mode === "bestand" ? "bg-brand text-white" : "bg-black/5"}`} onClick={() => setMode("bestand")}>Vorhanden</button>
          <button type="button" className={`rounded-full px-3 py-1 ${mode === "neu" ? "bg-brand text-white" : "bg-black/5"}`} onClick={() => setMode("neu")}>Neu anlegen</button>
        </div>
        <input type="hidden" name="customerMode" value={mode} />
        {mode === "bestand" ? (
          <label className="mt-4 block text-sm font-semibold">Kontakt
            <select name="customerId" className="field mt-1" required={mode === "bestand"}>
              <option value="">Bitte wählen</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.label}</option>)}
            </select>
          </label>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold sm:col-span-2">Firma<input name="companyName" className="field mt-1" /></label>
            <label className="text-sm font-semibold">Vorname<input name="firstName" required className="field mt-1" /></label>
            <label className="text-sm font-semibold">Nachname<input name="lastName" required className="field mt-1" /></label>
            <label className="text-sm font-semibold">E-Mail<input name="email" type="email" className="field mt-1" /></label>
            <label className="text-sm font-semibold">Telefon<input name="phone" className="field mt-1" /></label>
            <AddressFields names={{ street: "street", zip: "zip", city: "city" }} />
          </div>
        )}
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" name="sameAddress" defaultChecked /> Objektadresse ist die Kontaktadresse
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <AddressFields names={{ street: "siteStreet", zip: "siteZip", city: "siteCity" }} streetLabel="Abweichende Straße" />
        </div>
      </Panel>
    </form>
  );
}
