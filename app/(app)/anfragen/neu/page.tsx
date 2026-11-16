import { RequestForm } from "@/components/request-form";
import { PageHeader } from "@/components/ui";
import { staffOptions } from "@/app/actions/helpers";
import { prisma } from "@/lib/db";

export const metadata = { title: "Neue Anfrage" };

export default async function NewRequestPage() {
  const [customers, staff] = await Promise.all([
    prisma.customer.findMany({ orderBy: { lastName: "asc" }, take: 300 }),
    staffOptions(),
  ]);
  return (
    <div>
      <PageHeader eyebrow="Vertrieb" title="Neue Anfrage" description="Bestehenden Kontakt wählen oder direkt eine neue Person anlegen." />
      <RequestForm
        customers={customers.map((customer) => ({ id: customer.id, label: `${customer.lastName}, ${customer.firstName}${customer.companyName ? ` · ${customer.companyName}` : ""}` }))}
        staff={staff}
      />
    </div>
  );
}
