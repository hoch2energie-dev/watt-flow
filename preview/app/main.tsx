import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { OfferWizard } from "@/components/offer/wizard";
import { OfferPlanner3D } from "@/components/roof3d/offer-planner";
import { Shell } from "@/components/shell";
import { demoCatalog, demoMeta } from "../demo-data";
import { demoGround } from "../roof3d/demo-ground";
import { db, listeners, route, toast } from "./stubs/db";

/** Vorschau ohne Server: Angebotsseite und 3D-Planung mit einem Beispielangebot, das im Speicher liegt. */
const ground = { kind: "canvas" as const, paint: demoGround, sizeM: 160, credit: "Beispielbild, kein echtes Luftbild" };

function App() {
  const [page, setPage] = useState(window.location.hash === "#planung" ? "planung" : "angebot");
  const [visit, setVisit] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => {
      setPage(window.location.hash === "#planung" ? "planung" : "angebot");
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
        <OfferPlanner3D key={`p${visit}`} initial={db.offer} variantId={db.offer.variants[0].id} siteAddress={demoMeta.siteAddress} customerName={demoMeta.customerName} locked={false} groundOverride={ground} />
      ) : (
        <Shell user={{ name: "Rudolf Gress", email: "", role: "ADMIN" }} company="Vorschau mit Beispieldaten" mustChangePassword={false} demoSecret={false}>
          <OfferWizard key={`a${visit}`} initial={db.offer} catalog={demoCatalog} meta={demoMeta} />
        </Shell>
      )}
      {note ? <p role="status" style={{ position: "fixed", left: "50%", bottom: 84, transform: "translateX(-50%)", zIndex: 80, margin: 0, padding: "8px 14px", borderRadius: 8, background: "#1c2622", color: "#fffdf8", fontSize: 14 }}>{note}</p> : null}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
