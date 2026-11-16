import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function actor() {
  return requireUser();
}

export async function adminActor() {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new Error("Dafür braucht es ein Administrationskonto.");
  }
  return user;
}

export function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function formNumber(form: FormData, key: string, fallback = 0): number {
  const raw = formString(form, key).replace(/\s/g, "");
  if (!raw) return fallback;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : fallback;
}

export function formBool(form: FormData, key: string): boolean {
  const value = form.get(key);
  return value === "on" || value === "true" || value === "1";
}

export async function staffOptions() {
  return prisma.user.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
}
