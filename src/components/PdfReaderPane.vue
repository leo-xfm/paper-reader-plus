<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ExternalLink, Highlighter, Underline } from "lucide-vue-next";
import PdfWorkspace from "@/components/PdfWorkspace.vue";
import SelectionToolbar from "@/components/SelectionToolbar.vue";
import UiDropdown from "@/components/UiDropdown.vue";
import { usePdfDocument } from "@/composables/usePdfDocument";
import { usePdfPages } from "@/composables/usePdfPages";
import { usePdfSearch } from "@/composables/usePdfSearch";
import { usePdfPreviewActions } from "@/composables/usePdfPreviewActions";
import { useAnnotationActions } from "@/composables/useAnnotationActions";
import { useI18n } from "@/i18n";
import { linkedImageMarkdown, resizeMarkdownImage, markdownImagePattern } from "@/services/MarkdownImageService";
import { ANNOTATION_COLORS, sortAnnotations, type AnnotationToolMode } from "@/services/ReaderAnnotationService";
import { buildImageRegionAnchorCreateRequest, type ReaderSelection } from "@/services/ReaderAnchorService";
import { toIpcPlainObject } from "@/services/IpcPayloadService";
import { buildReaderContextPayload } from "@/services/ReaderContextService";
import type { Annotation, DocumentContext, LibraryDocument, RectPct, Settings } from "@/types";
import type { PdfHoverPreview, PdfTableSheet, PdfTextItem } from "@/pdf/pdfTypes";
import type { RightPanelTab } from "@/components/ReaderPanelTabs";

const props = defineProps<{
  documentId?: string;
  anchorId?: string;
  navigationKey?: number;
  historyDocuments?: LibraryDocument[];
  noteDraft: string;
  readermDocumentId: string;
  captureRequest?: { requestId: number; selection?: { start: number; end: number } } | null;
  settings?: Settings | null;
}>();

const emit = defineEmits<{
  (event: "update:noteDraft", value: string): void;
  (event: "translationModal", value: {
    provider: "google" | "baidu";
    targetLanguage: string;
    sourceText: string;
    translatedText: string;
    loading: boolean;
    error: string;
    position: { left: number; top: number; bottom?: number } | null;
  } | null): void;
  (event: "notice", message: string): void;
  (event: "selectDocument", documentId: string): void;
  (event: "openDocument", documentId: string): void;
  (event: "readermIndexed", context: DocumentContext): void;
}>();

const { t } = useI18n();
const context = ref<DocumentContext | null>(null);
const loading = ref(false);
const error = ref("");
const titleDraft = ref("");
const editingTitle = ref(false);
const pageJumpDraft = ref("1");
const pageTextItems = ref<Record<number, PdfTextItem[]>>({});
const annotationToolMode = ref<AnnotationToolMode>("select");
const annotationColor = ref("#BBD4F6");
const activeAnchor = ref<DocumentContext["anchors"][number] | null>(null);
const activeAnnotation = ref<Annotation | null>(null);
const referencePreview = ref<PdfHoverPreview | null>(null);
const referencePreviewFixed = ref(false);
const referencePreviewFixedPosition = ref<{ left: number; top: number } | null>(null);
const tableSheet = ref<PdfTableSheet | null>(null);
const selectionState = ref<(ReaderSelection & { position: { left: number; top: number; bottom?: number } }) | null>(null);
const pendingImageInsert = ref<{ target: "notes" | "summary"; selection?: { start: number; end: number } } | null>(null);
const pendingReadermImageInsert = ref<{ selection?: { start: number; end: number } } | null>(null);
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
const notesMode = ref<"edit" | "live" | "preview">("live");
const rightPanelTab = ref<RightPanelTab>("annotations");
const rightPanelCollapsed = ref(false);
const selectedText = computed(() => selectionState.value?.text || "");
const readermNoteDraft = computed({
  get: () => props.noteDraft,
  set: (value: string) => emit("update:noteDraft", value),
});

