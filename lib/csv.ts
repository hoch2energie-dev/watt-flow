import { parseDeNumber } from "@/lib/format";

export function parseCsv(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = cleaned.split("\n").find((line) => line.trim().length > 0) ?? "";
  const delimiter = firstLine.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (quoted) {
      if (char === '"') {
        if (cleaned[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.trim() !== ""));
}

export function toCsv(rows: string[][]): string {
  const escape = (value: string) => {
    if (/[;"\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  };
  return `\uFEFF${rows.map((row) => row.map(escape).join(";")).join("\n")}\n`;
}

export function parseCsvNumber(value: string): number {
  return parseDeNumber(value);
}
