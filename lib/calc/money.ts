/** Geldbeträge auf Cent runden. Grundlage für alle Preis- und Steuerrechnungen. */
export function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Verteilt einen Betrag in Cent anteilig auf Gewichte.
 * Der Rest landet bei den größten Nachkommastellen, ohne ein Gewicht zu überziehen.
 */
export function allocateCents(weights: number[], amountCents: number): number[] {
  const safe = weights.map((weight) => Math.max(0, Math.round(weight)));
  const total = safe.reduce((sum, weight) => sum + weight, 0);
  const capped = Math.max(0, Math.min(Math.round(amountCents), total));
  if (capped === 0 || total === 0) return safe.map(() => 0);

  const exact = safe.map((weight) => (capped * weight) / total);
  const out = exact.map((value) => Math.floor(value));
  let leftover = capped - out.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || safe[b.index] - safe[a.index]);

  let guard = 0;
  while (leftover > 0 && guard < safe.length * 3) {
    let moved = false;
    for (const entry of order) {
      if (leftover <= 0) break;
      if (out[entry.index] < safe[entry.index]) {
        out[entry.index] += 1;
        leftover -= 1;
        moved = true;
      }
    }
    if (!moved) break;
    guard += 1;
  }
  return out;
}
