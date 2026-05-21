import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import { createReaderPackageBuffer, extractAssetPathsFromMarkdown, type ReaderPackageAssetInput } from "../ReaderPackageService.js";
import { resolveReadermReferences } from "../services/ReadermPackageService.js";
import { migrateStoreToV3, STORE_SCHEMA_VERSION, type StoredAnchor, type StoredAnnotation, type StoredDocumentViewState, type StoredParagraphTranslation } from "../storeMigration.js";
import { findDocsService, readDocsKeyConfig, readTemplate } from "../services/DocsConfigService.js";
import type { Settings } from "../services/SettingsTypes.js";

export type DbDocument = {
  document_id: string;
  title: string;
  file_name: string;
  file_path: string;
  file_size: number;
  source_type?: "pdf" | "markdown" | "readerp" | "readerm";
  readerp_path?: string;
  package_path?: string;
  source_path?: string;
  latex_path?: string;
  latex_file_name?: string;
  created_at: string;
  updated_at: string;
};

export type StoredAsset = {
  asset_id: string;
  document_id: string;
  file_name: string;
  mime_type: string;
  path: string;
  original_name?: string;
  created_at: string;
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

export type StoredSymbolDefinition = {
  symbol: string;
  normalized_symbol: string;
  kind: "symbol" | "abbreviation";
  definition: string;
  source: "latex" | "pdf" | "grobid";
  page_index?: number;
  rects_pct?: Array<{ left: number; top: number; width: number; height: number }>;
  paragraph?: string;
  latex_line?: number;
  confidence: number;
  favorite?: boolean;
  deleted?: boolean;
  user_modified?: boolean;
  updated_at?: string;
};

export type StoredData = {
  schema_version: typeof STORE_SCHEMA_VERSION;
  documents: DbDocument[];
  notes: Record<string, { content: string; updated_at: string }>;
  summaries: Record<string, { content: string; updated_at: string }>;
  anchors: StoredAnchor[];
  annotations: StoredAnnotation[];
  ai_history: Record<string, Array<{ role: "user" | "assistant"; content: string; [key: string]: unknown }>>;
  symbols: Record<string, StoredSymbolDefinition[]>;
  assets: StoredAsset[];
  dictionary: DictionaryEntry[];
  paragraph_translations: Record<string, StoredParagraphTranslation[]>;
  view_states: Record<string, StoredDocumentViewState>;
  settings: Partial<Settings>;
};

type ReaderPackageSaveOptions = {
  document: DbDocument;
  documents?: DbDocument[];
  packageMode?: "pdf-centered" | "markdown-centered";
  defaultPath: string;
  note: string;
  summary: string;
  aiHistory: Array<{ role: "user" | "assistant"; content: string; [key: string]: unknown }>;
  anchors: unknown[];
  annotations: unknown[];
  symbols?: unknown[];
  pdfData?: Buffer;
  pdfDataByDocumentId?: Record<string, Buffer>;
  latexData?: Buffer;
  latexDataByDocumentId?: Record<string, Buffer>;
  assets?: ReaderPackageAssetInput[];
};

let mainWindow: BrowserWindow | null = null;
let libraryDir = "";
let assetsDir = "";
let storePath = "";
let store: StoredData;
const aiStreamControllers = new Map<string, AbortController>();
let storeWriteTimer: ReturnType<typeof setTimeout> | null = null;
let storeWritePromise = Promise.resolve();
const STORE_WRITE_DEBOUNCE_MS = 80;

function currentWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow && !focusedWindow.isDestroyed()) {
    mainWindow = focusedWindow;
    return focusedWindow;
  }
  const availableWindow = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) || null;
  mainWindow = availableWindow;
  if (!availableWindow) throw new Error("Main window is not available.");
  return availableWindow;
}

