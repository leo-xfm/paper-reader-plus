import { describe, expect, it } from "vitest";
import { buildPdfParagraphActionBlocks } from "@/services/PdfParagraphActionService";
import type { PdfTextItem } from "@/pdf/pdfTypes";

function item(text: string, left: number, top: number, width = 0.16, height = 0.014, fontSize = 10): PdfTextItem {
  return {
    text,
    left,
    top,
    width,
    height,
    fontName: "serif",
    fontSize,
    rectPct: { left, top, width, height },
  };
}

describe("PdfParagraphActionService", () => {
  it("builds paragraph action blocks with multi-line rects", () => {
    const blocks = buildPdfParagraphActionBlocks(2, [
      item("A paragraph starts here.", 0.12, 0.2),
      item("It continues on the next line.", 0.12, 0.216),
      item("Figure 1. Not an action paragraph.", 0.1, 0.32),
      item("Another paragraph.", 0.14, 0.42),
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      block_id: "2:0",
      page_index: 2,
      text: "A paragraph starts here. It continues on the next line.",
    });
    expect(blocks[0].rects_pct).toHaveLength(2);
    expect(blocks[1].text).toBe("Another paragraph.");
  });

  it("splits paragraph action blocks on a new paragraph indent", () => {
    const blocks = buildPdfParagraphActionBlocks(3, [
      item("The first paragraph begins without much indent.", 0.1, 0.1, 0.5),
      item("It continues on a normal body line.", 0.1, 0.116, 0.48),
      item("A new paragraph starts with indentation.", 0.14, 0.132, 0.46),
      item("It belongs to the indented paragraph.", 0.1, 0.148, 0.5),
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toBe("The first paragraph begins without much indent. It continues on a normal body line.");
    expect(blocks[1].text).toBe("A new paragraph starts with indentation. It belongs to the indented paragraph.");
  });
});
