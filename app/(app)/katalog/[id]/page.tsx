import { notFound } from "next/navigation";
import { CatalogForm } from "@/components/catalog-form";
import { PageHeader } from "@/components/ui";
import { asSpecs } from "@/lib/domain";
import { prisma } from "@/lib/db";

export const metadata = { title: "Komponente" };

export default async function CatalogItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await prisma.catalogItem.findUnique({ where: { id } });
  if (!item) notFound();
  return (
    <div>
      <PageHeader eyebrow={item.sku ?? "Ohne Artikelnummer"} title={item.name} />
      <CatalogForm
        initial={{
          id: item.id,
          typeKey: item.typeKey,
          manufacturer: item.manufacturer,
          model: item.model,
          name: item.name,
          sku: item.sku ?? "",
          unit: item.unit,
          purchasePriceNet: Number(item.purchasePriceNet),
          salesPriceNet: Number(item.salesPriceNet),
          vatCategory: item.vatCategory,
          description: item.description ?? "",
          active: item.active,
          specs: asSpecs(item.specs),
        }}
      />
    </div>
  );
}
