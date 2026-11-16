import { CalendarView } from "@/components/calendar-view";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { customerName } from "@/lib/format";

export const metadata = { title: "Termine" };

export default async function CalendarPage() {
  const [appointments, customers, offers, staff] = await Promise.all([
    prisma.appointment.findMany({ orderBy: { startAt: "asc" }, take: 400 }),
    prisma.customer.findMany({ orderBy: { lastName: "asc" }, take: 300 }),
    prisma.offer.findMany({ include: { request: { include: { customer: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return (
    <div>
      <PageHeader eyebrow="Termine" title="Kalender" description="Vor-Ort-Termine und Telefonate, verbunden mit Kontakt oder Angebot." />
      <CalendarView
        initialMonth={month}
        appointments={appointments.map((item) => ({
          id: item.id,
          title: item.title,
          startAt: item.startAt.toISOString(),
          endAt: item.endAt.toISOString(),
          location: item.location ?? "",
          notes: item.notes ?? "",
          userId: item.userId ?? "",
          customerId: item.customerId ?? "",
          offerId: item.offerId ?? "",
        }))}
        customers={customers.map((customer) => ({ id: customer.id, label: customerName(customer) }))}
        offers={offers.map((offer) => ({ id: offer.id, label: `${offer.number} · ${customerName(offer.request.customer)}` }))}
        staff={staff.map((person) => ({ id: person.id, name: person.name }))}
      />
    </div>
  );
}
