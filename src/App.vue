<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { BookOpen, FilePlus, FilePlus2, FileText, Highlighter, PanelRightOpen, Underline } from "lucide-vue-next";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import PdfWorkspace from "@/components/PdfWorkspace.vue";
import PdfReaderPane from "@/components/PdfReaderPane.vue";
import MarkdownWorkspace from "@/components/MarkdownWorkspace.vue";
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
import ImageSizeModal from "@/components/ImageSizeModal.vue";
import SettingsModal, { type SettingsPanel } from "@/components/SettingsModal.vue";
import TranslationResultModal from "@/components/TranslationResultModal.vue";
import { usePdfDocument } from "@/composables/usePdfDocument";
import { usePdfPages } from "@/composables/usePdfPages";
import { usePdfSearch } from "@/composables/usePdfSearch";
import { useDocumentLifecycle } from "@/composables/useDocumentLifecycle";
import { useMarkdownImageActions } from "@/composables/useMarkdownImageActions";
import { useMarkdownZoom } from "@/composables/useMarkdownZoom";
import { usePdfPreviewActions } from "@/composables/usePdfPreviewActions";
import { useAnnotationActions } from "@/composables/useAnnotationActions";
import { useAiTranslationActions } from "@/composables/useAiTranslationActions";
import { useFormulaAnalysis } from "@/composables/useFormulaAnalysis";
import { useSymbolTracking } from "@/composables/useSymbolTracking";
import { useLibrarySearch } from "@/composables/useLibrarySearch";
import { useReaderTabs } from "@/composables/useReaderTabs";
import { useReadermOutline } from "@/composables/useReadermOutline";
import { setUiLanguage, useI18n } from "@/i18n";
import type { ArxivImportProgress } from "@/env";
import type { PdfHoverPreview, PdfTableSheet, PdfTextItem } from "@/pdf/pdfTypes";
import { toIpcPlainObject } from "@/services/IpcPayloadService";
import { parseReaderAnchorHref, parseReaderDocumentHref, type ReaderDocumentView, type ReaderSelection } from "@/services/ReaderAnchorService";
import { ANNOTATION_COLORS, annotationMatchesFilters, sortAnnotations, type AnnotationFilters, type AnnotationToolMode } from "@/services/ReaderAnnotationService";
import { buildAuthorNetwork, type AuthorDocumentInput } from "@/services/AuthorNetworkService";
import { findSymbolDefinition, normalizeSymbol } from "@/services/SymbolTrackerService";
import type { AiChatRequest, Anchor, Annotation, AnnotationType, AuthorHoverPreview, DictionaryEntry, DictionaryHoverPreview, DocumentContext, DocumentViewState, FileAssociationExtension, FileAssociationStatus, FormulaAnalysis, LibraryDocument, LibraryGroup, LibrarySearchResult, MarkdownEditorMode, PackageHealthReport, PromptTemplateStatus, ReaderPackageAiHistory, ReadermEditorMode, ReadermReference, RectPct, Settings, SymbolDefinition } from "@/types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const { t } = useI18n();
const isHelpPage = new URLSearchParams(window.location.search).has("help");

const documents = ref<LibraryDocument[]>([]);
const groups = ref<LibraryGroup[]>([]);
const selectedLibraryDocumentIds = ref<string[]>([]);
const lastSelectedLibraryDocumentId = ref("");
const recentGroupId = ref("default");
const groupNameDialog = ref<{
  open: boolean;
  title: string;
  value: string;
  confirmLabel: string;
  onConfirm: (name: string) => Promise<void> | void;
} | null>(null);
type GroupContextAction = "create-group" | "rename-group" | "delete-group" | "delete-history";
const groupContextMenu = ref<{
  group: LibraryGroup;
  x: number;
  y: number;
} | null>(null);
const groupRenameRequest = ref<{ groupId: string; requestId: number } | null>(null);
const healthReports = ref<Record<string, PackageHealthReport | undefined>>({});
const {
  librarySearchQuery,
  librarySearchResults,
  librarySearchLoading,
} = useLibrarySearch(showNotice);
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
  getViewState,
  restoreViewState: restorePdfViewState,
} = usePdfPages(pageNumbers);
const loading = ref(false);
const error = ref("");
const notice = ref("");
const noteDraft = ref("");
const {
  readermOutlineItems,
  refreshReadermOutlineNow,
  scheduleReadermOutlineRefresh,
  cancelReadermOutlineRefresh,
} = useReadermOutline(context, noteDraft);
const summaryDraft = ref("");
const titleDraft = ref("");
const editingTitle = ref(false);
const rightPanelTab = ref<RightPanelTab>("annotations");
const libraryCollapsed = ref(false);
const libraryWidth = ref(280);
const rightPanelCollapsed = ref(false);
const rightPanelWidth = ref(560);
const notesMode = ref<MarkdownEditorMode>("edit");
const summaryMode = ref<MarkdownEditorMode>("edit");
const readermMode = ref<ReadermEditorMode>("live");
const activeReadermReferenceId = ref("");
const readermManualPdfDocumentId = ref("");
const readermManualPdfAnchorId = ref("");
const readermPdfNavigationKey = ref(0);
const readermPdfCollapsed = ref(false);
const readermPdfPaneWidth = ref(640);
const readermCaptureRequest = ref<{ requestId: number; selection?: { start: number; end: number }; kind?: "image" | "formula" } | null>(null);
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
const formulas = ref<FormulaAnalysis[]>([]);
const activeSymbol = ref("");
const annotationColor = ref("#BBD4F6");
const pendingImageInsert = ref<{ target: "notes" | "summary"; selection?: { start: number; end: number }; kind?: "image" | "formula" } | null>(null);
const activeSettingsPanel = ref<SettingsPanel | null>(null);
const settingsDraft = ref<Settings | null>(null);
const arxivImportOpen = ref(false);
const arxivIdDraft = ref("");
const arxivImportMode = ref<"pdf" | "pdf-latex">("pdf-latex");
const arxivImporting = ref(false);
const arxivImportProgress = ref<ArxivImportProgress | null>(null);
const startDropActive = ref(false);
const startDropDepth = ref(0);
const settings = ref<Settings | null>(null);
const promptTemplates = ref<PromptTemplateStatus[]>([]);
const settingsTesting = ref<"agent" | "translation" | "simpletex" | null>(null);
const fileAssociationStatus = ref<FileAssociationStatus | null>(null);
const fileAssociationBusy = ref<FileAssociationExtension | "all" | null>(null);
const { setMarkdownFontSize } = useMarkdownZoom();
const aiInput = ref("");
const aiMessages = ref<ReaderPackageAiHistory>([]);
const aiSummaryOutputChars = ref<number | null>(null);
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
type ImageSizeInput = { width: string; height: string };
const {
  openDocumentIds,
  addOpenDocumentTab,
  closeOpenDocumentTab,
  filterOpenDocumentTabs,
} = useReaderTabs();
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
let viewStateSaveTimer: number | null = null;
let viewStateRestoring = false;
const viewStateSaveDelay = 700;
const markdownWorkspaceRef = ref<InstanceType<typeof MarkdownWorkspace> | null>(null);
const readermWorkspaceRef = ref<InstanceType<typeof ReadermWorkspace> | null>(null);
const readerSidePanelRef = ref<InstanceType<typeof ReaderSidePanel> | null>(null);
const readermLayoutRef = ref<HTMLElement | null>(null);
const readermLayoutWidth = ref(0);
let readermLayoutResizeObserver: ResizeObserver | null = null;
const imageSizeRequest = ref<{
  currentWidth: string;
  currentHeight: string;
  error: string;
  resolve: (value: ImageSizeInput | null) => void;
} | null>(null);