function defaultSettings(): Settings {
  const docsConfig = readDocsKeyConfig();
  const agent = findDocsService(docsConfig, "agent", /volcengine/i);
  const google = findDocsService(docsConfig, "translation", /google/i);
  const baidu = findDocsService(docsConfig, "translation", /baidu/i);
  const agentUrl = String(agent.url || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");
  return {
    ui_language: "system",
    agent_provider: "volcengine",
    ai_base_url: agentUrl,
    ai_api_key: String(agent.key || ""),
    ai_model: String(agent.model || "deepseek-v3-2-251201"),
    agent_api_type: "chat",
    professional_field: "computer-science research",
    research_area: "",
    reader_prompt: readTemplate("system"),
    summary_template: readTemplate("literature-read"),
    copy_quote_template: "> {{ paragraph_content }}\n\nSource: {{ page_marker }}",
    quote_to_note_template: "{{ page_marker }}",
    quote_to_readerm_template: "[{{ passage_name }}, p.{{ page_number }}]({{ href }})",
    summary_source: "pdf-extractor",
    summary_text_char_limit: 120000,
    summary_figure_attachment_limit: 10,
    capture_image_scale: 2,
    markdown_default_font_size: 15,
    markdown_line_height: 1.6,
    markdown_code_font_scale: 0.86,
    markdown_code_line_height: 1.22,
    markdown_western_font_family: "current",
    markdown_chinese_font_family: "current",
    markdown_code_font_family: "Consolas",
    markdown_code_line_numbers: true,
    markdown_code_ligatures: true,
    markdown_highlight_enabled: true,
    markdown_highlight_color: "#fff3bf",
    markdown_math_enabled: true,
    markdown_html_live_enabled: true,
    markdown_default_editor_mode: "live",
    readerm_edit_split_default: false,
    readerm_preview_position: "right",
    history_readerp_link_view: "pdf",
    ai_send_notes_context: true,
    ai_send_summary_context: true,
    ai_send_annotations_context: true,
    ai_send_loaded_pdf_text: true,
    ai_send_figure_attachments: true,
    ai_redo_longer_prompt: "Make the answer more detailed and comprehensive while preserving accurate reader evidence links.",
    ai_redo_shorter_prompt: "Make the answer more concise while preserving the key points and accurate reader evidence links.",
    ai_redo_try_again_prompt: "Try again with clearer reasoning, better structure, and accurate reader evidence links.",
    simpletex_ocr_token: "",
    simpletex_ocr_enabled: false,
    translator_mode: "ai",
    translation_provider: "google",
    translator_api_url: "",
    translator_api_key: "",
    translator_target_language: "Chinese",
    google_project_id: "",
    google_api_key: String(google.key || ""),
    baidu_app_id: String(baidu.app_id || ""),
    baidu_app_key: String(baidu.key || ""),
    network_proxy_enabled: false,
    network_proxy_url: "http://127.0.0.1:7890",
  };
}

function emptyStore(): StoredData {
  return {
    schema_version: STORE_SCHEMA_VERSION,
    documents: [],
    notes: {},
    summaries: {},
    anchors: [],
    annotations: [],
    ai_history: {},
    symbols: {},
    assets: [],
    dictionary: [],
    paragraph_translations: {},
    view_states: {},
    settings: {},
  };
}

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function now() {
  return new Date().toISOString();
}

export function saveStore() {
  if (!storePath) return;
  if (storeWriteTimer !== null) clearTimeout(storeWriteTimer);
  storeWriteTimer = setTimeout(() => {
    storeWriteTimer = null;
    const snapshot = JSON.stringify(store, null, 2);
    storeWritePromise = storeWritePromise
      .then(() => writeStoreSnapshot(snapshot))
      .catch((cause) => {
        console.error("Failed to save Paper Reader Plus store:", cause);
      });
  }, STORE_WRITE_DEBOUNCE_MS);
}

async function writeStoreSnapshot(snapshot: string) {
  const tempPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(tempPath, snapshot, "utf8");
  await rename(tempPath, storePath);
}

export async function flushStore() {
  if (!storePath) return;
  if (storeWriteTimer !== null) {
    clearTimeout(storeWriteTimer);
    storeWriteTimer = null;
  }
  const snapshot = JSON.stringify(store, null, 2);
  storeWritePromise = storeWritePromise
    .then(() => writeStoreSnapshot(snapshot))
    .catch((cause) => {
      console.error("Failed to save Paper Reader Plus store:", cause);
    });
  await storeWritePromise;
}

export function initStorage() {
  const userData = app.getPath("userData");
  libraryDir = join(userData, "library");
  assetsDir = join(userData, "library-assets");
  mkdirSync(libraryDir, { recursive: true });
  mkdirSync(assetsDir, { recursive: true });
  storePath = join(userData, "paper-reader-plus.json");
  const parsed = existsSync(storePath)
    ? safeJsonParse(readFileSync(storePath, "utf8"), emptyStore())
    : emptyStore();
  store = migrateStoreToV3(parsed) as StoredData;
  store.ai_history ||= {};
  store.symbols ||= {};
  store.assets ||= [];
  store.dictionary ||= [];
  store.paragraph_translations ||= {};
  store.view_states ||= {};
  saveStore();
}

export function getDocument(documentId: string) {
  const row = store.documents.find((document) => document.document_id === documentId);
  if (!row) throw new Error("Document not found.");
  return row;
}

export function listAnchors(documentId: string) {
  return store.anchors
    .filter((anchor) => anchor.document_id === documentId)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

export function listAnnotations(documentId: string) {
  return store.annotations
    .filter((annotation) => annotation.document_id === documentId)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

export function listAssets(documentId: string) {
  return store.assets
    .filter((asset) => asset.document_id === documentId)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

export function documentAssetDir(documentId: string) {
  return join(assetsDir, documentId);
}

export async function createAssetRecordAsync(documentId: string, fileName: string, mimeType: string, data: Buffer, originalName?: string) {
  getDocument(documentId);
  const targetDir = documentAssetDir(documentId);
  await mkdir(targetDir, { recursive: true });
  const target = join(targetDir, fileName);
  await writeFile(target, data);
  const timestamp = now();
  const asset: StoredAsset = {
    asset_id: randomUUID(),
    document_id: documentId,
    file_name: fileName,
    mime_type: mimeType,
    path: target,
    original_name: originalName,
    created_at: timestamp,
  };
  store.assets = [...store.assets.filter((item) => !(item.document_id === documentId && item.file_name === fileName)), asset];
  saveStore();
  return asset;
}

export async function dataUrlForAssetAsync(asset: StoredAsset) {
  if (!existsSync(asset.path)) throw new Error("Image asset is missing.");
  return `data:${asset.mime_type};base64,${(await readFile(asset.path)).toString("base64")}`;
}

export async function packageAssetsForDocumentAsync(documentId: string, ...sources: string[]): Promise<ReaderPackageAssetInput[]> {
  const referenced = extractAssetPathsFromMarkdown(...sources);
  const assets = listAssets(documentId)
    .filter((asset) => referenced.has(`assets/${asset.file_name}`) && existsSync(asset.path));
  return Promise.all(assets.map(async (asset) => ({
    asset_id: asset.asset_id,
    document_id: asset.document_id,
    file_name: asset.file_name,
    mime_type: asset.mime_type,
    data: await readFile(asset.path),
    original_name: asset.original_name,
    created_at: asset.created_at,
  })));
}

export function extractReaderDocumentIdsFromMarkdown(...sources: string[]) {
  const documentIds = new Set<string>();
  for (const source of sources) {
    const matches = source.matchAll(/\/reader\?[^)\s"']+/g);
    for (const match of matches) {
      try {
        const url = new URL(match[0], "http://paper-reader-plus.local");
        const documentId = url.searchParams.get("documentId");
        if (documentId) documentIds.add(documentId);
      } catch {
        // Ignore malformed Markdown links.
      }
    }
  }
  return documentIds;
}

export function buildReadermReferenceContext(markdown: string) {
  const references = resolveReadermReferences(markdown, store.documents, store.anchors);
  const referencedIds = new Set(references.map((reference) => reference.document_id));
  const referencedDocuments = store.documents.filter((document) => referencedIds.has(document.document_id));
  return { references, referencedDocuments };
}

export function getSettings() {
  return { ...defaultSettings(), ...store.settings };
}

function cleanFiniteNumber(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.min(max, Math.max(min, number));
}

function cleanBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function cleanMode(value: unknown, allowed: string[]) {
  return typeof value === "string" && allowed.includes(value) ? value : undefined;
}

function compactRecord<T extends Record<string, unknown>>(value: T): Partial<T> | undefined {
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
  return entries.length ? Object.fromEntries(entries) as Partial<T> : undefined;
}

export function cleanDocumentViewState(value: unknown): StoredDocumentViewState {
  const source = isRecord(value) ? value : {};
  const pdfSource = isRecord(source.pdf) ? source.pdf : {};
  const readerPanelSource = isRecord(source.reader_panel) ? source.reader_panel : {};
  const markdownSource = isRecord(source.markdown) ? source.markdown : {};
  const readermSource = isRecord(source.readerm) ? source.readerm : {};
  const pdf = compactRecord({
    page_index: cleanFiniteNumber(pdfSource.page_index, 0, 100000),
    scroll_top: cleanFiniteNumber(pdfSource.scroll_top, 0, 100000000),
    scroll_left: cleanFiniteNumber(pdfSource.scroll_left, 0, 100000000),
    zoom: cleanFiniteNumber(pdfSource.zoom, 0.1, 10),
  });
  const reader_panel = compactRecord({
    active_tab: cleanMode(readerPanelSource.active_tab, ["annotations", "notes", "summary", "symbols", "ai"]),
    collapsed: cleanBoolean(readerPanelSource.collapsed),
    width: cleanFiniteNumber(readerPanelSource.width, 180, 2000),
    notes_mode: cleanMode(readerPanelSource.notes_mode, ["edit", "live", "preview"]),
    summary_mode: cleanMode(readerPanelSource.summary_mode, ["edit", "live", "preview"]),
    notes_scroll_top: cleanFiniteNumber(readerPanelSource.notes_scroll_top, 0, 100000000),
    summary_scroll_top: cleanFiniteNumber(readerPanelSource.summary_scroll_top, 0, 100000000),
  });
  const markdown = compactRecord({
    mode: cleanMode(markdownSource.mode, ["edit", "live", "preview"]),
    scroll_top: cleanFiniteNumber(markdownSource.scroll_top, 0, 100000000),
    selection_start: cleanFiniteNumber(markdownSource.selection_start, 0, 100000000),
    selection_end: cleanFiniteNumber(markdownSource.selection_end, 0, 100000000),
  });
  const readerm = compactRecord({
    mode: cleanMode(readermSource.mode, ["edit", "live", "preview", "edit-preview"]),
    scroll_top: cleanFiniteNumber(readermSource.scroll_top, 0, 100000000),
    selection_start: cleanFiniteNumber(readermSource.selection_start, 0, 100000000),
    selection_end: cleanFiniteNumber(readermSource.selection_end, 0, 100000000),
    preview_scroll_top: cleanFiniteNumber(readermSource.preview_scroll_top, 0, 100000000),
    source_view: cleanMode(readermSource.source_view, ["pdf", "markdown", "summary"]),
    source_document_id: typeof readermSource.source_document_id === "string" ? readermSource.source_document_id : undefined,
    source_anchor_id: typeof readermSource.source_anchor_id === "string" ? readermSource.source_anchor_id : undefined,
    active_reference_id: typeof readermSource.active_reference_id === "string" ? readermSource.active_reference_id : undefined,
    pdf_collapsed: cleanBoolean(readermSource.pdf_collapsed),
    pdf_pane_width: cleanFiniteNumber(readermSource.pdf_pane_width, 180, 2000),
  });
  return {
    version: 1,
    updated_at: now(),
    ...(pdf ? { pdf } : {}),
    ...(reader_panel ? { reader_panel } : {}),
    ...(markdown ? { markdown } : {}),
    ...(readerm ? { readerm } : {}),
  };
}

export function clampSummaryFigureAttachmentLimit(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 10;
  return Math.min(20, Math.max(0, Math.trunc(number)));
}

export function clampSummaryTextCharLimit(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 120000;
  return Math.min(2000000, Math.max(0, Math.trunc(number)));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cleanTextQuote(value: unknown) {
  if (!isRecord(value)) return { exact: "" };
  return {
    exact: typeof value.exact === "string" ? value.exact : "",
    prefix: typeof value.prefix === "string" ? value.prefix : undefined,
    suffix: typeof value.suffix === "string" ? value.suffix : undefined,
  };
}

export function cleanRectList(value: unknown) {
  return Array.isArray(value) ? value.filter((item) => isRecord(item)) as StoredAnchor["rects_pct"] : [];
}

export function buildSortIndex(pageIndex: number, createdAt: string, annotationId: string) {
  return `${String(pageIndex).padStart(6, "0")}:${createdAt}:${annotationId}`;
}

export function latexTargetPath(documentId: string) {
  return join(libraryDir, `${documentId}.tex`);
}

export function normalizeDictionaryTerm(value: string) {
  return value
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export async function saveReaderPackageForDocument(options: ReaderPackageSaveOptions) {
  const result = await dialog.showSaveDialog(currentWindow(), {
    title: "Save Reader Package",
    defaultPath: options.defaultPath,
    filters: [{ name: "Reader Package", extensions: ["readerp"] }],
  });
  if (result.canceled || !result.filePath) return null;
  const buffer = await createReaderPackageBuffer({
    document: options.document,
    documents: options.documents,
    packageMode: options.packageMode,
    note: options.note,
    summary: options.summary,
    aiHistory: options.aiHistory,
    anchors: options.anchors,
    annotations: options.annotations,
    symbols: options.symbols,
    pdfData: options.pdfData,
    pdfDataByDocumentId: options.pdfDataByDocumentId,
    latexData: options.latexData,
    latexDataByDocumentId: options.latexDataByDocumentId,
    assets: options.assets,
  });
  await writeFile(result.filePath, buffer);
  options.document.readerp_path = result.filePath;
  options.document.file_name = basename(result.filePath);
  return result.filePath;
}

export function createIpcContext(window: BrowserWindow) {
  mainWindow = window;
  return {
    get window() {
      return currentWindow();
    },
    aiStreamControllers,
    get store() {
      return store;
    },
    get libraryDir() {
      return libraryDir;
    },
    get assetsDir() {
      return assetsDir;
    },
    now,
    saveStore,
    getDocument,
    listAnchors,
    listAnnotations,
    listAssets,
    listSymbols: (documentId: string) => store.symbols[documentId] || [],
    listParagraphTranslations: (documentId: string) => store.paragraph_translations[documentId] || [],
    documentAssetDir,
    createAssetRecordAsync,
    dataUrlForAssetAsync,
    packageAssetsForDocumentAsync,
    extractReaderDocumentIdsFromMarkdown,
    buildReadermReferenceContext,
    getSettings,
    clampSummaryFigureAttachmentLimit,
    clampSummaryTextCharLimit,
    isRecord,
    cleanTextQuote,
    cleanRectList,
    buildSortIndex,
    latexTargetPath,
    normalizeDictionaryTerm,
    cleanDocumentViewState,
    saveReaderPackageForDocument,
    flushStore,
  };
}

export type IpcContext = ReturnType<typeof createIpcContext>;
