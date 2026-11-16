import fs from "node:fs/promises";
import path from "node:path";

export function uploadDir(): string {
  return path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads"));
}

export async function ensureUploadDir(): Promise<string> {
  const dir = uploadDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function safeStoredPath(storedName: string): string {
  if (!storedName || storedName !== path.basename(storedName) || storedName.includes("..")) {
    throw new Error("Ungültiger Dateiname.");
  }
  const base = uploadDir();
  const full = path.resolve(base, storedName);
  if (!full.startsWith(base + path.sep)) throw new Error("Ungültiger Dateipfad.");
  return full;
}

export function extensionOf(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return ext.length <= 8 ? ext : "";
}

const BLOCKED = new Set(["text/html", "image/svg+xml", "application/javascript", "text/javascript"]);

export function downloadMime(mime: string): { mime: string; inline: boolean } {
  if (BLOCKED.has(mime)) return { mime: "application/octet-stream", inline: false };
  const inline = mime === "application/pdf" || mime.startsWith("image/");
  return { mime, inline };
}
