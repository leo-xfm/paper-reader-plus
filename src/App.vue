<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { FilePlus2, FileText, Highlighter, Underline } from "lucide-vue-next";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import PdfWorkspace from "@/components/PdfWorkspace.vue";
import PdfReaderPane from "@/components/PdfReaderPane.vue";
import ReadermWorkspace from "@/components/ReadermWorkspace.vue";
import HelpPage from "@/components/HelpPage.vue";
import ReaderFileTabs from "@/components/ReaderFileTabs.vue";
import ReaderSidebar from "@/components/ReaderSidebar.vue";
import ReaderLayout from "@/components/ReaderLayout.vue";
import ReaderSidePanel from "@/components/ReaderSidePanel.vue";
import type { RightPanelTab } from "@/components/ReaderPanelTabs";
import SelectionToolbar from "@/components/SelectionToolbar.vue";
import TableSheetModal from "@/components/TableSheetModal.vue";
import ArxivImportModal from "@/components/ArxivImportModal.vue";
import SettingsModal, { type SettingsPanel } from "@/components/SettingsModal.vue";
import TranslationResultModal from "@/components/TranslationResultModal.vue";
import { usePdfDocument } from "@/composables/usePdfDocument";
import { usePdfPages } from "@/composables/usePdfPages";
import { usePdfSearch } from "@/composables/usePdfSearch";
import { useDocumentLifecycle } from "@/composables/useDocumentLifecycle";
import { useMarkdownImageActions } from "@/composables/useMarkdownImageActions";
import { usePdfPreviewActions } from "@/composables/usePdfPreviewActions";
import { useAnnotationActions } from "@/composables/useAnnotationActions";
import { useAiTranslationActions } from "@/composables/useAiTranslationActions";
import { useSymbolTracking } from "@/composables/useSymbolTracking";
import { setUiLanguage, useI18n } from "@/i18n";
import type { ArxivImportProgress } from "@/env";
import type { PdfHoverPreview, PdfTableSheet, PdfTextItem } from "@/pdf/pdfTypes";
import { toIpcPlainObject } from "@/services/IpcPayloadService";
import { extractMarkdownOutline } from "@/services/MarkdownOutlineService";
import { parseReaderAnchorHref, type ReaderSelection } from "@/services/ReaderAnchorService";
import { ANNOTATION_COLORS, annotationMatchesFilters, sortAnnotations, type AnnotationFilters, type AnnotationToolMode } from "@/services/ReaderAnnotationService";
import { buildAuthorNetwork, type AuthorDocumentInput } from "@/services/AuthorNetworkService";
import { findSymbolDefinition, normalizeSymbol } from "@/services/SymbolTrackerService";
import type { AiChatRequest, Anchor, Annotation, AnnotationType, AuthorHoverPreview, DictionaryEntry, DictionaryHoverPreview, DocumentContext, FileAssociationStatus, LibraryDocument, LibrarySearchResult, MarkdownEditorMode, PackageHealthReport, PromptTemplateStatus, ReaderPackageAiHistory, ReadermReference, RectPct, Settings, SymbolDefinition } from "@/types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const { t } = useI18n();
const isHelpPage = new URLSearchParams(window.location.search).has("help");

const documents = ref<LibraryDocument[]>([]);
const healthReports = ref<Record<string, PackageHealthReport | undefined>>({});
const librarySearchQuery = ref("");
const librarySearchResults = ref<LibrarySearchResult[]>([]);
const librarySearchLoading = ref(false);
let librarySearchTimer: number | null = null;
const selectedDocumentId = ref("");
const context = ref<DocumentContext | null>(null);
const { pdfDocument, pageNumbers, outlineItems, loadPdf, clearPdf } = usePdfDocument();
const {
  currentPageIndex,
  currentPageNumber,
  pdfZoom,
  pageRenderWidth,
  setPdfScrollElement,
  setPageElement,
  scrollToPage,
  handleWheel,
  zoom,
  resetZoom,
  clearPages,
} = usePdfPages(pageNumbers);
const loading = ref(false);
const error = ref("");
const notice = ref("");
const noteDraft = ref("");
const summaryDraft = ref("");
const titleDraft = ref("");
const editingTitle = ref(false);
const rightPanelTab = ref<RightPanelTab>("annotations");
const libraryCollapsed = ref(false);
const rightPanelCollapsed = ref(false);
const rightPanelWidth = ref(560);
const notesMode = ref<MarkdownEditorMode>("edit");
const summaryMode = ref<MarkdownEditorMode>("edit");
const readermMode = ref<MarkdownEditorMode>("live");
const activeReadermReferenceId = ref("");
const readermManualPdfDocumentId = ref("");
const readermManualPdfAnchorId = ref("");
const readermPdfNavigationKey = ref(0);
const readermPdfCollapsed = ref(false);
const readermPdfPaneWidth = ref(640);
const readermCaptureRequest = ref<{ requestId: number; selection?: { start: number; end: number } } | null>(null);
const annotationToolMode = ref<AnnotationToolMode>("select");
const annotationFilters = ref<AnnotationFilters>({ type: "all", color: "all", page: "all", content: "all" });
const pageJumpDraft = ref("1");
const pageTextItems = ref<Record<number, PdfTextItem[]>>({});
const {
  searchOpen,
  searchQuery,
  searchMatches,
  activeSearchIndex,
  activeSearchMatch,
  syncActiveSearchMatch,
  nextSearch,
} = usePdfSearch(pageTextItems, scrollToPage, pdfDocument);
const selectionState = ref<(ReaderSelection & { position: { left: number; top: number; bottom?: number } }) | null>(null);
const activeAnchor = ref<Anchor | null>(null);
const activeAnnotation = ref<Annotation | null>(null);
const referencePreview = ref<PdfHoverPreview | null>(null);
const referencePreviewFixed = ref(false);
const referencePreviewFixedPosition = ref<{ left: number; top: number } | null>(null);
const tableSheet = ref<PdfTableSheet | null>(null);
const authorPreview = ref<AuthorHoverPreview | null>(null);
const dictionaryPreview = ref<DictionaryHoverPreview | null>(null);
const dictionaryEntries = ref<DictionaryEntry[]>([]);
const authorDocuments = ref<Record<string, AuthorDocumentInput>>({});
const latexSymbols = ref<SymbolDefinition[]>([]);
const savedSymbols = ref<SymbolDefinition[]>([]);
const activeSymbol = ref("");
const annotationColor = ref("#BBD4F6");
const pendingImageInsert = ref<{ target: "notes" | "summary"; selection?: { start: number; end: number } } | null>(null);
const activeSettingsPanel = ref<SettingsPanel | null>(null);
const arxivImportOpen = ref(false);
const arxivIdDraft = ref("");
const arxivImportMode = ref<"pdf" | "pdf-latex">("pdf-latex");
const arxivImporting = ref(false);
const arxivImportProgress = ref<ArxivImportProgress | null>(null);
const startDropActive = ref(false);
const startDropDepth = ref(0);
const settings = ref<Settings | null>(null);
const promptTemplates = ref<PromptTemplateStatus[]>([]);
const settingsTesting = ref<"agent" | "translation" | null>(null);
const fileAssociationStatus = ref<FileAssociationStatus | null>(null);
const fileAssociationBusy = ref(false);
const aiInput = ref("");
const aiMessages = ref<Array<{ role: "user" | "assistant"; content: string }>>([]);
type DraftState = {
  title: string;
  note: string;
  summary: string;
  aiHistory: ReaderPackageAiHistory;
};
type DocumentDraftCacheEntry = {
  draft: DraftState;
  saved: DraftState;
};
const openDocumentIds = ref<string[]>([]);
const documentDraftCache = ref<Record<string, DocumentDraftCacheEntry>>({});
const aiLoading = ref(false);
const pendingAiTask = ref<AiChatRequest["task"] | null>(null);
const translationModal = ref<{
  provider: "google" | "baidu";
  targetLanguage: string;
  sourceText: string;
  translatedText: string;
  loading: boolean;
  error: string;
  position: { left: number; top: number; bottom?: number } | null;
} | null>(null);
const lastCreatedAnnotationId = ref<string | null>(null);
const annotationCommentEditor = ref<{
  annotationId: string;
  type: "highlight" | "underline";
  color: string;
  draft: string;
  tagsDraft: string;
  position: { left: number; top: number };
} | null>(null);
const annotationCommentTextarea = ref<HTMLTextAreaElement | null>(null);
let unsubscribeMenuAction: (() => void) | null = null;
let unsubscribeCloseRequest: (() => void) | null = null;
let unsubscribeOpenFileRequest: (() => void) | null = null;
let closeRequestRunning = false;
let markdownAutosaveTimer: number | null = null;
let markdownAutosaveDocumentId = "";
let markdownAutosaveRunning = false;
let markdownAutosaveQueued = false;
let markdownAutosavePrimed = false;
const markdownAutosaveDelay = 900;

