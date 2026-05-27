<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Highlighter,
  Languages,
  ListChecks,
  MoreHorizontal,
  MousePointer2,
  PictureInPicture,
  Quote,
  RefreshCcw,
  Save,
  Search,
  Underline,
  ZoomIn,
  ZoomOut,
} from "lucide-vue-next";
import AuthorNetworkPreview from "@/components/AuthorNetworkPreview.vue";
import DictionaryPreview from "@/components/DictionaryPreview.vue";
import ColorDropdown from "@/components/ColorDropdown.vue";
import PdfPage from "@/components/PdfPage.vue";
import PdfReferencePreview from "@/components/PdfReferencePreview.vue";
import { useDropdownPopover } from "@/composables/useDropdownPopover";
import { useI18n } from "@/i18n";
import type { AnnotationToolMode } from "@/services/ReaderAnnotationService";
import type { PdfLinkReturnTarget } from "@/composables/usePdfPreviewActions";
import type { PdfDocumentProxyLike, PdfHoverPreview, PdfLinkAnnotation, PdfPageMetrics, PdfReferenceCandidate, PdfSearchMatch, PdfTextItem } from "@/pdf/pdfTypes";
import type { Anchor, Annotation, AuthorHoverPreview, AuthorProfile, DictionaryEntry, DictionaryHoverPreview, FormulaAnalysis, RectPct, Settings } from "@/types";

const props = withDefaults(defineProps<{
  documentTitle: string;
  titleDraft: string;
  editingTitle: boolean;
  annotationToolMode: AnnotationToolMode;
  annotationColor: string;
  pdfZoom: number;
  pageJumpDraft: string;
  totalPages: number;
  searchOpen: boolean;
  searchQuery: string;
  activeSearchIndex: number;
  searchMatchesLength: number;
  loading: boolean;
  error: string;
  pageNumbers: number[];
  pdfDocument: PdfDocumentProxyLike | null;
  pageRenderWidth: number;
  activeAnchor: Anchor | null;
  annotations: Annotation[];
  activeAnnotation: Annotation | null;
  searchMatches: PdfSearchMatch[];
  activeSearchMatch: PdfSearchMatch | null;
  hasSelection: boolean;
  referencePreview: PdfHoverPreview | null;
  referencePreviewFixed: boolean;
  referencePreviewFixedPosition: { left: number; top: number } | null;
  pdfLinkReturnTarget: PdfLinkReturnTarget | null;
  authorProfiles: AuthorProfile[];
  authorPreview: AuthorHoverPreview | null;
  dictionaryEntries: DictionaryEntry[];
  documentId?: string;
  formulas?: FormulaAnalysis[];
  settings?: Settings | null;
  dictionaryPreview: DictionaryHoverPreview | null;
  captureImageScale?: number;
  pdfParagraphActionsEnabled?: boolean;
  pdfAuthorGraphEnabled?: boolean;
  pdfInternalLinkPreviewEnabled?: boolean;
  canRename?: boolean;
  canOpenAnnotations?: boolean;
  canTranslate?: boolean;
  canAskAi?: boolean;
  canCurrentPagePreview?: boolean;
  canSaveDocument?: boolean;
  canDownloadPdf?: boolean;
  canDeleteDocument?: boolean;
}>(), {
  canRename: true,
  canOpenAnnotations: true,
  canTranslate: true,
  canAskAi: true,
  canCurrentPagePreview: true,
  canSaveDocument: true,
  canDownloadPdf: true,
  canDeleteDocument: true,
  pdfParagraphActionsEnabled: true,
  pdfAuthorGraphEnabled: true,
  pdfInternalLinkPreviewEnabled: true,
});

const { t } = useI18n();

