export const STORE_SCHEMA_VERSION = 3;

export type RectPct = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type TextQuote = {
  exact: string;
  prefix?: string;
  suffix?: string;
};

export type TextPosition = {
  start: number;
  end: number;
  extraction_version: string;
};

export type StoredAnchor = {
  anchor_id: string;
  document_id: string;
  page_index: number;
  page_label?: string;
  rects_pct: RectPct[];
  text_quote: TextQuote;
  text_position?: TextPosition;
  created_from: "selection" | "markdown" | "ai" | "annotation";
  metadata: Record<string, unknown>;
  created_at: string;
};

export type StoredAnnotation = {
  annotation_id: string;
  document_id: string;
  anchor_id: string;
  type: "highlight" | "underline" | "note";
  color: string;
  page_index: number;
  sort_index: string;
  target: {
    rects_pct: RectPct[];
    text_quote?: TextQuote;
    text_position?: TextPosition;
    quad_points_pdf?: number[][];
    source_map?: unknown;
  };
  comment: string;
  tags: string[];
  read_only?: boolean;
  imported_from_pdf?: boolean;
  created_at: string;
  updated_at: string;
};

export type StoredParagraphTranslation = {
  document_id: string;
  page_index: number;
  source_text: string;
  source_hash: string;
  target_language: string;
  provider: "google" | "baidu";
  translated_text: string;
  created_at: string;
  updated_at: string;
};

