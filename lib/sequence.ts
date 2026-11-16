import type { Prisma } from "@prisma/client";

export function berlinYear(date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", year: "numeric" }).format(date));
}

export async function nextNumber(tx: Prisma.TransactionClient, prefix: "AN" | "AG"): Promise<string> {
  const year = berlinYear();
  const key = `${prefix}-${year}`;
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("id", "value") VALUES (${key}, 1)
    ON CONFLICT ("id") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"
  `;
  const value = Number(rows[0]?.value ?? 1);
  return `${prefix}-${year}-${String(value).padStart(4, "0")}`;
}