const documentTitle = computed(() => context.value?.document.title || "Paper Reader Plus");
const totalPages = computed(() => pageNumbers.value.length);
const selectedText = computed(() => selectionState.value?.text || "");
const annotations = computed(() => sortAnnotations(context.value?.annotations || []));
const filteredAnnotations = computed(() => annotations.value.filter((annotation) => annotationMatchesFilters(annotation, annotationFilters.value)));
const visibleSearchMatches = computed(() => searchOpen.value && searchQuery.value.trim() ? searchMatches.value : []);
const visibleActiveSearchMatch = computed(() => searchOpen.value && searchQuery.value.trim() ? activeSearchMatch.value : null);
const activeOutlineItems = computed(() => context.value?.document.source_type === "readerm" ? extractMarkdownOutline(noteDraft.value) : outlineItems.value);
const readermReferences = computed(() => context.value?.readerm_references || []);
const activeReadermReference = computed(() => readermReferences.value.find((reference) => reference.reference_id === activeReadermReferenceId.value) || readermReferences.value[0] || null);
const historyPdfDocuments = computed(() => documents.value.filter((document) => document.source_type !== "markdown" && document.source_type !== "readerm"));
const readermReferencedPdfDocumentId = computed(() => activeReadermReference.value?.status !== "missing-document" ? activeReadermReference.value?.document_id || "" : "");
const readermPdfDocumentId = computed(() => readermManualPdfDocumentId.value || readermReferencedPdfDocumentId.value);
const readermPdfAnchorId = computed(() => readermManualPdfDocumentId.value ? readermManualPdfAnchorId.value : activeReadermReference.value?.status === "resolved" ? activeReadermReference.value.anchor_id : "");
const readermResizeHandleWidth = 3;
const readermLayoutStyle = computed(() => ({
  gridTemplateColumns: readermPdfCollapsed.value
    ? "minmax(0, 1fr) 0 var(--rail-collapsed-width)"
    : `minmax(500px, 1fr) ${readermResizeHandleWidth}px ${readermPdfPaneWidth.value}px`,
}));
const authorProfiles = computed(() => buildAuthorNetwork(Object.values(authorDocuments.value)));
const agentStatusLabel = computed(() => settings.value
  ? `${settings.value.agent_provider} / ${settings.value.ai_model} / docs/*.j2`
  : t("app.agentTemplates"));
const summaryWaiting = computed(() => aiLoading.value && pendingAiTask.value === "summary");
const promptTemplatePreview = computed(() => promptTemplates.value.map((template) => ({
  ...template,
  preview: template.content.slice(0, 1200),
})));
const annotationCommentEditorStyle = computed(() => {
  const editor = annotationCommentEditor.value;
  if (!editor) return {};
  return {
    left: `${Math.min(Math.max(12, editor.position.left), Math.max(12, window.innerWidth - 392))}px`,
    top: `${Math.min(Math.max(12, editor.position.top), Math.max(12, window.innerHeight - 216))}px`,
  };
});
const {
  refreshDocuments,
  importPdf: lifecycleImportPdf,
  importArxiv: lifecycleImportArxiv,
  importReaderPackage: lifecycleImportReaderPackage,
  importReadermPackage: lifecycleImportReadermPackage,
  createReaderPackageFromPdf: lifecycleCreateReaderPackageFromPdf,
  createReaderPackageFromMarkdown: lifecycleCreateReaderPackageFromMarkdown,
  createEmptyReaderm: lifecycleCreateEmptyReaderm,
  createReadermFromMarkdown: lifecycleCreateReadermFromMarkdown,
  exportCurrentReaderPackage: lifecycleExportCurrentReaderPackage,
  exportCurrentReadermPackage: lifecycleExportCurrentReadermPackage,
  exportMarkdownReaderPackage: lifecycleExportMarkdownReaderPackage,
  splitCurrentReaderPackage: lifecycleSplitCurrentReaderPackage,
  openDocument: loadDocument,
  deleteDocument: lifecycleDeleteDocument,
  deleteCurrentDocument: lifecycleDeleteCurrentDocument,
  saveTitle: lifecycleSaveTitle,
  attachLatexSource,
  saveNote: lifecycleSaveNote,
  saveReaderm: lifecycleSaveReaderm,
  saveSummary: lifecycleSaveSummary,
} = useDocumentLifecycle({
  documents,
  selectedDocumentId,
  context,
  loading,
  error,
  noteDraft,
  summaryDraft,
  titleDraft,
  editingTitle,
  selectionState,
  activeAnchor,
  activeAnnotation,
  referencePreview,
  tableSheet,
  authorPreview,
  dictionaryPreview,
  latexSymbols,
  savedSymbols,
  activeSymbol,
  arxivIdDraft,
  arxivImportMode,
  arxivImportOpen,
  arxivImporting,
  arxivImportProgress,
  aiMessages,
  pageTextItems,
  showNotice,
  clearPages,
  clearPdf,
  loadPdf,
  scrollToPage,
});

const {
  appendMarkdown,
  insertImageAsset,
  pasteImageAsset,
  resizeMarkdownAssetImage,
  copyImageSelection,
} = useMarkdownImageActions({
  context,
  noteDraft,
  summaryDraft,
  notesMode,
  summaryMode,
  rightPanelTab,
  rightPanelCollapsed,
  pendingImageInsert,
  selectionState,
  annotationToolMode,
  activeAnchor,
  showNotice,
});

const {
  handlePdfLinkClick,
  pdfLinkReturnTarget,
  handlePdfLinkPreview,
  handleReferencePreview,
  handlePreviewReferencePage,
  handleReturnReferencePreview,
  keepReferencePreviewOpen,
  clearReferencePreviewSoon,
  closeReferencePreview,
  toggleReferencePreviewFixed,
  moveReferencePreviewFixed,
  returnToPdfLinkSource,
  closePdfLinkReturnTarget,
  handleReferenceJump,
  openReferenceSpreadsheet,
  exportTableCsv,
  openCurrentPagePreview,
} = usePdfPreviewActions({
  pdfDocument,
  referencePreview,
  referencePreviewFixed,
  referencePreviewFixedPosition,
  tableSheet,
  rightPanelCollapsed,
  rightPanelWidth,
  currentPageIndex,
  currentPageNumber,
  scrollToPage,
  showNotice,
});

const {
  ensureAnchor,
  createAnnotation,
  handleSelection,
  handleAnnotationToolMode,
  openAnnotationCommentEditor,
  saveAnnotationCommentEditor,
  updateAnnotationCommentEditorType,
  updateAnnotationCommentEditorColor,
  undoLastAnnotation,
  copySelectedText,
  copyQuote,
  quoteToNote,
  updateAnnotation,
  deleteAnnotation,
  selectAnnotation,
  handleAnnotationClick,
} = useAnnotationActions({
  context,
  selectedText,
  selectionState,
  activeAnchor,
  activeAnnotation,
  annotationToolMode,
  annotationColor,
  pendingImageInsert,
  lastCreatedAnnotationId,
  annotationCommentEditor,
  annotationCommentTextarea,
  noteDraft,
  notesMode,
  rightPanelTab,
  rightPanelCollapsed,
  pageTextItems,
  scrollToPage,
  showNotice,
});

const {
  buildCurrentReaderContext,
  askAiAboutSelection,
  explainSelectionWithMetaphor,
  translateSelection,
  sendAi,
  handlePanelSendAi,
  cancelActiveAiStream,
} = useAiTranslationActions({
  context,
  selectionState,
  activeAnchor,
  activeAnnotation,
  noteDraft,
  summaryDraft,
  settings,
  aiInput,
  aiMessages,
  aiLoading,
  pendingAiTask,
  translationModal,
  pageTextItems,
  pdfDocument,
  rightPanelCollapsed,
  rightPanelTab,
  ensureAnchor,
  showNotice,
  onAiHistorySaved: updateSavedAiHistorySnapshot,
});

const {
  symbols,
  symbolRefreshProgress,
  updateSymbolDefinition: saveSymbolDefinition,
  deleteSymbolDefinition: removeSymbolDefinition,
  refreshSymbols,
} = useSymbolTracking({
  context,
  loading,
  savedSymbols,
  latexSymbols,
  pageTextItems,
  showNotice,
  t,
});

function cloneAiHistory(history: Array<{ role: "user" | "assistant"; content: string }> = []): ReaderPackageAiHistory {
  return history.map((message) => ({ role: message.role, content: message.content }));
}