const documentTitle = computed(() => context.value?.document.title || "Paper Reader Plus");
const totalPages = computed(() => pageNumbers.value.length);
const selectedText = computed(() => selectionState.value?.text || "");
const annotations = computed(() => sortAnnotations(context.value?.annotations || []));
const filteredAnnotations = computed(() => annotations.value.filter((annotation) => annotationMatchesFilters(annotation, annotationFilters.value)));
const visibleSearchMatches = computed(() => searchOpen.value && searchQuery.value.trim() ? searchMatches.value : []);
const visibleActiveSearchMatch = computed(() => searchOpen.value && searchQuery.value.trim() ? activeSearchMatch.value : null);
const activeOutlineItems = computed(() => context.value?.document.source_type === "readerm" ? readermOutlineItems.value : outlineItems.value);
const readermReferences = computed(() => context.value?.readerm_references || []);
const readermReferencedDocuments = computed(() => context.value?.referenced_documents || []);
const activeReadermReference = computed(() => readermReferences.value.find((reference) => reference.reference_id === activeReadermReferenceId.value) || readermReferences.value[0] || null);
const historyPdfDocuments = computed(() => documents.value.filter((document) => document.source_type !== "markdown"));
const readermReferencedPdfDocumentId = computed(() => activeReadermReference.value?.status !== "missing-document" ? activeReadermReference.value?.document_id || "" : "");
const readermPdfDocumentId = computed(() => readermManualPdfDocumentId.value || readermReferencedPdfDocumentId.value);
const readermPdfAnchorId = computed(() => readermManualPdfDocumentId.value ? readermManualPdfAnchorId.value : activeReadermReference.value?.status === "resolved" ? activeReadermReference.value.anchor_id : "");
const readermPdfSourceView = ref<ReaderDocumentView>("pdf");
const libraryResizeHandleWidth = 4;
const libraryWidthMin = 220;
const libraryWidthMax = 420;
const readermResizeHandleWidth = 3;
const resizeDragUpdateIntervalMs = 50;
const libraryStyle = computed(() => ({
  "--library-width": `${clampLibraryWidth(libraryWidth.value)}px`,
}));
const appShellStyle = computed(() => ({
  gridTemplateColumns: `auto ${libraryCollapsed.value ? 0 : libraryResizeHandleWidth}px minmax(0, 1fr)`,
}));
const clampedReadermPdfPaneWidth = computed(() => clampReadermPdfPaneWidth(readermPdfPaneWidth.value));
const readermLayoutStyle = computed(() => ({
  gridTemplateColumns: readermPdfCollapsed.value
    ? "minmax(0, 1fr) 0 var(--rail-collapsed-width)"
    : `minmax(0, 1fr) ${readermResizeHandleWidth}px ${clampedReadermPdfPaneWidth.value}px`,
}));
const authorProfiles = computed(() => buildAuthorNetwork(Object.values(authorDocuments.value)));
const agentStatusLabel = computed(() => settings.value
  ? `${settings.value.ai_model} / docs/*.j2`
  : t("app.agentTemplates"));
const defaultMarkdownEditorMode = computed<MarkdownEditorMode>(() => {
  const mode = settings.value?.markdown_default_editor_mode;
  return mode === "edit" || mode === "preview" ? mode : "live";
});
const defaultReadermEditorMode = computed<ReadermEditorMode>(() => {
  if (defaultMarkdownEditorMode.value !== "edit") return defaultMarkdownEditorMode.value;
  return settings.value?.readerm_edit_split_default ? "edit-preview" : "edit";
});
const summaryWaiting = computed(() => aiLoading.value && pendingAiTask.value === "summary");
const promptTemplatePreview = computed(() => promptTemplates.value.map((template) => ({
  ...template,
  preview: template.content,
})));
const annotationCommentEditorStyle = computed(() => {
  const editor = annotationCommentEditor.value;
  if (!editor) return {};
  return {
    left: `${Math.min(Math.max(12, editor.position.left), Math.max(12, window.innerWidth - 392))}px`,
    top: `${Math.min(Math.max(12, editor.position.top), Math.max(12, window.innerHeight - 216))}px`,
  };
});
const groupContextMenuStyle = computed(() => {
  const menu = groupContextMenu.value;
  if (!menu) return {};
  const menuWidth = 204;
  const menuHeight = 142;
  return {
    left: `${Math.min(Math.max(8, menu.x), Math.max(8, window.innerWidth - menuWidth - 8))}px`,
    top: `${Math.min(Math.max(8, menu.y), Math.max(8, window.innerHeight - menuHeight - 8))}px`,
  };
});
const groupContextMenuItems = computed(() => {
  const menu = groupContextMenu.value;
  if (!menu) return [];
  const isDefault = menu.group.group_id === "default";
  return [
    { action: "create-group" as const, label: t("library.newGroup"), danger: false },
    ...isDefault ? [] : [
      { action: "rename-group" as const, label: t("library.renameGroup"), danger: false },
      { action: "delete-group" as const, label: t("library.deleteGroupOnly"), danger: false },
    ],
    { action: "delete-history" as const, label: t("library.deleteGroupHistory"), danger: true },
  ];
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
  formulas,
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
  settings,
  getInsertionSelection: getCurrentMarkdownInsertionSelection,
  showNotice,
  requestImageSize,
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
  settings,
  getNoteInsertionSelection: getCurrentNoteInsertionSelection,
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
  sendAiForTurnEdit,
  redoAiTurn,
  showAiTurnVersion,
  handlePanelSendAi,
  cancelActiveAiStream,
  requestSymbolAi,
  requestFormulaAi,
  askAiAboutFormula,
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
  aiSummaryOutputChars,
  translationModal,
  pageTextItems,
  pdfDocument,
  rightPanelCollapsed,
  rightPanelTab,
  ensureAnchor,
  showNotice,
  onAiHistorySaved: updateSavedAiHistorySnapshot,
  onSummaryCommitted: commitAiSummaryToDocument,
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
  requestAiSymbols: (source) => requestSymbolAi(symbols.value, source),
  showNotice,
  t,
});

const {
  formulaRefreshProgress,
  activeFormulaId,
  refreshFormulas,
  analyzeFormulaCandidate,
  updateFormula,
  deleteFormula,
  selectFormula,
} = useFormulaAnalysis({
  context,
  loading,
  formulas,
  pageTextItems,
  pdfDocument,
  settings,
  symbols,
  requestFormulaAi,
  showNotice,
  t,
});

function cloneAiHistory(history: ReaderPackageAiHistory = []): ReaderPackageAiHistory {
  return history.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.turn_id ? { turn_id: message.turn_id } : {}),
    ...(message.versions?.length ? {
      current_version: message.current_version,
      versions: message.versions.map((version) => ({ ...version })),
    } : {}),
  }));
}

