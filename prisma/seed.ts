import bcrypt from "bcryptjs";
import { Prisma, PrismaClient, type CatalogItem, type VatCategory } from "@prisma/client";
import { emptyQualification } from "../lib/checklist";
import { DEFAULT_ABOUT, DEFAULT_COVER, DEFAULT_LEGAL, DEFAULT_PDF_PAGES, DEFAULT_STAGES } from "../lib/content";

const prisma = new PrismaClient();

type Specs = Record<string, string | number | boolean | null>;

const catalogSeed: {
  seedKey: string;
  typeKey: string;
  manufacturer: string;
  model: string;
  name: string;
  unit: string;
  purchase: number;
  sales: number;
  vat: VatCategory;
  specs: Specs;
  description?: string;
}[] = [
  { seedKey: "NL-440", typeKey: "pv_module", manufacturer: "Nordlicht Solar", model: "NM-440", name: "Nordlicht NM-440", unit: "Stk", purchase: 112, sales: 189, vat: "PV_NULL", specs: { powerWp: 440, efficiencyPercent: 22.1, widthMm: 1134, heightMm: 1762, weightKg: 21, cellType: "TOPCon", vocV: 39.4, iscA: 14.1, vmppV: 32.8, imppA: 13.42, tempCoeffVocPct: -0.25, warrantyYears: 25 } },
  { seedKey: "NL-430", typeKey: "pv_module", manufacturer: "Nordlicht Solar", model: "NM-430", name: "Nordlicht NM-430", unit: "Stk", purchase: 104, sales: 175, vat: "PV_NULL", specs: { powerWp: 430, efficiencyPercent: 21.6, widthMm: 1134, heightMm: 1762, cellType: "TOPCon", vocV: 39.1, iscA: 13.9, vmppV: 32.5, imppA: 13.23, tempCoeffVocPct: -0.25, warrantyYears: 25 } },
  { seedKey: "FL-10", typeKey: "inverter", manufacturer: "Feldlinie", model: "FL-10", name: "Feldlinie FL-10", unit: "Stk", purchase: 1450, sales: 2180, vat: "PV_NULL", specs: { acPowerKw: 10, phases: "3", mppt: 2, efficiencyPercent: 98.2, stringsPerMppt: 1, maxDcVoltageV: 1000, mppMinV: 180, mppMaxV: 850, maxInputCurrentA: 16, maxShortCircuitCurrentA: 22, maxDcPowerKw: 15, warrantyYears: 10 } },
  { seedKey: "FL-6", typeKey: "inverter", manufacturer: "Feldlinie", model: "FL-6", name: "Feldlinie FL-6", unit: "Stk", purchase: 980, sales: 1490, vat: "PV_NULL", specs: { acPowerKw: 6, phases: "3", mppt: 2, efficiencyPercent: 97.8, stringsPerMppt: 1, maxDcVoltageV: 1000, mppMinV: 160, mppMaxV: 850, maxInputCurrentA: 16, maxShortCircuitCurrentA: 22, maxDcPowerKw: 9, warrantyYears: 10 } },
  { seedKey: "OPT-500", typeKey: "optimizer", manufacturer: "Dachwerk", model: "OPT-500", name: "Dachwerk Optimierer", unit: "Stk", purchase: 42, sales: 79, vat: "PV_NULL", specs: { powerW: 500, warrantyYears: 25 } },
  { seedKey: "DW-ZI", typeKey: "mounting_roof", manufacturer: "Dachwerk", model: "Ziegel", name: "Dachwerk Ziegelmontage", unit: "Pauschale", purchase: 900, sales: 1600, vat: "PV_NULL", specs: { roofType: "Ziegel", material: "Aluminium" } },
  { seedKey: "DW-FL", typeKey: "mounting_flat", manufacturer: "Dachwerk", model: "Flachdach", name: "Dachwerk Flachdach", unit: "Pauschale", purchase: 1100, sales: 1900, vat: "PV_NULL", specs: { material: "Aluminium", tiltDeg: 10 } },
  { seedKey: "KR-10", typeKey: "battery", manufacturer: "Kesselruhe", model: "KR-10", name: "Kesselruhe KR-10", unit: "Stk", purchase: 3100, sales: 4890, vat: "PV_NULL", specs: { capacityKwh: 10.2, usableKwh: 9.4, powerKw: 5, chemistry: "LFP", warrantyYears: 10 } },
  { seedKey: "KR-5", typeKey: "battery", manufacturer: "Kesselruhe", model: "KR-5", name: "Kesselruhe KR-5", unit: "Stk", purchase: 1850, sales: 2890, vat: "PV_NULL", specs: { capacityKwh: 5.1, usableKwh: 4.6, powerKw: 3, chemistry: "LFP", warrantyYears: 10 } },
  { seedKey: "EL-NOT", typeKey: "backup", manufacturer: "Elektroheim", model: "Notstrom", name: "Elektroheim Notstrompaket", unit: "Set", purchase: 700, sales: 1250, vat: "PV_NULL", specs: { powerKw: 5 } },
  { seedKey: "EL-EM", typeKey: "energy_manager", manufacturer: "Elektroheim", model: "Manager", name: "Elektroheim Energiemanager", unit: "Stk", purchase: 210, sales: 390, vat: "REGEL", specs: { protocol: "Modbus" } },
  { seedKey: "EL-MON", typeKey: "monitoring", manufacturer: "Elektroheim", model: "Monitor", name: "Elektroheim Monitoring", unit: "Stk", purchase: 80, sales: 160, vat: "REGEL", specs: { protocol: "WLAN" } },
  { seedKey: "LH-11", typeKey: "wallbox", manufacturer: "Ladeheim", model: "LH-11", name: "Ladeheim LH-11", unit: "Stk", purchase: 520, sales: 890, vat: "REGEL", specs: { powerKw: 11, phases: "3", cableM: 7, authorization: "App" } },
  { seedKey: "LH-22", typeKey: "wallbox", manufacturer: "Ladeheim", model: "LH-22", name: "Ladeheim LH-22", unit: "Stk", purchase: 780, sales: 1290, vat: "REGEL", specs: { powerKw: 22, phases: "3", cableM: 7, authorization: "RFID" } },
  { seedKey: "WQ-8", typeKey: "heat_pump", manufacturer: "Wärmequelle", model: "WQ-Luft-8", name: "Wärmequelle Luft 8 kW", unit: "Stk", purchase: 6200, sales: 9800, vat: "REGEL", specs: { thermalPowerKw: 8, scop: 4.4, source: "Luft", refrigerant: "R290" } },
  { seedKey: "WQ-300", typeKey: "hot_water_tank", manufacturer: "Wärmequelle", model: "Speicher 300", name: "Wärmequelle Speicher 300 l", unit: "Stk", purchase: 780, sales: 1290, vat: "REGEL", specs: { volumeL: 300 } },
  { seedKey: "WQ-500", typeKey: "buffer_tank", manufacturer: "Wärmequelle", model: "Puffer 500", name: "Wärmequelle Puffer 500 l", unit: "Stk", purchase: 920, sales: 1490, vat: "REGEL", specs: { volumeL: 500 } },
  { seedKey: "WQ-HS", typeKey: "heating_rod", manufacturer: "Wärmequelle", model: "Heizstab 3", name: "Wärmequelle Heizstab 3 kW", unit: "Stk", purchase: 90, sales: 180, vat: "REGEL", specs: { powerKw: 3 } },
  { seedKey: "EL-DC", typeKey: "cable_dc", manufacturer: "Elektroheim", model: "DC 6", name: "Elektroheim DC-Leitung 6 mm²", unit: "m", purchase: 2.4, sales: 4.8, vat: "PV_NULL", specs: { crossSectionMm2: 6 } },
  { seedKey: "EL-AC", typeKey: "cable_ac", manufacturer: "Elektroheim", model: "AC 6", name: "Elektroheim AC-Leitung 5×6", unit: "m", purchase: 3.2, sales: 6.5, vat: "PV_NULL", specs: { crossSectionMm2: 6 } },
  { seedKey: "EL-UES", typeKey: "surge_protection", manufacturer: "Elektroheim", model: "ÜSS Typ 2", name: "Elektroheim Überspannungsschutz Typ 2", unit: "Stk", purchase: 65, sales: 140, vat: "PV_NULL", specs: { spdType: "Typ 2" } },
  { seedKey: "EL-MID", typeKey: "meter", manufacturer: "Elektroheim", model: "MID", name: "Elektroheim MID-Zähler", unit: "Stk", purchase: 140, sales: 280, vat: "REGEL", specs: { mid: "ja" } },
  { seedKey: "SW-DC", typeKey: "labour_dc", manufacturer: "Stundenwerk", model: "DC", name: "DC-Montage", unit: "Stunde", purchase: 45, sales: 75, vat: "PV_NULL", specs: {} },
  { seedKey: "SW-AC", typeKey: "labour_ac", manufacturer: "Stundenwerk", model: "AC", name: "AC-Montage", unit: "Stunde", purchase: 48, sales: 82, vat: "PV_NULL", specs: {} },
  { seedKey: "SW-GER", typeKey: "scaffolding", manufacturer: "Stundenwerk", model: "Gerüst", name: "Gerüst bis 8 m", unit: "Pauschale", purchase: 350, sales: 690, vat: "REGEL", specs: {} },
  { seedKey: "SW-HAK", typeKey: "grid_connection", manufacturer: "Stundenwerk", model: "HAK", name: "HAK-Umrüstung klein", unit: "Pauschale", purchase: 180, sales: 420, vat: "REGEL", specs: {} },
  { seedKey: "SW-IBN", typeKey: "commissioning", manufacturer: "Stundenwerk", model: "IBN", name: "Inbetriebnahme", unit: "Pauschale", purchase: 120, sales: 280, vat: "PV_NULL", specs: {} },
  { seedKey: "SW-PL", typeKey: "planning", manufacturer: "Stundenwerk", model: "Planung", name: "Planung Einfamilienhaus", unit: "Pauschale", purchase: 0, sales: 450, vat: "PV_NULL", specs: {} },
];

