export const SESSION_COOKIE = "h2_session";

export function authSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < 16) {
    throw new Error("AUTH_SECRET fehlt oder ist zu kurz.");
  }
  return new TextEncoder().encode(secret);
}

export function usingDefaultSecret(): boolean {
  const secret = process.env.AUTH_SECRET ?? "";
  return secret.length < 16 || secret.includes("dev-only-change-me") || secret.includes("bitte-durch");
}

export function showDemoLogin(): boolean {
  return process.env.SHOW_DEMO_LOGIN !== "false";
}
