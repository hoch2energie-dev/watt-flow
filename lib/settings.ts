import { prisma } from "@/lib/db";
import { DEFAULT_ABOUT, DEFAULT_COVER, DEFAULT_LEGAL, DEFAULT_PDF_PAGES } from "@/lib/content";

export async function ensureSettings() {
  const existing = await prisma.companySettings.findUnique({ where: { id: "default" } });
  if (existing) return existing;
  return prisma.companySettings.create({
    data: {
      id: "default",
      companyName: "Hoch2 Energiesysteme GmbH",
      street: "Beispielweg 12",
      zip: "40789",
      city: "Monheim am Rhein",
      phone: "02173 000000",
      email: "angebote@hoch2.example",
      pdfPages: DEFAULT_PDF_PAGES,
      aboutText: DEFAULT_ABOUT,
      legalText: DEFAULT_LEGAL,
      coverSubtitle: DEFAULT_COVER,
    },
  });
}

export function variantDefaultsFromSettings(settings: {
  defaultSpecificYield: { toString(): string } | number;
  defaultDegradation: { toString(): string } | number;
  defaultHorizonYears: number;
  defaultEegTariff: { toString(): string } | number;
  defaultPostEeg: { toString(): string } | number;
  defaultOpex: { toString(): string } | number;
  defaultBatteryCycles: number;
}) {
  const n = (value: { toString(): string } | number) => Number(value);
  return {
    specificYield: n(settings.defaultSpecificYield),
    degradationPct: n(settings.defaultDegradation),
    horizonYears: settings.defaultHorizonYears,
    eegTariffEur: n(settings.defaultEegTariff),
    postEegTariffEur: n(settings.defaultPostEeg),
    opexEurPerYear: n(settings.defaultOpex),
    batteryCyclesPerYear: settings.defaultBatteryCycles,
  };
}