function createDraftState(document: LibraryDocument, note: string, summary: string, history: ReaderPackageAiHistory = []): DraftState {
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

function getCurrentReadermMarkdown() {
  return noteDraft.value;
}

function getCurrentReadermInsertionSelection() {
  return readermWorkspaceRef.value?.currentSelection();
}

function getCurrentNoteInsertionSelection() {
  return readerSidePanelRef.value?.currentNoteSelection();
}

function getCurrentMarkdownInsertionSelection(target: "notes" | "summary") {
  return readerSidePanelRef.value?.currentMarkdownSelection(target);
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

function currentDocumentViewState(): DocumentViewState | null {
  if (!context.value) return null;
  const document = context.value.document;
  const existing = context.value.view_state || { version: 1 };
  const nextState: DocumentViewState = {
    ...existing,
    version: 1,
    updated_at: new Date().toISOString(),
  };

  if (document.source_type === "readerm") {
    nextState.readerm = {
      ...(existing.readerm || {}),
      mode: readermMode.value,
      ...(readermWorkspaceRef.value?.currentViewState() || {}),
      source_view: readermPdfSourceView.value,
      source_document_id: readermManualPdfDocumentId.value || undefined,
      source_anchor_id: readermManualPdfAnchorId.value || undefined,
      active_reference_id: activeReadermReferenceId.value || undefined,
      pdf_collapsed: readermPdfCollapsed.value,
      pdf_pane_width: readermPdfPaneWidth.value,
    };
    return nextState;
  }

  if (document.source_type === "markdown") {
    nextState.markdown = {
      ...(existing.markdown || {}),
      mode: notesMode.value,
      ...(markdownWorkspaceRef.value?.currentViewState() || {}),
    };
    return nextState;
  }

  const notesViewState = readerSidePanelRef.value?.currentMarkdownViewState("notes");
  const summaryViewState = readerSidePanelRef.value?.currentMarkdownViewState("summary");
  nextState.pdf = {
    ...(existing.pdf || {}),
    ...getViewState(),
  };
  nextState.reader_panel = {
    ...(existing.reader_panel || {}),
    active_tab: rightPanelTab.value,
    collapsed: rightPanelCollapsed.value,
    width: rightPanelWidth.value,
    notes_mode: notesMode.value,
    summary_mode: summaryMode.value,
    ...(notesViewState ? { notes_scroll_top: notesViewState.scroll_top } : {}),
    ...(summaryViewState ? { summary_scroll_top: summaryViewState.scroll_top } : {}),
  };
  return nextState;
}

async function saveCurrentViewStateNow(documentId = selectedDocumentId.value) {
  if (!documentId || !context.value || context.value.document.document_id !== documentId) return;
  const viewState = currentDocumentViewState();
  if (!viewState) return;
  context.value.view_state = viewState;
  await window.paperReaderPlus.updateDocumentViewState(documentId, toIpcPlainObject(viewState));
}

function scheduleViewStateSave() {
  if (viewStateRestoring || !context.value) return;
  if (viewStateSaveTimer !== null) window.clearTimeout(viewStateSaveTimer);
  const documentId = context.value.document.document_id;
  viewStateSaveTimer = window.setTimeout(() => {
    viewStateSaveTimer = null;
    void saveCurrentViewStateNow(documentId);
  }, viewStateSaveDelay);
}

async function restoreCurrentDocumentViewState() {
  if (!context.value) return;
  const state = context.value.view_state;
  const sourceType = context.value.document.source_type;
  viewStateRestoring = true;
  if (viewStateSaveTimer !== null) {
    window.clearTimeout(viewStateSaveTimer);
    viewStateSaveTimer = null;
  }
  try {
    if (sourceType === "readerm") {
      const readerm = state?.readerm;
      readermMode.value = readerm?.mode || defaultReadermEditorMode.value;
      readermPdfSourceView.value = readerm?.source_view || "pdf";
      readermManualPdfDocumentId.value = readerm?.source_document_id || "";
      readermManualPdfAnchorId.value = readerm?.source_anchor_id || "";
      readermPdfCollapsed.value = readerm?.pdf_collapsed === true;
      readermPdfPaneWidth.value = readerm?.pdf_pane_width || readermPdfPaneWidth.value;
      const savedReferenceId = readerm?.active_reference_id || "";
      activeReadermReferenceId.value = savedReferenceId && readermReferences.value.some((reference) => reference.reference_id === savedReferenceId)
        ? savedReferenceId
        : readermReferences.value[0]?.reference_id || "";
      await nextTick();
      readermWorkspaceRef.value?.restoreViewState(readerm || null);
      syncReadermPdfPaneWidth();
      return;
    }

    if (sourceType === "markdown") {
      notesMode.value = state?.markdown?.mode || defaultMarkdownEditorMode.value;
      await nextTick();
      markdownWorkspaceRef.value?.restoreViewState(state?.markdown || null);
      return;
    }

    const panel = state?.reader_panel;
    rightPanelTab.value = panel?.active_tab || rightPanelTab.value;
    rightPanelCollapsed.value = panel?.collapsed === true;
    rightPanelWidth.value = panel?.width || rightPanelWidth.value;
    notesMode.value = panel?.notes_mode || defaultMarkdownEditorMode.value;
    summaryMode.value = panel?.summary_mode || defaultMarkdownEditorMode.value;
    await nextTick();
    if (state?.pdf) restorePdfViewState(state.pdf);
    else scrollToPage(0);
    if (panel?.active_tab === "notes") {
      readerSidePanelRef.value?.restoreMarkdownViewState("notes", { scroll_top: panel.notes_scroll_top || 0 });
    } else if (panel?.active_tab === "summary") {
      readerSidePanelRef.value?.restoreMarkdownViewState("summary", { scroll_top: panel.summary_scroll_top || 0 });
    }
  } finally {
    window.setTimeout(() => {
      viewStateRestoring = false;
    }, 0);
  }
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

function updateSavedAiHistorySnapshot(documentId: string, history: ReaderPackageAiHistory) {
  const entry = documentDraftCache.value[documentId];
  if (!entry) return;
  const aiHistory = cloneAiHistory(history);
  setDocumentCache(documentId, {
    draft: { ...entry.draft, aiHistory },
    saved: { ...entry.saved, aiHistory },
  });
}

async function commitAiSummaryToDocument(documentId: string, summary: string, history: ReaderPackageAiHistory) {
  const currentEntry = cacheEntryForDocument(documentId);
  let document = documents.value.find((item) => item.document_id === documentId)
    || (context.value?.document.document_id === documentId ? context.value.document : undefined);
  let entry = currentEntry;
  if (!entry || !document) {
    const nextContext = await window.paperReaderPlus.getDocumentContext(documentId);
    document = nextContext.document;
    const saved = createDraftState(document, nextContext.note.content, nextContext.summary.content, nextContext.ai_history || []);
    entry = { draft: saved, saved };
  }

  const aiHistory = cloneAiHistory(history);
  const nextDraft = { ...entry.draft, summary, aiHistory };
  const nextSaved = { ...entry.saved, summary, aiHistory };
  setDocumentCache(documentId, { draft: nextDraft, saved: nextSaved });
  if (context.value?.document.document_id === documentId) {
    summaryDraft.value = summary;
    aiMessages.value = cloneAiHistory(aiHistory);
    context.value.summary.content = summary;
    context.value.ai_history = cloneAiHistory(aiHistory);
  }

  if (document.readerp_path) {
    await window.paperReaderPlus.saveCurrentReaderPackage(
      documentId,
      nextDraft.note,
      summary,
      toIpcPlainObject(aiHistory),
    );
  } else {
    await window.paperReaderPlus.saveSummary(documentId, summary);
    await window.paperReaderPlus.saveAiHistory(documentId, toIpcPlainObject(aiHistory));
  }
  await refreshDocuments();
  await refreshDocumentHealth(documentId);
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

async function refreshGroups() {
  const api = paperReaderPlusApi();
  if (typeof api.listGroups !== "function") {
    groups.value = [{
      group_id: "default",
      name: "Default",
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
      readonly: true,
    }];
    return;
  }
  groups.value = await api.listGroups();
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

function paperReaderPlusApi() {
  return window.paperReaderPlus as typeof window.paperReaderPlus & {
    markDocumentOpened?: (documentId: string) => Promise<LibraryDocument>;
    setDocumentPinned?: (documentId: string, pinned: boolean) => Promise<LibraryDocument>;
    listGroups?: () => Promise<LibraryGroup[]>;
    createGroup?: (name: string) => Promise<LibraryGroup>;
    renameGroup?: (groupId: string, name: string) => Promise<LibraryGroup>;
    deleteGroup?: (groupId: string, mode: "group-only" | "history-records") => Promise<{ removed: number }>;
    moveDocumentsToGroup?: (documentIds: string[], groupId: string | null) => Promise<LibraryDocument[]>;
  };
}

async function markDocumentOpenedIfAvailable(documentId: string) {
  const openedAt = new Date().toISOString();
  const document = documents.value.find((item) => item.document_id === documentId);
  recentGroupId.value = document?.group_id || "default";
  documents.value = documents.value.map((item) =>
    item.document_id === documentId ? { ...item, last_opened_at: openedAt } : item,
  );
  const api = paperReaderPlusApi();
  if (typeof api.markDocumentOpened !== "function") return false;
  await api.markDocumentOpened(documentId);
  return true;
}

async function openDocument(documentId: string) {
  if (!documentId) return;
  if (selectedDocumentId.value === documentId && context.value) {
    addOpenDocumentTab(documentId);
    if (await markDocumentOpenedIfAvailable(documentId)) await refreshDocuments();
    return;
  }
  await saveCurrentViewStateNow();
  cacheCurrentDocumentDraft();
  await flushMarkdownAutosave(selectedDocumentId.value);
  if (await markDocumentOpenedIfAvailable(documentId)) await refreshDocuments();
  addOpenDocumentTab(documentId);
  await loadDocument(documentId);
  ensureLoadedDocumentCache();
  await restoreCurrentDocumentViewState();
  await refreshDocumentHealth(documentId);
}

async function toggleDocumentPinned(document: LibraryDocument) {
  const previousDocuments = documents.value;
  const optimisticPinnedAt = document.pinned_at ? undefined : new Date().toISOString();
  documents.value = documents.value.map((item) =>
    item.document_id === document.document_id ? { ...item, pinned_at: optimisticPinnedAt } : item,
  );
  try {
    const api = paperReaderPlusApi();
    if (typeof api.setDocumentPinned !== "function") return;
    const nextDocument = await api.setDocumentPinned(document.document_id, !document.pinned_at);
    documents.value = documents.value.map((item) =>
      item.document_id === nextDocument.document_id ? { ...item, ...nextDocument } : item,
    );
    if (context.value?.document.document_id === nextDocument.document_id) {
      context.value.document = { ...context.value.document, pinned_at: nextDocument.pinned_at };
    }
    await refreshDocuments();
  } catch (cause) {
    documents.value = previousDocuments;
    throw cause;
  }
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
  formulas.value = [];
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

async function saveCurrentDocument() {
  if (!context.value) return;
  const documentId = context.value.document.document_id;
  cacheCurrentDocumentDraft();
  try {
    const saved = await saveDocumentDraft(documentId);
    if (saved) showNotice(t("app.documentSaved"));
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
}

async function closeDocumentTab(documentId: string) {
  const index = openDocumentIds.value.indexOf(documentId);
  if (index === -1) return;
  if (selectedDocumentId.value === documentId) await saveCurrentViewStateNow(documentId);
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
  const nextOpenIds = closeOpenDocumentTab(documentId);
  const { [documentId]: _closed, ...remainingCache } = documentDraftCache.value;
  documentDraftCache.value = remainingCache;
  if (selectedDocumentId.value !== documentId) return;
  const nextDocumentId = nextOpenIds[index] || nextOpenIds[index - 1] || "";
  if (nextDocumentId) {
    await loadDocument(nextDocumentId);
    ensureLoadedDocumentCache();
    await restoreCurrentDocumentViewState();
  } else {
    clearActiveDocumentState();
  }
}

async function deleteDocument(document: LibraryDocument) {
  await lifecycleDeleteDocument(document);
  closeOpenDocumentTab(document.document_id);
  const { [document.document_id]: _deleted, ...remainingCache } = documentDraftCache.value;
  documentDraftCache.value = remainingCache;
}

function documentMatchesHistoryMode(document: LibraryDocument, mode: "readerp" | "readerm" | "all") {
  if (mode === "all") return true;
  return mode === "readerm" ? document.source_type === "readerm" : document.source_type !== "readerm";
}

async function clearHistory(mode: "readerp" | "readerm" | "all") {
  const count = documents.value.filter((document) => documentMatchesHistoryMode(document, mode)).length;
  if (!count) return;
  const confirmed = window.confirm(t(mode === "all" ? "library.clearAllHistoryConfirm" : mode === "readerm" ? "library.clearReadermHistoryConfirm" : "library.clearReaderpHistoryConfirm", { count }));
  if (!confirmed) return;
  try {
    const result = await window.paperReaderPlus.clearDocumentHistory(mode);
    filterOpenDocumentTabs((id) => {
      const document = documents.value.find((item) => item.document_id === id);
      return document ? !documentMatchesHistoryMode(document, mode) : true;
    });
    documentDraftCache.value = Object.fromEntries(
      Object.entries(documentDraftCache.value).filter(([documentId]) => {
        const document = documents.value.find((item) => item.document_id === documentId);
        return document ? !documentMatchesHistoryMode(document, mode) : true;
      }),
    );
    if (context.value && documentMatchesHistoryMode(context.value.document, mode)) clearActiveDocumentState();
    await refreshDocuments();
    showNotice(t("library.historyCleared", { count: result.removed }));
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
}

async function deleteCurrentDocument() {
  const documentId = selectedDocumentId.value;
  await lifecycleDeleteCurrentDocument();
  if (!documentId) return;
  closeOpenDocumentTab(documentId);
  const { [documentId]: _deleted, ...remainingCache } = documentDraftCache.value;
  documentDraftCache.value = remainingCache;
}

function registerCurrentDocumentTab() {
  if (!context.value || !selectedDocumentId.value) return;
  addOpenDocumentTab(selectedDocumentId.value);
  ensureLoadedDocumentCache();
}

async function importPdf() {
  await saveCurrentViewStateNow();
  cacheCurrentDocumentDraft();
  await lifecycleImportPdf();
  registerCurrentDocumentTab();
}

async function importArxiv() {
  await saveCurrentViewStateNow();
  cacheCurrentDocumentDraft();
  await lifecycleImportArxiv();
  registerCurrentDocumentTab();
}

async function importReaderPackage() {
  await saveCurrentViewStateNow();
  cacheCurrentDocumentDraft();
  await lifecycleImportReaderPackage();
  registerCurrentDocumentTab();
}

async function importReadermPackage() {
  await saveCurrentViewStateNow();
  cacheCurrentDocumentDraft();
  await lifecycleImportReadermPackage();
  registerCurrentDocumentTab();
}

async function createReaderPackageFromPdf() {
  await saveCurrentViewStateNow();
  cacheCurrentDocumentDraft();
  await lifecycleCreateReaderPackageFromPdf();
  registerCurrentDocumentTab();
}

async function createReaderPackageFromMarkdown() {
  await saveCurrentViewStateNow();
  cacheCurrentDocumentDraft();
  await lifecycleCreateReaderPackageFromMarkdown();
  registerCurrentDocumentTab();
}

async function createEmptyReaderm() {
  await saveCurrentViewStateNow();
  cacheCurrentDocumentDraft();
  await lifecycleCreateEmptyReaderm();
  readermMode.value = defaultReadermEditorMode.value;
  registerCurrentDocumentTab();
}

async function createReadermFromMarkdown() {
  await saveCurrentViewStateNow();
  cacheCurrentDocumentDraft();
  await lifecycleCreateReadermFromMarkdown();
  registerCurrentDocumentTab();
}

async function upgradeMarkdownToReaderm() {
  if (!context.value || context.value.document.source_type !== "markdown") return;
  cacheCurrentDocumentDraft();
  await flushMarkdownAutosave(context.value.document.document_id);
  try {
    const document = await window.paperReaderPlus.upgradeMarkdownToReadermCopy(
      context.value.document.document_id,
      noteDraft.value,
    );
    if (!document) return;
    await refreshDocuments();
    showNotice(t("app.markdownUpgraded"));
    await openDocument(document.document_id);
    readermMode.value = defaultReadermEditorMode.value;
    registerCurrentDocumentTab();
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
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

async function downloadCurrentPdf() {
  if (!context.value) return;
  try {
    const target = await window.paperReaderPlus.exportPdf(context.value.document.document_id);
    if (target) showNotice(`PDF saved: ${target}`);
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
}

function visibleLibraryDocuments() {
  return documents.value;
}

function selectLibraryDocument(payload: { document: LibraryDocument; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) {
  const documentId = payload.document.document_id;
  if (payload.shiftKey && lastSelectedLibraryDocumentId.value) {
    const visible = visibleLibraryDocuments();
    const start = visible.findIndex((item) => item.document_id === lastSelectedLibraryDocumentId.value);
    const end = visible.findIndex((item) => item.document_id === documentId);
    if (start >= 0 && end >= 0) {
      const [from, to] = start < end ? [start, end] : [end, start];
      selectedLibraryDocumentIds.value = visible.slice(from, to + 1).map((item) => item.document_id);
      return;
    }
  }
  if (payload.ctrlKey || payload.metaKey) {
    const selected = new Set(selectedLibraryDocumentIds.value);
    if (selected.has(documentId)) selected.delete(documentId);
    else selected.add(documentId);
    selectedLibraryDocumentIds.value = [...selected];
    lastSelectedLibraryDocumentId.value = documentId;
    return;
  }
  selectedLibraryDocumentIds.value = [documentId];
  lastSelectedLibraryDocumentId.value = documentId;
}

async function moveDocumentsToGroup(documentIds: string[], groupId: string | null) {
  const api = paperReaderPlusApi();
  if (typeof api.moveDocumentsToGroup !== "function") return;
  const moved = await api.moveDocumentsToGroup(documentIds, groupId);
  const byId = new Map(moved.map((document) => [document.document_id, document]));
  documents.value = documents.value.map((document) => byId.get(document.document_id) || document);
  recentGroupId.value = groupId || "default";
}

function openGroupNameDialog(options: {
  title: string;
  value?: string;
  confirmLabel?: string;
  onConfirm: (name: string) => Promise<void> | void;
}) {
  groupNameDialog.value = {
    open: true,
    title: options.title,
    value: options.value || "",
    confirmLabel: options.confirmLabel || t("common.save"),
    onConfirm: options.onConfirm,
  };
}

async function confirmGroupNameDialog() {
  const dialog = groupNameDialog.value;
  const clean = dialog?.value.trim().replace(/\s+/g, " ");
  if (!dialog || !clean) {
    groupNameDialog.value = null;
    return;
  }
  try {
    await dialog.onConfirm(clean);
    groupNameDialog.value = null;
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
}

function cancelGroupNameDialog() {
  groupNameDialog.value = null;
}

async function createGroup(name: string) {
  const api = paperReaderPlusApi();
  if (typeof api.createGroup !== "function") return;
  const group = await api.createGroup(name);
  recentGroupId.value = group.group_id;
  await refreshGroups();
}

function promptCreateGroupAndMove(documentIds: string[]) {
  openGroupNameDialog({
    title: t("library.groupNamePrompt"),
    confirmLabel: t("common.save"),
    onConfirm: async (name) => {
      const api = paperReaderPlusApi();
      if (typeof api.createGroup !== "function") return;
      const group = await api.createGroup(name);
      recentGroupId.value = group.group_id;
      await refreshGroups();
      await moveDocumentsToGroup(documentIds, group.group_id);
    },
  });
}

async function renameGroup(group: LibraryGroup, name: string) {
  const api = paperReaderPlusApi();
  if (typeof api.renameGroup !== "function") return;
  await api.renameGroup(group.group_id, name);
  await refreshGroups();
}

function openCreateGroupDialog() {
  openGroupNameDialog({
    title: t("library.groupNamePrompt"),
    confirmLabel: t("common.save"),
    onConfirm: createGroup,
  });
}

async function handleMoveDocumentsToGroup(payload: { documentIds: string[]; groupId: string | null }) {
  try {
    await moveDocumentsToGroup(payload.documentIds, payload.groupId);
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
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
  await refreshGroups();
  await refreshDocuments();
});

onBeforeUnmount(() => {
  if (markdownAutosaveTimer !== null) window.clearTimeout(markdownAutosaveTimer);
  if (viewStateSaveTimer !== null) window.clearTimeout(viewStateSaveTimer);
  readermLayoutResizeObserver?.disconnect();
  readermLayoutResizeObserver = null;
  markdownAutosaveDocumentId = "";
  if (context.value) cacheCurrentDocumentDraft();
  void saveCurrentViewStateNow();
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
  scheduleViewStateSave();
});

watch(searchMatches, (matches) => {
  syncActiveSearchMatch();
});

watch(readermLayoutRef, (element) => {
  readermLayoutResizeObserver?.disconnect();
  readermLayoutResizeObserver = null;
  readermLayoutWidth.value = element?.clientWidth || 0;
  if (!element) return;
  readermLayoutResizeObserver = new ResizeObserver((entries) => {
    readermLayoutWidth.value = entries[0]?.contentRect.width || element.clientWidth;
    syncReadermPdfPaneWidth();
  });
  readermLayoutResizeObserver.observe(element);
  syncReadermPdfPaneWidth();
}, { flush: "post" });

watch(() => [readermPdfCollapsed.value, readermPdfPaneWidth.value, readermLayoutWidth.value] as const, syncReadermPdfPaneWidth);

watch(() => [
  rightPanelTab.value,
  rightPanelCollapsed.value,
  rightPanelWidth.value,
  notesMode.value,
  summaryMode.value,
  readermMode.value,
  readermPdfSourceView.value,
  readermManualPdfDocumentId.value,
  readermManualPdfAnchorId.value,
  activeReadermReferenceId.value,
  readermPdfCollapsed.value,
  readermPdfPaneWidth.value,
  pdfZoom.value,
] as const, scheduleViewStateSave);

watch(documents, (items) => {
  const existingIds = new Set(items.map((document) => document.document_id));
  filterOpenDocumentTabs((documentId) => existingIds.has(documentId));
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

watch(() => context.value?.document.document_id, () => {
  const viewState = context.value?.view_state;
  if (context.value?.document.source_type === "readerm") {
    readermManualPdfDocumentId.value = viewState?.readerm?.source_document_id || "";
    readermManualPdfAnchorId.value = viewState?.readerm?.source_anchor_id || "";
    readermPdfSourceView.value = viewState?.readerm?.source_view || "pdf";
    readermPdfCollapsed.value = viewState?.readerm?.pdf_collapsed === true;
    if (viewState?.readerm?.pdf_pane_width) readermPdfPaneWidth.value = viewState.readerm.pdf_pane_width;
    readermMode.value = viewState?.readerm?.mode || defaultReadermEditorMode.value;
  } else {
    readermManualPdfDocumentId.value = "";
    readermManualPdfAnchorId.value = "";
  }
  if (context.value?.document.source_type === "markdown") notesMode.value = viewState?.markdown?.mode || defaultMarkdownEditorMode.value;
  if (context.value?.document.source_type !== "readerm" && context.value?.document.source_type !== "markdown") {
    notesMode.value = viewState?.reader_panel?.notes_mode || defaultMarkdownEditorMode.value;
    summaryMode.value = viewState?.reader_panel?.summary_mode || defaultMarkdownEditorMode.value;
    rightPanelTab.value = viewState?.reader_panel?.active_tab || rightPanelTab.value;
    rightPanelCollapsed.value = viewState?.reader_panel?.collapsed === true;
    if (viewState?.reader_panel?.width) rightPanelWidth.value = viewState.reader_panel.width;
  }
  cancelReadermOutlineRefresh();
  void nextTick(refreshReadermOutlineNow);
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
  scheduleReadermOutlineRefresh();
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
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void saveCurrentDocumentFromShortcut();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".readerm-pdf-pane, .live-codemirror-editor, .markdown-textarea, .readerm-textarea")) return;
    event.preventDefault();
    searchOpen.value = true;
    return;
  }
  if (event.key !== "Escape") return;
  closeGroupContextMenu();
  annotationToolMode.value = "select";
  pendingImageInsert.value = null;
  selectionState.value = null;
  activeAnnotation.value = null;
  activeAnchor.value = null;
  annotationCommentEditor.value = null;
  searchOpen.value = false;
}

async function saveCurrentDocumentFromShortcut() {
  const documentId = selectedDocumentId.value;
  if (!documentId || !context.value) return;
  try {
    cacheCurrentDocumentDraft();
    const saved = await saveDocumentDraft(documentId);
    if (saved) showNotice(t("app.documentSaved"));
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
}

function handleGlobalPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  if (target.closest(".group-context-menu")) return;
  closeGroupContextMenu();
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
    "settings-general": () => openSettingsPanel("general"),
    "settings-pdf": () => openSettingsPanel("pdf"),
    "settings-markdown": () => openSettingsPanel("markdown"),
    "settings-agent-api": () => openSettingsPanel("agent-api"),
    "settings-ocr-api": () => openSettingsPanel("ocr-api"),
    "settings-translation-api": () => openSettingsPanel("translation-api"),
    "settings-network-proxy": () => openSettingsPanel("general"),
    "settings-file-associations": () => { void openFileAssociationSettings(); },
    "settings-system-prompt": () => openSettingsPanel("system-prompt"),
    "settings-summary-prompt": () => openSettingsPanel("summary-prompt"),
    "settings-analysis-prompt": () => openSettingsPanel("analysis-prompt"),
  } satisfies Record<string, () => void>;
  actions[action]?.();
}

function showNotice(message: string) {
  notice.value = message;
  window.setTimeout(() => {
    if (notice.value === message) notice.value = "";
  }, 2600);
}

function imageSizeIsValid(size: ImageSizeInput) {
  const width = size.width.trim() ? Number(size.width.trim()) : 0;
  const height = size.height.trim() ? Number(size.height.trim()) : 0;
  return Number.isFinite(width) && width >= 0 && width <= 9999
    && Number.isFinite(height) && height >= 0 && height <= 9999;
}

function requestImageSize(current: ImageSizeInput) {
  imageSizeRequest.value?.resolve(null);
  return new Promise<ImageSizeInput | null>((resolve) => {
    imageSizeRequest.value = {
      currentWidth: current.width,
      currentHeight: current.height,
      error: "",
      resolve,
    };
  });
}

function confirmImageSize(value: ImageSizeInput) {
  if (!imageSizeRequest.value) return;
  if (!imageSizeIsValid(value)) {
    imageSizeRequest.value = {
      ...imageSizeRequest.value,
      error: t("markdown.imageSizeInvalid"),
    };
    return;
  }
  const { resolve } = imageSizeRequest.value;
  imageSizeRequest.value = null;
  resolve(value);
}

function cancelImageSize() {
  const request = imageSizeRequest.value;
  imageSizeRequest.value = null;
  request?.resolve(null);
}

async function loadSettings() {
  settings.value = await window.paperReaderPlus.getSettings();
  setUiLanguage(settings.value.ui_language);
  setMarkdownFontSize(settings.value.markdown_default_font_size);
  promptTemplates.value = await window.paperReaderPlus.getPromptTemplates();
  fileAssociationStatus.value = await window.paperReaderPlus.getFileAssociationStatus();
}

async function openFileAssociationSettings() {
  openSettingsPanel("file-associations");
  try {
    fileAssociationStatus.value = await window.paperReaderPlus.getFileAssociationStatus();
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
}

function cloneSettings(value: Settings) {
  return JSON.parse(JSON.stringify(value)) as Settings;
}

function openSettingsPanel(panel: SettingsPanel) {
  if (!settings.value) return;
  settingsDraft.value = cloneSettings(settings.value);
  activeSettingsPanel.value = panel;
}

function closeSettingsPanel() {
  settingsDraft.value = null;
  activeSettingsPanel.value = null;
}

async function loadDictionary() {
  dictionaryEntries.value = await window.paperReaderPlus.listDictionary();
}

async function saveSettings() {
  if (!settingsDraft.value) return;
  settings.value = await window.paperReaderPlus.updateSettings(toIpcPlainObject(settingsDraft.value));
  setUiLanguage(settings.value.ui_language);
  setMarkdownFontSize(settings.value.markdown_default_font_size);
  settingsDraft.value = null;
  activeSettingsPanel.value = null;
  showNotice(t("app.settingsSaved"));
}

async function updateSettingsPatch(patch: Partial<Settings>) {
  if (!settings.value) return;
  settings.value = await window.paperReaderPlus.updateSettings(toIpcPlainObject({ ...settings.value, ...patch }));
  setUiLanguage(settings.value.ui_language);
  setMarkdownFontSize(settings.value.markdown_default_font_size);
}

async function registerFileAssociations() {
  if (fileAssociationBusy.value) return;
  fileAssociationBusy.value = "all";
  try {
    fileAssociationStatus.value = await window.paperReaderPlus.registerFileAssociations();
    showNotice(t(fileAssociationStatus.value.associated ? "settings.fileAssociationsBoundNotice" : "settings.fileAssociationsPartialNotice"));
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  } finally {
    fileAssociationBusy.value = null;
  }
}

async function updateFileAssociation(extension: FileAssociationExtension, associated: boolean) {
  if (fileAssociationBusy.value) return;
  fileAssociationBusy.value = extension;
  try {
    fileAssociationStatus.value = associated
      ? await window.paperReaderPlus.unregisterFileAssociation(extension)
      : await window.paperReaderPlus.registerFileAssociation(extension);
    const updated = fileAssociationStatus.value.associations.find((item) => item.extension === extension);
    showNotice(t(updated?.associated
      ? "settings.fileAssociationBoundNotice"
      : updated?.registered
        ? "settings.fileAssociationRegisteredOnlyNotice"
        : "settings.fileAssociationUnboundNotice", { extension }));
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  } finally {
    fileAssociationBusy.value = null;
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

async function handleDocumentContextMenu(payload: { document: LibraryDocument; selectedDocumentIds: string[] }) {
  const document = payload.document;
  const selectedDocumentIds = payload.selectedDocumentIds;
  try {
    const result = await window.paperReaderPlus.showDocumentContextMenu(document.document_id, selectedDocumentIds);
    if (result?.action === "move-to-group") {
      await refreshDocuments();
      recentGroupId.value = result.groupId || "default";
      return;
    }
    if (result?.action === "create-group-and-move") {
      await promptCreateGroupAndMove(result.documentIds || [result.documentId]);
      return;
    }
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
    const deletedIds = result.documentIds || [result.documentId];
    if (deletedIds.includes(selectedDocumentId.value)) {
      clearActiveDocumentState();
    }
    for (const documentId of deletedIds) closeOpenDocumentTab(documentId);
    documentDraftCache.value = Object.fromEntries(
      Object.entries(documentDraftCache.value).filter(([documentId]) => !deletedIds.includes(documentId)),
    );
    selectedLibraryDocumentIds.value = selectedLibraryDocumentIds.value.filter((documentId) => !deletedIds.includes(documentId));
    await refreshDocuments();
    showNotice(result.mode === "file" ? "File deleted" : "History record deleted");
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
}

function fallbackDefaultGroup(): LibraryGroup {
  return groups.value.find((group) => group.group_id === "default") || {
    group_id: "default",
    name: "Default",
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    readonly: true,
  };
}

function closeGroupContextMenu() {
  groupContextMenu.value = null;
}

function openGroupContextMenu(group: LibraryGroup, x: number, y: number) {
  groupContextMenu.value = { group, x, y };
}

async function runGroupContextAction(group: LibraryGroup, action: GroupContextAction) {
  const isDefault = group.group_id === "default";
  const api = paperReaderPlusApi();
  closeGroupContextMenu();
  if (action === "create-group") {
    openCreateGroupDialog();
    return;
  }
  if (!isDefault && action === "rename-group") {
    groupRenameRequest.value = { groupId: group.group_id, requestId: Date.now() };
    return;
  }
  if (!isDefault && action === "delete-group") {
    if (typeof api.deleteGroup !== "function") return;
    await api.deleteGroup(group.group_id, "group-only");
    await refreshGroups();
    await refreshDocuments();
    return;
  }
  if (action === "delete-history") {
    if (!window.confirm(t("library.deleteGroupHistoryConfirm"))) return;
    if (typeof api.deleteGroup !== "function") return;
    await api.deleteGroup(group.group_id, "history-records");
    await refreshGroups();
    await refreshDocuments();
  }
}

async function handleGroupContextMenuAction(action: GroupContextAction) {
  const group = groupContextMenu.value?.group;
  if (!group) return;
  try {
    await runGroupContextAction(group, action);
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
}

function handleGroupContextMenu(payload: { group: LibraryGroup; x: number; y: number }) {
  openGroupContextMenu(payload.group, payload.x, payload.y);
}

function handleLibraryContextMenu(payload: { x: number; y: number }) {
  openGroupContextMenu(fallbackDefaultGroup(), payload.x, payload.y);
}

async function handleRenameGroupInline(payload: { group: LibraryGroup; name: string }) {
  try {
    await renameGroup(payload.group, payload.name);
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
    await saveCurrentViewStateNow();
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
  const currentSettings = settingsDraft.value ?? settings.value;
  if (!currentSettings || settingsTesting.value) return;
  settingsTesting.value = "agent";
  try {
    const result = await window.paperReaderPlus.testAgentSettings(toIpcPlainObject(currentSettings));
    showNotice(t("app.agentTestOk", { content: result.content || t("app.connected") }));
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  } finally {
    settingsTesting.value = null;
  }
}

async function testTranslationSettings() {
  const currentSettings = settingsDraft.value ?? settings.value;
  if (!currentSettings || settingsTesting.value) return;
  settingsTesting.value = "translation";
  try {
    const result = await window.paperReaderPlus.testTranslationSettings(toIpcPlainObject(currentSettings));
    showNotice(t("app.translationTestOk", { content: result.content || t("app.connected") }));
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  } finally {
    settingsTesting.value = null;
  }
}

async function testSimpleTexOcrSettings() {
  const currentSettings = settingsDraft.value ?? settings.value;
  if (!currentSettings || settingsTesting.value) return;
  settingsTesting.value = "simpletex";
  try {
    const result = await window.paperReaderPlus.testSimpleTexOcrSettings(toIpcPlainObject(currentSettings));
    showNotice(t("app.simpletexTestOk", { content: result.content || t("app.connected") }));
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

function selectFormulaAnalysis(formula: FormulaAnalysis) {
  selectFormula(formula);
  if (formula.page_index !== undefined) scrollToPage(formula.page_index, { rectsPct: formula.rects_pct, block: "center" });
}

function reanalyzeFormula(formula: FormulaAnalysis) {
  void analyzeFormulaCandidate({
    candidate_id: formula.formula_id.replace(/^.*:formula:/, ""),
    document_id: formula.document_id,
    source: formula.source,
    raw_text: formula.raw_text,
    latex: formula.latex,
    context: formula.context || "",
    page_index: formula.page_index,
    rects_pct: formula.rects_pct,
    latex_line: formula.latex_line,
    source_label: formula.source === "pdf"
      ? `PDF page ${(formula.page_index ?? 0) + 1}`
      : `LaTeX line ${formula.latex_line ?? ""}`,
  }, true);
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
  if (readermWorkspaceRef.value?.scrollToHeading(item.id)) return;
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

function externalMarkdownUrl(href: string) {
  if (/^https?:\/\//i.test(href)) return href;
  if (/^www\./i.test(href)) return `https://${href}`;
  return "";
}

function openExternalMarkdownLink(payload: { href: string; event: MouseEvent; force?: boolean }) {
  const url = externalMarkdownUrl(payload.href);
  if (!url || (!payload.force && !payload.event.ctrlKey && !payload.event.metaKey)) return false;
  payload.event.preventDefault();
  void window.paperReaderPlus.openExternalUrl(url).catch((cause) => {
    const message = cause instanceof Error ? cause.message : String(cause);
    showNotice(message.includes("ERR_UNSUPPORTED_EXTERNAL_URL") ? t("liveMarkdown.unsupportedExternalUrl") : message);
  });
  return true;
}

function handleMarkdownLink(payload: { href: string; event: MouseEvent; force?: boolean }) {
  if (openExternalMarkdownLink(payload)) return;
  const target = parseReaderAnchorHref(payload.href);
  if (!target) return;
  payload.event.preventDefault();
  if (target.documentId !== selectedDocumentId.value) {
    void openDocument(target.documentId).then(() => focusAnchor(target.anchorId));
  } else {
    focusAnchor(target.anchorId);
  }
}

async function handleReadermLink(payload: { href: string; event: MouseEvent; force?: boolean }) {
  if (openExternalMarkdownLink(payload)) return;
  const documentTarget = parseReaderDocumentHref(payload.href);
  if (documentTarget) {
    payload.event.preventDefault();
    readermManualPdfDocumentId.value = documentTarget.documentId;
    readermManualPdfAnchorId.value = "";
    readermPdfSourceView.value = documentTarget.view;
    readermPdfCollapsed.value = false;
    readermPdfNavigationKey.value += 1;
    return;
  }
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
    readermPdfSourceView.value = "pdf";
    readermPdfCollapsed.value = false;
    showNotice(t("readerm.openingUnindexedReference"));
    return;
  }
  activeReadermReferenceId.value = reference.reference_id;
  readermManualPdfDocumentId.value = target.documentId;
  readermManualPdfAnchorId.value = target.anchorId;
  readermPdfSourceView.value = "pdf";
  readermPdfCollapsed.value = false;
  readermPdfNavigationKey.value += 1;
}

function selectReadermReference(reference: ReadermReference) {
  readermManualPdfDocumentId.value = "";
  readermManualPdfAnchorId.value = "";
  readermPdfSourceView.value = "pdf";
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
  readermPdfSourceView.value = "pdf";
}

function openReadermCollapsedSource(view: ReaderDocumentView) {
  readermPdfSourceView.value = view;
  readermPdfCollapsed.value = false;
}

function refreshReadermContext(nextContext: DocumentContext) {
  if (!context.value || context.value.document.document_id !== nextContext.document.document_id) return;
  context.value = nextContext;
  titleDraft.value = nextContext.document.title;
  noteDraft.value = nextContext.note.content;
  summaryDraft.value = nextContext.summary.content;
  aiMessages.value = nextContext.ai_history || [];
  savedSymbols.value = nextContext.symbols || [];
  formulas.value = nextContext.formulas || [];
  const saved = createDraftState(nextContext.document, noteDraft.value, summaryDraft.value, aiMessages.value);
  setDocumentCache(nextContext.document.document_id, { draft: saved, saved });
  void refreshDocumentHealth(nextContext.document.document_id);
}

function captureReadermRegion(payload?: { start: number; end: number } | { selection?: { start: number; end: number }; kind?: "image" | "formula" }) {
  if (readermPdfCollapsed.value) readermPdfCollapsed.value = false;
  if (readermMode.value === "preview") readermMode.value = "live";
  const selection = payload && "selection" in payload ? payload.selection : payload as { start: number; end: number } | undefined;
  const kind = payload && "kind" in payload ? payload.kind : "image";
  readermCaptureRequest.value = { requestId: Date.now(), selection: selection ?? getCurrentReadermInsertionSelection(), kind };
}

function clampLibraryWidth(width: number) {
  return Math.min(libraryWidthMax, Math.max(libraryWidthMin, width));
}

function createResizeDragThrottle(apply: (width: number) => void) {
  let latestWidth: number | null = null;
  let lastAppliedAt = 0;
  let timer: number | null = null;

  const flush = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    if (latestWidth === null) return;
    lastAppliedAt = performance.now();
    apply(latestWidth);
  };

  return {
    update(width: number) {
      latestWidth = width;
      const remaining = resizeDragUpdateIntervalMs - (performance.now() - lastAppliedAt);
      if (remaining <= 0) {
        flush();
        return;
      }
      if (timer === null) timer = window.setTimeout(flush, remaining);
    },
    flush,
  };
}

function createResizeDragGuide(initialClientX: number) {
  const guide = document.createElement("div");
  guide.className = "resize-drag-guide";
  document.body.appendChild(guide);

  const move = (clientX: number) => {
    guide.style.left = `${Math.round(clientX)}px`;
  };

  move(initialClientX);

  return {
    move,
    remove() {
      guide.remove();
    },
  };
}

function startLibraryResize(event: PointerEvent) {
  if (libraryCollapsed.value) return;
  event.preventDefault();
  const handle = event.currentTarget as HTMLElement;
  handle.setPointerCapture(event.pointerId);
  document.body.classList.add("resizing");
  const startX = event.clientX;
  const startWidth = libraryWidth.value;
  const throttledResize = createResizeDragThrottle((width) => {
    libraryWidth.value = width;
  });
  const dragGuide = createResizeDragGuide(event.clientX);

  const onMove = (moveEvent: PointerEvent) => {
    const delta = moveEvent.clientX - startX;
    const width = clampLibraryWidth(startWidth + delta);
    dragGuide.move(startX + width - startWidth);
    throttledResize.update(width);
  };
  const onUp = (upEvent: PointerEvent) => {
    throttledResize.flush();
    dragGuide.remove();
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

function clampReadermPdfPaneWidth(width: number) {
  const preferredMarkdownWidth = 420;
  const minPdfWidth = 360;
  const maxPdfWidth = 900;
  const layoutWidth = readermLayoutWidth.value || readermLayoutRef.value?.clientWidth || 1200;
  const maxFittingPdfWidth = Math.max(0, layoutWidth - readermResizeHandleWidth);
  const minFittingPdfWidth = Math.min(minPdfWidth, maxFittingPdfWidth);
  const maxByPreferredMarkdown = layoutWidth - preferredMarkdownWidth - readermResizeHandleWidth;
  const maxByLayout = Math.min(
    maxPdfWidth,
    maxFittingPdfWidth,
    Math.max(minFittingPdfWidth, maxByPreferredMarkdown),
  );
  return Math.min(maxByLayout, Math.max(minFittingPdfWidth, width));
}

function syncReadermPdfPaneWidth() {
  if (readermPdfCollapsed.value) return;
  const targetWidth = clampReadermPdfPaneWidth(readermPdfPaneWidth.value);
  if (targetWidth !== readermPdfPaneWidth.value) readermPdfPaneWidth.value = targetWidth;
}

function startReadermResize(event: PointerEvent) {
  event.preventDefault();
  const handle = event.currentTarget as HTMLElement;
  handle.setPointerCapture(event.pointerId);
  document.body.classList.add("resizing");
  const startX = event.clientX;
  const startWidth = readermPdfPaneWidth.value;
  const throttledResize = createResizeDragThrottle((width) => {
    readermPdfPaneWidth.value = width;
  });
  const dragGuide = createResizeDragGuide(event.clientX);

  const onMove = (moveEvent: PointerEvent) => {
    const delta = startX - moveEvent.clientX;
    const width = clampReadermPdfPaneWidth(startWidth + delta);
    dragGuide.move(startX - (width - startWidth));
    throttledResize.update(width);
  };
  const onUp = (upEvent: PointerEvent) => {
    throttledResize.flush();
    dragGuide.remove();
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
  <main v-else class="app-shell" :style="appShellStyle">
    <ReaderSidebar
      v-model:collapsed="libraryCollapsed"
      :style="libraryStyle"
      :documents="documents"
      :groups="groups"
      :group-rename-request="groupRenameRequest"
      :selected-document-id="selectedDocumentId"
      :selected-document-ids="selectedLibraryDocumentIds"
      :recent-group-id="recentGroupId"
      :pdf-document="pdfDocument"
      :page-numbers="pageNumbers"
      :current-page-number="currentPageNumber"
      :outline-items="activeOutlineItems"
      :health-reports="healthReports"
      v-model:search-query="librarySearchQuery"
      :search-results="librarySearchResults"
      :search-loading="librarySearchLoading"
      :history-readerp-link-view="settings?.history_readerp_link_view || 'pdf'"
      @import-pdf="importPdf"
      @import-arxiv="arxivImportOpen = true"
      @create-empty-readerm="createEmptyReaderm"
      @create-readerm-from-markdown="createReadermFromMarkdown"
      @open-document="openDocument"
      @toggle-document-pinned="toggleDocumentPinned"
      @document-select="selectLibraryDocument"
      @document-context-menu="handleDocumentContextMenu"
      @group-context-menu="handleGroupContextMenu"
      @rename-group="handleRenameGroupInline"
      @library-context-menu="handleLibraryContextMenu"
      @move-documents-to-group="handleMoveDocumentsToGroup"
      @delete-document="deleteDocument"
      @clear-history="clearHistory"
      @open-search-result="openLibrarySearchResult"
      @scroll-to-page="scrollToPage"
      @outline-item-click="handleOutlineItemClick"
    />

    <button
      type="button"
      class="library-resize-handle"
      :disabled="libraryCollapsed"
      :aria-hidden="libraryCollapsed"
      tabindex="-1"
      @pointerdown="startLibraryResize"
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
            <button type="button" class="primary" @click="createEmptyReaderm"><FilePlus :size="18" /> {{ t("app.createEmptyReaderm") }}</button>
          </div>
          <div class="start-action-row">
            <button type="button" class="secondary" @click="arxivImportOpen = true"><BookOpen :size="18" /> {{ t("app.importArxiv") }}</button>
            <button type="button" class="secondary" @click="createReadermFromMarkdown"><FileText :size="18" /> {{ t("app.createReadermFromMarkdown") }}</button>
          </div>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
      </div>

      <template v-else>
        <section
          ref="readermLayoutRef"
          v-if="context.document.source_type === 'readerm'"
          class="readerm-layout"
          :class="{ 'pdf-collapsed': readermPdfCollapsed }"
          :style="readermLayoutStyle"
        >
          <ReadermWorkspace
            ref="readermWorkspaceRef"
            v-model:title-draft="titleDraft"
            v-model:markdown="noteDraft"
            v-model:mode="readermMode"
            :title="documentTitle"
            :editing-title="editingTitle"
            :document-id="context.document.document_id"
            :references="readermReferences"
            :referenced-documents="readermReferencedDocuments"
            :active-reference-id="activeReadermReference?.reference_id || ''"
            :settings="settings"
            @edit-title="editingTitle = true"
            @save-title="saveTitle"
            @save="saveReaderm"
            @export="exportCurrentReadermPackage"
            @capture-region="captureReadermRegion"
            @paste-image="pasteImageAsset({ target: 'notes', ...$event })"
            @resize-image="resizeMarkdownAssetImage({ target: 'notes', assetPath: $event.assetPath })"
            @link-click="handleReadermLink"
            @select-reference="selectReadermReference"
            @update-settings="updateSettingsPatch"
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
            :document-id="readermPdfDocumentId"
            :anchor-id="readermPdfAnchorId"
            :navigation-key="readermPdfNavigationKey"
            :source-view="readermPdfSourceView"
            :history-documents="historyPdfDocuments"
            :readerm-document-id="context.document.document_id"
            :get-readerm-markdown="getCurrentReadermMarkdown"
            :get-readerm-insertion-selection="getCurrentReadermInsertionSelection"
            :capture-request="readermCaptureRequest"
            :settings="settings"
            @update-readerm-markdown="noteDraft = $event"
            @translation-modal="translationModal = $event"
            @notice="showNotice"
            @select-document="selectReadermHistoryPdf"
            @update-source-view="readermPdfSourceView = $event"
            @open-document="openDocument"
            @link-click="handleReadermLink"
            @readerm-indexed="refreshReadermContext"
            @collapse="readermPdfCollapsed = true"
          />
          <nav
            v-else
            class="readerm-pdf-collapsed"
            :aria-label="t('readerm.expandPdf')"
          >
            <div class="readerm-pdf-collapsed-header">
              <button type="button" class="right-panel-toggle" :title="t('readerm.expandPdf')" :aria-label="t('readerm.expandPdf')" @click="readermPdfCollapsed = false">
                <PanelRightOpen :size="18" />
              </button>
            </div>
            <button
              type="button"
              class="readerm-pdf-collapsed-tab"
              :class="{ active: readermPdfSourceView === 'pdf' }"
              :title="t('readerm.sourcePdf')"
              @click="openReadermCollapsedSource('pdf')"
            >
              PDF
            </button>
            <button
              type="button"
              class="readerm-pdf-collapsed-tab"
              :class="{ active: readermPdfSourceView === 'markdown' }"
              :title="t('readerm.sourceMarkdown')"
              @click="openReadermCollapsedSource('markdown')"
            >
              MD
            </button>
            <button
              type="button"
              class="readerm-pdf-collapsed-tab"
              :class="{ active: readermPdfSourceView === 'summary' }"
              :title="t('readerm.sourceSummary')"
              @click="openReadermCollapsedSource('summary')"
            >
              SUM
            </button>
          </nav>
        </section>

        <MarkdownWorkspace
          v-else-if="context.document.source_type === 'markdown'"
          ref="markdownWorkspaceRef"
          v-model:title-draft="titleDraft"
          v-model:markdown="noteDraft"
          v-model:mode="notesMode"
          :title="documentTitle"
          :editing-title="editingTitle"
          :document-id="context.document.document_id"
          :settings="settings"
          @edit-title="editingTitle = true"
          @save-title="saveTitle"
          @save="saveNote"
          @upgrade="upgradeMarkdownToReaderm"
          @link-click="handleMarkdownLink"
          @update-settings="updateSettingsPatch"
        />

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
              :document-id="context.document.document_id"
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
              :formulas="formulas"
              :settings="settings"
              :capture-image-scale="settings?.capture_image_scale || 2"
              :pdf-paragraph-actions-enabled="settings?.pdf_paragraph_actions_enabled !== false"
              :pdf-author-graph-enabled="settings?.pdf_author_graph_enabled !== false"
              :pdf-internal-link-preview-enabled="settings?.pdf_internal_link_preview_enabled !== false"
              :can-open-annotations="!context.document.readerp_path"
              @edit-title="editingTitle = true"
              @save-title="saveTitle"
              @zoom="zoom"
              @reset-zoom="resetZoom"
              @undo="undoLastAnnotation"
              @jump-to-page="jumpToPage"
              @toggle-search="toggleSearch"
              @save-document="saveCurrentDocument"
              @download-pdf="downloadCurrentPdf"
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
              @formula-ask-ai="askAiAboutFormula"
              @formula-analyze="analyzeFormulaCandidate"
            />
          </template>
          <template #right>
            <ReaderSidePanel
              ref="readerSidePanelRef"
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
              :ai-summary-output-chars="aiSummaryOutputChars"
              :symbols="symbols"
              :active-symbol="activeSymbol"
              :symbol-refresh-progress="symbolRefreshProgress"
              :formulas="formulas"
              :active-formula-id="activeFormulaId"
              :formula-refresh-progress="formulaRefreshProgress"
              :document-id="context.document.document_id"
              :settings="settings"
              @collapse="rightPanelCollapsed = true"
              @save-note="saveNote"
              @save-summary="saveSummary"
              @insert-image="insertImageAsset"
              @paste-image="pasteImageAsset"
              @resize-image="resizeMarkdownAssetImage"
              @send-ai="handlePanelSendAi"
              @edit-ai-turn="sendAiForTurnEdit($event.turnId, $event.content)"
              @redo-ai-turn="redoAiTurn($event.turnId, $event.mode)"
              @show-ai-turn-version="showAiTurnVersion($event.turnId, $event.versionIndex)"
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
              @select-formula="selectFormulaAnalysis"
              @update-formula="updateFormula"
              @delete-formula="deleteFormula"
              @reanalyze-formula="reanalyzeFormula"
              @refresh-formulas="refreshFormulas()"
              @update-settings="updateSettingsPatch"
            />
          </template>
        </ReaderLayout>

        <SelectionToolbar
          v-if="context.document.source_type !== 'readerm' && context.document.source_type !== 'markdown'"
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
          v-if="context.document.source_type !== 'readerm' && context.document.source_type !== 'markdown' && annotationCommentEditor"
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
          v-if="context.document.source_type !== 'readerm' && context.document.source_type !== 'markdown'"
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
        v-if="settingsDraft && activeSettingsPanel"
        :panel="activeSettingsPanel"
        :settings="settingsDraft"
        :prompt-template-preview="promptTemplatePreview"
        :testing="settingsTesting"
        :file-association-status="fileAssociationStatus"
        :file-association-busy="fileAssociationBusy"
        @close="closeSettingsPanel"
        @save="saveSettings"
        @test-agent="testAgentSettings"
        @test-translation="testTranslationSettings"
        @test-simple-tex-ocr="testSimpleTexOcrSettings"
        @register-file-associations="registerFileAssociations"
        @update-file-association="updateFileAssociation"
      />

      <ImageSizeModal
        v-if="imageSizeRequest"
        :current-width="imageSizeRequest.currentWidth"
        :current-height="imageSizeRequest.currentHeight"
        :error="imageSizeRequest.error"
        @confirm="confirmImageSize"
        @cancel="cancelImageSize"
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

      <div v-if="groupNameDialog" class="modal-backdrop" @click.self="cancelGroupNameDialog">
        <section class="modal group-name-modal">
          <h2>{{ groupNameDialog.title }}</h2>
          <label>
            <span>{{ t("library.groupNamePrompt") }}</span>
            <input
              :value="groupNameDialog.value"
              autofocus
              @input="groupNameDialog.value = ($event.target as HTMLInputElement).value"
              @keydown.enter.prevent="confirmGroupNameDialog"
              @keydown.escape.prevent="cancelGroupNameDialog"
            />
          </label>
          <div class="modal-actions">
            <button type="button" class="secondary" @click="cancelGroupNameDialog">{{ t("common.cancel") }}</button>
            <button type="button" class="primary" @click="confirmGroupNameDialog">{{ groupNameDialog.confirmLabel }}</button>
          </div>
        </section>
      </div>
    </section>

    <div
      v-if="groupContextMenu"
      class="group-context-menu"
      :style="groupContextMenuStyle"
      @contextmenu.prevent
      @pointerdown.stop
    >
      <button
        v-for="item in groupContextMenuItems"
        :key="item.action"
        type="button"
        :class="{ danger: item.danger }"
        @click="handleGroupContextMenuAction(item.action)"
      >
        {{ item.label }}
      </button>
    </div>

    <div v-if="notice" class="toast">{{ notice }}</div>
  </main>
</template>
