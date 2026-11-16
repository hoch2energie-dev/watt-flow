import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui";
import { prisma } from "@/lib/db";
import { customerName } from "@/lib/format";

export const metadata = { title: "Suche" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q?.trim() ?? "";
  if (q.length < 2) {
    return <PageHeader title="Suche" description="Mindestens zwei Zeichen, zum Beispiel ein Name oder eine Angebotsnummer." />;
  }
  const [customers, requests, offers] = await Promise.all([
    prisma.customer.findMany({
      where: { OR: [{ lastName: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }, { companyName: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }] },
      take: 20,
    }),
    prisma.request.findMany({
      where: { OR: [{ number: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }] },
      include: { customer: true },
      take: 20,
    }),
    prisma.offer.findMany({
      where: { OR: [{ number: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }] },
      include: { request: { include: { customer: true } } },
      take: 20,
    }),
  ]);
  return (
    <div>
      <PageHeader title={`Suche nach „${q}“`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel><h2 className="font-display text-xl">Kontakte</h2><ul className="mt-2 space-y-1 text-sm">{customers.map((customer) => <li key={customer.id}><Link className="font-semibold" href={`/kunden/${customer.id}`}>{customerName(customer)}</Link></li>)}{customers.length === 0 ? <li className="text-muted">Nichts gefunden.</li> : null}</ul></Panel>
        <Panel><h2 className="font-display text-xl">Anfragen</h2><ul className="mt-2 space-y-1 text-sm">{requests.map((request) => <li key={request.id}><Link className="font-semibold" href={`/anfragen/${request.id}`}>{request.number}</Link> · {request.title}</li>)}{requests.length === 0 ? <li className="text-muted">Nichts gefunden.</li> : null}</ul></Panel>
        <Panel><h2 className="font-display text-xl">Angebote</h2><ul className="mt-2 space-y-1 text-sm">{offers.map((offer) => <li key={offer.id}><Link className="font-semibold" href={`/angebote/${offer.id}`}>{offer.number}</Link> · {customerName(offer.request.customer)}</li>)}{offers.length === 0 ? <li className="text-muted">Nichts gefunden.</li> : null}</ul></Panel>
      </div>
    </div>
  );
}
