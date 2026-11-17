import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/* Hanken Grotesk liegt im Repo (SIL Open Font License, app/fonts/OFL-HankenGrotesk.txt). Der Bau braucht dafür keinen fremden Server. */
const sans = localFont({ src: "./fonts/HankenGrotesk-Variable.woff2", variable: "--font-hanken", weight: "100 900", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Hoch2 Angebote", template: "%s · Hoch2 Angebote" },
  description: "Anfragen, Angebote und Projekte für Hoch2 Energiesysteme.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body className={`${sans.variable} antialiased`}>{children}</body>
    </html>
  );
}
