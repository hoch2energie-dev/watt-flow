import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CustomerForm } from "@/components/customer-form";
import { OfferWizard } from "@/components/offer/wizard";
import { OfferPlanner3D } from "@/components/roof3d/offer-planner";
import { Shell } from "@/components/shell";
import { Notice, PageHeader } from "@/components/ui";
import { demoCatalog, demoMeta } from "../demo-data";
import { demoGround } from "../roof3d/demo-ground";
import { db, listeners, route, toast } from "./stubs/db";

/**
 * Vorschau ohne Server: Angebotsseite und 3D-Planung mit einem Beispielangebot, das im Speicher liegt,
 * dazu das Formular „Kontakt anlegen" mit Adressvorschlägen aus erfundenen Anschriften.
 */
type Page = "angebot" | "planung" | "kontakt";
const pageOf = (hash: string): Page => (hash === "#planung" ? "planung" : hash === "#kontakt" ? "kontakt" : "angebot");
const user = { name: "Rudolf Gress", email: "", role: "ADMIN" as const };

const ground = { kind: "canvas" as const, paint: demoGround, sizeM: 160, credit: "Beispielbild, kein echtes Luftbild" };

function App() {
  const [page, setPage] = useState<Page>(pageOf(window.location.hash));
  const [visit, setVisit] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => {
      setPage(pageOf(window.location.hash));
      setVisit((value) => value + 1);
    };
    const onClick = (event: MouseEvent) => {
      /* Hat das Programm den Klick schon selbst abgefangen, bleibt es dabei. */
      const link = event.defaultPrevented ? null : (event.target as Element | null)?.closest?.("a[href^='/']");
      if (!link) return;
      event.preventDefault();
      route(link.getAttribute("href") ?? "");
    };
    const onSubmit = (event: Event) => {
      event.preventDefault();
      toast("Formulare schickt die Vorschau nicht ab.");
    };
    let timer = 0;
    const listener = (text: string) => {
      setNote(text);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setNote(null), 3500);
    };
    listeners.add(listener);
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  return (
    <>
      {page === "planung" ? (
        <OfferPlanner3D key={`p${visit}`} initial={db.offer} catalog={demoCatalog} variantId={db.offer.variants[0].id} siteAddress={demoMeta.siteAddress} customerName={demoMeta.customerName} locked={false} groundOverride={ground} />
      ) : page === "kontakt" ? (
        <Shell user={user} company="Vorschau mit Beispieldaten" mustChangePassword={false} demoSecret={false}>
          <PageHeader eyebrow="Kunden" title="Kontakt anlegen" description="Beim Tippen in „Straße“ erscheinen Adressvorschläge. Ein Vorschlag füllt Straße, PLZ und Ort." />
          <div className="mb-4 max-w-3xl"><Notice>Die Vorschau fragt nicht bei Google an. Sie kennt nur ein paar erfundene Anschriften, zum Beispiel „Musterweg“, „Beispielallee“ oder „Testring“.</Notice></div>
          <div className="max-w-3xl"><CustomerForm key={`k${visit}`} /></div>
        </Shell>
      ) : (
        <Shell user={user} company="Vorschau mit Beispieldaten" mustChangePassword={false} demoSecret={false}>
          <OfferWizard key={`a${visit}`} initial={db.offer} catalog={demoCatalog} meta={demoMeta} />
        </Shell>
      )}
      {note ? <p role="status" style={{ position: "fixed", left: "50%", bottom: 84, transform: "translateX(-50%)", zIndex: 80, margin: 0, padding: "8px 14px", borderRadius: 8, background: "#1c2622", color: "#fffdf8", fontSize: 14 }}>{note}</p> : null}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