function createDraftState(document: LibraryDocument, note: string, summary: string, history: Array<{ role: "user" | "assistant"; content: string }> = []): DraftState {
  return {
    title: document.title,
    note,
    summary,
    aiHistory: cloneAiHistory(history),
  };
}

function currentDraftState(): DraftState | null {
  if (!context.value) return null;
  return {
    title: titleDraft.value,
    note: noteDraft.value,
    summary: summaryDraft.value,
    aiHistory: cloneAiHistory(aiMessages.value),
  };
}

function draftKey(draft: DraftState) {
  return JSON.stringify(draft);
}

function cacheCurrentDocumentDraft() {
  if (!context.value) return;
  const documentId = context.value.document.document_id;
  const draft = currentDraftState();
  if (!draft) return;
  const saved = documentDraftCache.value[documentId]?.saved || createDraftState(
    context.value.document,
    context.value.note.content,
    context.value.summary.content,
    context.value.ai_history || [],
  );
  documentDraftCache.value = {
    ...documentDraftCache.value,
    [documentId]: { draft, saved },
  };
}

function setDocumentCache(documentId: string, entry: DocumentDraftCacheEntry) {
  documentDraftCache.value = {
    ...documentDraftCache.value,
    [documentId]: entry,
  };
}

function ensureLoadedDocumentCache() {
  if (!context.value) return;
  const documentId = context.value.document.document_id;
  const existing = documentDraftCache.value[documentId];
  if (existing) {
    titleDraft.value = existing.draft.title;
    noteDraft.value = existing.draft.note;
    summaryDraft.value = existing.draft.summary;
    aiMessages.value = cloneAiHistory(existing.draft.aiHistory);
    return;
  }
  const saved = createDraftState(context.value.document, noteDraft.value, summaryDraft.value, aiMessages.value);
  setDocumentCache(documentId, { draft: saved, saved });
}

function restoreDraftState(draft: DraftState) {
  titleDraft.value = draft.title;
  noteDraft.value = draft.note;
  summaryDraft.value = draft.summary;
  aiMessages.value = cloneAiHistory(draft.aiHistory);
}

function cacheEntryForDocument(documentId: string) {
  if (selectedDocumentId.value === documentId) cacheCurrentDocumentDraft();
  return documentDraftCache.value[documentId];
}

function isDocumentDirty(documentId: string) {
  const entry = cacheEntryForDocument(documentId);
  return Boolean(entry && draftKey(entry.draft) !== draftKey(entry.saved));
}

function updateSavedAiHistorySnapshot(documentId: string, history: Array<{ role: "user" | "assistant"; content: string }>) {
  const entry = documentDraftCache.value[documentId];
  if (!entry) return;
  const aiHistory = cloneAiHistory(history);
  setDocumentCache(documentId, {
    draft: { ...entry.draft, aiHistory },
    saved: { ...entry.saved, aiHistory },
  });
}

function addOpenDocumentTab(documentId: string) {
  if (openDocumentIds.value.includes(documentId)) return;
  openDocumentIds.value = [...openDocumentIds.value, documentId];
}

async function refreshDocumentHealth(documentId: string) {
  if (!documentId) return;
  try {
    const report = await window.paperReaderPlus.getDocumentHealth(documentId);
    healthReports.value = { ...healthReports.value, [documentId]: report };
  } catch {
    const { [documentId]: _failed, ...remaining } = healthReports.value;
    healthReports.value = remaining;
  }
}

async function refreshVisibleHealth() {
  const entries = await Promise.all(documents.value.map(async (document) => {
    try {
      return [document.document_id, await window.paperReaderPlus.getDocumentHealth(document.document_id)] as const;
    } catch {
      return [document.document_id, undefined] as const;
    }
  }));
  healthReports.value = Object.fromEntries(entries);
}

async function openDocument(documentId: string) {
  if (!documentId) return;
  if (selectedDocumentId.value === documentId && context.value) {
    addOpenDocumentTab(documentId);
    return;
  }
  cacheCurrentDocumentDraft();
  await flushMarkdownAutosave(selectedDocumentId.value);
  addOpenDocumentTab(documentId);
  await loadDocument(documentId);
  ensureLoadedDocumentCache();
  await refreshDocumentHealth(documentId);
}

function clearActiveDocumentState() {
  context.value = null;
  clearPdf();
  clearPages();
  pageTextItems.value = {};
  selectedDocumentId.value = "";
  selectionState.value = null;
  activeAnchor.value = null;
  activeAnnotation.value = null;
  referencePreview.value = null;
  tableSheet.value = null;
  authorPreview.value = null;
  dictionaryPreview.value = null;
  latexSymbols.value = [];
  savedSymbols.value = [];
  activeSymbol.value = "";
}

async function saveDocumentDraft(documentId: string) {
  const entry = cacheEntryForDocument(documentId);
  const document = documents.value.find((item) => item.document_id === documentId) || context.value?.document;
  if (!entry || !document) return false;
  const draft = entry.draft;
  let nextDocument = document;
  if (draft.title !== document.title) {
    nextDocument = await window.paperReaderPlus.updateDocumentTitle(documentId, draft.title);
    if (context.value?.document.document_id === documentId) context.value.document = nextDocument;
  }
  if (nextDocument.source_type === "readerm") {
    const target = await window.paperReaderPlus.saveCurrentReadermPackage(documentId, draft.note);
    if (!target) return false;
  } else if (nextDocument.readerp_path) {
    const target = await window.paperReaderPlus.saveCurrentReaderPackage(
      documentId,
      draft.note,
      draft.summary,
      toIpcPlainObject(draft.aiHistory),
    );
    if (!target) return false;
  } else {
    await window.paperReaderPlus.saveNote(documentId, draft.note);
    await window.paperReaderPlus.saveSummary(documentId, draft.summary);
    await window.paperReaderPlus.saveAiHistory(documentId, toIpcPlainObject(draft.aiHistory));
  }
  const saved = { ...draft, aiHistory: cloneAiHistory(draft.aiHistory) };
  setDocumentCache(documentId, { draft: saved, saved });
  if (context.value?.document.document_id === documentId) {
    context.value.note.content = saved.note;
    context.value.summary.content = saved.summary;
    context.value.ai_history = saved.aiHistory;
  }
  await refreshDocuments();
  await refreshDocumentHealth(documentId);
  return true;
}

function scheduleMarkdownAutosave() {
  if (!markdownAutosavePrimed || !context.value) return;
  const documentId = context.value.document.document_id;
  if (markdownAutosaveTimer !== null) window.clearTimeout(markdownAutosaveTimer);
  if (librarySearchTimer !== null) window.clearTimeout(librarySearchTimer);
  markdownAutosaveDocumentId = documentId;
  markdownAutosaveTimer = window.setTimeout(() => {
    markdownAutosaveTimer = null;
    markdownAutosaveDocumentId = "";
    void autosaveMarkdownDraft(documentId);
  }, markdownAutosaveDelay);
}

async function flushMarkdownAutosave(documentId = selectedDocumentId.value) {
  if (markdownAutosaveTimer !== null && (!documentId || markdownAutosaveDocumentId === documentId)) {
    window.clearTimeout(markdownAutosaveTimer);
    markdownAutosaveTimer = null;
    const targetDocumentId = markdownAutosaveDocumentId;
    markdownAutosaveDocumentId = "";
    if (targetDocumentId) await autosaveMarkdownDraft(targetDocumentId);
    return;
  }
  if (documentId && isDocumentDirty(documentId)) await autosaveMarkdownDraft(documentId);
}

async function autosaveMarkdownDraft(documentId: string) {
  if (markdownAutosaveRunning) {
    markdownAutosaveQueued = true;
    return;
  }
  markdownAutosaveRunning = true;
  try {
    const saved = await saveDocumentDraft(documentId);
    if (!saved && selectedDocumentId.value === documentId) showNotice("Auto-save failed");
  } catch (cause) {
    if (selectedDocumentId.value === documentId) showNotice(cause instanceof Error ? cause.message : String(cause));
  } finally {
    markdownAutosaveRunning = false;
    if (markdownAutosaveQueued) {
      markdownAutosaveQueued = false;
      const nextDocumentId = selectedDocumentId.value;
      if (nextDocumentId) void autosaveMarkdownDraft(nextDocumentId);
    }
  }
}

async function saveTitle() {
  await lifecycleSaveTitle();
  if (!context.value) return;
  const documentId = context.value.document.document_id;
  const entry = cacheEntryForDocument(documentId);
  const saved = createDraftState(context.value.document, noteDraft.value, summaryDraft.value, aiMessages.value);
  setDocumentCache(documentId, {
    draft: entry ? { ...entry.draft, title: saved.title } : saved,
    saved: entry ? { ...entry.saved, title: saved.title } : saved,
  });
}

