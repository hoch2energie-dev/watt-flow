import type { AddressSuggestion, ResolvedAddress } from "@/lib/google/places";

/** Anfragen des Browsers an den eigenen Server für die Adressvorschläge. */
export type SuggestReply = { enabled: boolean; suggestions: AddressSuggestion[] };

export async function fetchSuggestions(input: string, token: string, signal?: AbortSignal): Promise<SuggestReply> {
  const response = await fetch(`/api/address/suggest?q=${encodeURIComponent(input)}&s=${encodeURIComponent(token)}`, { signal, credentials: "same-origin" });
  if (!response.ok) return { enabled: true, suggestions: [] };
  const payload = (await response.json()) as Partial<SuggestReply>;
  return { enabled: payload.enabled !== false, suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [] };
}

export async function fetchAddress(placeId: string, token: string): Promise<ResolvedAddress | null> {
  const response = await fetch(`/api/address/resolve?id=${encodeURIComponent(placeId)}&s=${encodeURIComponent(token)}`, { credentials: "same-origin" });
  if (!response.ok) return null;
  const payload = (await response.json()) as { address?: ResolvedAddress | null };
  return payload.address ?? null;
}