const { pdfDocument, pageNumbers, loadPdf, clearPdf } = usePdfDocument();
const {
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
const {
  searchOpen,
  searchQuery,
  searchMatches,
  activeSearchIndex,
  activeSearchMatch,
  syncActiveSearchMatch,
  nextSearch,
} = usePdfSearch(pageTextItems, scrollToPage, pdfDocument);

const documentTitle = computed(() => context.value?.document.title || "Referenced PDF");
const totalPages = computed(() => pageNumbers.value.length);
const annotations = computed(() => sortAnnotations(context.value?.annotations || []));
const canUseTranslationApi = computed(() => props.settings?.translator_mode === "api");
const currentPageIndex = computed(() => Math.max(0, currentPageNumber.value - 1));
const visibleSearchMatches = computed(() => searchOpen.value && searchQuery.value.trim() ? searchMatches.value : []);
const visibleActiveSearchMatch = computed(() => searchOpen.value && searchQuery.value.trim() ? activeSearchMatch.value : null);
const pdfSourceOptions = computed(() => [
  { value: "", label: t("readerm.referencedPdf") },
  ...(props.historyDocuments || []).map((document) => ({
    value: document.document_id,
    label: document.title,
  })),
]);
const annotationCommentEditorStyle = computed(() => {
  const editor = annotationCommentEditor.value;
  if (!editor) return {};
  return {
    left: `${Math.min(Math.max(12, editor.position.left), Math.max(12, window.innerWidth - 392))}px`,
    top: `${Math.min(Math.max(12, editor.position.top), Math.max(12, window.innerHeight - 216))}px`,
  };
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
} = usePdfPreviewActions({
  pdfDocument,
  referencePreview,
  referencePreviewFixed,
  referencePreviewFixedPosition,
  tableSheet,
  rightPanelCollapsed,
  rightPanelWidth: ref(0),
  currentPageIndex,
  currentPageNumber,
  scrollToPage,
  showNotice,
});

const {
  createAnnotation,
  handleSelection,
  handleAnnotationToolMode,
  saveAnnotationCommentEditor,
  updateAnnotationCommentEditorType,
  updateAnnotationCommentEditorColor,
  undoLastAnnotation,
  copySelectedText,
  copyQuote,
  quoteToNote,
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
  noteDraft: readermNoteDraft,
  notesMode,
  rightPanelTab,
  rightPanelCollapsed,
  pageTextItems,
  scrollToPage,
  showNotice,
});

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("pointerdown", handleGlobalPointerDown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("pointerdown", handleGlobalPointerDown);
});

watch(currentPageNumber, (page) => {
  pageJumpDraft.value = String(page);
});

watch(searchMatches, () => {
  syncActiveSearchMatch();
});

watch(
  () => [props.documentId, props.anchorId, props.navigationKey] as const,
  ([documentId, anchorId]) => {
    void openReferencedDocument(documentId || "", anchorId || "");
  },
  { immediate: true },
);

watch(
  () => props.captureRequest?.requestId,
  (requestId) => {
    if (!requestId) return;
    beginReadermRegionCapture(props.captureRequest?.selection);
  },
);

function clearPane() {
  context.value = null;
  activeAnchor.value = null;
  activeAnnotation.value = null;
  referencePreview.value = null;
  referencePreviewFixed.value = false;
  referencePreviewFixedPosition.value = null;
  closePdfLinkReturnTarget();
  selectionState.value = null;
  annotationCommentEditor.value = null;
  lastCreatedAnnotationId.value = null;
  pendingReadermImageInsert.value = null;
  annotationToolMode.value = "select";
  pageTextItems.value = {};
  clearPdf();
  clearPages();
}

