import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PdfTextItem } from "@/pdf/pdfTypes";
import { buildPdfExtractorSummarySource, clearPdfFormulaOcrCache } from "@/services/PdfSummarySourceService";
import { renderPdfRegionImage } from "@/pdf/pdfImageRendering";

vi.mock("@/pdf/pdfImageRendering", () => ({
  renderPdfRegionImage: vi.fn(async () => "data:image/png;base64,Zm9ybXVsYQ=="),
}));

function item(text: string, left: number, top: number, width = 0.16, height = 0.014): PdfTextItem {
  return {
    text,
    left,
    top,
    width,
    height,
    fontName: "serif",
    fontSize: 10,
    rectPct: { left, top, width, height },
  };
}

describe("PdfSummarySourceService", () => {
  beforeEach(() => {
    clearPdfFormulaOcrCache();
    vi.clearAllMocks();
  });

  it("does not call formula OCR when the setting is disabled", async () => {
    const recognizeLatexImage = vi.fn(async () => ({ latex: "x+y" }));
    const source = await buildPdfExtractorSummarySource({
      documentId: "doc-1",
      pageItems: {
        0: [
          item("Method text.", 0.1, 0.1, 0.3),
          item("L = \\sum _ { i = 1 } ^ n", 0.24, 0.15, 0.32),
        ],
      },
      pdfDocument: { numPages: 1, getPage: vi.fn() },
      settings: { simpletex_ocr_enabled: false, simpletex_ocr_token: "token" },
      textCharLimit: 120000,
      recognizeLatexImage,
    });

    expect(recognizeLatexImage).not.toHaveBeenCalled();
    expect(renderPdfRegionImage).not.toHaveBeenCalled();
    expect(source.content).toContain("[formula OCR disabled]");
    expect(source.content).toContain("L = \\sum _ { i = 1 } ^ n");
  });

  it("replaces detected formula blocks with OCR LaTeX when enabled", async () => {
    const recognizeLatexImage = vi.fn(async () => ({ latex: "\\sum_{i=1}^{n} x_i" }));
    const source = await buildPdfExtractorSummarySource({
      documentId: "doc-1",
      pageItems: {
        0: [
          item("Method text.", 0.1, 0.1, 0.3),
          item("L = \\sum _ { i = 1 } ^ n", 0.24, 0.15, 0.32),
        ],
      },
      pdfDocument: { numPages: 1, getPage: vi.fn() },
      settings: { simpletex_ocr_enabled: true, simpletex_ocr_token: "token" },
      textCharLimit: 120000,
      recognizeLatexImage,
    });

    expect(recognizeLatexImage).toHaveBeenCalledTimes(1);
    expect(source.content).toContain("$$\n\\sum_{i=1}^{n} x_i\n$$");
  });

  it("caches formula OCR by document, page, rect, and text", async () => {
    const recognizeLatexImage = vi.fn(async () => ({ latex: "a+b" }));
    const options = {
      documentId: "doc-1",
      pageItems: { 0: [item("a + b = c", 0.24, 0.15, 0.18)] },
      pdfDocument: { numPages: 1, getPage: vi.fn() },
      settings: { simpletex_ocr_enabled: true, simpletex_ocr_token: "token" },
      textCharLimit: 120000,
      recognizeLatexImage,
    };

    await buildPdfExtractorSummarySource(options);
    await buildPdfExtractorSummarySource(options);

    expect(recognizeLatexImage).toHaveBeenCalledTimes(1);
  });

  it("keeps readable fallback text when OCR fails", async () => {
    const source = await buildPdfExtractorSummarySource({
      documentId: "doc-1",
      pageItems: { 0: [item("a + b = c", 0.24, 0.15, 0.18)] },
      pdfDocument: { numPages: 1, getPage: vi.fn() },
      settings: { simpletex_ocr_enabled: true, simpletex_ocr_token: "token" },
      textCharLimit: 120000,
      recognizeLatexImage: vi.fn(async () => {
        throw new Error("OCR failed");
      }),
    });

    expect(source.content).toContain("[formula OCR unavailable]");
    expect(source.content).toContain("a + b = c");
  });
});
