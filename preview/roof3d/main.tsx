import { createRoot } from "react-dom/client";
import { Planner3D } from "@/components/roof3d/planner3d";
import { demoGround } from "./demo-ground";

/** Vorschau ohne Server: die echte Planungsoberfläche auf einem gemalten Beispiel-Luftbild. */
const ground = { kind: "canvas" as const, paint: demoGround, sizeM: 160, credit: "Beispielbild, kein echtes Luftbild" };

createRoot(document.getElementById("root")!).render(
  <Planner3D
    title="3D-Planung"
    subtitle="Vorschau Stufe 1: Gebäude"
    initial={[]}
    ground={ground}
    onSave={async () => "In der Vorschau wird nichts gespeichert. Im Programm landet das Dach im Angebot."}
  />,
);
