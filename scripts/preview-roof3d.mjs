// Baut die Vorschau der 3D-Planung als eigenständige Seite nach preview/roof3d/dist.
// Aufruf: node scripts/preview-roof3d.mjs
import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "preview/roof3d/dist");
await mkdir(out, { recursive: true });
await build({
  entryPoints: { app: path.join(root, "preview/roof3d/main.tsx") },
  outdir: out,
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  alias: { "@": root },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
});
await copyFile(path.join(root, "preview/roof3d/index.html"), path.join(out, "index.html"));
