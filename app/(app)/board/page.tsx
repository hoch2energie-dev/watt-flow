import { Board } from "@/components/board";
import { PageHeader } from "@/components/ui";
import { calculateOffer } from "@/lib/calc/offer";
import { prisma } from "@/lib/db";
import { toOfferDTO } from "@/lib/dto";
import { toCalcInput } from "@/lib/domain";
import { customerName } from "@/lib/format";

export const metadata = { title: "Board" };

export default async function BoardPage() {
  const [stages, offers] = await Promise.all([
    prisma.kanbanStage.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.offer.findMany({
      where: { status: { not: "ABGELEHNT" } },
      include: { request: { include: { customer: true } }, variants: { include: { lines: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const first = stages[0]?.id ?? null;
  return (
    <div>
      <PageHeader eyebrow="Projekte" title="Board" description="Ziehen Sie ein Angebot in die nächste Spalte oder wählen Sie die Spalte in der Karte." />
      <Board
        stages={stages.map((stage) => ({ id: stage.id, name: stage.name, color: stage.color }))}
        cards={offers.map((offer) => {
          const dto = toOfferDTO(offer);
          const variant = dto.variants.find((item) => item.recommended) ?? dto.variants[0];
          return {
            id: offer.id,
            number: offer.number,
            title: offer.title,
            customer: customerName(offer.request.customer),
            city: offer.request.city ?? "",
            gross: variant ? calculateOffer(toCalcInput(dto, variant)).investment : 0,
            stageId: offer.stageId ?? first,
            status: offer.status,
          };
        })}
      />
    </div>
  );
}
