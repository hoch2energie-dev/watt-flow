import { SettingsScreen } from "@/components/settings-screen";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { parsePdfPages } from "@/lib/content";
import { prisma } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { googleBrowserKey, googleServerKey } from "@/lib/google/config";
import { ensureSettings } from "@/lib/settings";

export const metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await ensureSettings();
  const [stages, users] = await Promise.all([
    prisma.kanbanStage.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);
  const num = (value: { toString(): string }, digits: number) => formatNumber(Number(value), digits);
  return (
    <div>
      <PageHeader eyebrow="Betrieb" title="Einstellungen" description="Stammdaten, Rechenvorgaben, Angebotsseiten und Konten." />
      <SettingsScreen
        isAdmin={user.role === "ADMIN"}
        logo={Boolean(settings.logoStoredName)}
        google={user.role === "ADMIN" ? { server: Boolean(googleServerKey()), browser: Boolean(googleBrowserKey()) } : { server: false, browser: false }}
        company={{
          companyName: settings.companyName,
          street: settings.street,
          zip: settings.zip,
          city: settings.city,
          phone: settings.phone,
          email: settings.email,
          website: settings.website,
          taxNumber: settings.taxNumber,
          vatId: settings.vatId,
          bankName: settings.bankName,
          iban: settings.iban,
          bic: settings.bic,
          primaryColor: settings.primaryColor,
          accentColor: settings.accentColor,
        }}
        calc={{
          defaultSpecificYield: num(settings.defaultSpecificYield, 0),
          defaultEegTariff: num(settings.defaultEegTariff, 4),
          defaultPostEeg: num(settings.defaultPostEeg, 4),
          defaultElectricityPrice: num(settings.defaultElectricityPrice, 3),
          defaultPriceIncrease: num(settings.defaultPriceIncrease, 1),
          defaultDegradation: num(settings.defaultDegradation, 2),
          defaultHorizonYears: String(settings.defaultHorizonYears),
          defaultOpex: num(settings.defaultOpex, 0),
          defaultBatteryCycles: String(settings.defaultBatteryCycles),
          offerValidityDays: String(settings.offerValidityDays),
        }}
        documents={{
          pages: parsePdfPages(settings.pdfPages),
          aboutText: settings.aboutText,
          legalText: settings.legalText,
          coverSubtitle: settings.coverSubtitle,
        }}
        stages={stages.map((stage) => ({ id: stage.id, name: stage.name, color: stage.color, isWon: stage.isWon, isLost: stage.isLost, active: stage.active }))}
        users={users.map((entry) => ({ id: entry.id, name: entry.name, email: entry.email, role: entry.role, active: entry.active }))}
      />
    </div>
  );
}