async function openReferencedDocument(documentId: string, anchorId = "") {
  clearPane();
  if (!documentId) {
    error.value = t("readerm.selectReference");
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const nextContext = await window.paperReaderPlus.getDocumentContext(documentId);
    context.value = nextContext;
    titleDraft.value = nextContext.document.title;
    if (nextContext.document.source_type === "markdown" || nextContext.document.source_type === "readerm") {
      error.value = t("readerm.nonPdfReference");
      return;
    }
    const raw = await window.paperReaderPlus.getPdfData(documentId);
    const data = raw instanceof ArrayBuffer ? raw : new Uint8Array(raw).buffer;
    await loadPdf(data);
    await nextTick();
    const anchor = anchorId ? nextContext.anchors.find((item) => item.anchor_id === anchorId) || null : null;
    activeAnchor.value = anchor;
    scrollToPage(anchor?.page_index || 0, anchor ? { rectsPct: anchor.rects_pct, block: "center" } : undefined);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    loading.value = false;
  }
}

function jumpToPage() {
  const page = Math.min(totalPages.value, Math.max(1, Number.parseInt(pageJumpDraft.value, 10) || 1));
  scrollToPage(page - 1);
}

function showUnavailable() {
  emit("notice", t("readerm.openSourceForTools"));
}

function showNotice(message: string) {
  emit("notice", message);
}

function openSelectedPdfSource() {
  if (!props.documentId) return;
  emit("openDocument", props.documentId);
}

