import type { PdfParagraphActionBlock, PdfTextItem } from "@/pdf/pdfTypes";
import type { RectPct } from "@/types";

type TextLine = {
  page_index: number;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  rects_pct: RectPct[];
};

type TextBlockKind = "paragraph" | "heading" | "formula" | "figure" | "table";

type TextBlock = {
  block_id: string;
  page_index: number;
  kind: TextBlockKind;
  text: string;
  top: number;
  height: number;
  rects_pct: RectPct[];
};

type BuildOptions = {
  lineTopTolerance?: number;
  paragraphGapMultiplier?: number;
  minTextLength?: number;
};

const DEFAULT_OPTIONS: Required<BuildOptions> = {
  lineTopTolerance: 0.006,
  paragraphGapMultiplier: 1.65,
  minTextLength: 2,
};

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

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function itemSort(left: PdfTextItem, right: PdfTextItem) {
  if (Math.abs(left.rectPct.top - right.rectPct.top) > 0.004) return left.rectPct.top - right.rectPct.top;
  return left.rectPct.left - right.rectPct.left;
}

function buildLines(pageIndex: number, items: PdfTextItem[], options: Required<BuildOptions>): TextLine[] {
  const sorted = [...items]
    .filter((item) => normalizeText(item.text).length >= options.minTextLength)
    .sort(itemSort);
  const groups: PdfTextItem[][] = [];
  for (const item of sorted) {
    const last = groups.at(-1);
    const lastTop = last ? last.reduce((sum, entry) => sum + entry.rectPct.top, 0) / last.length : 0;
    if (!last || Math.abs(item.rectPct.top - lastTop) > options.lineTopTolerance) {
      groups.push([item]);
    } else {
      last.push(item);
    }
  }
  return groups.map((group) => {
    const ordered = [...group].sort((left, right) => left.rectPct.left - right.rectPct.left);
    const rect = mergeRects(ordered.map((item) => item.rectPct));
    return {
      page_index: pageIndex,
      text: normalizeText(ordered.map((item) => item.text).join(" ")),
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      fontSize: Math.max(...ordered.map((item) => item.fontSize || 0)),
      rects_pct: ordered.map((item) => clampRect(item.rectPct)),
    };
  }).filter((line) => line.text);
}

function isParagraphActionContinuation(current: TextLine[], next: TextLine, medianHeight: number, options: Required<BuildOptions>) {
  const previous = current.at(-1);
  if (!previous) return true;
  const verticalGap = next.top - (previous.top + previous.height);
  if (verticalGap < 0) return true;
  if (verticalGap > medianHeight * Math.min(options.paragraphGapMultiplier, 1.25)) return false;
  if (isCaptionLine(previous.text) || isCaptionLine(next.text)) return false;

  const first = current[0];
  const nextIndentedFromBody = next.left - Math.min(first.left, previous.left) > 0.026;
  const previousShortLine = previous.width < Math.max(first.width, next.width) * 0.74;
  const previousEndsSentence = /[.!?;:)\]\u3002\uff01\uff1f\uff1b\uff1a]$/.test(previous.text.trim());
  if (nextIndentedFromBody && (current.length > 1 || previousShortLine || previousEndsSentence)) return false;
  return true;
}

function median(values: number[]) {
  if (!values.length) return 0.015;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] || 0.015;
}

function isCaptionLine(text: string) {
  return /^(fig\.?|figure|table)\s+\d+/i.test(text.trim());
}

function detectKind(text: string, lines: TextLine[]): TextBlockKind {
  const trimmed = text.trim();
  if (/^table\s+\d+/i.test(trimmed)) return "table";
  if (/^(fig\.?|figure)\s+\d+/i.test(trimmed)) return "figure";
  const words = trimmed.split(/\s+/).filter(Boolean);
  const mathChars = (trimmed.match(/[=+\-*/\u2211\u2212\u00d7\u00f7\u2264\u2265\u221e\u2202\u221a\u03b1-\u03c9^_{}]/g) || []).length;
  if (words.length <= 18 && mathChars >= 3) return "formula";
  const averageFont = lines.reduce((sum, line) => sum + line.fontSize, 0) / Math.max(1, lines.length);
  const titleLike = words.length <= 14 && averageFont >= 12 && !/[.!?\u3002\uff01\uff1f]$/.test(trimmed);
  if (titleLike) return "heading";
  return "paragraph";
}

function createBlock(pageIndex: number, blockIndex: number, lines: TextLine[]): TextBlock {
  const rects = lines.map((line) => mergeRects(line.rects_pct));
  const box = mergeRects(rects);
  const text = normalizeText(lines.map((line) => line.text).join(" "));
  return {
    block_id: `${pageIndex}:${blockIndex}`,
    page_index: pageIndex,
    kind: detectKind(text, lines),
    text,
    top: box.top,
    height: box.height,
    rects_pct: rects,
  };
}

export function buildPdfParagraphActionBlocks(pageIndex: number, items: PdfTextItem[], options: BuildOptions = {}): PdfParagraphActionBlock[] {
  const resolved = { ...DEFAULT_OPTIONS, paragraphGapMultiplier: 1.25, ...options };
  const lines = buildLines(pageIndex, items, resolved);
  const medianHeight = median(lines.map((line) => line.height).filter((height) => height > 0));
  const blocks: TextBlock[] = [];
  let current: TextLine[] = [];
  let blockIndex = 0;
  for (const line of lines) {
    if (!current.length || isParagraphActionContinuation(current, line, medianHeight, resolved)) {
      current.push(line);
    } else {
      blocks.push(createBlock(pageIndex, blockIndex, current));
      blockIndex += 1;
      current = [line];
    }
  }
  if (current.length) blocks.push(createBlock(pageIndex, blockIndex, current));

  return blocks.filter((block) => block.kind === "paragraph" || block.kind === "heading")
    .map((block) => ({
      block_id: block.block_id,
      page_index: block.page_index,
      text: block.text,
      top: block.top,
      height: block.height,
      rects_pct: block.rects_pct,
    }));
}