async function saveNote() {
  await lifecycleSaveNote();
  if (!context.value) return;
  const documentId = context.value.document.document_id;
  const entry = cacheEntryForDocument(documentId);
  if (!entry) return;
  setDocumentCache(documentId, {
    draft: { ...entry.draft, note: noteDraft.value },
    saved: { ...entry.saved, note: noteDraft.value },
  });
  await refreshDocumentHealth(documentId);
}

async function saveReaderm() {
  await lifecycleSaveReaderm();
  if (!context.value) return;
  const documentId = context.value.document.document_id;
  const entry = cacheEntryForDocument(documentId);
  const saved = createDraftState(context.value.document, noteDraft.value, summaryDraft.value, aiMessages.value);
  setDocumentCache(documentId, {
    draft: entry ? { ...entry.draft, note: saved.note } : saved,
    saved: entry ? { ...entry.saved, note: saved.note } : saved,
  });
  activeReadermReferenceId.value = context.value.readerm_references?.[0]?.reference_id || activeReadermReferenceId.value;
  await refreshDocumentHealth(documentId);
}

async function saveSummary() {
  await lifecycleSaveSummary();
  if (!context.value) return;
  const documentId = context.value.document.document_id;
  const entry = cacheEntryForDocument(documentId);
  if (!entry) return;
  setDocumentCache(documentId, {
    draft: { ...entry.draft, summary: summaryDraft.value },
    saved: { ...entry.saved, summary: summaryDraft.value },
  });
  await refreshDocumentHealth(documentId);
}

async function closeDocumentTab(documentId: string) {
  const index = openDocumentIds.value.indexOf(documentId);
  if (index === -1) return;
  await flushMarkdownAutosave(documentId);
  if (isDocumentDirty(documentId)) {
    const document = documents.value.find((item) => item.document_id === documentId);
    const choice = await window.paperReaderPlus.confirmSaveOnTabClose(document?.title || documentDraftCache.value[documentId]?.draft.title || "");
    if (choice === "cancel") return;
    if (choice === "save") {
      const saved = await saveDocumentDraft(documentId);
      if (!saved) return;
    }
  }
  const nextOpenIds = openDocumentIds.value.filter((id) => id !== documentId);
  openDocumentIds.value = nextOpenIds;
  const { [documentId]: _closed, ...remainingCache } = documentDraftCache.value;
  documentDraftCache.value = remainingCache;
  if (selectedDocumentId.value !== documentId) return;
  const nextDocumentId = nextOpenIds[index] || nextOpenIds[index - 1] || "";
  if (nextDocumentId) {
    await loadDocument(nextDocumentId);
    ensureLoadedDocumentCache();
  } else {
    clearActiveDocumentState();
  }
}

async function deleteDocument(document: LibraryDocument) {
  await lifecycleDeleteDocument(document);
  openDocumentIds.value = openDocumentIds.value.filter((id) => id !== document.document_id);
  const { [document.document_id]: _deleted, ...remainingCache } = documentDraftCache.value;
  documentDraftCache.value = remainingCache;
}

async function deleteCurrentDocument() {
  const documentId = selectedDocumentId.value;
  await lifecycleDeleteCurrentDocument();
  if (!documentId) return;
  openDocumentIds.value = openDocumentIds.value.filter((id) => id !== documentId);
  const { [documentId]: _deleted, ...remainingCache } = documentDraftCache.value;
  documentDraftCache.value = remainingCache;
}

function registerCurrentDocumentTab() {
  if (!context.value || !selectedDocumentId.value) return;
  addOpenDocumentTab(selectedDocumentId.value);
  ensureLoadedDocumentCache();
}

async function importPdf() {
  cacheCurrentDocumentDraft();
  await lifecycleImportPdf();
  registerCurrentDocumentTab();
}

async function importArxiv() {
  cacheCurrentDocumentDraft();
  await lifecycleImportArxiv();
  registerCurrentDocumentTab();
}

async function importReaderPackage() {
  cacheCurrentDocumentDraft();
  await lifecycleImportReaderPackage();
  registerCurrentDocumentTab();
}

async function importReadermPackage() {
  cacheCurrentDocumentDraft();
  await lifecycleImportReadermPackage();
  registerCurrentDocumentTab();
}

async function createReaderPackageFromPdf() {
  cacheCurrentDocumentDraft();
  await lifecycleCreateReaderPackageFromPdf();
  registerCurrentDocumentTab();
}

async function createReaderPackageFromMarkdown() {
  cacheCurrentDocumentDraft();
  await lifecycleCreateReaderPackageFromMarkdown();
  registerCurrentDocumentTab();
}

async function createEmptyReaderm() {
  cacheCurrentDocumentDraft();
  await lifecycleCreateEmptyReaderm();
  readermMode.value = "edit";
  registerCurrentDocumentTab();
}

async function createReadermFromMarkdown() {
  cacheCurrentDocumentDraft();
  await lifecycleCreateReadermFromMarkdown();
  registerCurrentDocumentTab();
}

function startDropFilePath(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0];
  return file ? ((file as File & { path?: string }).path || "") : "";
}

function handleStartDragEnter(event: DragEvent) {
  event.preventDefault();
  startDropDepth.value += 1;
  startDropActive.value = true;
}

function handleStartDragOver(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  startDropActive.value = true;
}

function handleStartDragLeave(event: DragEvent) {
  event.preventDefault();
  startDropDepth.value = Math.max(0, startDropDepth.value - 1);
  if (startDropDepth.value === 0) startDropActive.value = false;
}

async function handleStartDrop(event: DragEvent) {
  event.preventDefault();
  startDropDepth.value = 0;
  startDropActive.value = false;
  const filePath = startDropFilePath(event);
  if (!filePath) {
    showNotice(t("app.dropFileUnavailable"));
    return;
  }
  try {
    cacheCurrentDocumentDraft();
    const document = await window.paperReaderPlus.importDroppedFile(filePath);
    if (!document) return;
    await refreshDocuments();
    const kind = document.source_type === "readerm" ? "ReaderM" : document.readerp_path ? "ReaderP" : "document";
    showNotice(t("app.dropImported", { kind }));
    await openDocument(document.document_id);
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
}

async function exportCurrentReaderPackage() {
  cacheCurrentDocumentDraft();
  if (context.value) {
    const report = await window.paperReaderPlus.getDocumentHealth(context.value.document.document_id);
    healthReports.value = { ...healthReports.value, [report.document_id]: report };
    if (report.status === "error") showNotice(`Exporting with ${report.issues.length} health issue(s)`);
  }
  await lifecycleExportCurrentReaderPackage();
}

async function exportCurrentReadermPackage() {
  cacheCurrentDocumentDraft();
  if (context.value) {
    const report = await window.paperReaderPlus.getDocumentHealth(context.value.document.document_id);
    healthReports.value = { ...healthReports.value, [report.document_id]: report };
    if (report.status === "error") showNotice(`Exporting with ${report.issues.length} health issue(s)`);
  }
  await lifecycleExportCurrentReadermPackage();
}

async function exportMarkdownReaderPackage() {
  cacheCurrentDocumentDraft();
  if (context.value) {
    const report = await window.paperReaderPlus.getDocumentHealth(context.value.document.document_id);
    healthReports.value = { ...healthReports.value, [report.document_id]: report };
    if (report.status === "error") showNotice(`Exporting with ${report.issues.length} health issue(s)`);
  }
  await lifecycleExportMarkdownReaderPackage();
}

async function splitCurrentReaderPackage() {
  cacheCurrentDocumentDraft();
  await lifecycleSplitCurrentReaderPackage();
}

onMounted(async () => {
  if (isHelpPage) return;
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("pointerdown", handleGlobalPointerDown);
  unsubscribeMenuAction = window.paperReaderPlus.onMenuAction(handleMenuAction);
  unsubscribeCloseRequest = window.paperReaderPlus.onCloseRequest(handleCloseRequest);
  unsubscribeOpenFileRequest = window.paperReaderPlus.onOpenFileRequest((documentId) => void handleOpenFileRequest(documentId));
  await loadSettings();
  await loadDictionary();
  await refreshDocuments();
});

onBeforeUnmount(() => {
  if (markdownAutosaveTimer !== null) window.clearTimeout(markdownAutosaveTimer);
  markdownAutosaveDocumentId = "";
  if (context.value) cacheCurrentDocumentDraft();
  cancelActiveAiStream();
  window.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("pointerdown", handleGlobalPointerDown);
  keepReferencePreviewOpen();
  unsubscribeMenuAction?.();
  unsubscribeCloseRequest?.();
  unsubscribeOpenFileRequest?.();
});

watch(currentPageNumber, (page) => {
  pageJumpDraft.value = String(page);
});

watch(searchMatches, (matches) => {
  syncActiveSearchMatch();
});

watch(documents, (items) => {
  const existingIds = new Set(items.map((document) => document.document_id));
  openDocumentIds.value = openDocumentIds.value.filter((documentId) => existingIds.has(documentId));
  if (readermManualPdfDocumentId.value && !existingIds.has(readermManualPdfDocumentId.value)) {
    readermManualPdfDocumentId.value = "";
    readermManualPdfAnchorId.value = "";
  }
  const nextCache: Record<string, DocumentDraftCacheEntry> = {};
  for (const [documentId, entry] of Object.entries(documentDraftCache.value)) {
    if (existingIds.has(documentId)) nextCache[documentId] = entry;
  }
  documentDraftCache.value = nextCache;
  void refreshVisibleHealth();
});

watch(librarySearchQuery, (query) => {
  if (librarySearchTimer !== null) window.clearTimeout(librarySearchTimer);
  const clean = query.trim();
  if (!clean) {
    librarySearchResults.value = [];
    librarySearchLoading.value = false;
    return;
  }
  librarySearchLoading.value = true;
  librarySearchTimer = window.setTimeout(async () => {
    try {
      librarySearchResults.value = await window.paperReaderPlus.searchLibrary(clean);
    } catch (cause) {
      showNotice(cause instanceof Error ? cause.message : String(cause));
      librarySearchResults.value = [];
    } finally {
      librarySearchLoading.value = false;
      librarySearchTimer = null;
    }
  }, 180);
});

watch(() => context.value?.document.document_id, () => {
  readermManualPdfDocumentId.value = "";
  readermManualPdfAnchorId.value = "";
  markdownAutosavePrimed = false;
  if (markdownAutosaveTimer !== null) {
    window.clearTimeout(markdownAutosaveTimer);
    markdownAutosaveTimer = null;
    markdownAutosaveDocumentId = "";
  }
  void Promise.resolve().then(() => {
    markdownAutosavePrimed = true;
  });
});

watch([noteDraft, summaryDraft], () => {
  cacheCurrentDocumentDraft();
  scheduleMarkdownAutosave();
});

watch(readermReferences, (references) => {
  if (!references.length) {
    activeReadermReferenceId.value = "";
    return;
  }
  if (!references.some((reference) => reference.reference_id === activeReadermReferenceId.value)) {
    activeReadermReferenceId.value = references[0].reference_id;
  }
});

function handleKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".readerm-pdf-pane")) return;
    event.preventDefault();
    searchOpen.value = true;
    return;
  }
  if (event.key !== "Escape") return;
  annotationToolMode.value = "select";
  pendingImageInsert.value = null;
  selectionState.value = null;
  activeAnnotation.value = null;
  activeAnchor.value = null;
  annotationCommentEditor.value = null;
  searchOpen.value = false;
}

function handleGlobalPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  if (target.closest(".annotation-comment-popover")) return;
  if (annotationCommentEditor.value) void saveAnnotationCommentEditor();
  if (target.closest(".selection-toolbar, .reference-preview, .popover, .pdf-toolbar, .app-menu, .modal, .pdf-paragraph-action, .pdf-paragraph-menu")) return;
  selectionState.value = null;
  if (!target.closest(".annotation-overlay, .note-marker, .annotation-card, .right-panel")) {
    activeAnnotation.value = null;
    activeAnchor.value = null;
  }
  searchOpen.value = false;
}

function handleMenuAction(action: Parameters<typeof window.paperReaderPlus.onMenuAction>[0] extends (action: infer T) => void ? T : never) {
  const actions = {
    "import-pdf": () => void importPdf(),
    "import-arxiv": () => { arxivImportOpen.value = true; },
    "import-readerp": () => void importReaderPackage(),
    "import-readerm": () => void importReadermPackage(),
    "create-readerp-from-pdf": () => void createReaderPackageFromPdf(),
    "create-readerp-from-markdown": () => void createReaderPackageFromMarkdown(),
    "create-readerm-empty": () => void createEmptyReaderm(),
    "create-readerm-from-markdown": () => void createReadermFromMarkdown(),
    "export-readerp": () => void exportCurrentReaderPackage(),
    "export-readerm": () => context.value?.document.source_type === "readerm" ? void exportCurrentReadermPackage() : showNotice(t("readerm.openBeforeExport")),
    "export-markdown-readerp": () => void exportMarkdownReaderPackage(),
    "split-readerp": () => void splitCurrentReaderPackage(),
    "attach-latex": () => void attachLatexSource(),
    "toggle-panel": () => { if (context.value) rightPanelCollapsed.value = !rightPanelCollapsed.value; },
    "select-tool": () => { annotationToolMode.value = "select"; selectionState.value = null; },
    "highlight-tool": () => handleAnnotationToolMode("highlight"),
    "underline-tool": () => handleAnnotationToolMode("underline"),
    "note-tool": () => { annotationToolMode.value = "select"; },
    "image-tool": () => handleAnnotationToolMode("image"),
    "copy-quote": () => void copyQuote(),
    "quote-to-note": () => void quoteToNote(),
    "ask-ai": () => void askAiAboutSelection(),
    "translate-selection": () => void translateSelection(),
    "toggle-search": openSearch,
    "toggle-outline": () => { libraryCollapsed.value = false; },
    "settings-agent-api": () => { activeSettingsPanel.value = "agent-api"; },
    "settings-translation-api": () => { activeSettingsPanel.value = "translation-api"; },
    "settings-network-proxy": () => { activeSettingsPanel.value = "network-proxy"; },
    "settings-file-associations": () => { void openFileAssociationSettings(); },
    "settings-system-prompt": () => { activeSettingsPanel.value = "system-prompt"; },
    "settings-summary-prompt": () => { activeSettingsPanel.value = "summary-prompt"; },
  } satisfies Record<string, () => void>;
  actions[action]?.();
}

function showNotice(message: string) {
  notice.value = message;
  window.setTimeout(() => {
    if (notice.value === message) notice.value = "";
  }, 2600);
}

async function loadSettings() {
  settings.value = await window.paperReaderPlus.getSettings();
  setUiLanguage(settings.value.ui_language);
  promptTemplates.value = await window.paperReaderPlus.getPromptTemplates();
  fileAssociationStatus.value = await window.paperReaderPlus.getFileAssociationStatus();
}

