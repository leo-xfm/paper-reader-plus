import * as pdfjsLib from "pdfjs-dist";
import type { PdfDocumentProxyLike, PdfFigureTarget, PdfPreviewTextItem, PdfReferenceCandidate, PdfReferenceTarget, PdfTableSheet, PdfTextItem } from "@/pdf/pdfTypes";
import type { RectPct } from "@/types";

const REFERENCE_PATTERN = /\b(Fig(?:ure)?\.?|Table)\s+([0-9]+[A-Za-z]?)\b/gi;
const CAPTION_PATTERN = /^\s*(Fig(?:ure)?\.?)\s+([0-9]+[A-Za-z]?)\b/i;

type PdfTextContent = {
  styles?: Record<string, { fontFamily?: string; ascent?: number }>;
  items?: Array<{
    str?: string;
    width?: number;
    height?: number;
    fontName?: string;
    transform: number[];
  }>;
};

type LineItem = PdfTextItem & { start: number; end: number };

type TextLine = {
  text: string;
  items: LineItem[];
  top: number;
  bottom: number;
};

let measureContext: CanvasRenderingContext2D | null = null;

function measureTextWidth(text: string, fontFamily: string, fontSize: number) {
  if (typeof document === "undefined") return 0;
  if (!measureContext) {
    measureContext = document.createElement("canvas").getContext("2d");
  }
  if (!measureContext) return 0;
  measureContext.font = `${fontSize}px ${fontFamily}`;
  return measureContext.measureText(text).width;
}

function normalizeKind(value: string): "figure" | "table" {
  return value.toLowerCase().startsWith("tab") ? "table" : "figure";
}

function normalizeLabel(kind: "figure" | "table", number: string) {
  return `${kind === "figure" ? "Figure" : "Table"} ${number}`;
}

function rectBounds(rects: RectPct[]): RectPct {
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
  return { left, top, width: right - left, height: bottom - top };
}

function mergeRects(rects: RectPct[]) {
  return rects.length ? [rectBounds(rects)] : [];
}

function groupTextLines(items: PdfTextItem[]) {
  const sorted = items
    .filter((item) => item.text.trim())
    .slice()
    .sort((left, right) => left.top - right.top || left.left - right.left);
  const lines: PdfTextItem[][] = [];
  for (const item of sorted) {
    const current = lines.at(-1);
    const tolerance = Math.max(3, item.height * 0.55);
    if (!current || Math.abs(current[0].top - item.top) > tolerance) {
      lines.push([item]);
    } else {
      current.push(item);
    }
  }
  return lines.map((lineItems): TextLine => {
    const byLeft = lineItems.slice().sort((left, right) => left.left - right.left);
    let cursor = 0;
    const mapped: LineItem[] = [];
    const parts: string[] = [];
    for (const item of byLeft) {
      const gap = parts.length ? " " : "";
      if (gap) cursor += 1;
      parts.push(item.text);
      mapped.push({ ...item, start: cursor, end: cursor + item.text.length });
      cursor += item.text.length;
    }
    return {
      text: parts.join(" "),
      items: mapped,
      top: Math.min(...byLeft.map((item) => item.top)),
      bottom: Math.max(...byLeft.map((item) => item.top + item.height)),
    };
  });
}

function rectForLineMatch(line: TextLine, start: number, end: number) {
  const matchedRects: RectPct[] = [];
  for (const item of line.items) {
    if (item.end < start || item.start > end) continue;
    const overlapStart = Math.max(start, item.start);
    const overlapEnd = Math.min(end, item.end);
    if (overlapEnd <= overlapStart) continue;
    const textLength = Math.max(1, item.end - item.start);
    const leftRatio = (overlapStart - item.start) / textLength;
    const rightRatio = (overlapEnd - item.start) / textLength;
    matchedRects.push({
      left: item.rectPct.left + item.rectPct.width * leftRatio,
      top: item.rectPct.top,
      width: item.rectPct.width * Math.max(0.08, rightRatio - leftRatio),
      height: item.rectPct.height,
    });
  }
  return mergeRects(matchedRects);
}

