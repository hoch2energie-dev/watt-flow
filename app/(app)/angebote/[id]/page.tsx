import { notFound } from "next/navigation";
import { OfferWizard } from "@/components/offer/wizard";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toCatalogOption, toOfferDTO } from "@/lib/dto";
import { addressLine, customerName } from "@/lib/format";
import { ensureSettings, variantDefaultsFromSettings } from "@/lib/settings";

export const metadata = { title: "Angebot" };

export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const offer = await prisma.offer.findUnique({
    where: { id },
    include: {
      variants: { include: { lines: { orderBy: { sortOrder: "asc" } }, faces: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } },
      request: { include: { customer: true } },
    },
  });
  if (!offer) notFound();
  const [catalog, stages, settings] = await Promise.all([
    prisma.catalogItem.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.kanbanStage.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    ensureSettings(),
  ]);
  return (
    <OfferWizard
      initial={toOfferDTO(offer)}
      catalog={catalog.map(toCatalogOption)}
      meta={{
        customerName: customerName(offer.request.customer),
        customerId: offer.request.customerId,
        customerEmail: offer.request.customer.email ?? "",
        customerPhone: offer.request.customer.phone ?? "",
        requestId: offer.requestId,
        requestNumber: offer.request.number,
        siteAddress: addressLine(offer.request),
        segment: offer.request.segment,
        locked: offer.status === "ANGENOMMEN",
        isAdmin: user.role === "ADMIN",
        stages: stages.map((stage) => ({ id: stage.id, name: stage.name })),
        defaults: variantDefaultsFromSettings(settings),
      }}
    />
  );
}