export type StoredDataV2 = {
  schema_version: typeof STORE_SCHEMA_VERSION;
  documents: Array<Record<string, unknown>>;
  notes: Record<string, { content: string; updated_at: string }>;
  summaries: Record<string, { content: string; updated_at: string }>;
  anchors: StoredAnchor[];
  annotations: StoredAnnotation[];
  ai_history?: Record<string, Array<{ role: "user" | "assistant"; content: string }>>;
  symbols?: Record<string, Array<Record<string, unknown>>>;
  assets?: Array<Record<string, unknown>>;
  dictionary?: Array<Record<string, unknown>>;
  paragraph_translations?: Record<string, StoredParagraphTranslation[]>;
  settings: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function cleanNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanRect(value: unknown): RectPct | null {
  if (!isRecord(value)) return null;
  const rect = {
    left: cleanNumber(value.left),
    top: cleanNumber(value.top),
    width: cleanNumber(value.width),
    height: cleanNumber(value.height),
  };
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

function cleanRects(value: unknown): RectPct[] {
  return Array.isArray(value) ? value.map(cleanRect).filter((rect): rect is RectPct => Boolean(rect)) : [];
}

function cleanTextQuote(value: unknown): TextQuote {
  if (!isRecord(value)) return { exact: "" };
  return {
    exact: cleanString(value.exact),
    prefix: typeof value.prefix === "string" ? value.prefix : undefined,
    suffix: typeof value.suffix === "string" ? value.suffix : undefined,
  };
}

function cleanTextPosition(value: unknown): TextPosition | undefined {
  if (!isRecord(value)) return undefined;
  const start = cleanNumber(value.start, NaN);
  const end = cleanNumber(value.end, NaN);
  const extractionVersion = cleanString(value.extraction_version);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !extractionVersion) return undefined;
  return { start, end, extraction_version: extractionVersion };
}

function cleanAnchorSource(value: unknown): StoredAnchor["created_from"] {
  return value === "markdown" || value === "ai" || value === "annotation" ? value : "selection";
}

function cleanAnnotationType(value: unknown): StoredAnnotation["type"] {
  return value === "underline" || value === "note" ? value : "highlight";
}

function sortIndex(pageIndex: number, createdAt: string, annotationId: string) {
  return `${String(pageIndex).padStart(6, "0")}:${createdAt}:${annotationId}`;
}

function migrateAnchor(value: unknown): StoredAnchor | null {
  if (!isRecord(value)) return null;
  const anchorId = cleanString(value.anchor_id);
  const documentId = cleanString(value.document_id);
  if (!anchorId || !documentId) return null;
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  return {
    anchor_id: anchorId,
    document_id: documentId,
    page_index: cleanNumber(value.page_index),
    page_label: typeof value.page_label === "string" ? value.page_label : undefined,
    rects_pct: cleanRects(value.rects_pct),
    text_quote: cleanTextQuote(value.text_quote),
    text_position: cleanTextPosition(value.text_position),
    created_from: cleanAnchorSource(value.created_from),
    metadata,
    created_at: cleanString(value.created_at, new Date(0).toISOString()),
  };
}

function migrateAnnotation(value: unknown, anchorsById: Map<string, StoredAnchor>): StoredAnnotation | null {
  if (!isRecord(value)) return null;
  const annotationId = cleanString(value.annotation_id);
  const documentId = cleanString(value.document_id);
  const anchorId = cleanString(value.anchor_id);
  if (!annotationId || !documentId || !anchorId) return null;
  const anchor = anchorsById.get(anchorId);
  const target = isRecord(value.target) ? value.target : {};
  const targetRects = cleanRects(target.rects_pct);
  const rectsPct = targetRects.length ? targetRects : cleanRects(value.rects_pct);
  const textQuote = isRecord(target.text_quote) ? cleanTextQuote(target.text_quote) : isRecord(value.text_quote) ? cleanTextQuote(value.text_quote) : anchor?.text_quote;
  const textPosition = cleanTextPosition(target.text_position) || anchor?.text_position;
  const createdAt = cleanString(value.created_at, new Date(0).toISOString());
  return {
    annotation_id: annotationId,
    document_id: documentId,
    anchor_id: anchorId,
    type: cleanAnnotationType(value.type),
    color: cleanString(value.color, "#BBD4F6"),
    page_index: cleanNumber(value.page_index, anchor?.page_index || 0),
    sort_index: cleanString(value.sort_index) || sortIndex(cleanNumber(value.page_index, anchor?.page_index || 0), createdAt, annotationId),
    target: {
      rects_pct: rectsPct.length ? rectsPct : anchor?.rects_pct || [],
      text_quote: textQuote,
      text_position: textPosition,
      quad_points_pdf: Array.isArray(target.quad_points_pdf) ? target.quad_points_pdf as number[][] : undefined,
      source_map: target.source_map,
    },
    comment: cleanString(value.comment),
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [],
    read_only: value.read_only === true,
    imported_from_pdf: value.imported_from_pdf === true,
    created_at: createdAt,
    updated_at: cleanString(value.updated_at, createdAt),
  };
}

function cleanMap(value: unknown) {
  return isRecord(value) ? value as Record<string, { content: string; updated_at: string }> : {};
}

function cleanSettings(value: unknown) {
  const settings = isRecord(value) ? { ...value } : {};
  const figureLimit = cleanNumber(settings.summary_figure_attachment_limit, 10);
  settings.summary_figure_attachment_limit = Math.min(20, Math.max(0, Math.trunc(figureLimit)));
  settings.ai_send_notes_context = settings.ai_send_notes_context !== false;
  settings.ai_send_summary_context = settings.ai_send_summary_context !== false;
  settings.ai_send_annotations_context = settings.ai_send_annotations_context !== false;
  settings.ai_send_loaded_pdf_text = settings.ai_send_loaded_pdf_text !== false;
  settings.ai_send_figure_attachments = settings.ai_send_figure_attachments !== false;
  return settings;
}

function cleanParagraphTranslationProvider(value: unknown): StoredParagraphTranslation["provider"] {
  return value === "baidu" ? "baidu" : "google";
}

function migrateParagraphTranslation(value: unknown): StoredParagraphTranslation | null {
  if (!isRecord(value)) return null;
  const documentId = cleanString(value.document_id);
  const sourceText = cleanString(value.source_text);
  const sourceHash = cleanString(value.source_hash);
  const targetLanguage = cleanString(value.target_language);
  const translatedText = cleanString(value.translated_text);
  if (!documentId || !sourceText || !sourceHash || !targetLanguage || !translatedText) return null;
  const createdAt = cleanString(value.created_at, new Date(0).toISOString());
  return {
    document_id: documentId,
    page_index: cleanNumber(value.page_index),
    source_text: sourceText,
    source_hash: sourceHash,
    target_language: targetLanguage,
    provider: cleanParagraphTranslationProvider(value.provider),
    translated_text: translatedText,
    created_at: createdAt,
    updated_at: cleanString(value.updated_at, createdAt),
  };
}

function cleanParagraphTranslations(value: unknown) {
  const result: Record<string, StoredParagraphTranslation[]> = {};
  if (!isRecord(value)) return result;
  for (const [documentId, entries] of Object.entries(value)) {
    const cleaned = Array.isArray(entries)
      ? entries.map(migrateParagraphTranslation).filter((entry): entry is StoredParagraphTranslation => Boolean(entry))
      : [];
    if (cleaned.length) result[documentId] = cleaned.filter((entry) => entry.document_id === documentId);
  }
  return result;
}

export function migrateStoreToV3(input: unknown): StoredDataV2 {
  const source = isRecord(input) ? input : {};
  const anchors = (Array.isArray(source.anchors) ? source.anchors : [])
    .map(migrateAnchor)
    .filter((anchor): anchor is StoredAnchor => Boolean(anchor));
  const anchorsById = new Map(anchors.map((anchor) => [anchor.anchor_id, anchor]));
  const annotations = (Array.isArray(source.annotations) ? source.annotations : [])
    .map((annotation) => migrateAnnotation(annotation, anchorsById))
    .filter((annotation): annotation is StoredAnnotation => Boolean(annotation));

  return {
    schema_version: STORE_SCHEMA_VERSION,
    documents: Array.isArray(source.documents) ? source.documents.filter(isRecord) : [],
    notes: cleanMap(source.notes),
    summaries: cleanMap(source.summaries),
    anchors,
    annotations,
    ai_history: isRecord(source.ai_history) ? source.ai_history as StoredDataV2["ai_history"] : {},
    symbols: isRecord(source.symbols) ? source.symbols as StoredDataV2["symbols"] : {},
    assets: Array.isArray(source.assets) ? source.assets.filter(isRecord) : [],
    dictionary: Array.isArray(source.dictionary) ? source.dictionary.filter(isRecord) : [],
    paragraph_translations: cleanParagraphTranslations(source.paragraph_translations),
    settings: cleanSettings(source.settings),
  };
}

export const migrateStoreToV2 = migrateStoreToV3;
