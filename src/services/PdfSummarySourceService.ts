import { renderPdfRegionImage } from "@/pdf/pdfImageRendering";
import type { PdfDocumentProxyLike, PdfTextItem } from "@/pdf/pdfTypes";
import { buildPdfTextBlocks, type PdfTextBlock } from "@/services/PdfParagraphActionService";
import type { RectPct, Settings, SummarySourceMode } from "@/types";

export type PdfSummarySource = {
  mode: SummarySourceMode;
  label: string;
  content: string;
};

export type PdfFormulaOcrRecognizer = (dataUrl: string) => Promise<{ latex: string }>;

export type BuildPdfSummarySourceOptions = {
  documentId: string;
  pageItems: Record<number, PdfTextItem[]>;
  pdfDocument: PdfDocumentProxyLike | null;
  settings: Pick<Settings, "simpletex_ocr_enabled" | "simpletex_ocr_token">;
  textCharLimit: number;
  recognizeLatexImage?: PdfFormulaOcrRecognizer;
};

const formulaOcrCache = new Map<string, string>();

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function clampRect(rect: RectPct): RectPct {
  const left = Math.min(1, Math.max(0, rect.left));
  const top = Math.min(1, Math.max(0, rect.top));
  return {
    left,
    top,
    width: Math.min(1 - left, Math.max(0, rect.width)),
    height: Math.min(1 - top, Math.max(0, rect.height)),
  };
}

function mergeRects(rects: RectPct[]): RectPct {
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
  return clampRect({ left, top, width: right - left, height: bottom - top });
}

function padRect(rect: RectPct, padding = 0.012): RectPct {
  return clampRect({
    left: rect.left - padding,
    top: rect.top - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  });
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function rectKey(rect: RectPct) {
  return [rect.left, rect.top, rect.width, rect.height]
    .map((value) => Math.round(value * 10000))
    .join(",");
}

function cacheKey(documentId: string, block: PdfTextBlock) {
  const rect = mergeRects(block.rects_pct);
  return `${documentId}:${block.page_index}:${rectKey(rect)}:${hashText(block.text)}`;
}

function canRunFormulaOcr(options: BuildPdfSummarySourceOptions) {
  return Boolean(
    options.settings.simpletex_ocr_enabled
      && options.settings.simpletex_ocr_token.trim()
      && options.pdfDocument
      && options.recognizeLatexImage,
  );
}

async function recognizeFormulaBlock(block: PdfTextBlock, options: BuildPdfSummarySourceOptions) {
  if (!canRunFormulaOcr(options)) return "";
  const key = cacheKey(options.documentId, block);
  if (formulaOcrCache.has(key)) return formulaOcrCache.get(key) || "";
  try {
    const rect = padRect(mergeRects(block.rects_pct));
    const dataUrl = await renderPdfRegionImage(options.pdfDocument as PdfDocumentProxyLike, block.page_index, rect, {
      targetWidth: 1000,
      minScale: 1.8,
      maxScale: 3.2,
    });
    if (!dataUrl) return "";
    const result = await options.recognizeLatexImage?.(dataUrl);
    const latex = result?.latex?.trim() || "";
    if (latex) formulaOcrCache.set(key, latex);
    return latex;
  } catch {
    return "";
  }
}

function fallbackFormulaText(block: PdfTextBlock, ocrEnabled: boolean) {
  const text = normalizeText(block.text);
  const reason = ocrEnabled ? "formula OCR unavailable" : "formula OCR disabled";
  return text ? `[${reason}]\n${text}` : `[${reason}]`;
}

async function renderBlock(block: PdfTextBlock, options: BuildPdfSummarySourceOptions) {
  if (block.kind !== "formula") return normalizeText(block.text);
  const latex = await recognizeFormulaBlock(block, options);
  if (latex) return `$$\n${latex}\n$$`;
  return fallbackFormulaText(block, Boolean(options.settings.simpletex_ocr_enabled));
}

export async function buildPdfExtractorSummarySource(options: BuildPdfSummarySourceOptions): Promise<PdfSummarySource> {
  const chunks: string[] = [];
  const sortedPages = Object.entries(options.pageItems)
    .sort(([left], [right]) => Number(left) - Number(right));
  for (const [pageIndexText, items] of sortedPages) {
    const pageIndex = Number(pageIndexText);
    const blocks = buildPdfTextBlocks(pageIndex, items);
    const renderedBlocks = (await Promise.all(blocks.map((block) => renderBlock(block, options))))
      .map((text) => text.trim())
      .filter(Boolean);
    if (renderedBlocks.length) {
      chunks.push(`Page ${pageIndex + 1}\n${renderedBlocks.join("\n\n")}`);
    }
  }
  const content = chunks.join("\n\n");
  const limited = options.textCharLimit > 0 ? content.slice(0, options.textCharLimit) : content;
  return {
    mode: "pdf-extractor",
    label: "PDF text extracted from the whole document",
    content: limited || "(no PDF text could be extracted; choose another summary source)",
  };
}

export function clearPdfFormulaOcrCache() {
  formulaOcrCache.clear();
}
