"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAppointment, saveAppointment } from "@/app/actions/calendar";
import { Button, Notice } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

type Appointment = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  location: string;
  notes: string;
  userId: string;
  customerId: string;
  offerId: string;
};

function localValue(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function CalendarView({
  initialMonth,
  appointments,
  customers,
  offers,
  staff,
}: {
  initialMonth: string;
  appointments: Appointment[];
  customers: { id: string; label: string }[];
  offers: { id: string; label: string }[];
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [cursor, setCursor] = useState(() => {
    const [year, month] = initialMonth.split("-").map(Number);
    return new Date(year, (month || 1) - 1, 1);
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const pad = (first.getDay() + 6) % 7;
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const result: (Date | null)[] = Array.from({ length: pad }, () => null);
    for (let day = 1; day <= days; day += 1) result.push(new Date(cursor.getFullYear(), cursor.getMonth(), day));
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [cursor]);

  const label = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(cursor);
  const dayKey = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const onDay = (date: Date) => appointments.filter((item) => dayKey(new Date(item.startAt)) === dayKey(date));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <button type="button" className="rounded-lg px-3 py-1 text-sm font-semibold" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>Zurück</button>
          <h2 className="font-display text-2xl capitalize">{label}</h2>
          <button type="button" className="rounded-lg px-3 py-1 text-sm font-semibold" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>Weiter</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted">
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => <div key={day}>{day}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((date, index) => (
            <button
              key={index}
              type="button"
              disabled={!date}
              onClick={() => date && setSelected(dayKey(date))}
              className={`min-h-20 rounded-xl border p-1 text-left text-xs ${date && selected === dayKey(date) ? "border-brand bg-accent-soft" : "border-line bg-white"}`}
            >
              {date ? <span className="font-semibold">{date.getDate()}</span> : null}
              {date ? onDay(date).slice(0, 2).map((item) => <span key={item.id} className="mt-1 block truncate rounded bg-brand/10 px-1 text-brand">{item.title}</span>) : null}
            </button>
          ))}
        </div>
      </div>
      <aside className="rounded-2xl border border-line bg-elevated p-4">
        <h2 className="font-display text-xl">{editing ? "Termin ändern" : "Termin"}</h2>
        {error ? <div className="mt-2"><Notice tone="danger">{error}</Notice></div> : null}
        <form
          className="mt-3 space-y-2"
          action={async (formData) => {
            const result = await saveAppointment(formData);
            if (!result.ok) setError(result.error);
            else {
              setError(null);
              setEditing(null);
              router.refresh();
            }
          }}
        >
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <input name="title" required placeholder="Titel" defaultValue={editing?.title} className="field" key={editing?.id ?? "new"} />
          <label className="block text-xs font-semibold">Beginn<input type="datetime-local" name="startAt" required className="field mt-1" defaultValue={editing ? localValue(editing.startAt) : selected ? `${selected}T09:00` : ""} /></label>
          <label className="block text-xs font-semibold">Ende<input type="datetime-local" name="endAt" required className="field mt-1" defaultValue={editing ? localValue(editing.endAt) : selected ? `${selected}T10:00` : ""} /></label>
          <input name="location" placeholder="Ort" defaultValue={editing?.location} className="field" />
          <select name="customerId" defaultValue={editing?.customerId ?? ""} className="field">
            <option value="">Ohne Kundenbezug</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.label}</option>)}
          </select>
          <select name="offerId" defaultValue={editing?.offerId ?? ""} className="field">
            <option value="">Ohne Angebot</option>
            {offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.label}</option>)}
          </select>
          <select name="userId" defaultValue={editing?.userId ?? staff[0]?.id} className="field">
            {staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
          <textarea name="notes" placeholder="Notiz" defaultValue={editing?.notes} className="field min-h-20" />
          <Button type="submit" size="sm">{editing ? "Aktualisieren" : "Anlegen"}</Button>
        </form>
        <ul className="mt-4 space-y-2 text-sm">
          {appointments.filter((item) => !selected || dayKey(new Date(item.startAt)) === selected).slice(0, 8).map((item) => (
            <li key={item.id} className="rounded-lg bg-bg px-2 py-2">
              <button type="button" className="text-left font-semibold" onClick={() => setEditing(item)}>{item.title}</button>
              <p className="text-xs text-muted">{formatDateTime(item.startAt)}</p>
              <button type="button" className="text-xs text-danger" onClick={async () => { await deleteAppointment(item.id); router.refresh(); }}>Löschen</button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
