import Link from "next/link";
import { prisma } from "@/lib/db";
import { addressLine, customerName } from "@/lib/format";
import { SEGMENT_LABEL } from "@/lib/labels";
import { ButtonLink, EmptyState, PageHeader, td, th } from "@/components/ui";

export const metadata = { title: "Kunden" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q?.trim() ?? "";
  const customers = await prisma.customer.findMany({
    where: q
      ? {
          OR: [
            { lastName: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { companyName: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {},
    include: { _count: { select: { requests: true } } },
    orderBy: { lastName: "asc" },
    take: 300,
  });
  return (
    <div>
      <PageHeader eyebrow="Kontakte" title="Kunden" description="Personen und Firmen, die an einer Anlage interessiert sind." actions={<ButtonLink href="/kunden/neu">Neuer Kontakt</ButtonLink>} />
      <form className="mb-4 flex gap-2" method="get">
        <input name="q" defaultValue={q} placeholder="Name, Firma, Ort" className="field max-w-sm" />
        <button className="h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white">Suchen</button>
      </form>
      {customers.length === 0 ? <EmptyState title="Keine Kontakte" text="Legen Sie einen Kontakt an oder passen Sie die Suche an." /> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-elevated">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr><th className={th}>Name</th><th className={th}>Bereich</th><th className={th}>Ort</th><th className={th}>Anfragen</th></tr></thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td className={td}><Link className="font-semibold" href={`/kunden/${customer.id}`}>{customerName(customer)}</Link><div className="text-xs text-muted">{customer.email}</div></td>
                  <td className={td}>{SEGMENT_LABEL[customer.segment]}</td>
                  <td className={td}>{addressLine(customer) || "–"}</td>
                  <td className={td}>{customer._count.requests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
