export type RectPct = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type LibraryDocument = {
  document_id: string;
  title: string;
  file_name: string;
  file_path: string;
  file_size: number;
  source_type?: "pdf" | "markdown" | "readerp" | "readerm";
  readerp_path?: string;
  package_path?: string;
  latex_path?: string;
  latex_file_name?: string;
  created_at: string;
  updated_at: string;
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

export type Anchor = {
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

export type AnnotationType = "highlight" | "underline" | "note";

export type Annotation = {
  annotation_id: string;
  document_id: string;
  anchor_id: string;
  type: AnnotationType;
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

export type DocumentContext = {
  document: LibraryDocument;
  note: { content: string };
  summary: { content: string };
  anchors: Anchor[];
  annotations: Annotation[];
  ai_history?: ReaderPackageAiHistory;
  assets?: ReaderPackageAsset[];
  symbols?: SymbolDefinition[];
  paragraph_translations?: ParagraphTranslation[];
  readerm_references?: ReadermReference[];
  referenced_documents?: LibraryDocument[];
};

export type PackageHealthStatus = "ok" | "warning" | "error";

export type PackageHealthIssue = {
  issue_id: string;
  status: Exclude<PackageHealthStatus, "ok">;
  kind:
    | "missing-main-file"
    | "missing-package-file"
    | "missing-referenced-document"
    | "missing-anchor"
    | "orphan-annotation"
    | "missing-asset";
  message: string;
  document_id?: string;
  anchor_id?: string;
  annotation_id?: string;
  asset_id?: string;
  reference_id?: string;
};

export type PackageHealthReport = {
  document_id: string;
  status: PackageHealthStatus;
  issues: PackageHealthIssue[];
  checked_at: string;
};

export type CleanupUnusedResult = {
  document_id: string;
  removed_anchors: number;
  removed_assets: number;
  removed_asset_files: number;
};

export type LibrarySearchResultKind =
  | "document"
  | "note"
  | "summary"
  | "annotation"
  | "dictionary"
  | "symbol";

export type LibrarySearchResult = {
  result_id: string;
  document_id: string;
  source_type?: LibraryDocument["source_type"];
  kind: LibrarySearchResultKind;
  title: string;
  snippet: string;
  page_index?: number;
  anchor_id?: string;
  score: number;
};

export type ParagraphTranslationProvider = "google" | "baidu";

export type ParagraphTranslation = {
  document_id: string;
  page_index: number;
  source_text: string;
  source_hash: string;
  target_language: string;
  provider: ParagraphTranslationProvider;
  translated_text: string;
  created_at: string;
  updated_at: string;
};

export type ParagraphTranslationSaveRequest = Pick<
  ParagraphTranslation,
  "page_index" | "source_text" | "source_hash" | "target_language" | "provider" | "translated_text"
>;

export type ReadermReferenceStatus = "resolved" | "missing-document" | "missing-anchor";

export type ReadermReference = {
  reference_id: string;
  document_id: string;
  anchor_id: string;
  href: string;
  markdown_start: number;
  markdown_end: number;
  label: string;
  status: ReadermReferenceStatus;
  page_index?: number;
  page_label?: string;
  rects_pct?: RectPct[];
  text_quote?: TextQuote;
};

export type ReaderEvidence = {
  evidence_id: string;
  document_id: string;
  anchor_id: string;
  page_index: number;
  href: string;
  quote: string;
  annotation_id?: string;
  annotation_type?: AnnotationType;
  comment?: string;
};

export type ReaderContextPayload = {
  document: LibraryDocument;
  selection?: {
    text: string;
    page_index: number;
    anchor?: Anchor | null;
    annotation?: Annotation | null;
  } | null;
  active_anchor?: Anchor | null;
  active_annotation?: Annotation | null;
  note: string;
  summary: string;
  evidences: ReaderEvidence[];
  figure_attachments?: ReaderFigureAttachment[];
  summary_source?: {
    mode: SummarySourceMode;
    label: string;
    content: string;
  };
};

export type AiContextOptions = Pick<
  Settings,
  | "ai_send_notes_context"
  | "ai_send_summary_context"
  | "ai_send_annotations_context"
  | "ai_send_loaded_pdf_text"
  | "ai_send_figure_attachments"
>;

export type ReaderFigureAttachment = {
  figure_id: string;
  label: string;
  caption: string;
  page_index: number;
  rect_pct: RectPct;
  data_url?: string;
  href?: string;
};

export type AnchorCreateRequest = {
  page_index: number;
  page_label?: string;
  rects_pct: RectPct[];
  text_quote: TextQuote;
  text_position?: TextPosition;
  created_from: Anchor["created_from"];
  metadata?: Record<string, unknown>;
};

export type AnnotationCreateRequest = {
  anchor_id: string;
  type: AnnotationType;
  color: string;
  sort_index?: string;
  target?: Annotation["target"];
  comment?: string;
  tags?: string[];
};

export type AnnotationUpdateRequest = Partial<Pick<Annotation, "type" | "color" | "comment" | "tags" | "target">>;

export type Settings = {
  ui_language: "system" | "en-US" | "zh-CN";
  agent_provider: "volcengine";
  ai_base_url: string;
  ai_api_key: string;
  ai_model: string;
  agent_api_type: "chat" | "responses";
  professional_field: string;
  research_area: string;
  reader_prompt: string;
  summary_template: string;
  summary_source: SummarySourceMode;
  summary_figure_attachment_limit: number;
  ai_send_notes_context: boolean;
  ai_send_summary_context: boolean;
  ai_send_annotations_context: boolean;
  ai_send_loaded_pdf_text: boolean;
  ai_send_figure_attachments: boolean;
  translator_mode: "ai" | "api";
  translation_provider: "google" | "baidu";
  translator_api_url: string;
  translator_api_key: string;
  translator_target_language: string;
  google_project_id: string;
  google_api_key: string;
  baidu_app_id: string;
  baidu_app_key: string;
  network_proxy_enabled: boolean;
  network_proxy_url: string;
};

export type SummarySourceMode = "pdf-direct" | "pdf-extractor" | "latex";

export type MarkdownEditorMode = "edit" | "live" | "preview";

export type AiTextContentPart = {
  type: "text";
  text: string;
};

export type AiImageContentPart = {
  type: "image_url";
  image_url: {
    url: string;
  };
};

export type AiMessageContent = string | Array<AiTextContentPart | AiImageContentPart>;

export type AiChatRequest = {
  messages: Array<{ role: "system" | "user" | "assistant"; content: AiMessageContent }>;
  prompt?: string;
  document?: LibraryDocument | null;
  document_id?: string;
  summary_source_mode?: SummarySourceMode;
  selection?: {
    text: string;
    page_index: number;
    anchor?: Anchor | null;
    annotation?: Annotation | null;
  } | null;
  reader_context?: ReaderContextPayload;
  task?: "chat" | "translate" | "summary" | "metaphor";
};

export type AiChatResponse = {
  content: string;
};

export type TranslateSelectionRequest = {
  text: string;
  target_language?: string;
  prompt?: string;
  messages?: AiChatRequest["messages"];
  document?: LibraryDocument | null;
  selection?: AiChatRequest["selection"];
  reader_context?: ReaderContextPayload;
  task?: "translate";
};

export type TranslateSelectionResponse = {
  content: string;
};

export type PromptTemplateStatus = {
  name: string;
  fileName: string;
  path: string;
  available: boolean;
  content: string;
};

export type ConnectionTestResponse = {
  ok: boolean;
  content: string;
};

export type FileAssociationStatus = {
  platform: NodeJS.Platform;
  supported: boolean;
  associated: boolean;
  associations: Array<{
    extension: ".readerp" | ".readerm";
    associated: boolean;
  }>;
};

export type SymbolDefinition = {
  symbol: string;
  normalized_symbol: string;
  kind: "symbol" | "abbreviation";
  definition: string;
  source: "latex" | "pdf" | "grobid";
  page_index?: number;
  rects_pct?: RectPct[];
  paragraph?: string;
  latex_line?: number;
  confidence: number;
  favorite?: boolean;
  deleted?: boolean;
  user_modified?: boolean;
  updated_at?: string;
};

export type AuthorPaperRef = {
  document_id: string;
  title: string;
};

export type AuthorNetworkEdge = {
  name: string;
  normalized_name: string;
  count: number;
  papers: AuthorPaperRef[];
};

export type AuthorProfile = {
  name: string;
  normalized_name: string;
  papers: AuthorPaperRef[];
  coauthors: AuthorNetworkEdge[];
  local_paper_count: number;
};

export type AuthorHoverPreview = {
  author: AuthorProfile;
  anchor: { left: number; top: number };
};

export type DictionaryEntry = {
  entry_id: string;
  term: string;
  normalized_term: string;
  definition: string;
  source_document_id?: string;
  source_anchor_id?: string;
  created_at: string;
  updated_at: string;
};

export type DictionaryHoverPreview = {
  entry: DictionaryEntry;
  anchor: { left: number; top: number };
};

export type ReaderPackageDocumentKind = "pdf" | "markdown" | "pdf-markdown";
export type ReaderPackageMode = "pdf-centered" | "markdown-centered";

export type ReaderPackageManifest = {
  format: "paper-reader-plus.readerp";
  version: 1;
  document_id: string;
  title: string;
  file_name: string;
  document_kind: ReaderPackageDocumentKind;
  package_mode?: ReaderPackageMode;
  created_at: string;
  updated_at: string;
  files: {
    pdf?: string;
    latex?: string;
    notes: string;
    summary: string;
    ai_history: string;
    anchors: string;
    annotations: string;
    symbols?: string;
    assets: string;
    assets_manifest?: string;
  };
};

export type ReaderPackageAiHistory = Array<{ role: "user" | "assistant"; content: string }>;

export type ReaderPackageAsset = {
  asset_id: string;
  document_id: string;
  file_name: string;
  mime_type: string;
  path: string;
  original_name?: string;
  created_at: string;
};

export type MarkdownImageInsertResult = {
  asset: ReaderPackageAsset;
  markdown: string;
};
