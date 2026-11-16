import { CustomerForm } from "@/components/customer-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Neuer Kontakt" };

export default function NewCustomerPage() {
  return (
    <div>
      <PageHeader title="Neuer Kontakt" description="Die Person oder Firma, mit der das Team spricht." />
      <CustomerForm />
    </div>
  );
}
