import { describe, expect, it } from "vitest";
import { estimateReferencePreviewRect, findPdfFigureTargets, findPdfReferenceCandidates } from "@/pdf/pdfReferences";
import type { PdfDocumentProxyLike, PdfTextItem } from "@/pdf/pdfTypes";

function item(text: string, left: number, top: number, width: number): PdfTextItem {
  return {
    text,
    left,
    top,
    width,
    height: 10,
    fontName: "serif",
    fontSize: 10,
    rectPct: { left: left / 500, top: top / 700, width: width / 500, height: 10 / 700 },
  };
}

function mockPdf(linesByPage: string[][]): PdfDocumentProxyLike {
  return {
    numPages: linesByPage.length,
    async getPage(pageNumber: number) {
      const lines = linesByPage[pageNumber - 1] || [];
      return {
        getViewport: () => ({ width: 500, height: 700, scale: 1, transform: [1, 0, 0, 1, 0, 0] }),
        async getTextContent() {
          return {
            styles: { f1: { fontFamily: "serif", ascent: 0.86 } },
            items: lines.map((text, index) => ({
              str: text,
              width: Math.max(20, text.length * 5),
              height: 10,
              fontName: "f1",
              transform: [1, 0, 0, 10, 40, 100 + index * 18],
            })),
          };
        },
      };
    },
  };
}

describe("pdfReferences", () => {
  it("finds figure and table references in text lines", () => {
    const candidates = findPdfReferenceCandidates(0, [
      item("As shown in", 40, 80, 80),
      item("Figure 4", 130, 80, 50),
      item("and Table 1,", 190, 80, 70),
    ]);
    expect(candidates.map((candidate) => candidate.label)).toEqual(["Figure 4", "Table 1"]);
    expect(candidates.every((candidate) => candidate.rects_pct.length === 1)).toBe(true);
  });

  it("estimates figure preview above the caption", () => {
    const rect = estimateReferencePreviewRect(
      { kind: "figure" },
      { left: 0.2, top: 0.72, width: 0.6, height: 0.04 },
    );
    expect(rect.top).toBeLessThan(0.72);
    expect(rect.height).toBeGreaterThan(0.3);
  });

  it("finds figure captions, folds continuation lines, and deduplicates same-page labels", async () => {
    const targets = await findPdfFigureTargets(mockPdf([[
      "Introduction text",
      "Figure 1. System overview.",
      "This diagram shows the full model pipeline.",
      "Fig. 1 repeated reference should not create another target.",
      "Fig. 2 Ablation comparison.",
    ]]));
    expect(targets.map((target) => target.label)).toEqual(["Figure 1", "Figure 2"]);
    expect(targets[0].caption).toContain("full model pipeline");
    expect(targets[0].preview_rect_pct.height).toBeGreaterThan(0);
  });
});
