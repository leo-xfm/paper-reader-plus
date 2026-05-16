import type { Anchor, AnchorCreateRequest, RectPct, TextQuote } from "@/types";

export type ReaderAnchorTarget = {
  documentId: string;
  anchorId: string;
};

export type ReaderSelection = {
  pageIndex: number;
  text: string;
  rectsPct: RectPct[];
  font?: { font_name: string; font_size: number };
};

export function buildReaderAnchorHref(anchor: Pick<Anchor, "document_id" | "anchor_id">, pageNumber?: number) {
  const params = new URLSearchParams({
    documentId: anchor.document_id,
    anchor: anchor.anchor_id,
  });
  if (pageNumber) params.set("page", String(pageNumber));
  return `/reader?${params.toString()}`;
}

export function parseReaderAnchorHref(href: string): ReaderAnchorTarget | null {
  try {
    const internalOrigin = "http://paper-reader-plus.local";
    const locationOrigin = globalThis.location?.origin || "";
    const base = href.startsWith("/") || locationOrigin === "null" || locationOrigin.startsWith("file:")
      ? internalOrigin
      : locationOrigin || internalOrigin;
    const url = new URL(href, base);
    if (url.pathname === "/reader") {
      const documentId = url.searchParams.get("documentId");
      const anchorId = url.searchParams.get("anchor");
      return documentId && anchorId ? { documentId, anchorId } : null;
    }
    if (url.protocol === "paper-reader-plus:" && url.hostname === "document") {
      const documentId = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      const anchorId = url.searchParams.get("anchor");
      return documentId && anchorId ? { documentId, anchorId } : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function buildTextQuote(selection: ReaderSelection, pageItems: Array<{ text: string }> = []): TextQuote {
  const exact = selection.text.trim();
  if (!exact) return { exact: "" };
  const pageText = pageItems.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();
  const start = pageText.indexOf(exact);
  if (start < 0) return { exact };
  const prefix = pageText.slice(Math.max(0, start - 80), start).trim();
  const suffix = pageText.slice(start + exact.length, start + exact.length + 80).trim();
  return {
    exact,
    prefix: prefix || undefined,
    suffix: suffix || undefined,
  };
}

function cleanNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function cleanRects(rects: RectPct[]) {
  return rects.map((rect) => ({
    left: cleanNumber(rect.left),
    top: cleanNumber(rect.top),
    width: cleanNumber(rect.width),
    height: cleanNumber(rect.height),
  })).filter((rect) => rect.width > 0 && rect.height > 0);
}

export function buildAnchorCreateRequest(selection: ReaderSelection, pageItems: Array<{ text: string }> = [], createdFrom: Anchor["created_from"] = "selection"): AnchorCreateRequest {
  const font = selection.font ? {
    font_name: String(selection.font.font_name || ""),
    font_size: cleanNumber(selection.font.font_size),
  } : null;
  return {
    page_index: cleanNumber(selection.pageIndex),
    page_label: String(cleanNumber(selection.pageIndex) + 1),
    rects_pct: cleanRects(selection.rectsPct),
    text_quote: buildTextQuote(selection, pageItems),
    created_from: createdFrom,
    metadata: { font },
  };
}

export function buildImageRegionAnchorCreateRequest(pageIndex: number, rectPct: RectPct): AnchorCreateRequest {
  const page = cleanNumber(pageIndex);
  return {
    page_index: page,
    page_label: String(page + 1),
    rects_pct: cleanRects([rectPct]),
    text_quote: { exact: `PDF image region, page ${page + 1}` },
    created_from: "markdown",
    metadata: { kind: "pdf-image-region" },
  };
}

export function buildMarkdownQuote(anchor: Anchor, text?: string) {
  const exact = text || anchor.text_quote.exact;
  return `> ${exact}\n\nSource: [p. ${anchor.page_index + 1}](${buildReaderAnchorHref(anchor, anchor.page_index + 1)})`;
}
