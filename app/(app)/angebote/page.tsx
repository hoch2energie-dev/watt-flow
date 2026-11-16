import Link from "next/link";
import { Badge, EmptyState, PageHeader, td, th } from "@/components/ui";
import { calculateOffer } from "@/lib/calc/offer";
import { prisma } from "@/lib/db";
import { toOfferDTO } from "@/lib/dto";
import { toCalcInput } from "@/lib/domain";
import { customerName, formatDate, formatEuro } from "@/lib/format";
import { OFFER_STATUS_LABEL } from "@/lib/labels";

export const metadata = { title: "Angebote" };

export default async function OffersPage() {
  const offers = await prisma.offer.findMany({
    include: { request: { include: { customer: true } }, stage: true, variants: { include: { lines: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return (
    <div>
      <PageHeader eyebrow="Planung" title="Angebote" description="Jedes Angebot hängt an einer Anfrage und kann mehrere Varianten haben." />
      {offers.length === 0 ? <EmptyState title="Noch keine Angebote" text="Öffnen Sie eine Anfrage und erstellen Sie von dort das erste Angebot." /> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-elevated">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr><th className={th}>Nummer</th><th className={th}>Kunde</th><th className={th}>Spalte</th><th className={th}>Status</th><th className={th}>Summe</th><th className={th}>Aktualisiert</th></tr></thead>
            <tbody>
              {offers.map((offer) => {
                const dto = toOfferDTO(offer);
                const variant = dto.variants.find((item) => item.recommended) ?? dto.variants[0];
                const investment = variant ? calculateOffer(toCalcInput(dto, variant)).investment : 0;
                return (
                  <tr key={offer.id}>
                    <td className={td}><Link className="font-semibold" href={`/angebote/${offer.id}`}>{offer.number}</Link><div className="text-xs text-muted">{offer.title}</div></td>
                    <td className={td}>{customerName(offer.request.customer)}</td>
                    <td className={td}>{offer.stage?.name ?? "–"}</td>
                    <td className={td}><Badge tone={offer.status === "ANGENOMMEN" ? "ok" : "neutral"}>{OFFER_STATUS_LABEL[offer.status]}</Badge></td>
                    <td className={td}>{formatEuro(investment)}</td>
                    <td className={td}>{formatDate(offer.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
