import { CatalogForm } from "@/components/catalog-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Neue Komponente" };

export default function NewCatalogPage() {
  return (
    <div>
      <PageHeader title="Komponente anlegen" description="Herstellerangaben und Preise netto. Die Steuerkategorie entscheidet später mit dem Angebot über 0 % oder 19 %." />
      <CatalogForm />
    </div>
  );
}
