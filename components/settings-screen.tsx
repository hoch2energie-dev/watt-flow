"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changePassword, checkGoogleMaps, createUser, saveCalculationDefaults, saveCompany, saveDocumentSettings, saveStages, updateUser, type GoogleCheck } from "@/app/actions/settings";
import { GoogleMap } from "@/components/google-map";
import { Badge, Button, Notice, Panel } from "@/components/ui";
import { PDF_PAGE_LABELS, type PdfPageSetting } from "@/lib/content";

type Stage = { id: string; name: string; color: string; isWon: boolean; isLost: boolean; active: boolean };
type UserRow = { id: string; name: string; email: string; role: "ADMIN" | "USER"; active: boolean };

export function SettingsScreen({
  isAdmin,
  company,
  calc,
  documents,
  stages,
  users,
  logo,
  google,
}: {
  isAdmin: boolean;
  company: Record<string, string>;
  calc: Record<string, string>;
  documents: { pages: PdfPageSetting[]; aboutText: string; legalText: string; coverSubtitle: string };
  stages: Stage[];
  users: UserRow[];
  logo: boolean;
  /** Welche Google-Schlüssel am Server hinterlegt sind. Nur für die Administration gefüllt. */
  google: { server: boolean; browser: boolean };
}) {
  const [tab, setTab] = useState(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "passwort" ? "passwort" : "betrieb");
  const tabs = [
    ["betrieb", "Betrieb"],
    ["rechnung", "Berechnung"],
    ["pdf", "PDF-Seiten"],
    ["board", "Board"],
    ["google", "Google Maps"],
    ["nutzer", "Nutzer"],
    ["passwort", "Passwort"],
  ] as const;
  return (
    <div>
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {tabs.filter(([id]) => isAdmin || id === "passwort" || id === "betrieb").map(([id, label]) => (
          <button key={id} type="button" className={`rounded-full px-3 py-1 text-sm font-semibold ${tab === id ? "bg-brand text-white" : "bg-white"}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "betrieb" ? <CompanyForm company={company} isAdmin={isAdmin} logo={logo} /> : null}
      {tab === "rechnung" && isAdmin ? <CalcForm calc={calc} /> : null}
      {tab === "pdf" && isAdmin ? <PdfForm initial={documents} /> : null}
      {tab === "board" && isAdmin ? <StageForm initial={stages} /> : null}
      {tab === "google" && isAdmin ? <GoogleStatus google={google} /> : null}
      {tab === "nutzer" && isAdmin ? <UserAdmin users={users} /> : null}
      {tab === "passwort" ? <PasswordForm /> : null}
    </div>
  );
}

function CompanyForm({ company, isAdmin, logo }: { company: Record<string, string>; isAdmin: boolean; logo: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const fields = [
    ["companyName", "Name"], ["street", "Straße"], ["zip", "PLZ"], ["city", "Ort"], ["phone", "Telefon"], ["email", "E-Mail"],
    ["website", "Web"], ["taxNumber", "Steuernummer"], ["vatId", "USt-IdNr."], ["bankName", "Bank"], ["iban", "IBAN"], ["bic", "BIC"],
  ];
  return (
    <Panel>
      <p className="mb-3 text-sm text-muted">Die Adresse in den Beispieldaten ist Platzhalter. Tragen Sie die echten Betriebsdaten ein, bevor ein Angebot an Kunden geht.</p>
      <form className="grid gap-3 sm:grid-cols-2" action={async (formData) => {
        const result = await saveCompany(formData);
        setMessage(result.ok ? "Gespeichert." : result.error);
      }}>
        {fields.map(([name, label]) => (
          <label key={name} className="text-sm font-semibold">{label}<input name={name} defaultValue={company[name] ?? ""} disabled={!isAdmin} className="field mt-1" /></label>
        ))}
        <label className="text-sm font-semibold">Farbe<input name="primaryColor" defaultValue={company.primaryColor} disabled={!isAdmin} className="field mt-1" /></label>
        <label className="text-sm font-semibold">Akzent<input name="accentColor" defaultValue={company.accentColor} disabled={!isAdmin} className="field mt-1" /></label>
        {isAdmin ? <Button className="sm:col-span-2 w-fit" type="submit">Betriebsdaten speichern</Button> : <p className="text-sm text-muted sm:col-span-2">Nur die Administration ändert diese Daten.</p>}
        {message ? <p className="text-sm sm:col-span-2">{message}</p> : null}
      </form>
      {isAdmin ? (
        <form action="/api/settings/logo" method="post" encType="multipart/form-data" className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm">{logo ? "Logo ist hinterlegt." : "Noch kein Logo."}</span>
          <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required className="text-sm" />
          <Button type="submit" size="sm" variant="secondary">Logo hochladen</Button>
        </form>
      ) : null}
    </Panel>
  );
}

function CalcForm({ calc }: { calc: Record<string, string> }) {
  const [message, setMessage] = useState<string | null>(null);
  const fields = [
    ["defaultSpecificYield", "Spezifischer Ertrag kWh/kWp"],
    ["defaultEegTariff", "EEG-Vergütung €/kWh"],
    ["defaultPostEeg", "Vergütung nach 20 Jahren €/kWh"],
    ["defaultElectricityPrice", "Strompreis €/kWh"],
    ["defaultPriceIncrease", "Preissteigerung %"],
    ["defaultDegradation", "Degradation %"],
    ["defaultHorizonYears", "Jahre"],
    ["defaultOpex", "Betriebskosten €/Jahr"],
    ["defaultBatteryCycles", "Speicherzyklen"],
    ["offerValidityDays", "Angebot gültig, Tage"],
  ];
  return (
    <form className="grid gap-3 rounded-2xl border border-line bg-elevated p-4 sm:grid-cols-2" action={async (formData) => {
      const result = await saveCalculationDefaults(formData);
      setMessage(result.ok ? "Gespeichert. Neue Angebote übernehmen diese Vorgaben." : result.error);
    }}>
      {fields.map(([name, label]) => <label key={name} className="text-sm font-semibold">{label}<input name={name} defaultValue={calc[name]} className="field mt-1" /></label>)}
      <Button className="w-fit" type="submit">Vorgaben speichern</Button>
      {message ? <p className="text-sm">{message}</p> : null}
    </form>
  );
}

function PdfForm({ initial }: { initial: { pages: PdfPageSetting[]; aboutText: string; legalText: string; coverSubtitle: string } }) {
  const [pages, setPages] = useState(initial.pages);
  const [message, setMessage] = useState<string | null>(null);
  function move(index: number, direction: -1 | 1) {
    const next = pages.slice();
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setPages(next);
  }
  return (
    <form className="space-y-3 rounded-2xl border border-line bg-elevated p-4" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const result = await saveDocumentSettings({
        pages,
        aboutText: String(form.get("aboutText") ?? ""),
        legalText: String(form.get("legalText") ?? ""),
        coverSubtitle: String(form.get("coverSubtitle") ?? ""),
      });
      setMessage(result.ok ? "Gespeichert." : result.error);
    }}>
      <ul className="space-y-2">
        {pages.map((page, index) => (
          <li key={page.key} className="flex flex-wrap items-center gap-2 text-sm">
            <input type="checkbox" checked={page.enabled} onChange={(event) => setPages(pages.map((entry) => entry.key === page.key ? { ...entry, enabled: event.target.checked } : entry))} />
            <span className="min-w-48">{PDF_PAGE_LABELS[page.key]}</span>
            <button type="button" onClick={() => move(index, -1)}>hoch</button>
            <button type="button" onClick={() => move(index, 1)}>runter</button>
          </li>
        ))}
      </ul>
      <label className="block text-sm font-semibold">Untertitel auf dem Deckblatt<textarea name="coverSubtitle" defaultValue={initial.coverSubtitle} className="field mt-1" /></label>
      <label className="block text-sm font-semibold">Firmenvorstellung<textarea name="aboutText" defaultValue={initial.aboutText} className="field mt-1 min-h-32" /></label>
      <label className="block text-sm font-semibold">Rechtliche Hinweise<textarea name="legalText" defaultValue={initial.legalText} className="field mt-1 min-h-48" /></label>
      <Button type="submit">Seiten speichern</Button>
      {message ? <p className="text-sm">{message}</p> : null}
    </form>
  );
}

function StageForm({ initial }: { initial: Stage[] }) {
  const [stages, setStages] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  function move(index: number, direction: -1 | 1) {
    const next = stages.slice();
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setStages(next);
  }
  return (
    <div className="space-y-3">
      {stages.map((stage, index) => (
        <div key={stage.id || index} className="grid gap-2 rounded-xl border border-line bg-white p-3 sm:grid-cols-6">
          <input className="field sm:col-span-2" value={stage.name} onChange={(event) => setStages(stages.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry))} />
          <input className="field" value={stage.color} onChange={(event) => setStages(stages.map((entry, i) => i === index ? { ...entry, color: event.target.value } : entry))} />
          <label className="text-sm"><input type="checkbox" checked={stage.isWon} onChange={(event) => setStages(stages.map((entry, i) => i === index ? { ...entry, isWon: event.target.checked } : entry))} /> Gewonnen</label>
          <label className="text-sm"><input type="checkbox" checked={stage.active} onChange={(event) => setStages(stages.map((entry, i) => i === index ? { ...entry, active: event.target.checked } : entry))} /> Aktiv</label>
          <div className="flex gap-2 text-sm"><button type="button" onClick={() => move(index, -1)}>hoch</button><button type="button" onClick={() => move(index, 1)}>runter</button></div>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => setStages([...stages, { id: "", name: "Neue Spalte", color: "#1e5c42", isWon: false, isLost: false, active: true }])}>Spalte hinzufügen</Button>
      <Button type="button" onClick={async () => {
        const result = await saveStages(stages);
        setMessage(result.ok ? "Board gespeichert." : result.error);
      }}>Board speichern</Button>
      {message ? <Notice>{message}</Notice> : null}
    </div>
  );
}

function PasswordForm() {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form className="max-w-md space-y-3 rounded-2xl border border-line bg-elevated p-4" action={async (formData) => {
      const result = await changePassword(formData);
      setMessage(result.ok ? "Passwort geändert." : result.error);
    }}>
      <label className="block text-sm font-semibold">Bisheriges Passwort<input type="password" name="current" required className="field mt-1" /></label>
      <label className="block text-sm font-semibold">Neues Passwort<input type="password" name="next" required className="field mt-1" /></label>
      <label className="block text-sm font-semibold">Wiederholung<input type="password" name="repeat" required className="field mt-1" /></label>
      <Button type="submit">Passwort ändern</Button>
      {message ? <p className="text-sm">{message}</p> : null}
    </form>
  );
}

function UserAdmin({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <form className="grid gap-2 rounded-2xl border border-line bg-elevated p-4 sm:grid-cols-2" action={async (formData) => {
        const result = await createUser(formData);
        setMessage(result.ok ? "Konto angelegt." : result.error);
        if (result.ok) router.refresh();
      }}>
        <input name="name" placeholder="Name" className="field" required />
        <input name="email" type="email" placeholder="E-Mail" className="field" required />
        <input name="password" type="text" placeholder="Startpasswort, mind. 10 Zeichen" className="field" required />
        <select name="role" className="field"><option value="USER">Team</option><option value="ADMIN">Administration</option></select>
        <Button type="submit">Konto anlegen</Button>
      </form>
      {message ? <Notice>{message}</Notice> : null}
      {users.map((user) => (
        <form key={user.id} className="grid gap-2 rounded-xl border border-line bg-white p-3 sm:grid-cols-5" action={async (formData) => {
          const result = await updateUser(formData);
          setMessage(result.ok ? "Konto aktualisiert." : result.error);
          if (result.ok) router.refresh();
        }}>
          <input type="hidden" name="id" value={user.id} />
          <input name="name" defaultValue={user.name} className="field" />
          <p className="self-center text-sm text-muted">{user.email}</p>
          <select name="role" defaultValue={user.role} className="field"><option value="USER">Team</option><option value="ADMIN">Administration</option></select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={user.active} /> Aktiv</label>
          <Button type="submit" size="sm" variant="secondary">Speichern</Button>
        </form>
      ))}
    </div>
  );
}

/** Stand der Google-Anbindung mit Verbindungsprüfung. Die Schlüssel selbst werden hier nicht angezeigt. */
function GoogleStatus({ google }: { google: { server: boolean; browser: boolean } }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<GoogleCheck[] | null>(null);
  const [map, setMap] = useState<{ key: string; latitude: number; longitude: number } | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setMap(null);
    const result = await checkGoogleMaps();
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setChecks(result.checks);
    /* Die Karte prüft den Browser-Schlüssel dort, wo er gebraucht wird: im Browser. Ohne gefundenen Standort zeigt sie Berlin. */
    if (result.browserKey) setMap({ key: result.browserKey, latitude: result.location?.latitude ?? 52.5186, longitude: result.location?.longitude ?? 13.3762 });
  }

  const row = (label: string, use: string, name: string, present: boolean) => (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Badge tone={present ? "ok" : "neutral"}>{present ? "hinterlegt" : "fehlt"}</Badge>
      <span className="font-semibold">{label}</span>
      <span className="text-muted">{use} · <code>{name}</code></span>
    </li>
  );

  return (
    <Panel>
      <h2 className="font-display text-xl">Google Maps</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Adressvorschläge, genauere Standortsuche und die Karte im Angebot kommen von Google. Die zwei Schlüssel stehen in der Datei <code>.env</code> auf dem Server, nicht im Programm. Nach einer Änderung dort muss das Programm neu gestartet werden. Ohne Schlüssel arbeitet alles wie bisher, nur ohne diese drei Funktionen.
      </p>
      <ul className="mt-4 space-y-2 text-sm" data-google-keys>
        {row("Server-Schlüssel", "Adressvorschläge und Standortsuche", "GOOGLE_MAPS_SERVER_KEY", google.server)}
        {row("Browser-Schlüssel", "Karte im Angebot", "GOOGLE_MAPS_BROWSER_KEY", google.browser)}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" disabled={busy || (!google.server && !google.browser)} onClick={() => void run()}>{busy ? "Prüft…" : "Verbindung prüfen"}</Button>
        {!google.server && !google.browser ? <span className="text-sm text-muted">Es ist noch kein Schlüssel hinterlegt. Die Anleitung steht in <code>docs/google-maps.md</code>.</span> : null}
      </div>
      {error ? <div className="mt-3"><Notice tone="danger">{error}</Notice></div> : null}
      {checks ? (
        <ul className="mt-4 space-y-3 text-sm" data-google-checks>
          {checks.map((check) => (
            <li key={check.name} className="rounded-xl border border-line bg-white p-3">
              <p className="flex flex-wrap items-center gap-2 font-semibold"><Badge tone={check.ok ? "ok" : "danger"}>{check.ok ? "in Ordnung" : "Fehler"}</Badge>{check.name}</p>
              <p className="mt-1 break-words">{check.detail}</p>
              {check.hint ? <p className="mt-1 text-warn">{check.hint}</p> : null}
            </li>
          ))}
          {checks.length === 0 ? <li className="text-muted">Ohne Server-Schlüssel gibt es keine Adressvorschläge und keine Standortsuche über Google.</li> : null}
        </ul>
      ) : null}
      {map ? (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold">Karte (Maps JavaScript API)</p>
          <GoogleMap apiKey={map.key} start={{ latitude: map.latitude, longitude: map.longitude, zoom: 18 }} className="h-80 w-full max-w-3xl" />
          <p className="mt-1 text-xs text-muted">Erscheint hier ein Satellitenbild mit Fadenkreuz, funktioniert der Browser-Schlüssel.</p>
        </div>
      ) : checks && !google.browser ? <p className="mt-4 text-sm text-muted">Ohne Browser-Schlüssel gibt es im Angebot keinen Knopf „Auf der Karte prüfen“.</p> : null}
    </Panel>
  );
}
