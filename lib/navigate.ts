/** Seitenwechsel an einer Stelle, damit Vorschau und Tests ihn umleiten können. */
export function navigate(url: string) {
  window.location.assign(url);
}
