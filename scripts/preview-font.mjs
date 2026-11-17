// Setzt die Schrift des Programms als Daten in eine Vorschauseite ein, damit die Vorschau ohne Server und ohne fremde Adressen auskommt.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writePageWithFont(root, source, target) {
  const font = await readFile(path.join(root, "app/fonts/HankenGrotesk-Variable.woff2"));
  const face = `@font-face { font-family: "Hanken Grotesk"; font-style: normal; font-weight: 100 900; font-display: swap; src: url(data:font/woff2;base64,${font.toString("base64")}) format("woff2"); }`;
  const html = await readFile(source, "utf8");
  if (!html.includes("/*SCHRIFT*/")) throw new Error(`In ${source} fehlt die Marke /*SCHRIFT*/.`);
  await writeFile(target, html.replace("/*SCHRIFT*/", face));
}
