import { describe, expect, it } from "vitest";
import { filterRows, sortRows, tableSheetToCsv } from "@/services/TableSheetService";
import { selectLikelyTableRowsForTest } from "@/pdf/pdfReferences";
import type { PdfTableSheet } from "@/pdf/pdfTypes";

const sheet: PdfTableSheet = {
  table_id: "t1",
  title: "Table 1",
  caption: "Table 1. Results.",
  page_index: 0,
  columns: ["Method", "Score"],
  rows: [
    ["B", "10"],
    ["A", "2"],
    ["C", "7"],
  ],
};

describe("TableSheetService", () => {
  it("filters rows by any cell", () => {
    expect(filterRows(sheet, "A")).toEqual([["A", "2"]]);
  });

  it("sorts numeric cells", () => {
    expect(sortRows(sheet.rows, { column: 1, direction: "asc" }).map((row) => row[0])).toEqual(["A", "C", "B"]);
  });

  it("exports clean escaped CSV", () => {
    expect(tableSheetToCsv({
      columns: ["Name", "Note"],
      rows: [["A", "hello, world"], ["B", "plain"]],
    })).toBe("Name,Note\r\nA,\"hello, world\"\r\nB,plain");
  });

  it("drops caption and following prose when selecting table rows", () => {
    const rows = [
      { top: 0, bottom: 10, cells: [{ text: "Table 1: Performance comparison", left: 0, width: 100 }] },
      { top: 12, bottom: 22, cells: [{ text: "LLM", left: 0, width: 20 }, { text: "SWE-Agent", left: 100, width: 40 }, { text: "SE-Agent", left: 220, width: 40 }] },
      { top: 24, bottom: 34, cells: [{ text: "Pass@1", left: 100, width: 30 }, { text: "Pass@5", left: 150, width: 30 }, { text: "Pass@1", left: 220, width: 30 }] },
      { top: 36, bottom: 46, cells: [{ text: "DeepSeek-V3-0324", left: 0, width: 70 }, { text: "31.6%", left: 100, width: 30 }, { text: "54.8%", left: 220, width: 30 }] },
      { top: 48, bottom: 58, cells: [{ text: "This selection process continues iteratively until convergence criteria are met.", left: 0, width: 300 }] },
      { top: 60, bottom: 70, cells: [{ text: "mechanism, SE-Agent achieves two critical advantages", left: 0, width: 260 }] },
    ];

    expect(selectLikelyTableRowsForTest(rows).map((row) => row.cells[0].text)).toEqual(["LLM", "Pass@1", "DeepSeek-V3-0324"]);
  });
});
