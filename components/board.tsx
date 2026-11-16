"use client";

import Link from "next/link";
import { useState } from "react";
import { moveOffer } from "@/app/actions/offers";
import { formatEuro } from "@/lib/format";

export type BoardCard = {
  id: string;
  number: string;
  title: string;
  customer: string;
  city: string;
  gross: number;
  stageId: string | null;
  status: string;
};

export function Board({ stages, cards }: { stages: { id: string; name: string; color: string }[]; cards: BoardCard[] }) {
  const [items, setItems] = useState(cards);
  const [error, setError] = useState<string | null>(null);

  async function drop(offerId: string, stageId: string) {
    const previous = items;
    setItems(items.map((card) => (card.id === offerId ? { ...card, stageId } : card)));
    const result = await moveOffer(offerId, stageId);
    if (!result.ok) {
      setItems(previous);
      setError(result.error);
    }
  }

  return (
    <div>
      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <section
            key={stage.id}
            className="w-72 shrink-0 rounded-2xl bg-black/5 p-3"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const id = event.dataTransfer.getData("text/plain");
              if (id) void drop(id, stage.id);
            }}
          >
            <header className="mb-3 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
              <h2 className="text-sm font-semibold">{stage.name}</h2>
              <span className="text-xs text-muted">{items.filter((card) => card.stageId === stage.id).length}</span>
            </header>
            <div className="space-y-2">
              {items.filter((card) => card.stageId === stage.id).map((card) => (
                <article key={card.id} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", card.id)} className="cursor-grab rounded-xl border border-line bg-white p-3 shadow-sm">
                  <Link href={`/angebote/${card.id}`} className="font-semibold">{card.number}</Link>
                  <p className="text-sm">{card.customer}</p>
                  <p className="text-xs text-muted">{card.city || card.title}</p>
                  <p className="mt-2 text-sm font-semibold">{formatEuro(card.gross)}</p>
                  <label className="mt-2 block text-xs text-muted">Spalte
                    <select className="field mt-1" value={card.stageId ?? ""} onChange={(event) => void drop(card.id, event.target.value)}>
                      {stages.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </select>
                  </label>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
