import PDFDocument from "pdfkit";
import { centroidLngLat, centroidXY, heightOnPlane, moduleCornersAt, toLocal, vertexHeights, type XY } from "@/lib/roof/geo";
import { activeModuleCount } from "@/lib/roof/types";
import { formatNumber } from "@/lib/format";
import type { RoofFaceInput } from "@/lib/pvgis/types";

type Colors = { brand: string; ink: string; muted: string; accent: string };

/** Strings aus der 3D-Planung, mit dem Anschluss als fertigem Text ("MPP 1 an Wechselrichter"). */
export type RoofPlanString = { id: string; name: string; color: string; port: string };

type Point = { x: number; y: number };

/**
 * Schematische Draufsicht und eine einfache Isometrie.
 * Das Luftbild bleibt in der Planung; ins PDF kommt die Belegung als Vektorzeichnung.
 */
type Doc = InstanceType<typeof PDFDocument>;

export function drawRoofPlan(doc: Doc, faces: RoofFaceInput[], colors: Colors, strings: RoofPlanString[] = []) {
  const planned = faces.filter((face) => (face.geometry?.ring.length ?? 0) >= 3);
  if (planned.length === 0) return;
  const anchors = planned.flatMap((face) => face.geometry?.ring ?? []);
  const origin = centroidLngLat(anchors);
  doc.addPage();
  doc.save();
  doc.rect(0, 0, doc.page.width, 8).fill(colors.brand);
  doc.restore();
  doc.fillColor(colors.brand).font("Bold").fontSize(18).text("Dachbelegung", 48, 36, { width: 500 });
  doc.font("Regular").fontSize(9).fillColor(colors.muted).text(
    "Draufsicht und vereinfachte Ansicht aus der Dachplanung. Module, die angeklickt und entfernt wurden, fehlen.",
    48,
    62,
    { width: 500 },
  );

  const plan = boxOf(48, 96, 500, 250);
  const planPoints: { east: number; north: number }[] = [];
  const collect = (point: XY) => planPoints.push({ east: point[0], north: point[1] });
  const localOf = (face: RoofFaceInput) => (face.geometry?.ring ?? []).map((point) => toLocal(point, origin));
  /* Belegte Module einer Fläche im gemeinsamen Bezugssystem der Zeichnung. */
  const panelsOf = (face: RoofFaceInput) =>
    (face.geometry?.modules ?? []).filter((panel) => panel.active).map((panel) => moduleCornersAt(face.geometry?.ring ?? [], panel.corners, origin));
  /* Je String: Farbe, Stückzahl, Leistung und der Weg durch die Module in der Reihenfolge der Verschaltung. */
  const wiring = new Map(strings.map((entry) => [entry.id, { ...entry, count: 0, watts: 0, path: [] as { order: number; at: XY }[] }]));
  /* Zu jedem belegten Modul einer Fläche sein String, in derselben Reihenfolge wie `panelsOf`. */
  const ownersOf = (face: RoofFaceInput) =>
    (face.geometry?.modules ?? []).filter((panel) => panel.active).map((panel) => ({ owner: panel.string ? wiring.get(panel.string) ?? null : null, order: panel.order ?? 0 }));
  for (const face of planned) {
    const owners = ownersOf(face);
    panelsOf(face).forEach((corners, index) => {
      const { owner, order } = owners[index];
      if (!owner) return;
      owner.count += 1;
      owner.watts += face.geometry?.placement?.powerWp ?? 0;
      owner.path.push({ order, at: centroidXY(corners) });
    });
  }
  const wired = [...wiring.values()].filter((entry) => entry.count > 0);
  for (const face of planned) {
    localOf(face).forEach(collect);
    panelsOf(face).forEach((corners) => corners.forEach(collect));
  }
  const projectPlan = fitter(planPoints.map((point) => ({ x: point.east, y: point.north })), plan, true);

  for (const face of planned) {
    strokeFill(doc, localOf(face).map((point) => projectPlan(point[0], point[1])), "#f6f1e6", colors.brand);
    for (const obstacle of face.geometry?.obstacles ?? []) {
      strokeFill(doc, obstacle.ring.map((point) => toLocal(point, origin)).map((point) => projectPlan(point[0], point[1])), colors.accent, colors.accent);
    }
    const owners = ownersOf(face);
    panelsOf(face).forEach((corners, index) => {
      strokeFill(doc, corners.map((corner) => projectPlan(corner[0], corner[1])), owners[index].owner?.color ?? "#1e4d6b", "#143044");
    });
  }
  /* Der Weg jedes Strings durch seine Module, als dünne helle Linie über der Draufsicht. */
  for (const entry of wired) {
    const stops = entry.path.sort((a, b) => a.order - b.order).map((stop) => projectPlan(stop.at[0], stop.at[1]));
    if (stops.length < 2) continue;
    doc.save();
    doc.moveTo(stops[0].x, stops[0].y);
    for (const stop of stops.slice(1)) doc.lineTo(stop.x, stop.y);
    doc.strokeColor("#ffffff").lineWidth(0.7).lineJoin("round").stroke();
    doc.restore();
  }

  const isoBox = boxOf(48, 364, 250, 190);
  const isoPoints: Point[] = [];
  const isoFace = (face: RoofFaceInput) => {
    const local = localOf(face);
    const heights = vertexHeights(local, face.azimuthDeg, face.tiltDeg);
    return local.map((point, index) => iso(point[0], point[1], heights[index]));
  };
  for (const face of planned) isoFace(face).forEach((point) => isoPoints.push(point));
  const projectIso = fitter(isoPoints, isoBox, false);
  for (const face of planned) {
    const local = localOf(face);
    const heights = vertexHeights(local, face.azimuthDeg, face.tiltDeg);
    strokeFill(
      doc,
      local.map((point, index) => projectIso(iso(point[0], point[1], heights[index]).x, iso(point[0], point[1], heights[index]).y)),
      "#e7d7c4",
      colors.brand,
    );
    for (const panel of panelsOf(face)) {
      const corners = panel.map((point) => {
        const projected = iso(point[0], point[1], heightOnPlane(local, face.azimuthDeg, face.tiltDeg, point));
        return projectIso(projected.x, projected.y);
      });
      strokeFill(doc, corners, "#1e4d6b", "#143044");
    }
  }

  doc.font("Bold").fontSize(10).fillColor(colors.ink).text("Flächen", 320, 364, { width: 220 });
  let y = 382;
  for (const face of planned) {
    const count = activeModuleCount(face.geometry);
    const shading = face.geometry?.shading;
    const extra = shading ? shading.obstacleLossPercent + shading.horizonLossPercent : 0;
    doc.font("Regular").fontSize(8).fillColor(colors.ink).text(
      `${face.name}: ${count} Module, ${formatNumber(face.kwp, 2)} kWp`,
      320,
      y,
      { width: 220 },
    );
    y += 12;
    doc.fillColor(colors.muted).text(
      `${formatNumber(face.tiltDeg, 0)}° Neigung, Azimut ${formatNumber(face.azimuthDeg, 0)}, Verluste ${formatNumber(face.lossesPercent, 1)} %${extra > 0 ? ` davon ${formatNumber(extra, 1)} % Verschattung` : ""}`,
      320,
      y,
      { width: 220 },
    );
    y += 16;
  }
  doc.font("Regular").fontSize(8).fillColor(colors.muted).text(
    `${wired.length > 0 ? "Draufsicht: Module in der Farbe ihres Strings, die helle Linie zeigt die Reihenfolge. Blau: Modul ohne String." : "Blau: Modul."} Orange: Hindernis. Die Verschattung aus Hindernissen und dem PVGIS-Horizont steckt als zusätzlicher Verlust in der Ertragsrechnung, nicht als zweites Mal in den 14 % Anlagenverlust.`,
    48,
    570,
    { width: 500 },
  );
  if (wired.length === 0) return;

  /* Verschaltung: eine Spalte, bei vielen Strings zwei. So viele Zeilen, wie über der Fußzeile Platz haben. */
  doc.font("Bold").fontSize(10).fillColor(colors.ink).text("Verschaltung", 48, 612, { width: 500 });
  const rows = 12;
  const columns = wired.length > rows ? 2 : 1;
  const columnWidth = columns === 1 ? 500 : 245;
  const shown = wired.length > rows * 2 ? wired.slice(0, rows * 2 - 1) : wired;
  shown.forEach((entry, index) => {
    const x = 48 + Math.floor(index / rows) * 255;
    const top = 630 + (index % rows) * 12;
    doc.save();
    doc.rect(x, top + 1.5, 7, 7).fill(entry.color);
    doc.restore();
    doc.font("Regular").fontSize(8).fillColor(colors.ink).text(
      `String ${entry.name}: ${entry.count} ${entry.count === 1 ? "Modul" : "Module"}, ${formatNumber(entry.watts / 1000, 2)} kWp${entry.port ? ` · ${entry.port}` : ""}`,
      x + 12,
      top,
      { width: columnWidth - 12, lineBreak: false, ellipsis: true, height: 11 },
    );
  });
  if (shown.length < wired.length) {
    const index = shown.length;
    doc.font("Regular").fontSize(8).fillColor(colors.muted).text(`und ${wired.length - shown.length} weitere Strings`, 48 + Math.floor(index / rows) * 255 + 12, 630 + (index % rows) * 12, { width: 235, lineBreak: false });
  }
}

function iso(east: number, north: number, up: number): Point {
  return { x: east - north * 0.55, y: -(north * 0.28 + up) };
}

function boxOf(x: number, y: number, w: number, h: number) {
  return { x, y, w, h };
}

function fitter(points: Point[], box: { x: number; y: number; w: number; h: number }, flipY: boolean) {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const spanX = Math.max(0.001, maxX - minX);
  const spanY = Math.max(0.001, maxY - minY);
  const pad = 10;
  const scale = Math.min((box.w - pad * 2) / spanX, (box.h - pad * 2) / spanY);
  return (x: number, y: number): Point => {
    const px = box.x + pad + (x - minX) * scale;
    const py = flipY ? box.y + box.h - pad - (y - minY) * scale : box.y + pad + (y - minY) * scale;
    return { x: px, y: py };
  };
}

function strokeFill(doc: Doc, points: Point[], fill: string, stroke: string) {
  if (points.length < 3) return;
  const draw = () => {
    doc.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) doc.lineTo(point.x, point.y);
    doc.closePath();
  };
  doc.save();
  draw();
  doc.fillColor(fill).fill();
  draw();
  doc.strokeColor(stroke).lineWidth(0.8).stroke();
  doc.restore();
}
