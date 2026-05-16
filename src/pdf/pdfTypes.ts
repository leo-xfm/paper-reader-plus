import type { RectPct } from "@/types";

export type PdfDocumentProxyLike = {
  numPages: number;
  getPage(pageNumber: number): Promise<any>;
  getOutline?(): Promise<Array<Record<string, unknown>> | null>;
  getDestination?(destination: string): Promise<unknown[] | null>;
  getPageIndex?(reference: unknown): Promise<number>;
};

export type PdfOutlineItem = {
  id: string;
  title: string;
  page_index: number;
  level: number;
};

export type PdfPageMetrics = {
  pageIndex: number;
  width: number;
  height: number;
  scale: number;
};

export type PdfTextItem = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontName: string;
  fontSize: number;
  hScale?: number;
  rectPct: RectPct;
};

export type PdfPreviewTextItem = {
  text: string;
  rectPct: RectPct;
  fontName: string;
  hScale?: number;
};

export type PdfSearchMatch = {
  match_id: string;
  page_index: number;
  text: string;
  snippet: string;
  rects_pct: RectPct[];
};

export type PdfLinkAnnotation = {
  link_id: string;
  page_index: number;
  rects_pct: RectPct[];
  url?: string;
  destination?: unknown;
  title: string;
};

export type PdfReferenceCandidate = {
  reference_id: string;
  kind: "figure" | "table";
  number: string;
  label: string;
  page_index: number;
  rects_pct: RectPct[];
};

export type PdfReferenceTarget = {
  kind: "figure" | "table";
  number: string;
  label: string;
  page_index: number;
  caption: string;
  caption_rect_pct: RectPct;
  preview_rect_pct: RectPct;
};

export type PdfFigureTarget = {
  figure_id: string;
  label: string;
  page_index: number;
  caption: string;
  caption_rect_pct: RectPct;
  preview_rect_pct: RectPct;
};

export type PdfReferencePreview = {
  preview_kind: "reference";
  reference: PdfReferenceCandidate;
  target: PdfReferenceTarget | null;
  origin_page_index: number | null;
  preview_rect_pct: RectPct | null;
  preview_page_index: number | null;
  anchor: { left: number; top: number };
  imageUrl?: string;
  previewTextItems?: PdfPreviewTextItem[];
  loading: boolean;
  error?: string;
};

export type PdfLinkPreview = {
  preview_kind: "link";
  link: PdfLinkAnnotation;
  source?: "pdf-link" | "page-preview" | "reference";
  reference?: PdfReferenceCandidate;
  reference_target?: PdfReferenceTarget;
  target_page_index: number | null;
  origin_page_index: number | null;
  preview_rect_pct: RectPct | null;
  preview_page_index: number | null;
  anchor: { left: number; top: number };
  imageUrl?: string;
  previewTextItems?: PdfPreviewTextItem[];
  loading: boolean;
  error?: string;
};

export type PdfHoverPreview = PdfReferencePreview | PdfLinkPreview;

export type PdfTableSheet = {
  table_id: string;
  title: string;
  caption: string;
  page_index: number;
  columns: string[];
  rows: string[][];
};

export type PdfParagraphActionBlock = {
  block_id: string;
  page_index: number;
  text: string;
  top: number;
  height: number;
  rects_pct: RectPct[];
};
