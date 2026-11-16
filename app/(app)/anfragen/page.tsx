import Link from "next/link";
import { prisma } from "@/lib/db";
import { addressLine, customerName, formatDate } from "@/lib/format";
import { REQUEST_STATUS_LABEL, SEGMENT_LABEL } from "@/lib/labels";
import { Badge, ButtonLink, EmptyState, PageHeader, td, th } from "@/components/ui";

export const metadata = { title: "Anfragen" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ q?: string; segment?: string; status?: string }> }) {
  const query = await searchParams;
  const q = query.q?.trim() ?? "";
  const segment = query.segment === "HAUSHALT" || query.segment === "GEWERBE" ? query.segment : undefined;
  const status = query.status && query.status in REQUEST_STATUS_LABEL ? query.status : undefined;
  const requests = await prisma.request.findMany({
    where: {
      segment,
      status: status as never,
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" } },
              { title: { contains: q, mode: "insensitive" } },
              { city: { contains: q, mode: "insensitive" } },
              { customer: { lastName: { contains: q, mode: "insensitive" } } },
              { customer: { companyName: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { customer: true, assignee: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Vertrieb"
        title="Anfragen"
        description="Haushalt und Gewerbe, vom ersten Kontakt bis zum Angebot."
        actions={<ButtonLink href="/anfragen/neu">Neue Anfrage</ButtonLink>}
      />
      <form className="mb-4 grid gap-2 sm:grid-cols-4" method="get">
        <input name="q" defaultValue={q} placeholder="Suche" className="field" />
        <select name="segment" defaultValue={segment ?? ""} className="field">
          <option value="">Alle Bereiche</option>
          <option value="HAUSHALT">Haushalt</option>
          <option value="GEWERBE">Gewerbe</option>
        </select>
        <select name="status" defaultValue={status ?? ""} className="field">
          <option value="">Alle Status</option>
          {Object.entries(REQUEST_STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <button className="h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white">Filtern</button>
      </form>
      {requests.length === 0 ? (
        <EmptyState title="Keine Anfragen" text="Legen Sie die erste Kundenanfrage an oder ändern Sie den Filter." action={<ButtonLink href="/anfragen/neu">Neue Anfrage</ButtonLink>} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-elevated">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr>
                <th className={th}>Nummer</th>
                <th className={th}>Kontakt</th>
                <th className={th}>Ort</th>
                <th className={th}>Bereich</th>
                <th className={th}>Status</th>
                <th className={th}>Datum</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="hover:bg-accent-soft/40">
                  <td className={td}><Link className="font-semibold" href={`/anfragen/${request.id}`}>{request.number}</Link><div className="text-xs text-muted">{request.title}</div></td>
                  <td className={td}>{customerName(request.customer)}</td>
                  <td className={td}>{addressLine(request) || "–"}</td>
                  <td className={td}>{SEGMENT_LABEL[request.segment]}</td>
                  <td className={td}><Badge tone={request.status === "GEWONNEN" ? "ok" : request.status === "VERLOREN" || request.status === "UNGEEIGNET" ? "danger" : "info"}>{REQUEST_STATUS_LABEL[request.status]}</Badge></td>
                  <td className={td}>{formatDate(request.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
