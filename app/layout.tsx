import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const sans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: { default: "Hoch2 Angebote", template: "%s · Hoch2 Angebote" },
  description: "Anfragen, Angebote und Projekte für Hoch2 Energiesysteme.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body className={`${sans.variable} ${display.variable} antialiased`}>{children}</body>
    </html>
  );
}
