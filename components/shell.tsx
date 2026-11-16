"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CalendarDays, Columns3, FileText, Inbox, LayoutDashboard, LogOut, Menu, Package, Search, Settings, Users, X } from "lucide-react";
import { Notice } from "@/components/ui";

const NAV = [
  { href: "/uebersicht", label: "Übersicht", icon: LayoutDashboard },
  { href: "/anfragen", label: "Anfragen", icon: Inbox },
  { href: "/kunden", label: "Kunden", icon: Users },
  { href: "/angebote", label: "Angebote", icon: FileText },
  { href: "/katalog", label: "Katalog", icon: Package },
  { href: "/board", label: "Board", icon: Columns3 },
  { href: "/kalender", label: "Termine", icon: CalendarDays },
  { href: "/einstellungen", label: "Einstellungen", icon: Settings },
];

export function Shell({
  user,
  company,
  mustChangePassword,
  demoSecret,
  children,
}: {
  user: { name: string; email: string; role: "ADMIN" | "USER" };
  company: string;
  mustChangePassword: boolean;
  demoSecret: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Hauptnavigation">
      {NAV.map((item) => {
        const active = item.href === "/uebersicht" ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold ${active ? "bg-white/10 text-white" : "text-sidebar-muted hover:bg-white/5 hover:text-white"}`}
          >
            <Icon size={18} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-bg text-ink">
      <a href="#inhalt" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
        Zum Inhalt
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar px-4 py-5 text-white md:flex">
        <Link href="/uebersicht" className="mb-6 flex items-center gap-3 px-2">
          <Mark />
          <span>
            <span className="block font-display text-xl leading-none">Hoch2</span>
            <span className="text-xs text-sidebar-muted">Angebote</span>
          </span>
        </Link>
        {nav}
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="px-2 text-sm font-semibold">{user.name}</p>
          <p className="px-2 text-xs text-sidebar-muted">{user.role === "ADMIN" ? "Administration" : "Team"}</p>
          <form action="/api/auth/logout" method="post" className="mt-3">
            <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-sidebar-muted hover:text-white">
              <LogOut size={16} aria-hidden /> Abmelden
            </button>
          </form>
        </div>
      </aside>

      <div className="md:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur md:px-8">
          <button className="rounded-lg p-2 md:hidden" aria-label="Menü öffnen" onClick={() => setOpen(true)}>
            <Menu size={20} />
          </button>
          <p className="hidden text-sm text-muted md:block">{company}</p>
          <form action="/suche" className="ml-auto flex min-w-0 flex-1 items-center gap-2 md:max-w-sm">
            <label className="sr-only" htmlFor="q">Suche</label>
            <div className="flex w-full items-center gap-2 rounded-xl border border-line bg-white px-3">
              <Search size={16} className="text-muted" aria-hidden />
              <input id="q" name="q" placeholder="Name, Nummer, Ort" className="h-10 w-full bg-transparent text-sm outline-none" />
            </div>
          </form>
        </header>
        {open ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <button className="absolute inset-0 bg-black/40" aria-label="Menü schließen" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-sidebar p-4 text-white">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-display text-xl">Hoch2 Angebote</span>
                <button aria-label="Schließen" onClick={() => setOpen(false)}><X /></button>
              </div>
              {nav}
            </aside>
          </div>
        ) : null}
        <main id="inhalt" className="px-4 py-6 md:px-8 md:py-8">
          <div className="mb-4 space-y-2">
            {mustChangePassword ? (
              <Notice>Bitte ändern Sie das Beispielpasswort unter Einstellungen.</Notice>
            ) : null}
            {demoSecret ? (
              <Notice>Der Server nutzt noch das Entwicklungsgeheimnis. Setzen Sie AUTH_SECRET, bevor die Anwendung erreichbar ist.</Notice>
            ) : null}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

function Mark() {
  return (
    <svg width="36" height="36" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#1e5c42" />
      <path d="M6 19.5 16 9l10 10.5" fill="none" stroke="#f4efe6" strokeWidth="2.2" />
      <path d="M11 19.5V24h10v-4.5" fill="none" stroke="#f4efe6" strokeWidth="2.2" />
      <circle cx="23.2" cy="10.2" r="2.1" fill="#e7a15a" />
    </svg>
  );
}
