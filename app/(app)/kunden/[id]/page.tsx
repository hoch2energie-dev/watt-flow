import Link from "next/link";
import { notFound } from "next/navigation";
import { addNote } from "@/app/actions/crm";
import { CustomerForm } from "@/components/customer-form";
import { Button, PageHeader, Panel } from "@/components/ui";
import { prisma } from "@/lib/db";
import { customerName, formatDateTime } from "@/lib/format";
import { REQUEST_STATUS_LABEL } from "@/lib/labels";

export const metadata = { title: "Kontakt" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      requests: { orderBy: { createdAt: "desc" } },
      notesLog: { include: { author: true }, orderBy: { createdAt: "desc" } },
      attachments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!customer) notFound();
  return (
    <div>
      <PageHeader eyebrow="Kontakt" title={customerName(customer)} />
      <div className="grid gap-4 lg:grid-cols-2">
        <CustomerForm
          customer={{
            id: customer.id,
            segment: customer.segment,
            companyName: customer.companyName ?? "",
            firstName: customer.firstName,
            lastName: customer.lastName,
            email: customer.email ?? "",
            phone: customer.phone ?? "",
            street: customer.street ?? "",
            zip: customer.zip ?? "",
            city: customer.city ?? "",
            notes: customer.notes ?? "",
          }}
        />
        <div className="space-y-4">
          <Panel>
            <h2 className="font-display text-xl">Anfragen</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {customer.requests.map((request) => (
                <li key={request.id}><Link className="font-semibold" href={`/anfragen/${request.id}`}>{request.number}</Link> · {request.title} · {REQUEST_STATUS_LABEL[request.status]}</li>
              ))}
              {customer.requests.length === 0 ? <li className="text-muted">Noch keine Anfrage.</li> : null}
            </ul>
          </Panel>
          <Panel>
            <h2 className="font-display text-xl">Notizen und Dateien</h2>
            <form key={customer.notesLog.length} action={addNote} className="mt-3">
              <input type="hidden" name="customerId" value={customer.id} />
              <textarea name="body" required className="field min-h-20" placeholder="Notiz zum Kontakt" />
              <Button className="mt-2" size="sm" type="submit">Speichern</Button>
            </form>
            <ul className="mt-3 space-y-2 text-sm">
              {customer.notesLog.map((note) => <li key={note.id}><p>{note.body}</p><p className="text-xs text-muted">{note.author.name} · {formatDateTime(note.createdAt)}</p></li>)}
            </ul>
            <form action="/api/attachments" method="post" encType="multipart/form-data" className="mt-4 flex flex-wrap gap-2">
              <input type="hidden" name="customerId" value={customer.id} />
              <input type="file" name="file" required className="text-sm" />
              <Button size="sm" variant="secondary" type="submit">Datei hochladen</Button>
            </form>
            <ul className="mt-2 text-sm">
              {customer.attachments.map((file) => <li key={file.id}><a className="text-brand font-semibold" href={`/api/attachments/${file.id}`}>{file.originalName}</a></li>)}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