function setSelectionFromAction(payload: {
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
}

async function translateSelectionInReadermPane() {
  if (!selectionState.value) {
    showNotice("Select text first");
    return;
  }
  if (!canUseTranslationApi.value) {
    showUnavailable();
    return;
  }
  if (!context.value) return;
  const provider = props.settings?.translation_provider || "google";
  const targetLanguage = props.settings?.translator_target_language || "Chinese";
  const readerContext = buildReaderContextPayload({
    document: context.value.document,
    context: context.value,
    note: props.noteDraft,
    summary: "",
    selection: {
      text: selectionState.value.text,
      page_index: selectionState.value.pageIndex,
      anchor: null,
      annotation: activeAnnotation.value,
    },
    activeAnnotation: activeAnnotation.value,
  });
  emit("translationModal", {
    provider,
    targetLanguage,
    sourceText: selectionState.value.text,
    translatedText: "",
    loading: true,
    error: "",
    position: selectionState.value.position || null,
  });
  try {
    const response = await window.paperReaderPlus.translateSelection(toIpcPlainObject({
      text: selectionState.value.text,
      target_language: targetLanguage,
      task: "translate",
      document: context.value.document,
      selection: readerContext.selection,
      reader_context: readerContext,
      messages: [],
    }));
    emit("translationModal", {
      provider,
      targetLanguage,
      sourceText: selectionState.value.text,
      translatedText: response.content,
      loading: false,
      error: "",
      position: selectionState.value.position || null,
    });
  } catch (cause) {
    emit("translationModal", {
      provider,
      targetLanguage,
      sourceText: selectionState.value.text,
      translatedText: "",
      loading: false,
      error: cause instanceof Error ? cause.message : String(cause),
      position: selectionState.value.position || null,
    });
  }
}

async function handleReadermParagraphAction(payload: {
  action: "translate" | "quote" | "askAi";
  pageIndex: number;
  text: string;
  rectsPct: RectPct[];
  position: { left: number; top: number; bottom?: number };
}) {
  setSelectionFromAction(payload);
  if (payload.action === "quote") {
    await copyQuote();
  } else if (payload.action === "translate") {
    await translateSelectionInReadermPane();
  } else {
    showUnavailable();
  }
}

function insertMarkdownAt(value: string, markdown: string, selection?: { start: number; end: number }) {
  const insertion = `\n\n${markdown}\n\n`;
  if (!selection) return `${value}${insertion}`;
  return `${value.slice(0, selection.start)}${insertion}${value.slice(selection.end)}`;
}

function beginReadermRegionCapture(selection?: { start: number; end: number }) {
  if (!props.readermDocumentId) return;
  if (!context.value || context.value.document.source_type === "markdown" || context.value.document.source_type === "readerm") {
    showNotice(t("readerm.selectPdfBeforeCapture"));
    return;
  }
  pendingReadermImageInsert.value = { selection };
  pendingImageInsert.value = null;
  selectionState.value = null;
  annotationToolMode.value = "image";
  showNotice(t("readerm.dragRegionForCaption"));
}

async function captureReadermImageRegion(payload: { pageIndex: number; dataUrl: string; rectPct: RectPct }) {
  const pending = pendingReadermImageInsert.value;
  if (!pending || !context.value) {
    showUnavailable();
    return;
  }
  try {
    const result = await window.paperReaderPlus.saveImageDataUrl(
      props.readermDocumentId,
      payload.dataUrl,
      `page-${payload.pageIndex + 1}`,
    );
    const anchor = await window.paperReaderPlus.createAnchor(
      context.value.document.document_id,
      toIpcPlainObject(buildImageRegionAnchorCreateRequest(payload.pageIndex, payload.rectPct)),
    );
    context.value.anchors = [...context.value.anchors, anchor];
    activeAnchor.value = anchor;
    const nextMarkdown = insertMarkdownAt(props.noteDraft, linkedImageMarkdown(result.markdown, anchor), pending.selection);
    emit("update:noteDraft", nextMarkdown);
    await window.paperReaderPlus.saveNote(props.readermDocumentId, nextMarkdown);
    emit("readermIndexed", await window.paperReaderPlus.getDocumentContext(props.readermDocumentId));
    pendingReadermImageInsert.value = null;
    annotationToolMode.value = "select";
    showNotice(t("readerm.captionInserted", { page: payload.pageIndex + 1 }));
  } catch (cause) {
    pendingReadermImageInsert.value = null;
    annotationToolMode.value = "select";
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
}

async function pasteReadermImage(payload: { dataUrl: string; selection?: { start: number; end: number } }) {
  try {
    const result = await window.paperReaderPlus.saveImageDataUrl(props.readermDocumentId, payload.dataUrl, "pasted-image");
    emit("update:noteDraft", insertMarkdownAt(props.noteDraft, result.markdown, payload.selection));
    showNotice(t("readerm.imageInserted"));
  } catch (cause) {
    showNotice(cause instanceof Error ? cause.message : String(cause));
  }
}

function resizeReadermImage(assetPath: string) {
  const match = props.noteDraft.match(markdownImagePattern(assetPath));
  if (!match) {
    showNotice("Could not find this image in the current markdown.");
    return;
  }
  const currentWidth = match[3] || "";
  const currentHeight = match[4] || "";
  const widthInput = window.prompt("Image width in pixels. Leave blank for auto.", currentWidth);
  if (widthInput === null) return;
  const heightInput = window.prompt("Image height in pixels. Leave blank for auto.", currentHeight);
  if (heightInput === null) return;
  const width = widthInput.trim() ? Number(widthInput.trim()) : 0;
  const height = heightInput.trim() ? Number(heightInput.trim()) : 0;
  if ((!Number.isFinite(width) || width < 0 || width > 9999) || (!Number.isFinite(height) || height < 0 || height > 9999)) {
    showNotice("Image size must be between 0 and 9999 pixels.");
    return;
  }
  emit("update:noteDraft", resizeMarkdownImage(props.noteDraft, assetPath, Math.round(width), Math.round(height)));
  showNotice("Image size updated");
}

defineExpose({
  pasteReadermImage,
  resizeReadermImage,
});

function handleKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
    const target = event.target as HTMLElement | null;
    if (!target?.closest(".readerm-pdf-pane")) return;
    event.preventDefault();
    searchOpen.value = true;
    return;
  }
  if (event.key !== "Escape") return;
  annotationToolMode.value = "select";
  pendingReadermImageInsert.value = null;
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
  if (!target.closest(".readerm-pdf-pane")) {
    if (annotationCommentEditor.value) void saveAnnotationCommentEditor();
    selectionState.value = null;
    activeAnnotation.value = null;
    activeAnchor.value = null;
    searchOpen.value = false;
    return;
  }
  if (annotationCommentEditor.value) void saveAnnotationCommentEditor();
  if (target.closest(".selection-toolbar, .reference-preview, .popover, .pdf-toolbar, .readerm-pdf-sourcebar, .pdf-paragraph-action, .pdf-paragraph-menu")) return;
  selectionState.value = null;
  if (!target.closest(".annotation-overlay, .note-marker")) {
    activeAnnotation.value = null;
    activeAnchor.value = null;
  }
  searchOpen.value = false;
}
</script>