export function findPdfReferenceCandidates(pageIndex: number, items: PdfTextItem[]): PdfReferenceCandidate[] {
  const candidates: PdfReferenceCandidate[] = [];
  for (const line of groupTextLines(items)) {
    for (const match of line.text.matchAll(REFERENCE_PATTERN)) {
      const kind = normalizeKind(match[1]);
      const number = match[2];
      const rects_pct = rectForLineMatch(line, match.index || 0, (match.index || 0) + match[0].length);
      if (!rects_pct.length) continue;
      candidates.push({
        reference_id: `${pageIndex}:${kind}:${number}:${match.index || 0}`,
        kind,
        number,
        label: normalizeLabel(kind, number),
        page_index: pageIndex,
        rects_pct,
      });
    }
  }
  return candidates;
}

function isCaptionLine(line: TextLine, reference: Pick<PdfReferenceCandidate, "kind" | "number">) {
  const escaped = reference.number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = reference.kind === "figure" ? String.raw`(?:fig(?:ure)?\.?)` : "table";
  return new RegExp(String.raw`^\s*${prefix}\s+${escaped}\b`, "i").test(line.text);
}

function figureCaptionMatch(line: TextLine) {
  const match = line.text.match(CAPTION_PATTERN);
  if (!match) return null;
  return {
    kind: "figure" as const,
    number: match[2],
    label: normalizeLabel("figure", match[2]),
  };
}

function captionTextFrom(lines: TextLine[], index: number) {
  const parts = [lines[index].text.trim()];
  for (let offset = 1; offset <= 2; offset += 1) {
    const next = lines[index + offset];
    if (!next) break;
    if (/^\s*(?:fig(?:ure)?\.?|table)\s+\d+/i.test(next.text)) break;
    if (next.text.length < 18) break;
    parts.push(next.text.trim());
  }
  return parts.join(" ");
}

function textItemsToRows(items: PdfTextItem[]) {
  return groupTextLines(items)
    .map((line) => ({
      top: line.top,
      bottom: line.bottom,
      cells: line.items
        .slice()
        .sort((left, right) => left.left - right.left)
        .map((item) => ({ text: item.text, left: item.left, width: item.width })),
    }));
}

function rowText(row: ReturnType<typeof textItemsToRows>[number]) {
  return row.cells.map((cell) => cell.text).join(" ").trim();
}

function isLikelyTableRow(row: ReturnType<typeof textItemsToRows>[number]) {
  const text = rowText(row);
  if (!text || /^table\s+\d+/i.test(text)) return false;
  if (row.cells.length >= 3) return true;
  const numericCells = row.cells.filter((cell) => /(?:\d+(?:\.\d+)?%?|\bpass@\d\b)/i.test(cell.text)).length;
  if (numericCells >= 2) return true;
  return row.cells.length >= 2 && /\b(?:llm|pass@\d|agent|search|ours|based)\b/i.test(text);
}

export function selectLikelyTableRowsForTest(rows: ReturnType<typeof textItemsToRows>) {
  const tableRows: typeof rows = [];
  let started = false;
  let sparseAfterStart = 0;
  for (const row of rows) {
    const likely = isLikelyTableRow(row);
    if (!started) {
      if (!likely) continue;
      started = true;
    }
    if (!likely) {
      sparseAfterStart += 1;
      if (sparseAfterStart >= 2) break;
      continue;
    }
    sparseAfterStart = 0;
    tableRows.push(row);
  }
  return tableRows.length ? tableRows : rows.filter((row) => row.cells.length);
}

