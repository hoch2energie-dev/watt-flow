"use client";

import { useEffect, useId, useRef, useState } from "react";
import { fetchAddress, fetchSuggestions } from "@/lib/address-client";
import { MIN_INPUT, type AddressSuggestion } from "@/lib/google/places";

type Names = { street: string; zip: string; city: string };

/* Ist Google am Server nicht eingerichtet, fragt die Seite nach der ersten Antwort nicht weiter. */
let switchedOff = false;
const DELAY_MS = 250;

/**
 * Straße, PLZ und Ort als drei Eingabefelder für ein Formular. Beim Tippen in „Straße" erscheinen
 * Adressvorschläge; ein gewählter Vorschlag füllt alle drei Felder. Ohne Google am Server sind es
 * drei gewöhnliche Felder. Die Feldnamen bestimmt das Formular, das sie abschickt.
 *
 * `layout="grid"`: drei Kinder für ein zweispaltiges Raster, die Straße über beide Spalten.
 * `layout="stack"`: Straße über die volle Breite, darunter PLZ und Ort nebeneinander.
 */
export function AddressFields({
  names,
  defaults,
  streetLabel = "Straße",
  layout = "grid",
}: {
  names: Names;
  defaults?: Partial<Record<keyof Names, string | null>>;
  streetLabel?: string;
  layout?: "grid" | "stack";
}) {
  const listId = useId();
  const [street, setStreet] = useState(defaults?.street ?? "");
  const [zip, setZip] = useState(defaults?.zip ?? "");
  const [city, setCity] = useState(defaults?.city ?? "");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [note, setNote] = useState<string | null>(null);
  /* Sitzungskennzeichen bei Google: gilt vom ersten Tippen bis zur Auswahl eines Vorschlags. */
  const token = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const request = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      request.current?.abort();
    },
    [],
  );

  function close() {
    setOpen(false);
    setActive(-1);
  }

  function typed(value: string) {
    setStreet(value);
    setNote(null);
    window.clearTimeout(timer.current);
    request.current?.abort();
    const input = value.trim();
    if (switchedOff || input.length < MIN_INPUT) {
      setSuggestions([]);
      close();
      return;
    }
    timer.current = window.setTimeout(async () => {
      const controller = new AbortController();
      request.current = controller;
      token.current ??= crypto.randomUUID();
      try {
        const reply = await fetchSuggestions(input, token.current, controller.signal);
        if (controller.signal.aborted) return;
        if (!reply.enabled) switchedOff = true;
        setSuggestions(reply.suggestions);
        setOpen(reply.suggestions.length > 0);
        setActive(-1);
      } catch {
        /* Abgebrochen oder Netzfehler: Das Feld bleibt ein gewöhnliches Eingabefeld. */
      }
    }, DELAY_MS);
  }

  async function choose(suggestion: AddressSuggestion) {
    window.clearTimeout(timer.current);
    request.current?.abort();
    close();
    setSuggestions([]);
    const session = token.current ?? crypto.randomUUID();
    token.current = null;
    setStreet(suggestion.main);
    try {
      const address = await fetchAddress(suggestion.placeId, session);
      if (address?.street) setStreet(address.street);
      if (address?.zip) setZip(address.zip);
      if (address?.city) setCity(address.city);
      if (!address) setNote("PLZ und Ort ließen sich nicht laden. Bitte von Hand eintragen.");
      else if (!address.zip || !address.city) setNote("Der Vorschlag enthält nicht alle Angaben. Bitte PLZ und Ort prüfen.");
    } catch {
      setNote("PLZ und Ort ließen sich nicht laden. Bitte von Hand eintragen.");
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + suggestions.length + (current < 0 && step < 0 ? 1 : 0)) % suggestions.length);
    } else if (event.key === "Enter" && active >= 0) {
      /* Enter wählt den markierten Vorschlag und schickt das Formular nicht ab. */
      event.preventDefault();
      void choose(suggestions[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  const label = "text-sm font-semibold";
  const streetField = (
    <div className={`relative ${layout === "grid" ? "sm:col-span-2" : ""}`} data-address="street">
      <label className={`block ${label}`}>
        {streetLabel}
        <input
          name={names.street}
          value={street}
          className="field mt-1"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(event) => typed(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={close}
        />
      </label>
      {open ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-line bg-white shadow-lg">
          <ul id={listId} role="listbox" aria-label="Adressvorschläge" className="max-h-72 overflow-y-auto py-1">
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.placeId}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={`cursor-pointer px-3 py-2 text-sm ${index === active ? "bg-accent-soft" : ""}`}
                /* mousedown statt click: Sonst schließt das Verlassen des Feldes die Liste, bevor der Klick ankommt. */
                onMouseDown={(event) => {
                  event.preventDefault();
                  void choose(suggestion);
                }}
                onMouseEnter={() => setActive(index)}
              >
                <span className="font-semibold">{suggestion.main}</span>
                {suggestion.secondary ? <span className="text-muted"> · {suggestion.secondary}</span> : null}
              </li>
            ))}
          </ul>
          {/* Herkunftsangabe, die Google für Vorschläge ohne Karte verlangt: der Name unverändert. */}
          <p className="border-t border-line px-3 py-1 text-right" style={{ fontFamily: "Roboto, Arial, sans-serif", fontSize: 12, color: "#5e5e5e" }} translate="no">Google Maps</p>
        </div>
      ) : null}
      {note ? <p className="mt-1 text-xs font-normal text-warn" role="status">{note}</p> : null}
    </div>
  );
  const zipField = (
    <label className={label}>PLZ<input name={names.zip} value={zip} className="field mt-1" autoComplete="off" onChange={(event) => setZip(event.target.value)} /></label>
  );
  const cityField = (
    <label className={label}>Ort<input name={names.city} value={city} className="field mt-1" autoComplete="off" onChange={(event) => setCity(event.target.value)} /></label>
  );

  if (layout === "stack") {
    return (
      <>
        {streetField}
        <div className="grid grid-cols-2 gap-2">
          {zipField}
          {cityField}
        </div>
      </>
    );
  }
  return (
    <>
      {streetField}
      {zipField}
      {cityField}
    </>
  );
}