const emit = defineEmits<{
  (event: "update:titleDraft", value: string): void;
  (event: "update:pageJumpDraft", value: string): void;
  (event: "update:searchQuery", value: string): void;
  (event: "update:annotationToolMode", value: AnnotationToolMode): void;
  (event: "update:annotationColor", value: string): void;
  (event: "editTitle"): void;
  (event: "saveTitle"): void;
  (event: "zoom", delta: number): void;
  (event: "resetZoom"): void;
  (event: "undo"): void;
  (event: "jumpToPage"): void;
  (event: "toggleSearch"): void;
  (event: "saveDocument"): void;
  (event: "downloadPdf"): void;
  (event: "openCurrentPagePreview"): void;
  (event: "showAnnotations"): void;
  (event: "deleteDocument"): void;
  (event: "quote"): void;
  (event: "quoteToNote"): void;
  (event: "askAi"): void;
  (event: "translate"): void;
  (event: "previousSearch"): void;
  (event: "nextSearch"): void;
  (event: "wheel", value: WheelEvent): void;
  (event: "scrollElement", element: HTMLElement | null): void;
  (event: "selection", payload: { pageIndex: number; text: string; rectsPct: RectPct[]; font?: { font_name: string; font_size: number }; position: { left: number; top: number; bottom?: number } }): void;
  (event: "annotationClick", annotation: Annotation): void;
  (event: "rendered", payload: { pageIndex: number; element: HTMLElement | null; metrics?: PdfPageMetrics }): void;
  (event: "textItems", payload: { pageIndex: number; items: PdfTextItem[] }): void;
  (event: "imageSelection", payload: { pageIndex: number; dataUrl: string; rectPct: RectPct }): void;
  (event: "linkClick", link: PdfLinkAnnotation): void;
  (event: "linkPreview", payload: { link: PdfLinkAnnotation; position: { left: number; top: number } }): void;
  (event: "referencePreview", payload: { reference: PdfReferenceCandidate; position: { left: number; top: number } }): void;
  (event: "referenceJump", reference: PdfReferenceCandidate): void;
  (event: "clearReferencePreview"): void;
  (event: "closeReferencePreview"): void;
  (event: "keepReferencePreview"): void;
  (event: "toggleReferencePreviewFixed"): void;
  (event: "moveReferencePreviewFixed", position: { left: number; top: number }): void;
  (event: "jumpReferencePreview", pageIndex: number): void;
  (event: "previewReferencePage", delta: number): void;
  (event: "returnReferencePreview"): void;
  (event: "returnPdfLinkSource"): void;
  (event: "closePdfLinkReturnTarget"): void;
  (event: "openReferenceSpreadsheet"): void;
  (event: "symbolClick", payload: { symbol: string; pageIndex: number }): void;
  (event: "authorHover", payload: AuthorHoverPreview): void;
  (event: "clearAuthorHover"): void;
  (event: "openAuthorDocument", documentId: string): void;
  (event: "dictionaryHover", payload: DictionaryHoverPreview): void;
  (event: "clearDictionaryHover"): void;
  (event: "paragraphAction", payload: { action: "translate" | "quote" | "askAi"; pageIndex: number; text: string; rectsPct: RectPct[]; position: { left: number; top: number; bottom?: number }; source: "paragraph" }): void;
  (event: "formulaAskAi", candidate: import("@/services/FormulaAnalysisService").FormulaCandidate): void;
  (event: "formulaAnalyze", candidate: import("@/services/FormulaAnalysisService").FormulaCandidate): void;
}>();

const scrollRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const {
  open: pdfMoreToolsOpen,
  rootRef: pdfMoreToolsRoot,
  triggerRef: pdfMoreToolsTrigger,
  menuStyle: pdfMoreToolsStyle,
  closeMenu: closePdfMoreTools,
  toggleOpen: togglePdfMoreTools,
} = useDropdownPopover(".pdf-more-tools-menu, .color-dropdown-menu", { offset: 7, align: "right" });

function publishScrollElement() {
  emit("scrollElement", scrollRef.value);
}

function focusSearchInput() {
  if (!props.searchOpen) return;
  void nextTick(() => {
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
  });
}

function handleSearchEnter(event: KeyboardEvent) {
  if (event.shiftKey) emit("previousSearch");
  else emit("nextSearch");
}

function runPdfMoreTool(action: () => void) {
  closePdfMoreTools();
  action();
}

onMounted(() => {
  void nextTick(publishScrollElement);
  focusSearchInput();
});

onBeforeUnmount(() => {
  closePdfMoreTools();
  emit("scrollElement", null);
});