async function openFileAssociationSettings() {
  activeSettingsPanel.value = "file-associations";
  try {
    fileAssociationStatus.value = await window.paperReaderPlus.getFileAssociationStatus();
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
}

async function loadDictionary() {
  dictionaryEntries.value = await window.paperReaderPlus.listDictionary();
}

async function saveSettings() {
  if (!settings.value) return;
  settings.value = await window.paperReaderPlus.updateSettings(toIpcPlainObject(settings.value));
  setUiLanguage(settings.value.ui_language);
  activeSettingsPanel.value = null;
  showNotice(t("app.settingsSaved"));
}

async function registerFileAssociations() {
  if (fileAssociationBusy.value) return;
  fileAssociationBusy.value = true;
  try {
    fileAssociationStatus.value = await window.paperReaderPlus.registerFileAssociations();
    showNotice(t(fileAssociationStatus.value.associated ? "settings.fileAssociationsBoundNotice" : "settings.fileAssociationsPartialNotice"));
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  } finally {
    fileAssociationBusy.value = false;
  }
}

async function handleOpenFileRequest(payload: string | LibraryDocument) {
  const documentId = typeof payload === "string" ? payload : payload.document_id;
  if (!documentId) return;
  cacheCurrentDocumentDraft();
  await refreshDocuments();
  showNotice(t("app.dropImported", { kind: "Reader package" }));
  await openDocument(documentId);
}

async function openDocumentFile(document: LibraryDocument) {
  try {
    await window.paperReaderPlus.openDocumentFile(document.document_id);
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
}

async function showDocumentInFolder(document: LibraryDocument) {
  try {
    await window.paperReaderPlus.showDocumentInFolder(document.document_id);
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
}

async function showDocumentProperties(document: LibraryDocument) {
  try {
    await window.paperReaderPlus.showDocumentProperties(document.document_id);
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
}

async function handleDocumentContextMenu(document: LibraryDocument) {
  try {
    const result = await window.paperReaderPlus.showDocumentContextMenu(document.document_id);
    if (result?.action === "cleanup") {
      if (selectedDocumentId.value === result.documentId) {
        context.value = await window.paperReaderPlus.getDocumentContext(result.documentId);
      }
      await refreshDocumentHealth(result.documentId);
      const cleanup = result.cleanup;
      showNotice(cleanup ? `Cleaned ${cleanup.removed_anchors} anchors and ${cleanup.removed_assets} assets` : "Cleanup complete");
      return;
    }
    if (result?.action !== "delete") return;
    if (selectedDocumentId.value === result.documentId) {
      clearActiveDocumentState();
    }
    openDocumentIds.value = openDocumentIds.value.filter((id) => id !== result.documentId);
    const { [result.documentId]: _deleted, ...remainingCache } = documentDraftCache.value;
    documentDraftCache.value = remainingCache;
    await refreshDocuments();
    showNotice(result.mode === "file" ? "File deleted" : "History record deleted");
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
}

async function openLibrarySearchResult(result: LibrarySearchResult) {
  await openDocument(result.document_id);
  if (!result.anchor_id || !context.value) return;
  const anchor = context.value.anchors.find((item) => item.anchor_id === result.anchor_id);
  if (anchor) scrollToPage(anchor.page_index, { rectsPct: anchor.rects_pct, block: "center" });
  else if (typeof result.page_index === "number") scrollToPage(result.page_index, { block: "center" });
}

async function handleCloseRequest() {
  if (closeRequestRunning) return;
  closeRequestRunning = true;
  try {
    cacheCurrentDocumentDraft();
    await flushMarkdownAutosave();
    const dirtyDocumentId = openDocumentIds.value.find((documentId) => isDocumentDirty(documentId));
    if (!dirtyDocumentId) {
      await window.paperReaderPlus.finishCloseRequest(true);
      return;
    }
    const dirtyDocument = documents.value.find((document) => document.document_id === dirtyDocumentId);
    const choice = await window.paperReaderPlus.confirmSaveOnClose(dirtyDocument?.title || documentDraftCache.value[dirtyDocumentId]?.draft.title || "");
    if (choice === "cancel") {
      await window.paperReaderPlus.finishCloseRequest(false);
      return;
    }
    if (choice === "save") {
      for (const documentId of openDocumentIds.value.filter((id) => isDocumentDirty(id))) {
        const saved = await saveDocumentDraft(documentId);
        if (!saved) {
          await window.paperReaderPlus.finishCloseRequest(false);
          return;
        }
      }
    }
    await window.paperReaderPlus.finishCloseRequest(true);
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
    await window.paperReaderPlus.finishCloseRequest(false);
  } finally {
    closeRequestRunning = false;
  }
}

async function testAgentSettings() {
  if (!settings.value || settingsTesting.value) return;
  settingsTesting.value = "agent";
  try {
    const result = await window.paperReaderPlus.testAgentSettings(toIpcPlainObject(settings.value));
    showNotice(t("app.agentTestOk", { content: result.content || t("app.connected") }));
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  } finally {
    settingsTesting.value = null;
  }
}

async function testTranslationSettings() {
  if (!settings.value || settingsTesting.value) return;
  settingsTesting.value = "translation";
  try {
    const result = await window.paperReaderPlus.testTranslationSettings(toIpcPlainObject(settings.value));
    showNotice(t("app.translationTestOk", { content: result.content || t("app.connected") }));
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  } finally {
    settingsTesting.value = null;
  }
}

async function copyTranslationResult() {
  const content = translationModal.value?.translatedText || "";
  if (!content) return;
  try {
    await navigator.clipboard.writeText(content);
    showNotice(t("app.translationCopied"));
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
}

function handleTextItems(payload: { pageIndex: number; items: PdfTextItem[] }) {
  pageTextItems.value = { ...pageTextItems.value, [payload.pageIndex]: payload.items };
  if (payload.pageIndex === 0 && context.value) {
    const document = context.value.document;
    authorDocuments.value = {
      ...authorDocuments.value,
      [document.document_id]: {
        document_id: document.document_id,
        title: document.title,
        pageTextItems: { 0: payload.items },
      },
    };
  }
}

async function handleParagraphAction(payload: {
  action: "translate" | "quote" | "askAi";
  pageIndex: number;
  text: string;
  rectsPct: RectPct[];
  position: { left: number; top: number; bottom?: number };
}) {
  selectionState.value = {
    pageIndex: payload.pageIndex,
    text: payload.text,
    rectsPct: payload.rectsPct,
    position: payload.position,
  };
  window.getSelection()?.removeAllRanges();
  if (payload.action === "quote") {
    await copyQuote();
  } else if (payload.action === "translate") {
    await translateSelection({ paragraphCache: { pageIndex: payload.pageIndex } });
  } else {
    await askAiAboutSelection();
  }
}

function handleAuthorHover(payload: AuthorHoverPreview) {
  authorPreview.value = payload;
}

function clearAuthorHover() {
  authorPreview.value = null;
}

function handleDictionaryHover(payload: DictionaryHoverPreview) {
  dictionaryPreview.value = payload;
}

function clearDictionaryHover() {
  dictionaryPreview.value = null;
}

function handleSymbolClick(payload: { symbol: string; pageIndex: number }) {
  const definition = findSymbolDefinition(symbols.value, payload.symbol);
  activeSymbol.value = normalizeSymbol(payload.symbol);
  rightPanelCollapsed.value = false;
  rightPanelTab.value = "symbols";
  if (!definition) {
    showNotice(t("app.noDefinition", { symbol: payload.symbol }));
    return;
  }
  activeSymbol.value = definition.normalized_symbol;
  if (definition.page_index !== undefined) scrollToPage(definition.page_index, { rectsPct: definition.rects_pct, block: "center" });
}

function selectSymbolDefinition(symbol: SymbolDefinition) {
  activeSymbol.value = symbol.normalized_symbol;
  if (symbol.page_index !== undefined) scrollToPage(symbol.page_index, { rectsPct: symbol.rects_pct, block: "center" });
}

function updateSymbolDefinition(symbol: SymbolDefinition) {
  activeSymbol.value = saveSymbolDefinition(symbol);
}

function setSymbolAnchor(symbol: SymbolDefinition) {
  if (!selectionState.value?.rectsPct.length) {
    showNotice(t("app.selectTextFirst"));
    return;
  }
  updateSymbolDefinition({
    ...symbol,
    page_index: selectionState.value.pageIndex,
    rects_pct: selectionState.value.rectsPct,
    paragraph: selectionState.value.text.trim() || symbol.paragraph,
    user_modified: true,
  });
}

function deleteSymbolDefinition(symbol: SymbolDefinition) {
  removeSymbolDefinition(symbol);
  activeSymbol.value = "";
}

function jumpToPage() {
  const page = Math.min(totalPages.value, Math.max(1, Number.parseInt(pageJumpDraft.value, 10) || 1));
  scrollToPage(page - 1);
}

function handleOutlineItemClick(item: { id: string; page_index: number }) {
  if (context.value?.document.source_type !== "readerm") {
    scrollToPage(item.page_index);
    return;
  }
  document
    .querySelector<HTMLElement>(`[data-readerm-heading-id="${CSS.escape(item.id)}"]`)
    ?.scrollIntoView({ block: "start", behavior: "smooth" });
}

function toggleSearch() {
  searchOpen.value = !searchOpen.value;
}

function openSearch() {
  searchOpen.value = true;
}

function handleMarkdownLink(payload: { href: string; event: MouseEvent }) {
  const target = parseReaderAnchorHref(payload.href);
  if (!target) return;
  payload.event.preventDefault();
  if (target.documentId !== selectedDocumentId.value) {
    void openDocument(target.documentId).then(() => focusAnchor(target.anchorId));
  } else {
    focusAnchor(target.anchorId);
  }
}

async function handleReadermLink(payload: { href: string; event: MouseEvent }) {
  const target = parseReaderAnchorHref(payload.href);
  if (!target) return;
  payload.event.preventDefault();
  let reference = readermReferences.value.find((item) => item.document_id === target.documentId && item.anchor_id === target.anchorId);
  if (!reference && context.value?.document.source_type === "readerm") {
    await window.paperReaderPlus.saveNote(context.value.document.document_id, noteDraft.value);
    refreshReadermContext(await window.paperReaderPlus.getDocumentContext(context.value.document.document_id));
    reference = readermReferences.value.find((item) => item.document_id === target.documentId && item.anchor_id === target.anchorId);
  }
  if (!reference) {
    readermManualPdfDocumentId.value = target.documentId;
    readermManualPdfAnchorId.value = target.anchorId;
    readermPdfCollapsed.value = false;
    showNotice(t("readerm.openingUnindexedReference"));
    return;
  }
  activeReadermReferenceId.value = reference.reference_id;
  readermManualPdfDocumentId.value = target.documentId;
  readermManualPdfAnchorId.value = target.anchorId;
  readermPdfCollapsed.value = false;
  readermPdfNavigationKey.value += 1;
}

function selectReadermReference(reference: ReadermReference) {
  readermManualPdfDocumentId.value = "";
  readermManualPdfAnchorId.value = "";
  activeReadermReferenceId.value = reference.reference_id;
  readermPdfCollapsed.value = false;
  readermPdfNavigationKey.value += 1;
  if (reference.status !== "resolved") {
    showNotice(reference.status === "missing-anchor" ? t("readerm.anchorMissing") : t("readerm.documentMissing"));
  }
}

function selectReadermHistoryPdf(documentId: string) {
  readermManualPdfDocumentId.value = documentId;
  readermManualPdfAnchorId.value = "";
}

function refreshReadermContext(nextContext: DocumentContext) {
  if (!context.value || context.value.document.document_id !== nextContext.document.document_id) return;
  context.value = nextContext;
  titleDraft.value = nextContext.document.title;
  noteDraft.value = nextContext.note.content;
  summaryDraft.value = nextContext.summary.content;
  aiMessages.value = nextContext.ai_history || [];
  savedSymbols.value = nextContext.symbols || [];
  const saved = createDraftState(nextContext.document, noteDraft.value, summaryDraft.value, aiMessages.value);
  setDocumentCache(nextContext.document.document_id, { draft: saved, saved });
  void refreshDocumentHealth(nextContext.document.document_id);
}

function captureReadermRegion(selection?: { start: number; end: number }) {
  if (readermPdfCollapsed.value) readermPdfCollapsed.value = false;
  if (readermMode.value === "preview") readermMode.value = "live";
  readermCaptureRequest.value = { requestId: Date.now(), selection };
}

function clampReadermPdfPaneWidth(width: number) {
  const minMarkdownWidth = 500;
  const minPdfWidth = 520;
  const maxPdfWidth = 900;
  const layoutWidth = document.querySelector<HTMLElement>(".readerm-layout")?.clientWidth || 1200;
  const maxByLayout = Math.max(minPdfWidth, layoutWidth - minMarkdownWidth - readermResizeHandleWidth);
  return Math.min(maxPdfWidth, Math.max(minPdfWidth, Math.min(width, maxByLayout)));
}

function startReadermResize(event: PointerEvent) {
  event.preventDefault();
  const handle = event.currentTarget as HTMLElement;
  handle.setPointerCapture(event.pointerId);
  document.body.classList.add("resizing");
  const startX = event.clientX;
  const startWidth = readermPdfPaneWidth.value;

  const onMove = (moveEvent: PointerEvent) => {
    const delta = startX - moveEvent.clientX;
    readermPdfPaneWidth.value = clampReadermPdfPaneWidth(startWidth + delta);
  };
  const onUp = (upEvent: PointerEvent) => {
    if (handle.hasPointerCapture(upEvent.pointerId)) handle.releasePointerCapture(upEvent.pointerId);
    document.body.classList.remove("resizing");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

function focusAnchor(anchorId: string) {
  const anchor = context.value?.anchors.find((item) => item.anchor_id === anchorId);
  if (!anchor) {
    showNotice(t("app.anchorNotFound"));
    return;
  }
  activeAnchor.value = anchor;
  scrollToPage(anchor.page_index, { rectsPct: anchor.rects_pct, block: "center" });
}

</script>

<template>
  <HelpPage v-if="isHelpPage" />
  <main v-else class="app-shell">
    <ReaderSidebar
      v-model:collapsed="libraryCollapsed"
      :documents="documents"
      :selected-document-id="selectedDocumentId"
      :pdf-document="pdfDocument"
      :page-numbers="pageNumbers"
      :current-page-number="currentPageNumber"
      :outline-items="activeOutlineItems"
      :health-reports="healthReports"
      v-model:search-query="librarySearchQuery"
      :search-results="librarySearchResults"
      :search-loading="librarySearchLoading"
      @import-pdf="importPdf"
      @import-arxiv="arxivImportOpen = true"
      @create-empty-readerm="createEmptyReaderm"
      @create-readerm-from-markdown="createReadermFromMarkdown"
      @open-document="openDocument"
      @document-context-menu="handleDocumentContextMenu"
      @delete-document="deleteDocument"
      @open-search-result="openLibrarySearchResult"
      @scroll-to-page="scrollToPage"
      @outline-item-click="handleOutlineItemClick"
    />

    <section class="workspace">
      <ReaderFileTabs
        :documents="documents"
        :open-document-ids="openDocumentIds"
        :active-document-id="selectedDocumentId"
        @open-document="openDocument"
        @close-tab="closeDocumentTab"
      />

      <div
        v-if="!context"
        class="start-screen"
        :class="{ 'drag-over': startDropActive }"
        @dragenter="handleStartDragEnter"
        @dragover="handleStartDragOver"
        @dragleave="handleStartDragLeave"
        @drop="handleStartDrop"
      >
        <h1>Paper Reader Plus</h1>
        <p>{{ t("app.tagline") }}</p>
        <p class="start-drop-hint">{{ t("app.dropHint") }}</p>
        <div class="start-actions">
          <div class="start-action-row">
            <button type="button" class="primary" @click="importPdf"><FilePlus2 :size="18" /> {{ t("app.importPdf") }}</button>
            <button type="button" class="primary" @click="createEmptyReaderm"><FileText :size="18" /> {{ t("app.createEmptyReaderm") }}</button>
          </div>
          <div class="start-action-row">
            <button type="button" class="secondary" @click="arxivImportOpen = true">{{ t("app.importArxiv") }}</button>
            <button type="button" class="secondary" @click="createReadermFromMarkdown">{{ t("app.createReadermFromMarkdown") }}</button>
          </div>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
      </div>

      <template v-else>
        <section
          v-if="context.document.source_type === 'readerm'"
          class="readerm-layout"
          :class="{ 'pdf-collapsed': readermPdfCollapsed }"
          :style="readermLayoutStyle"
        >
          <ReadermWorkspace
            v-model:title-draft="titleDraft"
            v-model:markdown="noteDraft"
            v-model:mode="readermMode"
            :title="documentTitle"
            :editing-title="editingTitle"
            :document-id="context.document.document_id"
            :references="readermReferences"
            :active-reference-id="activeReadermReference?.reference_id || ''"
            @edit-title="editingTitle = true"
            @save-title="saveTitle"
            @save="saveReaderm"
            @export="exportCurrentReadermPackage"
            @capture-region="captureReadermRegion"
            @paste-image="pasteImageAsset({ target: 'notes', ...$event })"
            @resize-image="resizeMarkdownAssetImage({ target: 'notes', assetPath: $event.assetPath })"
            @link-click="handleReadermLink"
          />
          <button
            v-if="!readermPdfCollapsed"
            type="button"
            class="resize-handle"
            :title="t('readerm.resizePdf')"
            @pointerdown="startReadermResize"
            @dblclick="readermPdfCollapsed = true"
          />
          <PdfReaderPane
            v-if="!readermPdfCollapsed"
            v-model:note-draft="noteDraft"
            :document-id="readermPdfDocumentId"
            :anchor-id="readermPdfAnchorId"
            :navigation-key="readermPdfNavigationKey"
            :history-documents="historyPdfDocuments"
            :readerm-document-id="context.document.document_id"
            :capture-request="readermCaptureRequest"
            :settings="settings"
            @translation-modal="translationModal = $event"
            @notice="showNotice"
            @select-document="selectReadermHistoryPdf"
            @open-document="openDocument"
            @readerm-indexed="refreshReadermContext"
          />
          <button
            v-else
            type="button"
            class="readerm-pdf-collapsed"
            :title="t('readerm.expandPdf')"
            @click="readermPdfCollapsed = false"
          >
            PDF
          </button>
        </section>

        <ReaderLayout v-else v-model:collapsed="rightPanelCollapsed" v-model:right-panel-width="rightPanelWidth" v-model:active-tab="rightPanelTab">
          <template #pdf>
            <PdfWorkspace
              v-model:title-draft="titleDraft"
              v-model:page-jump-draft="pageJumpDraft"
              v-model:search-query="searchQuery"
              v-model:annotation-color="annotationColor"
              :annotation-tool-mode="annotationToolMode"
              :document-title="documentTitle"
              :editing-title="editingTitle"
              :pdf-zoom="pdfZoom"
              :total-pages="totalPages"
              :search-open="searchOpen"
              :active-search-index="activeSearchIndex"
              :search-matches-length="searchMatches.length"
              :loading="loading"
              :error="error"
              :page-numbers="pageNumbers"
              :pdf-document="pdfDocument"
              :page-render-width="pageRenderWidth"
              :active-anchor="activeAnchor"
              :annotations="annotations"
              :active-annotation="activeAnnotation"
              :search-matches="visibleSearchMatches"
              :active-search-match="visibleActiveSearchMatch"
              :has-selection="Boolean(selectionState)"
              :reference-preview-fixed="referencePreviewFixed"
              :reference-preview-fixed-position="referencePreviewFixedPosition"
              :reference-preview="referencePreview"
              :pdf-link-return-target="pdfLinkReturnTarget"
              :author-profiles="authorProfiles"
              :author-preview="authorPreview"
              :dictionary-entries="dictionaryEntries"
              :dictionary-preview="dictionaryPreview"
              :can-open-annotations="!context.document.readerp_path"
              @edit-title="editingTitle = true"
              @save-title="saveTitle"
              @zoom="zoom"
              @reset-zoom="resetZoom"
              @undo="undoLastAnnotation"
              @jump-to-page="jumpToPage"
              @toggle-search="toggleSearch"
              @open-current-page-preview="openCurrentPagePreview"
              @show-annotations="rightPanelCollapsed = false; rightPanelTab = 'annotations'"
              @update:annotation-tool-mode="handleAnnotationToolMode"
              @delete-document="deleteCurrentDocument"
              @quote="copyQuote"
              @quote-to-note="quoteToNote"
              @translate="translateSelection"
              @ask-ai="askAiAboutSelection"
              @previous-search="nextSearch(-1)"
              @next-search="nextSearch(1)"
              @wheel="handleWheel"
              @scroll-element="setPdfScrollElement"
              @selection="handleSelection"
              @annotation-click="handleAnnotationClick"
              @rendered="setPageElement($event.pageIndex, $event.element)"
              @text-items="handleTextItems"
              @image-selection="copyImageSelection"
              @link-click="handlePdfLinkClick"
              @link-preview="handlePdfLinkPreview"
              @reference-preview="handleReferencePreview"
              @reference-jump="handleReferenceJump"
              @clear-reference-preview="clearReferencePreviewSoon"
              @close-reference-preview="closeReferencePreview"
              @keep-reference-preview="keepReferencePreviewOpen"
              @toggle-reference-preview-fixed="toggleReferencePreviewFixed"
              @move-reference-preview-fixed="moveReferencePreviewFixed"
              @jump-reference-preview="scrollToPage"
              @preview-reference-page="handlePreviewReferencePage"
              @return-reference-preview="handleReturnReferencePreview"
              @return-pdf-link-source="returnToPdfLinkSource"
              @close-pdf-link-return-target="closePdfLinkReturnTarget"
              @open-reference-spreadsheet="openReferenceSpreadsheet"
              @symbol-click="handleSymbolClick"
              @author-hover="handleAuthorHover"
              @clear-author-hover="clearAuthorHover"
              @open-author-document="openDocument"
              @dictionary-hover="handleDictionaryHover"
              @clear-dictionary-hover="clearDictionaryHover"
              @paragraph-action="handleParagraphAction"
            />
          </template>
          <template #right>
            <ReaderSidePanel
              v-model:active-tab="rightPanelTab"
              v-model:annotation-filters="annotationFilters"
              v-model:notes-mode="notesMode"
              v-model:summary-mode="summaryMode"
              v-model:note-draft="noteDraft"
              v-model:summary-draft="summaryDraft"
              v-model:ai-input="aiInput"
              :annotations="filteredAnnotations"
              :all-annotations="annotations"
              :all-annotation-count="annotations.length"
              :active-annotation="activeAnnotation"
            :agent-label="agentStatusLabel"
              :ai-messages="aiMessages"
              :ai-loading="aiLoading"
              :summary-waiting="summaryWaiting"
              :symbols="symbols"
              :active-symbol="activeSymbol"
              :symbol-refresh-progress="symbolRefreshProgress"
              :document-id="context.document.document_id"
              @collapse="rightPanelCollapsed = true"
              @save-note="saveNote"
              @save-summary="saveSummary"
              @insert-image="insertImageAsset"
              @paste-image="pasteImageAsset"
              @resize-image="resizeMarkdownAssetImage"
              @send-ai="handlePanelSendAi"
              @stop-ai="cancelActiveAiStream"
              @select-annotation="selectAnnotation"
              @update-annotation="updateAnnotation($event.annotation, $event.patch)"
              @delete-annotation="deleteAnnotation"
              @link-click="handleMarkdownLink"
              @select-symbol="selectSymbolDefinition"
              @update-symbol="updateSymbolDefinition"
              @set-symbol-anchor="setSymbolAnchor"
              @delete-symbol="deleteSymbolDefinition"
              @refresh-symbols="refreshSymbols"
            />
          </template>
        </ReaderLayout>

        <SelectionToolbar
          v-if="context.document.source_type !== 'readerm'"
          v-model:color="annotationColor"
          :selected-text="selectedText"
          :position="selectionState?.position || null"
          @copy="copySelectedText"
          @quote="copyQuote"
          @quote-to-note="quoteToNote"
          @annotate="createAnnotation"
          @translate="translateSelection"
          @metaphor="explainSelectionWithMetaphor"
          @ask-ai="askAiAboutSelection"
        />

        <section
          v-if="context.document.source_type !== 'readerm' && annotationCommentEditor"
          class="annotation-comment-popover"
          :style="annotationCommentEditorStyle"
          @pointerdown.stop
        >
          <div class="annotation-comment-tools">
            <div class="annotation-comment-type" role="group" :aria-label="t('annotation.type')">
              <button
                type="button"
                :title="t('annotation.type.highlight')"
                :class="{ active: annotationCommentEditor.type === 'highlight' }"
                @click="updateAnnotationCommentEditorType('highlight')"
              >
                <Highlighter :size="15" />
              </button>
              <button
                type="button"
                :title="t('annotation.type.underline')"
                :class="{ active: annotationCommentEditor.type === 'underline' }"
                @click="updateAnnotationCommentEditorType('underline')"
              >
                <Underline :size="15" />
              </button>
            </div>
            <div class="annotation-comment-colors" role="group" :aria-label="t('annotation.color')">
              <button
                v-for="color in ANNOTATION_COLORS"
                :key="color"
                type="button"
                :class="{ active: annotationCommentEditor.color.toLowerCase() === color.toLowerCase() }"
                :style="{ backgroundColor: color }"
                :title="t('annotation.color')"
                @click="updateAnnotationCommentEditorColor(color)"
              />
            </div>
          </div>
          <textarea
            ref="annotationCommentTextarea"
            :value="annotationCommentEditor.draft"
            :placeholder="t('annotation.addComment')"
            @input="annotationCommentEditor.draft = ($event.target as HTMLTextAreaElement).value"
            @keydown.ctrl.enter.prevent="saveAnnotationCommentEditor"
            @keydown.meta.enter.prevent="saveAnnotationCommentEditor"
          />
          <input
            :value="annotationCommentEditor.tagsDraft"
            :placeholder="t('annotation.addTags')"
            @input="annotationCommentEditor.tagsDraft = ($event.target as HTMLInputElement).value"
            @keydown.enter.prevent="saveAnnotationCommentEditor"
          />
        </section>

        <TableSheetModal
          v-if="context.document.source_type !== 'readerm'"
          :sheet="tableSheet"
          @close="tableSheet = null"
          @export-csv="exportTableCsv"
        />
      </template>

      <ArxivImportModal
        v-if="arxivImportOpen"
        v-model="arxivIdDraft"
        v-model:mode="arxivImportMode"
        :importing="arxivImporting"
        :progress="arxivImportProgress"
        @cancel="arxivImportOpen = false"
        @import="importArxiv"
      />

      <SettingsModal
        v-if="settings && activeSettingsPanel"
        :panel="activeSettingsPanel"
        :settings="settings"
        :prompt-template-preview="promptTemplatePreview"
        :testing="settingsTesting"
        :file-association-status="fileAssociationStatus"
        :file-association-busy="fileAssociationBusy"
        @close="activeSettingsPanel = null"
        @save="saveSettings"
        @test-agent="testAgentSettings"
        @test-translation="testTranslationSettings"
        @register-file-associations="registerFileAssociations"
      />

      <TranslationResultModal
        v-if="translationModal"
        :provider="translationModal.provider"
        :target-language="translationModal.targetLanguage"
        :source-text="translationModal.sourceText"
        :translated-text="translationModal.translatedText"
        :loading="translationModal.loading"
        :error="translationModal.error"
        :position="translationModal.position"
        @close="translationModal = null"
        @copy="copyTranslationResult"
      />
    </section>

    <div v-if="notice" class="toast">{{ notice }}</div>
  </main>
</template>
