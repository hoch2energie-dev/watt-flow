"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CalendarDays, Columns3, FileText, Inbox, LayoutDashboard, LogOut, Menu, Package, Search, Settings, Users, X } from "lucide-react";
import { Notice } from "@/components/ui";

/** Hauptnavigation in Gruppen. Die erste Gruppe steht ohne Überschrift. */
const NAV_GROUPS = [
  {
    label: null,
    items: [
      { href: "/uebersicht", label: "Übersicht", icon: LayoutDashboard },
      { href: "/kunden", label: "Kunden", icon: Users },
      { href: "/kalender", label: "Termine", icon: CalendarDays },
    ],
  },
  {
    label: "Projekte",
    items: [
      { href: "/anfragen", label: "Anfragen", icon: Inbox },
      { href: "/angebote", label: "Angebote", icon: FileText },
      { href: "/board", label: "Board", icon: Columns3 },
    ],
  },
  {
    label: "Verwaltung",
    items: [
      { href: "/katalog", label: "Katalog", icon: Package },
      { href: "/einstellungen", label: "Einstellungen", icon: Settings },
    ],
  },
];

const RAIL_ITEM = "rail-item relative grid size-12 place-items-center rounded-2xl";
const RAIL_IDLE = "text-muted hover:bg-surface/70 hover:text-ink";
const RAIL_ON = "bg-surface text-brand shadow-raise";

/**
 * Rahmen des Programms. Links eine schmale Symbolleiste (die Beschriftung erscheint neben dem Symbol),
 * oben rechts die Suche. Auf dem Handy öffnet der Menüknopf dieselbe Navigation mit Beschriftung.
 */
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
  const isActive = (href: string) => (href === "/uebersicht" ? pathname === href : pathname.startsWith(href));
  const role = user.role === "ADMIN" ? "Administration" : "Team";
  const initials = user.name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-bg text-ink md:pl-[5.5rem]">
      <a href="#inhalt" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2">
        Zum Inhalt
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[5.5rem] flex-col items-center gap-6 py-6 md:flex">
        <Link href="/uebersicht" className="rail-item relative rounded-2xl">
          <Mark />
          <span className="rail-tip">Hoch2 Angebote</span>
        </Link>
        <nav className="flex flex-1 flex-col items-center gap-3" aria-label="Hauptnavigation">
          {NAV_GROUPS.map((group, index) => (
            <div key={group.label ?? "start"} role="group" aria-label={group.label ?? "Start"} className="flex flex-col items-center gap-1.5">
              {index > 0 ? <i className="mb-1.5 block h-px w-6 bg-line" aria-hidden /> : null}
              {group.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`${RAIL_ITEM} ${active ? RAIL_ON : RAIL_IDLE}`}>
                    <Icon size={20} aria-hidden />
                    <span className="rail-tip">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="flex flex-col items-center gap-1.5">
          <span className="rail-item relative grid size-10 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong">
            <span aria-hidden>{initials}</span>
            <span className="rail-tip">{user.name}, {role}</span>
          </span>
          <form action="/api/auth/logout" method="post">
            <button className={`${RAIL_ITEM} ${RAIL_IDLE}`}>
              <LogOut size={19} aria-hidden />
              <span className="rail-tip">Abmelden</span>
            </button>
          </form>
        </div>
      </aside>

      <div className="px-4 pb-10 pt-4 md:px-8 md:pt-6">
        {mustChangePassword || demoSecret ? (
          <div className="mb-4 space-y-2">
            {mustChangePassword ? <Notice>Bitte ändern Sie das Beispielpasswort unter Einstellungen.</Notice> : null}
            {demoSecret ? <Notice>Der Server nutzt noch das Entwicklungsgeheimnis. Setzen Sie AUTH_SECRET, bevor die Anwendung erreichbar ist.</Notice> : null}
          </div>
        ) : null}

        {/* Die Zeile selbst fängt keine Klicks: Auf breiten Schirmen steht links davon der Kopf der Seite. */}
        <header className="pointer-events-none relative z-20 mb-3 flex h-12 items-center justify-end gap-4">
          <button className="pointer-events-auto grid size-12 shrink-0 place-items-center rounded-2xl bg-surface shadow-raise md:hidden" aria-label="Menü öffnen" onClick={() => setOpen(true)}>
            <Menu size={20} aria-hidden />
          </button>
          <p className="pointer-events-auto hidden truncate text-sm text-muted lg:block">{company}</p>
          <form action="/suche" className="pointer-events-auto min-w-0 flex-1 md:w-80 md:flex-none">
            <label className="sr-only" htmlFor="q">Suche</label>
            <div className="flex h-12 w-full items-center gap-2.5 rounded-full bg-surface px-4 shadow-raise focus-within:ring-2 focus-within:ring-brand/45">
              <Search size={17} className="shrink-0 text-muted" aria-hidden />
              <input id="q" name="q" placeholder="Name, Nummer, Ort" className="h-full w-full bg-transparent text-sm" style={{ outline: "none" }} />
            </div>
          </form>
        </header>

        {open ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <button className="absolute inset-0 bg-ink/40" aria-label="Menü schließen" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-2 left-2 flex w-72 max-w-[calc(100vw-1rem)] flex-col rounded-3xl bg-elevated p-4 shadow-xl">
              <div className="mb-5 flex items-center justify-between">
                <span className="flex items-center gap-3">
                  <Mark />
                  <span className="title-md">Hoch2 Angebote</span>
                </span>
                <button className="grid size-10 place-items-center rounded-full hover:bg-surface" aria-label="Schließen" onClick={() => setOpen(false)}>
                  <X size={20} aria-hidden />
                </button>
              </div>
              <nav className="flex flex-1 flex-col gap-4 overflow-y-auto" aria-label="Hauptnavigation">
                {NAV_GROUPS.map((group) => (
                  <div key={group.label ?? "start"} className="flex flex-col gap-1">
                    {group.label ? <p className="px-3 pb-1 text-xs text-muted">{group.label}</p> : null}
                    {group.items.map((item) => {
                      const active = isActive(item.href);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setOpen(false)}
                          className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium ${active ? "bg-surface text-brand shadow-raise" : "text-ink hover:bg-surface/70"}`}
                        >
                          <Icon size={19} aria-hidden />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </nav>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
                <p className="min-w-0 text-sm">
                  <span className="block truncate font-semibold">{user.name}</span>
                  <span className="text-xs text-muted">{role}</span>
                </p>
                <form action="/api/auth/logout" method="post">
                  <button className="flex items-center gap-2 rounded-full px-3 py-2 text-sm text-muted hover:bg-surface hover:text-ink">
                    <LogOut size={16} aria-hidden /> Abmelden
                  </button>
                </form>
              </div>
            </aside>
          </div>
        ) : null}

        <main id="inhalt">{children}</main>
      </div>
    </div>
  );
}

function Mark() {
  return (
    <svg width="48" height="48" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="10" fill="#1e5c42" />
      <path d="M7.5 19 16 10.2 24.5 19" fill="none" stroke="#f4f6f5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.2 18.6V23h9.6v-4.4" fill="none" stroke="#f4f6f5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23.4" cy="9.6" r="2" fill="#e8955f" />
    </svg>
  );
}
