import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/secret";
import { verifyToken } from "@/lib/token";

export async function getSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireUser(): Promise<User> {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || !user.active) {
    const jar = await cookies();
    jar.delete(SESSION_COOKIE);
    redirect("/login");
  }
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/uebersicht");
  return user;
}
