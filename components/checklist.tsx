"use client";

import { useState } from "react";
import { saveQualification } from "@/app/actions/crm";
import type { Qualification } from "@/lib/checklist";

export function ChecklistEditor({ requestId, initial }: { requestId: string; initial: Qualification }) {
  const [items, setItems] = useState(initial.items);
  const [saved, setSaved] = useState(false);
  const done = items.filter((item) => item.checked).length;

  async function update(next: Qualification["items"]) {
    setItems(next);
    setSaved(false);
    await saveQualification(requestId, { items: next });
    setSaved(true);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <p className="font-semibold">{done} von {items.length} Punkten</p>
        {saved ? <p className="text-ok">Gespeichert</p> : null}
      </div>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.key} className="rounded-xl border border-line px-3 py-2">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={item.checked}
                onChange={(event) => update(items.map((entry) => entry.key === item.key ? { ...entry, checked: event.target.checked } : entry))}
              />
              <span>{item.label}</span>
            </label>
            <input
              className="field mt-2"
              placeholder="Notiz zu diesem Punkt"
              value={item.note}
              onChange={(event) => setItems(items.map((entry) => entry.key === item.key ? { ...entry, note: event.target.value } : entry))}
              onBlur={() => update(items)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