function checks(on: string[]) {
  const qualification = emptyQualification();
  qualification.items = qualification.items.map((item) => ({ ...item, checked: on.includes(item.key) }));
  return qualification as unknown as Prisma.InputJsonValue;
}

function daysFromNow(days: number, hour: number, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function seedDemoEnabled(): boolean {
  return process.env.SEED_DEMO === "true" || process.env.SEED_DEMO === "1";
}

async function ensureUser(email: string, name: string, password: string, role: "ADMIN" | "USER", mustChangePassword: boolean) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.user.create({
    data: { email, name, role, passwordHash: await bcrypt.hash(password, 10), mustChangePassword },
  });
}

async function ensureInitialAdmin() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = (process.env.ADMIN_NAME ?? "").trim() || "Administration";
  if (!email && !password) return null;
  if (!email || !email.includes("@")) {
    throw new Error("ADMIN_EMAIL fehlt oder ist keine E-Mail-Adresse.");
  }
  if (password.length < 10) {
    throw new Error("ADMIN_PASSWORD braucht mindestens 10 Zeichen.");
  }
  const user = await ensureUser(email, name, password, "ADMIN", false);
  console.log(user.email === email ? `Administrationskonto bereit: ${email}` : email);
  return user;
}

async function main() {
  const demo = seedDemoEnabled();
  await ensureInitialAdmin();
  if (!demo && !(process.env.ADMIN_EMAIL ?? "").trim()) {
    throw new Error("Produktivstart ohne ADMIN_EMAIL. Setzen Sie ADMIN_EMAIL und ADMIN_PASSWORD, oder SEED_DEMO=true nur für eine Probelauf-Datenbank.");
  }

  const settings = await prisma.companySettings.findUnique({ where: { id: "default" } });
  if (!settings) {
    await prisma.companySettings.create({
      data: {
        id: "default",
        companyName: "Hoch2 Energiesysteme GmbH",
        street: demo ? "Beispielweg 12" : "",
        zip: demo ? "40789" : "",
        city: demo ? "Monheim am Rhein" : "Monheim am Rhein",
        phone: demo ? "02173 000000" : "",
        email: demo ? "angebote@hoch2.example" : (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase(),
        website: demo ? "https://hoch2.example" : "",
        pdfPages: DEFAULT_PDF_PAGES,
        aboutText: DEFAULT_ABOUT,
        legalText: DEFAULT_LEGAL,
        coverSubtitle: DEFAULT_COVER,
        defaultSpecificYield: 980,
        defaultEegTariff: 0.078,
        defaultElectricityPrice: 0.34,
      },
    });
  }

  if ((await prisma.kanbanStage.count()) === 0) {
    await prisma.kanbanStage.createMany({
      data: DEFAULT_STAGES.map((stage, index) => ({ ...stage, sortOrder: index })),
    });
  }

  if (!demo) {
    console.log("Beispieldaten sind aus (SEED_DEMO ist nicht true). Es wurden keine Beispielkunden angelegt.");
    return;
  }

  const leonie = await ensureUser("leonie.hartmann@hoch2.example", "Leonie Hartmann", "Sonnenklar!2026", "ADMIN", true);
  const jonas = await ensureUser("jonas.keller@hoch2.example", "Jonas Keller", "Speicher!2026", "USER", true);
  const stages = await prisma.kanbanStage.findMany();
  const stageByKey = Object.fromEntries(stages.map((stage) => [stage.seedKey, stage]));

  for (const item of catalogSeed) {
    const existing = await prisma.catalogItem.findUnique({ where: { seedKey: item.seedKey } });
    if (existing) continue;
    await prisma.catalogItem.create({
      data: {
        seedKey: item.seedKey,
        typeKey: item.typeKey,
        manufacturer: item.manufacturer,
        model: item.model,
        name: item.name,
        sku: item.seedKey,
        unit: item.unit,
        purchasePriceNet: item.purchase,
        salesPriceNet: item.sales,
        vatCategory: item.vat,
        specs: item.specs as Prisma.InputJsonValue,
        description: item.description,
      },
    });
  }
  const products = await prisma.catalogItem.findMany({ where: { seedKey: { not: null } } });
  const product = Object.fromEntries(products.map((entry) => [entry.seedKey, entry])) as Record<string, CatalogItem>;

  async function ensureCustomer(data: Prisma.CustomerCreateInput) {
    const existing = await prisma.customer.findUnique({ where: { seedKey: data.seedKey ?? undefined } });
    if (existing) return existing;
    return prisma.customer.create({ data });
  }

  const bergmann = await ensureCustomer({
    seedKey: "bergmann",
    segment: "HAUSHALT",
    firstName: "Lena",
    lastName: "Bergmann",
    email: "lena.bergmann@example.com",
    phone: "0170 0000001",
    street: "Beispielweg 12",
    zip: "40789",
    city: "Monheim am Rhein",
  });
  const yildiz = await ensureCustomer({
    seedKey: "yildiz",
    segment: "HAUSHALT",
    firstName: "Samira",
    lastName: "Yildiz",
    email: "samira.yildiz@example.com",
    phone: "0170 0000002",
    street: "Musterpfad 4",
    zip: "40789",
    city: "Monheim am Rhein",
  });
  const werkhof = await ensureCustomer({
    seedKey: "werkhof",
    segment: "GEWERBE",
    companyName: "Werkhof Beispiel GmbH",
    firstName: "Paul",
    lastName: "Pauli",
    email: "paul.pauli@example.com",
    phone: "02173 000001",
    street: "Industriehof 20",
    zip: "40789",
    city: "Monheim am Rhein",
  });
  const sommer = await ensureCustomer({
    seedKey: "sommer",
    segment: "HAUSHALT",
    firstName: "Mira",
    lastName: "Sommer",
    email: "mira.sommer@example.com",
    phone: "0170 0000003",
    street: "Probenstraße 8",
    zip: "40789",
    city: "Monheim am Rhein",
  });

  async function ensureRequest(data: Prisma.RequestCreateInput) {
    const existing = await prisma.request.findUnique({ where: { seedKey: data.seedKey ?? undefined } });
    if (existing) return existing;
    return prisma.request.create({ data });
  }

  const requestBergmann = await ensureRequest({
    seedKey: "an-bergmann",
    number: "AN-2026-1001",
    title: "Photovoltaik, Speicher und Wallbox",
    segment: "HAUSHALT",
    status: "ANGEBOT_ERSTELLT",
    source: "Empfehlung",
    customer: { connect: { id: bergmann.id } },
    assignee: { connect: { id: leonie.id } },
    street: bergmann.street,
    zip: bergmann.zip,
    city: bergmann.city,
    qualification: checks(["owner", "roof", "consumption", "meter", "monument", "scope", "contact"]),
  });
  const requestYildiz = await ensureRequest({
    seedKey: "an-yildiz",
    number: "AN-2026-1002",
    title: "Wärmepumpe statt Gasheizung",
    segment: "HAUSHALT",
    status: "IN_QUALIFIZIERUNG",
    source: "Telefon",
    customer: { connect: { id: yildiz.id } },
    assignee: { connect: { id: jonas.id } },
    street: yildiz.street,
    zip: yildiz.zip,
    city: yildiz.city,
    qualification: checks(["owner", "contact"]),
  });
  await ensureRequest({
    seedKey: "an-werkhof",
    number: "AN-2026-1003",
    title: "Gewerbe-Photovoltaik Halle",
    segment: "GEWERBE",
    status: "NEU",
    source: "Web",
    customer: { connect: { id: werkhof.id } },
    assignee: { connect: { id: leonie.id } },
    street: werkhof.street,
    zip: werkhof.zip,
    city: werkhof.city,
    qualification: checks(["contact"]),
  });
  const requestSommer = await ensureRequest({
    seedKey: "an-sommer",
    number: "AN-2026-1004",
    title: "Kleine PV-Anlage",
    segment: "HAUSHALT",
    status: "ANGEBOT_ERSTELLT",
    source: "Vor Ort",
    customer: { connect: { id: sommer.id } },
    assignee: { connect: { id: jonas.id } },
    street: sommer.street,
    zip: sommer.zip,
    city: sommer.city,
    qualification: checks(["owner", "roof", "consumption", "scope"]),
  });

  const noteCount = await prisma.note.count({ where: { requestId: requestBergmann.id } });
  if (noteCount === 0) {
    await prisma.note.create({
      data: {
        authorId: leonie.id,
        requestId: requestBergmann.id,
        body: "Frau Bergmann hat die Abrechnung der letzten zwölf Monate geschickt. Dach Südwest, Ziegel, kein Denkmal. Wallbox ist gewünscht, weil ab Frühjahr ein E-Auto kommt.",
      },
    });
    await prisma.note.create({
      data: {
        authorId: jonas.id,
        requestId: requestYildiz.id,
        body: "Die Gasheizung soll ersetzt werden. Der Gasverbrauch ist noch nicht in Kilowattstunden umgerechnet.",
      },
    });
  }

  function position(item: CatalogItem, section: string, quantity: number, sortOrder: number): Prisma.OfferLineCreateWithoutVariantInput {
    return {
      catalogItemId: item.id,
      typeKey: item.typeKey,
      section,
      name: item.name,
      quantity,
      unit: item.unit,
      unitPriceNet: item.purchasePriceNet ? item.salesPriceNet : item.salesPriceNet,
      purchasePriceNet: item.purchasePriceNet,
      vatCategory: item.vatCategory,
      specs: item.specs as Prisma.InputJsonValue,
      sortOrder,
    };
  }

  const offerBergmann = await prisma.offer.findUnique({ where: { seedKey: "ag-bergmann" } });
  if (!offerBergmann) {
    const validUntil = daysFromNow(30, 12);
    await prisma.offer.create({
      data: {
        seedKey: "ag-bergmann",
        number: "AG-2026-1001",
        title: "Photovoltaik Bergmann",
        status: "ENTWURF",
        requestId: requestBergmann.id,
        authorId: leonie.id,
        stageId: stageByKey.arbeit?.id,
        householdKwh: 4100,
        evKwh: 1700,
        electricityPriceEur: 0.34,
        priceIncreasePct: 3,
        buildingType: "Einfamilienhaus",
        buildingYear: 1998,
        roofType: "Ziegel",
        orientation: "Südwest",
        tiltDeg: 32,
        roofAreaM2: 48,
        existingHeating: "Gas",
        vatZeroEligible: true,
        vatDeductible: false,
        validUntil,
        variants: {
          create: [
            {
              name: "Standard",
              sortOrder: 0,
              recommended: true,
              specificYield: 980,
              eegTariffEur: 0.078,
              rebateNet: 400,
              lines: {
                create: [
                  position(product["NL-440"], "module", 22, 0),
                  position(product["FL-10"], "inverter", 1, 1),
                  position(product["DW-ZI"], "mounting", 1, 2),
                  position(product["SW-DC"], "mounting", 14, 3),
                  position(product["SW-AC"], "mounting", 10, 4),
                  position(product["EL-UES"], "mounting", 1, 5),
                  position(product["KR-10"], "storage", 1, 6),
                  position(product["LH-11"], "wallbox", 1, 7),
                  position(product["EL-NOT"], "extra", 1, 8),
                ],
              },
            },
            {
              name: "Kompakt",
              sortOrder: 1,
              recommended: false,
              specificYield: 980,
              eegTariffEur: 0.078,
              lines: {
                create: [
                  position(product["NL-430"], "module", 16, 0),
                  position(product["FL-6"], "inverter", 1, 1),
                  position(product["DW-ZI"], "mounting", 1, 2),
                  position(product["SW-DC"], "mounting", 10, 3),
                  position(product["SW-AC"], "mounting", 8, 4),
                  position(product["EL-UES"], "mounting", 1, 5),
                ],
              },
            },
          ],
        },
      },
    });
  }

  const offerSommer = await prisma.offer.findUnique({ where: { seedKey: "ag-sommer" } });
  if (!offerSommer) {
    await prisma.offer.create({
      data: {
        seedKey: "ag-sommer",
        number: "AG-2026-1002",
        title: "PV Sommer",
        status: "ENTWURF",
        requestId: requestSommer.id,
        authorId: jonas.id,
        stageId: stageByKey.neu?.id,
        householdKwh: 3500,
        electricityPriceEur: 0.34,
        buildingType: "Einfamilienhaus",
        roofType: "Ziegel",
        orientation: "Süd",
        vatZeroEligible: true,
        variants: { create: [{ name: "Standard", sortOrder: 0, recommended: true, specificYield: 980 }] },
      },
    });
  }

  if ((await prisma.appointment.count({ where: { seedKey: { not: null } } })) === 0) {
    await prisma.appointment.createMany({
      data: [
        {
          seedKey: "termin-bergmann",
          title: "Dachaufnahme Bergmann",
          startAt: daysFromNow(2, 9, 30),
          endAt: daysFromNow(2, 11, 0),
          location: "Beispielweg 12, Monheim",
          userId: leonie.id,
          customerId: bergmann.id,
          requestId: requestBergmann.id,
        },
        {
          seedKey: "termin-yildiz",
          title: "Telefon Qualifizierung Yildiz",
          startAt: daysFromNow(3, 15, 0),
          endAt: daysFromNow(3, 15, 30),
          userId: jonas.id,
          customerId: yildiz.id,
          requestId: requestYildiz.id,
        },
        {
          seedKey: "termin-werkhof",
          title: "Netzanschluss Werkhof klären",
          startAt: daysFromNow(4, 10, 0),
          endAt: daysFromNow(4, 11, 0),
          location: "Telefon Netzbetreiber",
          userId: leonie.id,
          customerId: werkhof.id,
        },
      ],
    });
  }

  for (const prefix of ["AN", "AG"] as const) {
    const year = new Date().getFullYear();
    const id = `${prefix}-${year}`;
    const existing = await prisma.counter.findUnique({ where: { id } });
    if (existing) continue;
    const rows = prefix === "AN"
      ? await prisma.request.findMany({ select: { number: true } })
      : await prisma.offer.findMany({ select: { number: true } });
    const matcher = new RegExp(`^${prefix}-${year}-(\\d+)$`);
    const max = rows.reduce((highest, row) => {
      const match = row.number.match(matcher);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);
    await prisma.counter.create({ data: { id, value: max } });
  }

  console.log("Beispieldaten sind bereit.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
