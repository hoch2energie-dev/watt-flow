import { createRoot } from "react-dom/client";
import { Planner3D } from "@/components/roof3d/planner3d";
import { demoGround } from "./demo-ground";

/** Vorschau ohne Server: die echte Planungsoberfläche auf einem gemalten Beispiel-Luftbild. */
const ground = { kind: "canvas" as const, paint: demoGround, sizeM: 160, credit: "Beispielbild, kein echtes Luftbild" };

createRoot(document.getElementById("root")!).render(
  <Planner3D
    title="3D-Planung"
    subtitle="Vorschau: Gebäude, Module und Strings"
    initial={[]}
    ground={ground}
    modules={[
      { id: "k1", name: "Beispielmodul 450 Wp Glas-Glas", powerWp: 450, widthM: 1.134, heightM: 1.762, electrical: { vocV: 39.8, iscA: 14.3, vmppV: 33.2, imppA: 13.56, tempCoeffVocPct: 0.25 } },
      { id: "k2", name: "Beispielmodul 430 Wp schwarz", powerWp: 430, widthM: 1.134, heightM: 1.722 },
    ]}
    inverters={[
      {
        id: "k3",
        name: "Beispiel-Hybridwechselrichter 10 kW",
        data: { name: "Beispiel-Hybridwechselrichter 10 kW", acPowerKw: 10, trackers: 2, stringsPerTracker: 1, maxDcVoltageV: 1000, mppMinV: 180, mppMaxV: 850, maxInputCurrentA: 16, maxShortCircuitCurrentA: 22, maxDcPowerKw: 15 },
      },
    ]}
    onSave={async () => "In der Vorschau wird nichts gespeichert. Im Programm landet das Dach im Angebot."}
  />,
);
