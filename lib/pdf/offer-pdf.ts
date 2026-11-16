import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { CalcResult } from "@/lib/calc/offer";
import type { PdfPageKey, PdfPageSetting } from "@/lib/content";
import { PDF_PAGE_LABELS } from "@/lib/content";
import type { OfferDTO, VariantDTO } from "@/lib/domain";
import { formatDate, formatEuro, formatNumber, formatPercent } from "@/lib/format";
import { PAYMENT_LABEL } from "@/lib/labels";
import { drawRoofPlan } from "@/lib/pdf/roof-plan";
import { PVGIS_SOURCE_NOTE, type RoofFaceInput } from "@/lib/pvgis/types";
import { activeModuleCount } from "@/lib/roof/types";

export type PdfCompany = {
  companyName: string;
  street: string;
  zip: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  taxNumber: string;
  vatId: string;
  iban: string;
  bic: string;
  bankName: string;
  logoPath: string | null;
  primaryColor: string;
  accentColor: string;
  aboutText: string;
  legalText: string;
  coverSubtitle: string;
  pages: PdfPageSetting[];
};

export type PdfModel = {
  company: PdfCompany;
  number: string;
  title: string;
  createdAt: Date;
  customerName: string;
  customerAddress: string;
  siteAddress: string;
  segmentLabel: string;
  offer: OfferDTO;
  activeVariantId: string;
  results: { variant: VariantDTO; result: CalcResult }[];
};

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function hex(value: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

export function renderOfferPdf(model: PdfModel): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
  const fontDir = path.join(process.cwd(), "assets/fonts");
  doc.registerFont("Regular", path.join(fontDir, "NotoSans-Regular.ttf"));
  doc.registerFont("Bold", path.join(fontDir, "NotoSans-Bold.ttf"));
  doc.registerFont("Italic", path.join(fontDir, "NotoSans-Italic.ttf"));
  const brand = hex(model.company.primaryColor, "#1e5c42");
  const accent = hex(model.company.accentColor, "#c65b2e");
  const ink = "#1c2622";
  const muted = "#5c6b64";
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const active = model.results.find((entry) => entry.variant.id === model.activeVariantId) ?? model.results[0];
  const width = doc.page.width - 96;

  const h1 = (title: string) => {
    doc.fillColor(brand).font("Bold").fontSize(18).text(title, 48, 64, { width });
    doc.moveDown(0.3);
    doc.strokeColor(accent).lineWidth(2).moveTo(48, doc.y).lineTo(120, doc.y).stroke();
    doc.moveDown(0.8);
    doc.fillColor(ink).font("Regular").fontSize(10);
  };

  const paragraph = (text: string) => {
    doc.font("Regular").fontSize(10).fillColor(ink).text(text, 48, doc.y, { width, lineGap: 2 });
    doc.moveDown(0.6);
  };

  const ensure = (height: number) => {
    if (doc.y + height > doc.page.height - 64) doc.addPage();
  };

  const kv = (rows: [string, string][]) => {
    for (const [label, value] of rows) {
      ensure(18);
      const y = doc.y;
      doc.font("Regular").fontSize(9).fillColor(muted).text(label, 48, y, { width: 180 });
      doc.font("Bold").fontSize(10).fillColor(ink).text(value || "–", 230, y, { width: width - 182 });
      doc.y = Math.max(doc.y, y + 16);
    }
    doc.moveDown(0.4);
  };

  const drawCover = () => {
    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#f7f3eb");
    doc.rect(0, 0, 18, doc.page.height).fill(accent);
    doc.rect(0, 0, doc.page.width, 220).fill(brand);
    if (model.company.logoPath && fs.existsSync(model.company.logoPath)) {
      try {
        doc.image(model.company.logoPath, 48, 36, { fit: [140, 52] });
      } catch {
        doc.fillColor("#f7f3eb").font("Bold").fontSize(14).text(model.company.companyName, 48, 48, { width: 400 });
      }
    } else {
      doc.fillColor("#f7f3eb").font("Bold").fontSize(14).text(model.company.companyName, 48, 48, { width: 420 });
    }
    doc.fillColor("#f6d7c6").font("Regular").fontSize(11).text("Angebot", 48, 120, { width: 400 });
    doc.fillColor("#fffdf8").font("Bold").fontSize(26).text(model.title, 48, 140, { width: 480 });
    doc.fillColor("#f7f3eb").font("Regular").fontSize(12).text(model.company.coverSubtitle, 48, 260, { width: 460 });
    doc.fillColor(ink).font("Bold").fontSize(14).text(model.customerName, 48, 320, { width: 460 });
    doc.font("Regular").fontSize(11).text(model.customerAddress || model.siteAddress, 48, 342, { width: 460 });
    const facts: [string, string][] = [
      ["Angebotsnummer", model.number],
      ["Datum", formatDate(model.createdAt)],
      ["Gültig bis", model.offer.validUntil ? formatDate(model.offer.validUntil) : "auf Anfrage"],
      ["Variante", active?.variant.name ?? "–"],
      ["Objekt", model.siteAddress || model.customerAddress || "–"],
    ];
    let y = 420;
    for (const [label, value] of facts) {
      doc.font("Regular").fontSize(9).fillColor(muted).text(label, 48, y, { width: 140 });
      doc.font("Bold").fontSize(11).fillColor(ink).text(value, 190, y, { width: 340 });
      y += 28;
    }
    doc.font("Regular").fontSize(9).fillColor(muted).text(
      [model.company.street, [model.company.zip, model.company.city].filter(Boolean).join(" "), model.company.phone, model.company.email]
        .filter(Boolean)
        .join("  ·  "),
      48,
      760,
      { width: 480 },
    );
  };

  const lineTable = (sections: string[]) => {
    const lines = active?.result.pricing.lines.filter((line) => sections.includes(line.section)) ?? [];
    if (lines.length === 0) {
      paragraph("In dieser Variante sind dazu keine Positionen enthalten.");
      return;
    }
    ensure(28);
    const columns = [210, 55, 70, 70, 70];
    const headers = ["Position", "Menge", "Einzel netto", "Netto", "Brutto"];
    let y = doc.y;
    doc.font("Bold").fontSize(8).fillColor(muted);
    let x = 48;
    headers.forEach((header, index) => {
      doc.text(header, x, y, { width: columns[index] });
      x += columns[index];
    });
    y += 16;
    doc.strokeColor("#e4d9c8").moveTo(48, y).lineTo(48 + width, y).stroke();
    y += 6;
    for (const line of lines) {
      const nameHeight = doc.font("Regular").fontSize(9).heightOfString(line.name, { width: columns[0] - 6 });
      if (y + nameHeight + 8 > doc.page.height - 64) {
        doc.addPage();
        y = 64;
      }
      doc.font("Regular").fontSize(9).fillColor(ink).text(line.name, 48, y, { width: columns[0] - 6 });
      const values = [
        `${formatNumber(line.quantity, line.quantity % 1 === 0 ? 0 : 1)} ${line.unit}`,
        formatEuro(line.unitPriceNet),
        formatEuro(line.net),
        formatEuro(line.gross),
      ];
      let cursor = 48 + columns[0];
      values.forEach((value, index) => {
        doc.text(value, cursor, y, { width: columns[index + 1] - 4 });
        cursor += columns[index + 1];
      });
      y += Math.max(16, nameHeight + 6);
      if (line.vatRate === 0) {
        doc.font("Italic").fontSize(8).fillColor(muted).text("Nullsteuersatz § 12 Abs. 3 UStG", 48, y, { width });
        y += 12;
      }
    }
    doc.y = y + 8;
  };

  const drawOverview = () => {
    h1("Gesamtübersicht");
    paragraph(`${model.segmentLabel} · ${model.siteAddress || model.customerAddress || "Standort folgt"}`);
    for (const entry of model.results) {
      ensure(78);
      const y = doc.y;
      doc.roundedRect(48, y, width, 70, 8).strokeColor("#e4d9c8").stroke();
      doc.font("Bold").fontSize(12).fillColor(ink).text(entry.variant.name + (entry.variant.recommended ? "  ·  empfohlen" : ""), 60, y + 10, { width: width - 24 });
      doc.font("Regular").fontSize(9).fillColor(muted).text(
        `${formatNumber(entry.result.kwp, 2)} kWp · Speicher ${formatNumber(entry.result.batteryKwh, 1)} kWh · Kunde zahlt ${formatEuro(entry.result.investment)}`,
        60,
        y + 30,
        { width: width - 24 },
      );
      doc.text(
        `Autarkie ${formatPercent(entry.result.self.autarkyRatio)} · Ersparnis im ersten Jahr ${formatEuro(entry.result.kpis.annualSavingsYear1)} · Amortisation ${entry.result.kpis.breakEvenYears == null ? "offen" : `${formatNumber(entry.result.kpis.breakEvenYears, 1)} Jahre`}`,
        60,
        y + 46,
        { width: width - 24 },
      );
      doc.y = y + 82;
    }
    if (active) {
      paragraph(`Die folgenden Seiten beschreiben die Variante „${active.variant.name}“.`);
    }
  };

  const drawProduction = () => {
    if (!active) return;
    h1("Ertrag und Eigenverbrauch");
    paragraph(active.result.yield.description);
    kv([
      ["Jahresertrag", `${formatNumber(active.result.yield.annualKwh, 0)} kWh`],
      ["Spezifischer Ertrag", `${formatNumber(active.variant.specificYield, 0)} kWh/kWp`],
      ["Eigenverbrauch", `${formatNumber(active.result.self.selfConsumedKwh, 0)} kWh (${formatPercent(active.result.self.selfConsumptionRatio)})`],
      ["Autarkie", formatPercent(active.result.self.autarkyRatio)],
      ["Einspeisung", `${formatNumber(active.result.self.feedInKwh, 0)} kWh`],
    ]);
    const monthly = active.result.yield.monthlyKwh;
    const max = Math.max(...monthly, 1);
    const base = doc.y + 110;
    ensure(140);
    monthly.forEach((value, index) => {
      const barHeight = (value / max) * 90;
      const x = 56 + index * 40;
      doc.rect(x, base - barHeight, 22, barHeight).fill(brand);
      doc.font("Regular").fontSize(7).fillColor(muted).text(MONTHS[index], x - 2, base + 6, { width: 28, align: "center" });
    });
    doc.y = base + 28;
    doc.moveDown(0.6);
    if (active.result.yield.providerId === "pvgis") {
      paragraph(PVGIS_SOURCE_NOTE);
      if (active.variant.faces.length > 0) {
        paragraph(active.variant.faces.map(faceLine).join(" · "));
      }
    }
    drawRoofPlan(doc, active.variant.faces, { brand, ink, muted, accent });
  };

  const faceLine = (face: RoofFaceInput) => {
    const count = activeModuleCount(face.geometry);
    const modules = count > 0 ? `, ${count} Module` : "";
    return `${face.name}: ${formatNumber(face.kwp, 2)} kWp${modules}, ${formatNumber(face.tiltDeg, 0)}°, Azimut ${formatNumber(face.azimuthDeg, 0)}, Verluste ${formatNumber(face.lossesPercent, 1)} %`;
  };

  const drawPrices = () => {
    if (!active) return;
    h1("Preise und Zahlung");
    lineTable(["module", "inverter", "mounting", "storage", "wallbox", "heatpump", "extra"]);
    const pricing = active.result.pricing;
    kv([
      ["Netto vor Rabatt", formatEuro(pricing.netBeforeRebate)],
      ["Rabatt netto", formatEuro(pricing.rebateNet)],
      ["Netto", formatEuro(pricing.net)],
      ["Umsatzsteuer", formatEuro(pricing.vat)],
      ["Brutto", formatEuro(pricing.gross)],
      ["Investition für die Wirtschaftlichkeit", formatEuro(active.result.investment)],
    ]);
    for (const bucket of pricing.vatByRate) {
      paragraph(`${bucket.rate === 0 ? "0 %" : "19 %"}: Netto ${formatEuro(bucket.net)}, Steuer ${formatEuro(bucket.vat)}.`);
    }
    const pay = active.result.financing;
    paragraph(`Zahlungsart: ${PAYMENT_LABEL[pay.mode]}.`);
    if (pay.mode === "BAR") paragraph(`Der Kunde zahlt ${formatEuro(pay.customerPays)}.`);
    if (pay.mode === "FINANZIERUNG") {
      paragraph(
        `Anzahlung ${formatEuro(pay.downPayment)}, finanzierter Betrag ${formatEuro(pay.principal)}, ${formatNumber(pay.interestPct, 2)} % nominal, ${pay.periods} Monatsraten zu ${formatEuro(pay.payment)}. Zinsen gesamt ${formatEuro(pay.totalInterest)}.`,
      );
    }
    if (pay.mode === "RATEN") {
      paragraph(
        `${pay.periods} Raten alle ${pay.intervalMonths} Monate zu ${formatEuro(pay.payment)}${pay.interestPct > 0 ? `, Zinssatz ${formatNumber(pay.interestPct, 2)} %` : ""}.`,
      );
    }
    doc.moveDown(0.6);
    paragraph("Annahme der Variante „" + active.variant.name + "“");
    paragraph("Ort, Datum _______________________          Unterschrift _______________________");
  };

  const drawEconomics = () => {
    if (!active) return;
    h1("Wirtschaftlichkeit");
    paragraph(
      "Barkauf, ohne Finanzierungskosten. Strompreis und EEG-Vergütung sind Annahmen. Die Eigenverbrauchsquote ist eine Näherung, kein gemessener Lastgang.",
    );
    const kpis = active.result.kpis;
    kv([
      ["Ersparnis im ersten Jahr", formatEuro(kpis.annualSavingsYear1)],
      ["Amortisation", kpis.breakEvenYears == null ? "im Zeitraum nicht erreicht" : `${formatNumber(kpis.breakEvenYears, 1)} Jahre`],
      ["Überschuss nach " + active.variant.horizonYears + " Jahren", formatEuro(kpis.netProfit)],
      ["Interner Zinsfuß", kpis.irr == null ? "–" : formatPercent(kpis.irr)],
      ["Stromgestehungskosten", kpis.lcoePerKwh == null ? "–" : `${formatNumber(kpis.lcoePerKwh * 100, 1)} ct/kWh`],
    ]);
    ensure(24);
    doc.font("Bold").fontSize(8).fillColor(muted).text("Jahr", 48, doc.y, { continued: false });
    const headerY = doc.y - 10;
    doc.text("Ertrag kWh", 100, headerY);
    doc.text("Nutzen", 210, headerY);
    doc.text("Summe", 320, headerY);
    doc.y = headerY + 16;
    for (const row of active.result.cashflow) {
      if (row.year === 0 || row.year % 5 === 0 || row.year === active.variant.horizonYears) {
        ensure(14);
        const y = doc.y;
        doc.font("Regular").fontSize(8).fillColor(ink);
        doc.text(String(row.year), 48, y);
        doc.text(row.year === 0 ? "Investition" : formatNumber(row.productionKwh, 0), 100, y);
        doc.text(formatEuro(row.year === 0 ? row.cashflow : row.energyBenefit - row.opex), 210, y);
        doc.text(formatEuro(row.cumulative), 320, y);
        doc.y = y + 12;
      }
    }
  };

  const sectionPages: Record<PdfPageKey, () => void> = {
    cover: drawCover,
    about: () => {
      h1(model.company.companyName);
      paragraph(model.company.aboutText);
      kv([
        ["Adresse", [model.company.street, [model.company.zip, model.company.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")],
        ["Telefon", model.company.phone],
        ["E-Mail", model.company.email],
        ["Web", model.company.website],
        ["USt-IdNr.", model.company.vatId],
        ["Bank", [model.company.bankName, model.company.iban, model.company.bic].filter(Boolean).join(" · ")],
      ]);
    },
    overview: drawOverview,
    pv: () => {
      h1("Photovoltaik");
      if (!active) return;
      kv([
        ["Anlagengröße", `${formatNumber(active.result.kwp, 2)} kWp`],
        ["Wechselrichter", active.result.inverterKw > 0 ? `${formatNumber(active.result.inverterKw, 1)} kW` : "–"],
        ["DC/AC", active.result.dcAcRatio == null ? "–" : formatPercent(active.result.dcAcRatio)],
      ]);
      lineTable(["module", "inverter", "mounting"]);
    },
    production: drawProduction,
    storage: () => {
      h1(PDF_PAGE_LABELS.storage);
      if (active) kv([["Nutzbare Speicherkapazität", `${formatNumber(active.result.batteryKwh, 1)} kWh`]]);
      lineTable(["storage"]);
    },
    wallbox: () => {
      h1(PDF_PAGE_LABELS.wallbox);
      lineTable(["wallbox"]);
    },
    heatpump: () => {
      h1(PDF_PAGE_LABELS.heatpump);
      lineTable(["heatpump"]);
    },
    building: () => {
      h1("Gebäude und Verbrauch");
      const offer = model.offer;
      kv([
        ["Gebäude", [offer.buildingType, offer.buildingYear ? `Baujahr ${offer.buildingYear}` : ""].filter(Boolean).join(", ")],
        ["Dach", [offer.roofType, offer.orientation, offer.tiltDeg != null ? `${formatNumber(offer.tiltDeg, 0)}°` : ""].filter(Boolean).join(", ")],
        ["Dachfläche", offer.roofAreaM2 != null ? `${formatNumber(offer.roofAreaM2, 0)} m²` : "–"],
        ["Denkmalschutz", offer.monumentProtected ? "ja" : "nein"],
        ["Haushaltsstrom", `${formatNumber(offer.householdKwh, 0)} kWh/Jahr`],
        ["Wärmepumpe, elektrisch", `${formatNumber(offer.heatPumpElectricKwh, 0)} kWh/Jahr`],
        ["E-Auto", `${formatNumber(offer.evKwh, 0)} kWh/Jahr`],
        ["Weiterer Strom", `${formatNumber(offer.otherKwh, 0)} kWh/Jahr`],
        ["Strompreis", `${formatNumber(offer.electricityPriceEur * 100, 1)} ct/kWh`],
        ["Bestehende PV", offer.existingPvKwp > 0 ? `${formatNumber(offer.existingPvKwp, 2)} kWp` : "keine"],
        ["Bestehende Heizung", offer.existingHeating || "–"],
        ["Notiz", offer.buildingNote || "–"],
      ]);
    },
    prices: drawPrices,
    economics: drawEconomics,
    legal: () => {
      h1("Hinweise zum Angebot");
      paragraph(model.company.legalText);
    },
  };

  const enabled = model.company.pages.filter((page) => page.enabled);
  const ordered = enabled.length > 0 ? enabled : [{ key: "cover" as const, enabled: true }];
  ordered.forEach((page, index) => {
    if (index > 0) doc.addPage();
    if (page.key !== "cover") {
      doc.save();
      doc.rect(0, 0, doc.page.width, 8).fill(brand);
      doc.restore();
      doc.y = 28;
    }
    const lines = active?.result.pricing.lines ?? [];
    const skip =
      (page.key === "storage" && !lines.some((line) => line.section === "storage")) ||
      (page.key === "wallbox" && !lines.some((line) => line.section === "wallbox")) ||
      (page.key === "heatpump" && !lines.some((line) => line.section === "heatpump"));
    if (skip) {
      h1(PDF_PAGE_LABELS[page.key]);
      paragraph("Für diese Variante ist kein Bestandteil vorgesehen. Die Seite bleibt der Vollständigkeit halber kurz.");
      return;
    }
    sectionPages[page.key]();
  });

  const range = doc.bufferedPageRange();
  for (let pageIndex = 0; pageIndex < range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    const previous = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Regular").fontSize(8).fillColor(muted);
    doc.text(model.company.companyName, 48, doc.page.height - 28, { width: 240, lineBreak: false, height: 12 });
    doc.text(`${model.number} · Seite ${pageIndex + 1} von ${range.count}`, 300, doc.page.height - 28, {
      width: doc.page.width - 348,
      align: "right",
      lineBreak: false,
      height: 12,
    });
    doc.page.margins.bottom = previous;
  }

  doc.end();
  return done;
}
