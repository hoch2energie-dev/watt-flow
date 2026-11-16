import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publicUrl } from "@/lib/public-url";
import { SESSION_COOKIE } from "@/lib/secret";
import { signSession } from "@/lib/token";

export const dynamic = "force-dynamic";

const attempts = new Map<string, { count: number; reset: number }>();

function tooMany(key: string): boolean {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.reset < now) {
    attempts.set(key, { count: 1, reset: now + 10 * 60 * 1000 });
    return false;
  }
  current.count += 1;
  return current.count > 12;
}

function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/uebersicht";
  return value;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const fail = (status = 303) => {
    const url = publicUrl(request, "/login");
    url.searchParams.set("fehler", "1");
    return NextResponse.redirect(url, status);
  };
  if (tooMany(`${ip}:${email}`)) return fail();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return fail();
  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) return fail();
  const token = await signSession({ sub: user.id, email: user.email, name: user.name });
  const destination = user.mustChangePassword ? "/einstellungen?tab=passwort" : safeNext(form.get("next"));
  const response = NextResponse.redirect(publicUrl(request, destination), 303);
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
