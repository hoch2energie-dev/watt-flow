import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { showDemoLogin } from "@/lib/secret";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ fehler?: string; next?: string }> }) {
  const session = await getSession();
  if (session) redirect("/uebersicht");
  const query = await searchParams;
  const next = query.next && query.next.startsWith("/") ? query.next : "/uebersicht";
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-sidebar px-12 py-12 text-white lg:flex">
        <div>
          <p className="font-display text-4xl">Hoch2 Angebote</p>
          <p className="mt-4 max-w-md text-lg text-sidebar-muted">
            Anfragen, Varianten und Wirtschaftlichkeit für Photovoltaik, Speicher, Wärmepumpen und Wallboxen. Die Kundendaten bleiben auf Ihrem Server.
          </p>
        </div>
        <ul className="space-y-3 text-sm text-sidebar-muted">
          <li>Qualifizierung von Haushalt und Gewerbe</li>
          <li>Katalog mit Einkauf, Verkauf und Steuerkategorie</li>
          <li>Angebot als PDF, Board und Termine</li>
        </ul>
      </section>
      <section className="flex items-center justify-center px-4 py-12">
        <form action="/api/auth/login" method="post" className="w-full max-w-md rounded-3xl border border-line bg-elevated p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Anmeldung</p>
          <h1 className="mt-2 font-display text-3xl">Willkommen im Team</h1>
          <p className="mt-2 text-sm text-muted lg:hidden">Hoch2 Angebote für den internen Gebrauch.</p>
          {query.fehler ? <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">E-Mail oder Passwort stimmt nicht.</p> : null}
          <input type="hidden" name="next" value={next} />
          <label className="mt-6 block text-sm font-semibold" htmlFor="email">E-Mail</label>
          <input id="email" name="email" type="email" autoComplete="username" required className="field mt-1" />
          <label className="mt-4 block text-sm font-semibold" htmlFor="password">Passwort</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="field mt-1" />
          <button className="mt-6 h-11 w-full rounded-xl bg-brand text-sm font-semibold text-white hover:bg-brand-strong">Anmelden</button>
          {showDemoLogin() ? (
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Beispielzugang: leonie.hartmann@hoch2.example · Sonnenklar!2026
              <br />
              Teamkonto: jonas.keller@hoch2.example · Speicher!2026
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}
