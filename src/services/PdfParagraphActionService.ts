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
  columnIndex: number;
  rects_pct: RectPct[];
};

export type TextBlockKind = "paragraph" | "heading" | "formula" | "figure" | "table";

export type PdfTextBlock = {
  block_id: string;
  page_index: number;
  kind: TextBlockKind;
  text: string;
  top: number;
  height: number;
  rects_pct: RectPct[];
};

export type PdfTextBlockBuildOptions = {
  lineTopTolerance?: number;
  columnGapThreshold?: number;
  minColumnLineCount?: number;
  fullWidthLineThreshold?: number;
  paragraphGapMultiplier?: number;
  minTextLength?: number;
};

const DEFAULT_OPTIONS: Required<PdfTextBlockBuildOptions> = {
  lineTopTolerance: 0.012,
  columnGapThreshold: 0.14,
  minColumnLineCount: 2,
  fullWidthLineThreshold: 0.72,
  paragraphGapMultiplier: 2.0,
  minTextLength: 1,
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

function rightOf(line: Pick<TextLine, "left" | "width">) {
  return line.left + line.width;
}

function lineCenter(line: Pick<TextLine, "left" | "width">) {
  return line.left + line.width / 2;
}

function createLine(pageIndex: number, group: PdfTextItem[]): TextLine | null {
  const ordered = [...group].sort((left, right) => left.rectPct.left - right.rectPct.left);
  const rect = mergeRects(ordered.map((item) => item.rectPct));
  const text = normalizeText(ordered.map((item) => item.text).join(" "));
  if (!text) return null;
  return {
    page_index: pageIndex,
    text,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    fontSize: Math.max(...ordered.map((item) => item.fontSize || 0)),
    columnIndex: 0,
    rects_pct: ordered.map((item) => clampRect(item.rectPct)),
  };
}

function splitLineGroup(group: PdfTextItem[], options: Required<PdfTextBlockBuildOptions>) {
  const ordered = [...group].sort((left, right) => left.rectPct.left - right.rectPct.left);
  const segments: PdfTextItem[][] = [];
  let current: PdfTextItem[] = [];
  let currentRight = 0;
  for (const item of ordered) {
    const itemRight = item.rectPct.left + item.rectPct.width;
    const gap = item.rectPct.left - currentRight;
    if (current.length && gap > options.columnGapThreshold) {
      segments.push(current);
      current = [item];
      currentRight = itemRight;
    } else {
      current.push(item);
      currentRight = Math.max(currentRight, itemRight);
    }
  }
  if (current.length) segments.push(current);
  return segments;
}

function quantile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function isPotentialFullWidthLine(line: TextLine, options: Required<PdfTextBlockBuildOptions>) {
  return line.width >= options.fullWidthLineThreshold || (line.left < 0.42 && rightOf(line) > 0.58);
}

function sortColumnRegion(lines: TextLine[]) {
  return [...lines].sort((left, right) => left.columnIndex - right.columnIndex || left.top - right.top || left.left - right.left);
}

function sortTwoColumnLines(lines: TextLine[]) {
  const fullWidthLines = lines.filter((line) => line.columnIndex < 0).sort((left, right) => left.top - right.top || left.left - right.left);
  const columnLines = lines.filter((line) => line.columnIndex >= 0);
  if (!fullWidthLines.length) return sortColumnRegion(columnLines);

  const sorted: TextLine[] = [];
  const consumed = new Set<TextLine>();
  for (const fullWidthLine of fullWidthLines) {
    const before = columnLines.filter((line) => !consumed.has(line) && line.top < fullWidthLine.top);
    sorted.push(...sortColumnRegion(before));
    before.forEach((line) => consumed.add(line));
    sorted.push(fullWidthLine);
  }
  sorted.push(...sortColumnRegion(columnLines.filter((line) => !consumed.has(line))));
  return sorted;
}

function assignReadingColumns(lines: TextLine[], options: Required<PdfTextBlockBuildOptions>) {
  const columnCandidates = lines.filter((line) => !isPotentialFullWidthLine(line, options));
  const leftCandidates = columnCandidates.filter((line) => lineCenter(line) < 0.5);
  const rightCandidates = columnCandidates.filter((line) => lineCenter(line) >= 0.5);
  const hasColumnCounts = leftCandidates.length >= options.minColumnLineCount && rightCandidates.length >= options.minColumnLineCount;
  if (!hasColumnCounts) {
    return [...lines].sort((left, right) => left.top - right.top || left.left - right.left)
      .map((line) => ({ ...line, columnIndex: 0 }));
  }

  const leftColumnRight = quantile(leftCandidates.map(rightOf), 0.75);
  const rightColumnLeft = quantile(rightCandidates.map((line) => line.left), 0.25);
  const columnGap = rightColumnLeft - leftColumnRight;
  if (columnGap < options.columnGapThreshold) {
    return [...lines].sort((left, right) => left.top - right.top || left.left - right.left)
      .map((line) => ({ ...line, columnIndex: 0 }));
  }

  const splitX = (leftColumnRight + rightColumnLeft) / 2;
  const assigned = lines.map((line) => {
    const spansColumnGutter = line.left < splitX - options.columnGapThreshold / 2 && rightOf(line) > splitX + options.columnGapThreshold / 2;
    const columnIndex = isPotentialFullWidthLine(line, options) || spansColumnGutter ? -1 : lineCenter(line) < splitX ? 0 : 1;
    return { ...line, columnIndex };
  });
  return sortTwoColumnLines(assigned);
}

function buildLines(pageIndex: number, items: PdfTextItem[], options: Required<PdfTextBlockBuildOptions>): TextLine[] {
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
  const lines = groups
    .flatMap((group) => splitLineGroup(group, options))
    .map((group) => createLine(pageIndex, group))
    .filter((line): line is TextLine => Boolean(line));
  return assignReadingColumns(lines, options);
}

function formulaSignal(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 6 && /[.!?\u3002\uff01\uff1f]$/.test(trimmed)) return 0;
  const mathChars = (trimmed.match(/[=+\-*/\u2211\u2212\u00d7\u00f7\u2264\u2265\u221e\u2202\u2207\u221a\u03b1-\u03c9\u0391-\u03a9^_{}\\]/g) || []).length;
  const hasMathOperator = /[=<>+\-*/^_]|\b(?:arg\s*min|arg\s*max|min|max|sum|prod|log|exp)\b|\\(?:sum|prod|int|frac|sqrt|alpha|beta|gamma|lambda|theta|sigma|mu|partial|nabla)/i.test(trimmed);
  if (mathChars >= 4 && mathChars / Math.max(1, trimmed.length) > 0.1) return 2;
  if (words.length <= 14 && mathChars >= 2 && hasMathOperator) return 1;
  return 0;
}

