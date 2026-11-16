import { notFound } from "next/navigation";
import { OfferPlanner3D } from "@/components/roof3d/offer-planner";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toOfferDTO } from "@/lib/dto";
import { addressLine, customerName } from "@/lib/format";

export const metadata = { title: "3D-Planung" };

export default async function Roof3DPage({
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
  return (
    <OfferPlanner3D
      initial={toOfferDTO(offer)}
      variantId={query.variante ?? offer.variants.find((variant) => variant.recommended)?.id ?? offer.variants[0]?.id ?? ""}
      siteAddress={addressLine(offer.request)}
      customerName={customerName(offer.request.customer)}
      locked={offer.status === "ANGENOMMEN"}
    />
  );
}
