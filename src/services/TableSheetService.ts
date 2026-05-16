import type { PdfTableSheet } from "@/pdf/pdfTypes";

export type SheetSort = {
  column: number;
  direction: "asc" | "desc";
} | null;

export function filterRows(sheet: PdfTableSheet, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return sheet.rows;
  return sheet.rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(normalized)));
}

function compareCells(left: string, right: string) {
  const leftNumber = Number(left.replace(/,/g, ""));
  const rightNumber = Number(right.replace(/,/g, ""));
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && left.trim() && right.trim()) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export function sortRows(rows: string[][], sort: SheetSort) {
  if (!sort) return rows;
  return rows.slice().sort((left, right) => {
    const result = compareCells(left[sort.column] || "", right[sort.column] || "");
    return sort.direction === "asc" ? result : -result;
  });
}

function escapeCsvCell(value: string) {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, "\"\"")}"`;
}

export function tableSheetToCsv(sheet: Pick<PdfTableSheet, "columns" | "rows">) {
  return [sheet.columns, ...sheet.rows]
    .map((row) => row.map((cell) => escapeCsvCell(cell.trim())).join(","))
    .join("\r\n");
}