function isLikelyFormulaLine(line: TextLine) {
  return formulaSignal(line.text) > 0 && line.text.split(/\s+/).filter(Boolean).length <= 16;
}

function isParagraphActionContinuation(current: TextLine[], next: TextLine, medianHeight: number, options: Required<PdfTextBlockBuildOptions>) {
  const previous = current.at(-1);
  if (!previous) return true;
  if (previous.columnIndex !== next.columnIndex) return false;
  const previousFormula = isLikelyFormulaLine(previous);
  const nextFormula = isLikelyFormulaLine(next);
  if (previousFormula !== nextFormula) return false;
  const verticalGap = next.top - (previous.top + previous.height);
  if (verticalGap < 0) return true;
  if (verticalGap > medianHeight * options.paragraphGapMultiplier) return false;
  if (isCaptionLine(previous.text) || isCaptionLine(next.text)) return false;

  const first = current[0];
  const bodyLeft = Math.min(...current.map((line) => line.left));
  const bodyWidth = median(current.map((line) => line.width).filter((width) => width > 0));
  const nextIndentedFromBody = next.left - Math.min(bodyLeft, previous.left) > 0.026;
  const nextStartsAtBody = Math.abs(next.left - bodyLeft) <= 0.018;
  const previousShortLine = previous.width < Math.max(bodyWidth, first.width, next.width) * 0.74;
  const previousEndsSentence = /[.!?;:)\]\u3002\uff01\uff1f\uff1b\uff1a]$/.test(previous.text.trim());
  if (nextIndentedFromBody && (current.length > 1 || previousShortLine || previousEndsSentence)) return false;
  if (previousEndsSentence && previousShortLine && current.length > 1 && nextStartsAtBody) return false;
  if (startsLikelySectionHeading(next.text)) return false;
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

function startsLikelySectionHeading(text: string) {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length <= 10 && /^\d+(?:\.\d+)*\.?\s+[A-Z][\w-]*/.test(trimmed) && !/[.!?\u3002\uff01\uff1f]$/.test(trimmed);
}

function detectKind(text: string, lines: TextLine[]): TextBlockKind {
  const trimmed = text.trim();
  if (/^table\s+\d+/i.test(trimmed)) return "table";
  if (/^(fig\.?|figure)\s+\d+/i.test(trimmed)) return "figure";
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 18 && formulaSignal(trimmed) > 0) return "formula";
  const averageFont = lines.reduce((sum, line) => sum + line.fontSize, 0) / Math.max(1, lines.length);
  const titleLike = words.length <= 14 && averageFont >= 12 && !/[.!?\u3002\uff01\uff1f]$/.test(trimmed);
  if (titleLike) return "heading";
  return "paragraph";
}

function createBlock(pageIndex: number, blockIndex: number, lines: TextLine[]): PdfTextBlock {
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

export function buildPdfTextBlocks(pageIndex: number, items: PdfTextItem[], options: PdfTextBlockBuildOptions = {}): PdfTextBlock[] {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const lines = buildLines(pageIndex, items, resolved);
  const medianHeight = median(lines.map((line) => line.height).filter((height) => height > 0));
  const blocks: PdfTextBlock[] = [];
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

  return blocks.filter((block) => block.text.trim());
}

export function buildPdfParagraphActionBlocks(pageIndex: number, items: PdfTextItem[], options: PdfTextBlockBuildOptions = {}): PdfParagraphActionBlock[] {
  return buildPdfTextBlocks(pageIndex, items, options)
    .map((block) => ({
      block_id: block.block_id,
      page_index: block.page_index,
      text: block.text,
      top: block.top,
      height: block.height,
      rects_pct: block.rects_pct,
    }));
}