export function estimateReferencePreviewRect(reference: Pick<PdfReferenceCandidate, "kind">, captionRect: RectPct): RectPct {
  const horizontalPadding = 0.06;
  const left = Math.max(0, captionRect.left - horizontalPadding);
  const width = Math.min(1 - left, Math.max(captionRect.width + horizontalPadding * 2, 0.72));
  if (reference.kind === "table") {
    const top = Math.max(0, captionRect.top - 0.03);
    return { left, top, width, height: Math.min(1 - top, 0.44) };
  }
  const bottom = Math.min(1, captionRect.top + captionRect.height + 0.06);
  const top = Math.max(0, bottom - 0.48);
  return { left, top, width, height: Math.min(1 - top, bottom - top) };
}

async function extractPageItems(pdfDocument: PdfDocumentProxyLike, pageNumber: number): Promise<PdfTextItem[]> {
  const page = await pdfDocument.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent() as PdfTextContent;
  const styles = content.styles || {};
  return (content.items || []).map((item) => {
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]) || Number(item.height || 0) || 10;
    const style = styles[item.fontName || ""] || {};
    const fontName = String(style.fontFamily || "serif");
    const width = Math.max(1, Number(item.width || 0) * viewport.scale);
    const measuredWidth = measureTextWidth(String(item.str || ""), fontName, fontHeight);
    const ascent = Number(style.ascent || 0.86);
    const top = tx[5] - fontHeight * Math.min(1, Math.max(0.5, ascent));
    return {
      text: String(item.str || ""),
      left: tx[4],
      top,
      width,
      height: Math.max(1, fontHeight),
      fontName,
      fontSize: fontHeight,
      hScale: measuredWidth > 0 ? width / measuredWidth : 1,
      rectPct: {
        left: tx[4] / Math.max(1, viewport.width),
        top: top / Math.max(1, viewport.height),
        width: width / Math.max(1, viewport.width),
        height: Math.max(1, fontHeight) / Math.max(1, viewport.height),
      },
    };
  }).filter((item: PdfTextItem) => item.text.trim());
}

function itemInsideRect(item: PdfTextItem, rect: RectPct) {
  const centerX = item.rectPct.left + item.rectPct.width / 2;
  const centerY = item.rectPct.top + item.rectPct.height / 2;
  return centerX >= rect.left && centerX <= rect.left + rect.width && centerY >= rect.top && centerY <= rect.top + rect.height;
}

function inferColumnBreaks(rows: ReturnType<typeof textItemsToRows>) {
  const lefts = rows.flatMap((row) => row.cells.map((cell) => cell.left)).sort((left, right) => left - right);
  if (!lefts.length) return [];
  const clusters: number[][] = [];
  for (const left of lefts) {
    const cluster = clusters.at(-1);
    if (!cluster || Math.abs(cluster.reduce((sum, value) => sum + value, 0) / cluster.length - left) > 28) {
      clusters.push([left]);
    } else {
      cluster.push(left);
    }
  }
  return clusters.map((cluster) => cluster.reduce((sum, value) => sum + value, 0) / cluster.length).slice(0, 16);
}

function rowToCells(row: ReturnType<typeof textItemsToRows>[number], columns: number[]) {
  if (!columns.length) return [row.cells.map((cell) => cell.text).join(" ").trim()];
  const cells = Array.from({ length: columns.length }, () => "");
  for (const cell of row.cells) {
    let columnIndex = 0;
    for (let index = 0; index < columns.length; index += 1) {
      if (Math.abs(cell.left - columns[index]) < Math.abs(cell.left - columns[columnIndex])) columnIndex = index;
    }
    cells[columnIndex] = `${cells[columnIndex]} ${cell.text}`.trim();
  }
  return cells;
}

export async function extractPdfTextInRect(pdfDocument: PdfDocumentProxyLike, pageIndex: number, rect: RectPct): Promise<string> {
  const items = (await extractPageItems(pdfDocument, pageIndex + 1)).filter((item) => itemInsideRect(item, rect));
  return groupTextLines(items)
    .map((line) => line.text.trim())
    .filter(Boolean)
    .join("\n");
}

