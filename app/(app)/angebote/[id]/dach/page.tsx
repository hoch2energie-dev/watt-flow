import { notFound } from "next/navigation";
import { RoofPlanner } from "@/components/roof/planner";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toCatalogOption, toOfferDTO } from "@/lib/dto";
import { addressLine, customerName } from "@/lib/format";

export const metadata = { title: "Dachplanung" };

export default async function RoofPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variante?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  await requireUser();
  const offer = await prisma.offer.findUnique({
    where: { id },
    include: {
      variants: { include: { lines: { orderBy: { sortOrder: "asc" } }, faces: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } },
      request: { include: { customer: true } },
    },
  });
  if (!offer) notFound();
  const catalog = await prisma.catalogItem.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return (
    <RoofPlanner
      initial={toOfferDTO(offer)}
      catalog={catalog.map(toCatalogOption)}
      variantId={query.variante ?? offer.variants.find((variant) => variant.recommended)?.id ?? offer.variants[0]?.id ?? ""}
      siteAddress={addressLine(offer.request)}
      customerName={customerName(offer.request.customer)}
      locked={offer.status === "ANGENOMMEN"}
    />
  );
}
