import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvNumber, toCsv } from "@/lib/csv";

describe("CSV", () => {
  it("liest Semikolon, Anführungszeichen und Kommazahlen", () => {
    const rows = parseCsv('typ;name;preis\npv_module;"Nordlicht; schwarz";189,50\n');
    expect(rows).toEqual([
      ["typ", "name", "preis"],
      ["pv_module", "Nordlicht; schwarz", "189,50"],
    ]);
    expect(parseCsvNumber(rows[1][2])).toBeCloseTo(189.5, 2);
  });

  it("schreibt Semikolon und maskiert Anführungszeichen", () => {
    const csv = toCsv([
      ["name", "notiz"],
      ['A "B"', "ok"],
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(parseCsv(csv)[1][0]).toBe('A "B"');
  });
});
