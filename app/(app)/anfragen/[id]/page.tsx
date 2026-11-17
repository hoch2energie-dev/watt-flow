import Link from "next/link";
import { notFound } from "next/navigation";
import { addNote, deleteRequest, updateRequest } from "@/app/actions/crm";
import { createOffer } from "@/app/actions/offers";
import { staffOptions } from "@/app/actions/helpers";
import { AddressFields } from "@/components/address-fields";
import { ChecklistEditor } from "@/components/checklist";
import { Badge, Button, PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { parseQualification, qualificationProgress } from "@/lib/checklist";
import { REQUEST_SOURCES } from "@/lib/content";
import { prisma } from "@/lib/db";
import { addressLine, customerName, formatDateTime } from "@/lib/format";
import { OFFER_STATUS_LABEL, REQUEST_STATUS_LABEL, SEGMENT_LABEL } from "@/lib/labels";

export const metadata = { title: "Anfrage" };

export default async function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const request = await prisma.request.findUnique({
    where: { id },
    include: {
      customer: true,
      assignee: true,
      notes: { include: { author: true }, orderBy: { createdAt: "desc" } },
      attachments: { orderBy: { createdAt: "desc" } },
      offers: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!request) notFound();
  const staff = await staffOptions();
  const qualification = parseQualification(request.qualification);
  const progress = qualificationProgress(qualification);

  return (
    <div>
      <PageHeader
        eyebrow={request.number}
        title={request.title}
        description={`${customerName(request.customer)} · ${SEGMENT_LABEL[request.segment]}`}
        actions={
          <form action={createOffer.bind(null, request.id)}>
            <Button type="submit">Angebot erstellen</Button>
          </form>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel>
            <h2 className="font-display text-xl">Qualifizierung</h2>
            <p className="mb-3 text-sm text-muted">{progress.done} von {progress.total} Punkten erledigt.</p>
            <ChecklistEditor requestId={request.id} initial={qualification} />
          </Panel>
          <Panel>
            <h2 className="font-display text-xl">Notizen</h2>
            <form key={request.notes.length} action={addNote} className="mt-3">
              <input type="hidden" name="requestId" value={request.id} />
              <textarea name="body" required className="field min-h-24" placeholder="Gespräch, offene Frage, nächster Schritt" />
              <Button className="mt-2" type="submit" size="sm">Notiz speichern</Button>
            </form>
            <ul className="mt-4 space-y-3">
              {request.notes.map((note) => (
                <li key={note.id} className="rounded-xl bg-bg px-3 py-2">
                  <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                  <p className="mt-1 text-xs text-muted">{note.author.name} · {formatDateTime(note.createdAt)}</p>
                </li>
              ))}
              {request.notes.length === 0 ? <li className="text-sm text-muted">Noch keine Notizen.</li> : null}
            </ul>
          </Panel>
          <Panel>
            <h2 className="font-display text-xl">Dateien</h2>
            <form action="/api/attachments" method="post" encType="multipart/form-data" className="mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="requestId" value={request.id} />
              <input type="file" name="file" required className="text-sm" />
              <Button type="submit" size="sm" variant="secondary">Hochladen</Button>
            </form>
            <ul className="mt-3 space-y-2 text-sm">
              {request.attachments.map((file) => (
                <li key={file.id}><a className="font-semibold text-brand" href={`/api/attachments/${file.id}`}>{file.originalName}</a> <span className="text-muted">{formatDateTime(file.createdAt)}</span></li>
              ))}
              {request.attachments.length === 0 ? <li className="text-muted">Noch keine Dateien.</li> : null}
            </ul>
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel>
            <h2 className="font-display text-xl">Status</h2>
            <form action={updateRequest} className="mt-3 space-y-3">
              <input type="hidden" name="id" value={request.id} />
              <label className="block text-sm font-semibold">Titel<input name="title" defaultValue={request.title} className="field mt-1" /></label>
              <label className="block text-sm font-semibold">Status
                <select name="status" defaultValue={request.status} className="field mt-1">
                  {Object.entries(REQUEST_STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold">Bereich
                <select name="segment" defaultValue={request.segment} className="field mt-1">
                  <option value="HAUSHALT">Haushalt</option>
                  <option value="GEWERBE">Gewerbe</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">Herkunft
                <select name="source" defaultValue={request.source ?? ""} className="field mt-1">
                  <option value="">–</option>
                  {REQUEST_SOURCES.map((source) => <option key={source}>{source}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold">Zuständig
                <select name="assigneeId" defaultValue={request.assigneeId ?? ""} className="field mt-1">
                  <option value="">–</option>
                  {staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              </label>
              <AddressFields layout="stack" streetLabel="Objektstraße" names={{ street: "street", zip: "zip", city: "city" }} defaults={{ street: request.street, zip: request.zip, city: request.city }} />
              <Button type="submit" size="sm">Speichern</Button>
            </form>
          </Panel>
          <Panel>
            <h2 className="font-display text-xl">Kontakt</h2>
            <p className="mt-2 font-semibold"><Link href={`/kunden/${request.customer.id}`}>{customerName(request.customer)}</Link></p>
            <p className="text-sm text-muted">{addressLine(request.customer) || "Keine Adresse"}</p>
            <p className="text-sm">{request.customer.email}</p>
            <p className="text-sm">{request.customer.phone}</p>
            <p className="mt-2 text-sm text-muted">Objekt: {addressLine(request) || "wie Kontakt"}</p>
          </Panel>
          <Panel>
            <h2 className="font-display text-xl">Angebote</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {request.offers.map((offer) => (
                <li key={offer.id} className="flex items-center justify-between gap-2">
                  <Link className="font-semibold" href={`/angebote/${offer.id}`}>{offer.number}</Link>
                  <Badge>{OFFER_STATUS_LABEL[offer.status]}</Badge>
                </li>
              ))}
              {request.offers.length === 0 ? <li className="text-muted">Noch kein Angebot.</li> : null}
            </ul>
          </Panel>
          {user.role === "ADMIN" ? (
            <Panel>
              <form action={deleteRequest.bind(null, request.id)}>
                <Button type="submit" variant="danger" size="sm">Anfrage löschen</Button>
              </form>
              <p className="mt-2 text-xs text-muted">Nur möglich, solange kein Angebot daran hängt.</p>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
