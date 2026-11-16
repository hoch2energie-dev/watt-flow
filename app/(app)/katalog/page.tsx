import Link from "next/link";
import { CatalogImport } from "@/components/catalog-import";
import { Badge, ButtonLink, EmptyState, PageHeader, td, th } from "@/components/ui";
import { catalogTypeLabel } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { formatEuro, formatPercent } from "@/lib/format";

export const metadata = { title: "Katalog" };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string; typ?: string; archiv?: string }> }) {
  const query = await searchParams;
  const q = query.q?.trim() ?? "";
  const typ = query.typ ?? "";
  const showArchived = query.archiv === "1";
  const items = await prisma.catalogItem.findMany({
    where: {
      active: showArchived ? undefined : true,
      typeKey: typ || undefined,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { manufacturer: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ typeKey: "asc" }, { name: "asc" }],
    take: 400,
  });
  const types = await prisma.catalogItem.groupBy({ by: ["typeKey"], _count: true });
  return (
    <div>
      <PageHeader
        eyebrow="Preise"
        title="Produktkatalog"
        description="Einkauf, Verkauf und Steuerkategorie. Positionen im Angebot sind eine Kopie und bleiben stehen, wenn sich der Katalog später ändert."
        actions={<ButtonLink href="/katalog/neu">Komponente anlegen</ButtonLink>}
      />
      <CatalogImport />
      <form className="my-4 grid gap-2 sm:grid-cols-4" method="get">
        <input name="q" defaultValue={q} placeholder="Name, Hersteller, Artikelnummer" className="field sm:col-span-2" />
        <select name="typ" defaultValue={typ} className="field">
          <option value="">Alle Typen</option>
          {types.map((type) => <option key={type.typeKey} value={type.typeKey}>{catalogTypeLabel(type.typeKey)} ({type._count})</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="archiv" value="1" defaultChecked={showArchived} /> Archiv</label>
        <button className="h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white sm:col-span-1">Filtern</button>
      </form>
      {items.length === 0 ? <EmptyState title="Der Katalog ist leer" text="Legen Sie die erste Komponente an oder importieren Sie eine CSV-Datei." /> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-elevated">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Typ</th>
                <th className={th}>Einkauf</th>
                <th className={th}>Verkauf</th>
                <th className={th}>Marge</th>
                <th className={th}>Steuer</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const sales = Number(item.salesPriceNet);
                const purchase = Number(item.purchasePriceNet);
                const margin = sales > 0 ? (sales - purchase) / sales : 0;
                return (
                  <tr key={item.id}>
                    <td className={td}>
                      <Link className="font-semibold" href={`/katalog/${item.id}`}>{item.name}</Link>
                      <div className="text-xs text-muted">{item.manufacturer} {item.model} {item.sku ? `· ${item.sku}` : ""}</div>
                    </td>
                    <td className={td}>{catalogTypeLabel(item.typeKey)}</td>
                    <td className={td}>{formatEuro(purchase)}</td>
                    <td className={td}>{formatEuro(sales)}</td>
                    <td className={td}>{formatPercent(margin)}</td>
                    <td className={td}>{item.active ? <Badge tone={item.vatCategory === "PV_NULL" ? "ok" : "neutral"}>{item.vatCategory === "PV_NULL" ? "0 % Vorlage" : "19 %"}</Badge> : <Badge tone="warn">Archiv</Badge>}</td>
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
