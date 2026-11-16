import PDFDocument from "pdfkit";
import { centroidLngLat, heightOnPlane, toLocal, vertexHeights, type XY } from "@/lib/roof/geo";
import { activeModuleCount } from "@/lib/roof/types";
import { formatNumber } from "@/lib/format";
import type { RoofFaceInput } from "@/lib/pvgis/types";

type Colors = { brand: string; ink: string; muted: string; accent: string };

type Point = { x: number; y: number };

/**
 * Schematische Draufsicht und eine einfache Isometrie.
 * Das Luftbild bleibt in der Planung; ins PDF kommt die Belegung als Vektorzeichnung.
 */
type Doc = InstanceType<typeof PDFDocument>;

export function drawRoofPlan(doc: Doc, faces: RoofFaceInput[], colors: Colors) {
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
  for (const face of planned) {
    localOf(face).forEach(collect);
    face.geometry?.modules.filter((panel) => panel.active).forEach((panel) => panel.corners.forEach(collect));
  }
  const projectPlan = fitter(planPoints.map((point) => ({ x: point.east, y: point.north })), plan, true);

  for (const face of planned) {
    strokeFill(doc, localOf(face).map((point) => projectPlan(point[0], point[1])), "#f6f1e6", colors.brand);
    for (const obstacle of face.geometry?.obstacles ?? []) {
      strokeFill(doc, obstacle.ring.map((point) => toLocal(point, origin)).map((point) => projectPlan(point[0], point[1])), colors.accent, colors.accent);
    }
    for (const panel of face.geometry?.modules ?? []) {
      if (!panel.active) continue;
      strokeFill(doc, panel.corners.map((corner) => projectPlan(corner[0], corner[1])), "#1e4d6b", "#143044");
    }
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
    for (const panel of face.geometry?.modules ?? []) {
      if (!panel.active) continue;
      const corners = panel.corners.map((corner) => {
        const point: XY = [corner[0], corner[1]];
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
    "Blau: Modul. Orange: Hindernis. Die Verschattung aus Hindernissen und dem PVGIS-Horizont steckt als zusätzlicher Verlust in der Ertragsrechnung, nicht als zweites Mal in den 14 % Anlagenverlust.",
    48,
    570,
    { width: 500 },
  );
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
