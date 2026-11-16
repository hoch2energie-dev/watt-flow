import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24">
      <h1 className="font-display text-4xl">Seite nicht gefunden</h1>
      <p className="mt-2 text-muted">Der Eintrag existiert nicht oder wurde verschoben.</p>
      <Link href="/uebersicht" className="mt-4 inline-block font-semibold text-brand">Zur Übersicht</Link>
    </div>
  );
}