<template>
  <section class="readerm-pdf-pane">
    <header class="readerm-pdf-sourcebar">
      <label>{{ t("readerm.pdfSource") }}</label>
      <UiDropdown
        :model-value="documentId || ''"
        :title="t('readerm.pdfSource')"
        :options="pdfSourceOptions"
        @update:model-value="emit('selectDocument', $event)"
      />
      <button
        type="button"
        class="readerm-pdf-open-source"
        :title="t('readerm.openPdfSource')"
        :disabled="!documentId"
        @click="openSelectedPdfSource"
      >
        <ExternalLink :size="16" />
      </button>
    </header>
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
      :reference-preview="referencePreview"
      :reference-preview-fixed="referencePreviewFixed"
      :reference-preview-fixed-position="referencePreviewFixedPosition"
      :pdf-link-return-target="pdfLinkReturnTarget"
      :author-profiles="[]"
      :author-preview="null"
      :dictionary-entries="[]"
      :dictionary-preview="null"
      :can-rename="false"
      :can-open-annotations="false"
      :can-translate="canUseTranslationApi"
      :can-ask-ai="false"
      :can-current-page-preview="false"
      :can-delete-document="false"
      @edit-title="showUnavailable"
      @save-title="editingTitle = false"
      @zoom="zoom"
      @reset-zoom="resetZoom"
      @undo="undoLastAnnotation"
      @jump-to-page="jumpToPage"
      @toggle-search="searchOpen = !searchOpen"
      @open-current-page-preview="showUnavailable"
      @show-annotations="showUnavailable"
      @update:annotation-tool-mode="handleAnnotationToolMode"
      @delete-document="showUnavailable"
      @quote="copyQuote"
      @quote-to-note="quoteToNote"
      @translate="translateSelectionInReadermPane"
      @ask-ai="showUnavailable"
      @previous-search="nextSearch(-1)"
      @next-search="nextSearch(1)"
      @wheel="handleWheel"
      @scroll-element="setPdfScrollElement"
      @selection="handleSelection"
      @annotation-click="handleAnnotationClick"
      @rendered="setPageElement($event.pageIndex, $event.element)"
      @text-items="pageTextItems = { ...pageTextItems, [$event.pageIndex]: $event.items }"
      @image-selection="captureReadermImageRegion"
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
      @symbol-click="showUnavailable"
      @author-hover="() => {}"
      @clear-author-hover="() => {}"
      @open-author-document="openReferencedDocument"
      @dictionary-hover="() => {}"
      @clear-dictionary-hover="() => {}"
      @paragraph-action="handleReadermParagraphAction"
    />
    <SelectionToolbar
      v-model:color="annotationColor"
      :selected-text="selectedText"
      :position="selectionState?.position || null"
      :can-translate="canUseTranslationApi"
      :can-metaphor="false"
      :can-ask-ai="false"
      @copy="copySelectedText"
      @quote="copyQuote"
      @quote-to-note="quoteToNote"
      @annotate="createAnnotation"
      @translate="translateSelectionInReadermPane"
      @metaphor="showUnavailable"
      @ask-ai="showUnavailable"
    />
    <section
      v-if="annotationCommentEditor"
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
  </section>
</template>
