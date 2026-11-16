import { describe, expect, it } from "vitest";
import { parseDeNumber } from "@/lib/format";

describe("deutsche Zahlen", () => {
  it("versteht Komma, Tausenderpunkte und Dezimalpunkte", () => {
    expect(parseDeNumber("1.234,56")).toBeCloseTo(1234.56, 2);
    expect(parseDeNumber("1234,56")).toBeCloseTo(1234.56, 2);
    expect(parseDeNumber("1234.56")).toBeCloseTo(1234.56, 2);
    expect(parseDeNumber("1.234")).toBe(1234);
    expect(parseDeNumber("1.234.567")).toBe(1234567);
    expect(parseDeNumber("10.50")).toBeCloseTo(10.5, 2);
    expect(parseDeNumber("")).toBe(0);
    expect(parseDeNumber("abc")).toBe(0);
  });
});
