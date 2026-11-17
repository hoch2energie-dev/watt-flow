"use client";

import { useState } from "react";
import { saveCustomer } from "@/app/actions/crm";
import { AddressFields } from "@/components/address-fields";
import { Button, Notice, Panel } from "@/components/ui";

type CustomerValues = {
  id?: string;
  segment: "HAUSHALT" | "GEWERBE";
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  zip: string;
  city: string;
  notes: string;
};

export function CustomerForm({ customer }: { customer?: CustomerValues }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <form
      action={async (formData) => {
        const result = await saveCustomer(formData);
        if (result && "ok" in result && result.ok === false) {
          setSaved(false);
          setError(result.error);
        } else setSaved(true);
      }}
    >
      <Panel>
        {customer?.id ? <input type="hidden" name="id" value={customer.id} /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Bereich
            <select name="segment" defaultValue={customer?.segment ?? "HAUSHALT"} className="field mt-1">
              <option value="HAUSHALT">Haushalt</option>
              <option value="GEWERBE">Gewerbe</option>
            </select>
          </label>
          <label className="text-sm font-semibold">Firma<input name="companyName" defaultValue={customer?.companyName} className="field mt-1" /></label>
          <label className="text-sm font-semibold">Vorname<input name="firstName" required defaultValue={customer?.firstName} className="field mt-1" /></label>
          <label className="text-sm font-semibold">Nachname<input name="lastName" required defaultValue={customer?.lastName} className="field mt-1" /></label>
          <label className="text-sm font-semibold">E-Mail<input name="email" type="email" defaultValue={customer?.email} className="field mt-1" /></label>
          <label className="text-sm font-semibold">Telefon<input name="phone" defaultValue={customer?.phone} className="field mt-1" /></label>
          <AddressFields key={customer?.id ?? "neu"} names={{ street: "street", zip: "zip", city: "city" }} defaults={customer} />
          <label className="text-sm font-semibold sm:col-span-2">Interne Notiz<textarea name="notes" defaultValue={customer?.notes} className="field mt-1 min-h-24" /></label>
        </div>
        {error ? <div className="mt-3"><Notice tone="danger">{error}</Notice></div> : null}
        {saved ? <p className="mt-3 text-sm text-ok">Gespeichert.</p> : null}
        <Button className="mt-4" type="submit">Kontakt speichern</Button>
      </Panel>
    </form>
  );
}