export async function extractPdfPreviewTextItems(pdfDocument: PdfDocumentProxyLike, pageIndex: number, rect: RectPct): Promise<PdfPreviewTextItem[]> {
  return (await extractPageItems(pdfDocument, pageIndex + 1))
    .filter((item) => itemInsideRect(item, rect))
    .map((item) => ({
      text: item.text,
      fontName: item.fontName,
      hScale: item.hScale,
      rectPct: {
        left: (item.rectPct.left - rect.left) / Math.max(0.0001, rect.width),
        top: (item.rectPct.top - rect.top) / Math.max(0.0001, rect.height),
        width: item.rectPct.width / Math.max(0.0001, rect.width),
        height: item.rectPct.height / Math.max(0.0001, rect.height),
      },
    }));
}

export async function extractTableSheet(pdfDocument: PdfDocumentProxyLike, target: PdfReferenceTarget): Promise<PdfTableSheet> {
  const page = await pdfDocument.getPage(target.page_index + 1);
  const viewport = page.getViewport({ scale: 1 });
  const items = await extractPageItems(pdfDocument, target.page_index + 1);
  const captionBottom = target.caption_rect_pct.top + target.caption_rect_pct.height;
  const tableItems = items.filter((item) => itemInsideRect(item, target.preview_rect_pct) && item.rectPct.top > captionBottom + 0.002);
  const rows = selectLikelyTableRowsForTest(textItemsToRows(tableItems));
  const columns = inferColumnBreaks(rows);
  const grid = rows.map((row) => rowToCells(row, columns)).filter((row) => row.some(Boolean));
  const firstRow = grid[0] || [];
  const hasHeader = firstRow.length > 1 && firstRow.some((cell) => /[A-Za-z]/.test(cell));
  const headers = hasHeader ? firstRow : firstRow.map((_, index) => `Column ${index + 1}`);
  const body = hasHeader ? grid.slice(1) : grid;
  return {
    table_id: `${target.page_index}:${target.label}`,
    title: target.label,
    caption: target.caption,
    page_index: target.page_index,
    columns: headers.length ? headers : ["Column 1"],
    rows: body.map((row) => headers.map((_, index) => row[index] || "")),
  };
}

export async function findPdfReferenceTarget(pdfDocument: PdfDocumentProxyLike, reference: PdfReferenceCandidate): Promise<PdfReferenceTarget | null> {
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const lines = groupTextLines(await extractPageItems(pdfDocument, pageNumber));
    const captionIndex = lines.findIndex((line) => isCaptionLine(line, reference));
    if (captionIndex === -1) continue;
    const captionRect = rectBounds(lines[captionIndex].items.map((item) => item.rectPct));
    return {
      kind: reference.kind,
      number: reference.number,
      label: reference.label,
      page_index: pageNumber - 1,
      caption: captionTextFrom(lines, captionIndex),
      caption_rect_pct: captionRect,
      preview_rect_pct: estimateReferencePreviewRect(reference, captionRect),
    };
  }
  return null;
}

export async function findPdfFigureTargets(pdfDocument: PdfDocumentProxyLike, limit = 20): Promise<PdfFigureTarget[]> {
  const targets: PdfFigureTarget[] = [];
  const seen = new Set<string>();
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const lines = groupTextLines(await extractPageItems(pdfDocument, pageNumber));
    for (let index = 0; index < lines.length; index += 1) {
      const match = figureCaptionMatch(lines[index]);
      if (!match) continue;
      const key = `${match.label.toLowerCase()}:${pageNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const captionRect = rectBounds(lines[index].items.map((item) => item.rectPct));
      const previewRect = estimateReferencePreviewRect(match, captionRect);
      if (previewRect.width <= 0 || previewRect.height <= 0) continue;
      targets.push({
        figure_id: `${pageNumber - 1}:${match.label}`,
        label: match.label,
        page_index: pageNumber - 1,
        caption: captionTextFrom(lines, index),
        caption_rect_pct: captionRect,
        preview_rect_pct: previewRect,
      });
      if (targets.length >= limit) return targets;
    }
  }
  return targets;
}
