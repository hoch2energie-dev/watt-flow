// Baut die Vorschau von Angebotsseite und 3D-Planung als eigenständige Seite nach preview/app/dist.
// Serverfunktionen und Next-Bausteine werden durch Stellvertreter aus preview/app/stubs ersetzt.
// Aufruf: node scripts/preview-app.mjs
import tailwind from "@tailwindcss/postcss";
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { writePageWithFont } from "./preview-font.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "preview/app/dist");
const stub = (name) => path.join(root, "preview/app/stubs", name);
const replaced = {
  "next/link": stub("next-link.tsx"),
  "next/navigation": stub("next-navigation.ts"),
  "@/app/actions/offers": stub("actions-offers.ts"),
  "@/app/actions/yield": stub("actions-yield.ts"),
  "@/app/actions/roof": stub("actions-roof.ts"),
  "@/lib/navigate": stub("navigate.ts"),
  "@/app/actions/crm": stub("actions-crm.ts"),
  "@/lib/address-client": stub("address-client.ts"),
};

await mkdir(out, { recursive: true });
await build({
  entryPoints: { app: path.join(root, "preview/app/main.tsx") },
  outdir: out,
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  alias: { "@": root },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
  plugins: [
    {
      name: "stellvertreter",
      setup(api) {
        api.onResolve({ filter: /^(next\/(link|navigation)|@\/app\/actions\/(offers|yield|roof|crm)|@\/lib\/(navigate|address-client))$/ }, (args) => ({ path: replaced[args.path] }));
      },
    },
  ],
});
const source = path.join(root, "app/globals.css");
const css = await postcss([tailwind()]).process(await readFile(source, "utf8"), { from: source });
await writeFile(path.join(out, "tailwind.css"), css.css);
await writePageWithFont(root, path.join(root, "preview/app/index.html"), path.join(out, "index.html"));