watch(scrollRef, publishScrollElement);
watch(() => props.searchOpen, focusSearchInput);
</script>

<template>
  <section class="pdf-workspace">
    <header class="pdf-toolbar">
      <div class="pdf-title-row">
        <div class="title-edit">
          <input
            v-if="editingTitle"
            :value="titleDraft"
            @input="emit('update:titleDraft', ($event.target as HTMLInputElement).value)"
            @keydown.enter.prevent="emit('saveTitle')"
            @blur="emit('saveTitle')"
          />
          <button v-else type="button" class="title-button" :title="t('pdf.rename')" :disabled="canRename === false" @click="emit('editTitle')">{{ documentTitle }}</button>
        </div>
        <div class="pdf-title-actions">
          <button type="button" class="pdf-title-search" :title="t('pdf.search')" :aria-label="t('pdf.search')" :class="{ active: searchOpen }" @click="emit('toggleSearch')"><Search :size="17" /></button>
          <button type="button" class="pdf-title-save" :title="t('common.save')" :aria-label="t('common.save')" :disabled="canSaveDocument === false" @click="emit('saveDocument')"><Save :size="17" /></button>
          <button type="button" class="pdf-title-download" :title="t('pdf.downloadPdf')" :aria-label="t('pdf.downloadPdf')" :disabled="canDownloadPdf === false" @click="emit('downloadPdf')"><Download :size="17" /></button>
        </div>
      </div>
      <div class="pdf-action-row">
        <div class="toolbar-zone toolbar-zone-left">
          <div class="toolbar-group">
            <button type="button" :title="t('pdf.zoomOut')" @click="emit('zoom', -1)"><ZoomOut :size="17" /></button>
            <span class="zoom-label">{{ Math.round(pdfZoom * 100) }}%</span>
            <button type="button" :title="t('pdf.zoomIn')" @click="emit('zoom', 1)"><ZoomIn :size="17" /></button>
            <button type="button" class="pdf-toolbar-reset-zoom" :title="t('pdf.resetZoom')" @click="emit('resetZoom')"><RefreshCcw :size="16" /></button>
            <button type="button" class="pdf-toolbar-undo" :title="t('pdf.undoAnnotation')" @click="emit('undo')"><History :size="17" /></button>
          </div>
        </div>
        <div class="toolbar-zone toolbar-zone-center">
          <div class="toolbar-group">
            <button type="button" :title="t('pdf.selectText')" :class="{ active: annotationToolMode === 'select' }" @click="emit('update:annotationToolMode', 'select')"><MousePointer2 :size="17" /></button>
            <button type="button" class="pdf-toolbar-highlight" :title="t('annotation.type.highlight')" :class="{ active: annotationToolMode === 'highlight' }" @click="emit('update:annotationToolMode', 'highlight')"><Highlighter :size="17" /></button>
            <button type="button" class="pdf-toolbar-underline" :title="t('annotation.type.underline')" :class="{ active: annotationToolMode === 'underline' }" @click="emit('update:annotationToolMode', 'underline')"><Underline :size="17" /></button>
            <button v-if="canOpenAnnotations !== false" type="button" :title="t('pdf.openAnnotations')" @click="emit('showAnnotations')"><ListChecks :size="17" /></button>
            <ColorDropdown class="pdf-toolbar-annotation-color" :model-value="annotationColor" :title="t('annotation.color')" @update:model-value="emit('update:annotationColor', $event)" />
            <button type="button" class="pdf-toolbar-quote" :title="t('pdf.copyQuote')" :disabled="!hasSelection" @click="emit('quote')"><Quote :size="17" /></button>
            <button type="button" class="pdf-toolbar-translate" :title="t('pdf.translateSelection')" :disabled="!hasSelection || canTranslate === false" @click="emit('translate')"><Languages :size="17" /></button>
            <button type="button" class="pdf-toolbar-ask-ai" :title="t('pdf.askAiSelection')" :disabled="!hasSelection || canAskAi === false" @click="emit('askAi')"><Bot :size="17" /></button>
          </div>
        </div>
        <div class="toolbar-zone toolbar-zone-right">
          <div class="toolbar-group">
            <button type="button" class="pdf-toolbar-float-window" :title="t('pdf.currentPagePreview')" :disabled="canCurrentPagePreview === false" @click="emit('openCurrentPagePreview')"><PictureInPicture :size="17" /></button>
            <div ref="pdfMoreToolsRoot" class="pdf-more-tools">
              <button ref="pdfMoreToolsTrigger" type="button" class="pdf-more-tools-trigger" :class="{ active: pdfMoreToolsOpen }" :title="t('pdf.moreTools')" @click="togglePdfMoreTools"><MoreHorizontal :size="17" /></button>
            </div>
          </div>
        </div>
      </div>
    </header>
    <Teleport to="body">
      <div v-if="pdfMoreToolsOpen" class="pdf-more-tools-menu pdf-more-tools-floating" :style="pdfMoreToolsStyle">
        <button type="button" :title="t('pdf.resetZoom')" @click="runPdfMoreTool(() => emit('resetZoom'))"><RefreshCcw :size="17" /><span>{{ t("pdf.resetZoom") }}</span></button>
        <button type="button" :title="t('pdf.undoAnnotation')" @click="runPdfMoreTool(() => emit('undo'))"><History :size="17" /><span>{{ t("pdf.undoAnnotation") }}</span></button>
        <div class="pdf-more-tools-separator" />
        <ColorDropdown class="pdf-more-tools-color" :model-value="annotationColor" :title="t('annotation.color')" @update:model-value="emit('update:annotationColor', $event)" />
        <button type="button" :title="t('annotation.type.highlight')" :class="{ active: annotationToolMode === 'highlight' }" @click="runPdfMoreTool(() => emit('update:annotationToolMode', 'highlight'))"><Highlighter :size="17" /><span>{{ t("annotation.type.highlight") }}</span></button>
        <button type="button" :title="t('annotation.type.underline')" :class="{ active: annotationToolMode === 'underline' }" @click="runPdfMoreTool(() => emit('update:annotationToolMode', 'underline'))"><Underline :size="17" /><span>{{ t("annotation.type.underline") }}</span></button>
        <button type="button" :title="t('pdf.copyQuote')" :disabled="!hasSelection" @click="runPdfMoreTool(() => emit('quote'))"><Quote :size="17" /><span>{{ t("pdf.copyQuote") }}</span></button>
        <div class="pdf-more-tools-separator" />
        <button type="button" :title="t('pdf.translateSelection')" :disabled="!hasSelection || canTranslate === false" @click="runPdfMoreTool(() => emit('translate'))"><Languages :size="17" /><span>{{ t("pdf.translateSelection") }}</span></button>
        <button type="button" :title="t('pdf.askAiSelection')" :disabled="!hasSelection || canAskAi === false" @click="runPdfMoreTool(() => emit('askAi'))"><Bot :size="17" /><span>{{ t("pdf.askAiSelection") }}</span></button>
        <div class="pdf-more-tools-separator" />
        <button type="button" :title="t('pdf.currentPagePreview')" :disabled="canCurrentPagePreview === false" @click="runPdfMoreTool(() => emit('openCurrentPagePreview'))"><PictureInPicture :size="17" /><span>{{ t("pdf.currentPagePreview") }}</span></button>
      </div>
    </Teleport>

    <div v-if="searchOpen" class="popover search-popover">
      <input
        ref="searchInputRef"
        :value="searchQuery"
        :placeholder="t('pdf.searchPlaceholder')"
        @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        @keydown.enter.prevent="handleSearchEnter"
      />
      <button type="button" @click="emit('previousSearch')"><ChevronLeft :size="16" /></button>
      <span>{{ activeSearchIndex + 1 || 0 }}/{{ searchMatchesLength }}</span>
      <button type="button" @click="emit('nextSearch')"><ChevronRight :size="16" /></button>
    </div>
    <div v-if="pdfLinkReturnTarget" class="pdf-link-return-bar" role="status">
      <span>{{ t("preview.internalLinkOpened") }}</span>
      <button type="button" @click="emit('returnPdfLinkSource')">{{ t("preview.returnToLinkSource") }}</button>
      <button type="button" @click="emit('closePdfLinkReturnTarget')">{{ t("common.close") }}</button>
    </div>
    <section ref="scrollRef" class="pdf-scroll" @wheel="emit('wheel', $event)">
      <div v-if="loading" class="loading">{{ t("common.loadingPdf") }}</div>
      <PdfPage
        v-for="page in pageNumbers"
        :key="page"
        :pdf-document="pdfDocument"
        :document-id="documentId"
        :page-number="page"
        :scale-width="pageRenderWidth"
        :active-anchor="activeAnchor"
        :annotations="annotations"
        :active-annotation="activeAnnotation"
        :search-matches="searchMatches"
        :active-search-match="activeSearchMatch"
        :image-select-mode="annotationToolMode === 'image'"
        :author-profiles="authorProfiles"
        :dictionary-entries="dictionaryEntries"
        :formulas="formulas || []"
        :settings="settings"
        :capture-image-scale="captureImageScale"
        :pdf-paragraph-actions-enabled="pdfParagraphActionsEnabled !== false"
        :pdf-author-graph-enabled="pdfAuthorGraphEnabled !== false"
        :pdf-internal-link-preview-enabled="pdfInternalLinkPreviewEnabled !== false"
        :can-translate="canTranslate !== false"
        :can-ask-ai="canAskAi !== false"
        @selection="emit('selection', $event)"
        @annotation-click="emit('annotationClick', $event)"
        @rendered="emit('rendered', $event)"
        @text-items="emit('textItems', $event)"
        @image-selection="emit('imageSelection', $event)"
        @link-click="emit('linkClick', $event)"
        @link-preview="emit('linkPreview', $event)"
        @clear-reference-preview="emit('clearReferencePreview')"
        @reference-preview="emit('referencePreview', $event)"
        @reference-jump="emit('referenceJump', $event)"
        @symbol-click="emit('symbolClick', $event)"
        @author-hover="emit('authorHover', { author: $event.author, anchor: $event.position })"
        @clear-author-hover="emit('clearAuthorHover')"
        @dictionary-hover="emit('dictionaryHover', { entry: $event.entry, anchor: $event.position })"
        @clear-dictionary-hover="emit('clearDictionaryHover')"
        @paragraph-action="emit('paragraphAction', $event)"
        @formula-ask-ai="emit('formulaAskAi', $event)"
        @formula-analyze="emit('formulaAnalyze', $event)"
      />
      <p v-if="error" class="error pdf-error">{{ error }}</p>
    </section>
    <PdfReferencePreview
      v-if="pdfInternalLinkPreviewEnabled !== false"
      :preview="referencePreview"
      :total-pages="totalPages"
      :fixed="referencePreviewFixed"
      :fixed-position="referencePreviewFixedPosition"
      @keep-open="emit('keepReferencePreview')"
      @clear="emit('clearReferencePreview')"
      @close="emit('closeReferencePreview')"
      @toggle-fixed="emit('toggleReferencePreviewFixed')"
      @move-fixed="emit('moveReferencePreviewFixed', $event)"
      @jump="emit('jumpReferencePreview', $event)"
      @preview-page="emit('previewReferencePage', $event)"
      @return-preview="emit('returnReferencePreview')"
      @selection="emit('selection', $event)"
      @open-spreadsheet="emit('openReferenceSpreadsheet')"
    />
    <AuthorNetworkPreview
      v-if="pdfAuthorGraphEnabled !== false"
      :preview="authorPreview"
      @clear="emit('clearAuthorHover')"
      @open-document="emit('openAuthorDocument', $event)"
    />
    <DictionaryPreview
      :preview="dictionaryPreview"
      @clear="emit('clearDictionaryHover')"
    />
    <footer class="pdf-page-footer">
      <input
        :value="pageJumpDraft"
        class="page-input"
        :title="t('common.page')"
        @input="emit('update:pageJumpDraft', ($event.target as HTMLInputElement).value)"
        @keydown.enter.prevent="emit('jumpToPage')"
      />
      <span>/ {{ totalPages }}</span>
    </footer>
  </section>
</template>
