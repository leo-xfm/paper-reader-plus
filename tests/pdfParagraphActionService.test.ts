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

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({
      block_id: "2:0",
      page_index: 2,
      text: "A paragraph starts here. It continues on the next line.",
    });
    expect(blocks[0].rects_pct).toHaveLength(2);
    expect(blocks[1].text).toBe("Figure 1. Not an action paragraph.");
    expect(blocks[2].text).toBe("Another paragraph.");
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

  it("keeps two-column paragraph blocks in column reading order", () => {
    const blocks = buildPdfParagraphActionBlocks(4, [
      item("Left column paragraph starts.", 0.08, 0.1, 0.32),
      item("Right column paragraph starts.", 0.56, 0.1, 0.32),
      item("Left column continues.", 0.08, 0.116, 0.3),
      item("Right column continues.", 0.56, 0.116, 0.3),
      item("Left column second paragraph.", 0.12, 0.154, 0.28),
      item("Right column second paragraph.", 0.6, 0.154, 0.28),
      item("Left second paragraph continues.", 0.08, 0.17, 0.32),
      item("Right second paragraph continues.", 0.56, 0.17, 0.32),
    ]);

    expect(blocks).toHaveLength(4);
    expect(blocks.map((block) => block.text)).toEqual([
      "Left column paragraph starts. Left column continues.",
      "Left column second paragraph. Left second paragraph continues.",
      "Right column paragraph starts. Right column continues.",
      "Right column second paragraph. Right second paragraph continues.",
    ]);
    expect(blocks[0].rects_pct).toHaveLength(2);
    expect(blocks[2].rects_pct[0].left).toBeGreaterThan(0.5);
  });

  it("keeps paragraphs when text items have slight baseline drift and larger line gaps", () => {
    const blocks = buildPdfParagraphActionBlocks(5, [
      item("This paragraph is extracted", 0.1, 0.1, 0.26),
      item("from one visual line.", 0.38, 0.108, 0.18),
      item("The next visual line is still part of it.", 0.1, 0.13, 0.5),
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe("This paragraph is extracted from one visual line. The next visual line is still part of it.");
  });

  it("does not drop ordinary technical prose as a formula", () => {
    const blocks = buildPdfParagraphActionBlocks(6, [
      item("The A-B test uses x+y features in v2.0.", 0.1, 0.1, 0.44),
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe("The A-B test uses x+y features in v2.0.");
  });

  it("recognizes paragraphs from loosely extracted text items", () => {
    const blocks = buildPdfParagraphActionBlocks(7, [
      item("A", 0.1, 0.1, 0.012),
      item("loosely", 0.13, 0.111, 0.055),
      item("extracted", 0.2, 0.108, 0.07),
      item("paragraph", 0.29, 0.112, 0.08),
      item("continues", 0.1, 0.151, 0.08),
      item("on the next line.", 0.2, 0.158, 0.16),
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe("A loosely extracted paragraph continues on the next line.");
  });
});
