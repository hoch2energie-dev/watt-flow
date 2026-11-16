import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { calculateOffer } from "@/lib/calc/offer";
import { toOfferDTO } from "@/lib/dto";
import { toCalcInput } from "@/lib/domain";
import { customerName, formatDateTime, formatEuro } from "@/lib/format";
import { OFFER_STATUS_LABEL } from "@/lib/labels";
import { prisma } from "@/lib/db";
import { Badge, PageHeader, Panel } from "@/components/ui";

export const metadata = { title: "Übersicht" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [openRequests, offers, appointments, wonOffers] = await Promise.all([
    prisma.request.count({ where: { status: { notIn: ["GEWONNEN", "VERLOREN", "UNGEEIGNET"] } } }),
    prisma.offer.findMany({
      include: { request: { include: { customer: true } }, variants: { include: { lines: true } }, stage: true },
      orderBy: { updatedAt: "desc" },
      take: 40,
    }),
    prisma.appointment.findMany({
      where: { startAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
      include: { customer: true },
      orderBy: { startAt: "asc" },
      take: 5,
    }),
    prisma.offer.findMany({
      where: { status: "ANGENOMMEN", signedAt: { gte: new Date(new Date().getFullYear(), 0, 1) } },
      include: { variants: { include: { lines: true } } },
    }),
  ]);
  const stages = await prisma.kanbanStage.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const priced = offers.map((offer) => {
    const dto = toOfferDTO(offer);
    const variant = dto.variants.find((item) => item.recommended) ?? dto.variants[0];
    const gross = variant ? calculateOffer(toCalcInput(dto, variant)).investment : 0;
    return { offer, gross };
  });
  const wonSum = wonOffers.reduce((sum, offer) => {
    const dto = toOfferDTO(offer);
    const variant = dto.variants.find((item) => item.recommended) ?? dto.variants[0];
    return sum + (variant ? calculateOffer(toCalcInput(dto, variant)).investment : 0);
  }, 0);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Europe/Berlin" }).format(new Date()),
  );
  const greeting = hour < 11 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";

  return (
    <div>
      <PageHeader eyebrow={greeting} title={user.name.split(" ")[0]} description="Offene Anfragen, laufende Angebote und die nächsten Termine." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Offene Anfragen" value={String(openRequests)} />
        <Stat label="Angebote in Bearbeitung" value={String(offers.filter((offer) => offer.status !== "ABGELEHNT").length)} />
        <Stat label="Angenommen in diesem Jahr" value={formatEuro(wonSum)} hint={`${wonOffers.length} Angebote`} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <h2 className="font-display text-xl">Board</h2>
          <ul className="mt-4 space-y-2">
            {stages.map((stage) => {
              const count = offers.filter((offer) => offer.stageId === stage.id).length;
              return (
                <li key={stage.id} className="flex items-center gap-3 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
                  <span className="flex-1">{stage.name}</span>
                  <span className="font-semibold">{count}</span>
                </li>
              );
            })}
          </ul>
          <Link href="/board" className="mt-4 inline-block text-sm font-semibold text-brand">Zum Board</Link>
        </Panel>
        <Panel className="lg:col-span-2">
          <h2 className="font-display text-xl">Nächste Termine</h2>
          {appointments.length === 0 ? <p className="mt-3 text-sm text-muted">Keine anstehenden Termine.</p> : (
            <ul className="mt-3 space-y-3">
              {appointments.map((item) => (
                <li key={item.id}>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="text-xs text-muted">{formatDateTime(item.startAt)}{item.customer ? ` · ${customerName(item.customer)}` : ""}</p>
                </li>
              ))}
            </ul>
          )}
          <Link href="/kalender" className="mt-4 inline-block text-sm font-semibold text-brand">Kalender öffnen</Link>
        </Panel>
      </div>
      <Panel className="mt-4">
        <h2 className="font-display text-xl">Zuletzt bearbeitet</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {priced.slice(0, 6).map(({ offer, gross }) => (
                <tr key={offer.id}>
                  <td className="py-2 pr-3 font-semibold"><Link href={`/angebote/${offer.id}`}>{offer.number}</Link></td>
                  <td className="py-2 pr-3">{customerName(offer.request.customer)}</td>
                  <td className="py-2 pr-3 text-muted">{offer.stage?.name ?? "ohne Spalte"}</td>
                  <td className="py-2 pr-3"><Badge>{OFFER_STATUS_LABEL[offer.status]}</Badge></td>
                  <td className="py-2 text-right">{formatEuro(gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {priced.length === 0 ? <p className="text-sm text-muted">Noch keine Angebote.</p> : null}
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-elevated px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl">{value}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
