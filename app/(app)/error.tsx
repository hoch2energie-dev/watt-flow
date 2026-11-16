"use client";

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-2xl border border-line bg-elevated p-6">
      <h1 className="font-display text-3xl">Die Seite konnte nicht geladen werden</h1>
      <p className="mt-2 text-sm text-muted">{error.message}</p>
      <button className="mt-4 h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white" onClick={reset}>Erneut versuchen</button>
    </div>
  );
}
