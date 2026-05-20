<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AnnotationOverlay from "@/components/AnnotationOverlay.vue";
import PdfCanvasPage from "@/components/PdfCanvasPage.vue";
import PdfAuthorLayer from "@/components/PdfAuthorLayer.vue";
import PdfDictionaryLayer from "@/components/PdfDictionaryLayer.vue";
import PdfLinkLayer from "@/components/PdfLinkLayer.vue";
import PdfParagraphActionLayer from "@/components/PdfParagraphActionLayer.vue";
import PdfReferenceLayer from "@/components/PdfReferenceLayer.vue";
import { useI18n } from "@/i18n";
import PdfTextLayer from "@/components/PdfTextLayer.vue";
import type { PdfDocumentProxyLike, PdfLinkAnnotation, PdfPageMetrics, PdfReferenceCandidate, PdfSearchMatch, PdfTextItem } from "@/pdf/pdfTypes";
import type { Anchor, Annotation, AuthorProfile, DictionaryEntry, RectPct } from "@/types";

const props = withDefaults(defineProps<{
  pdfDocument: PdfDocumentProxyLike | null;
  pageNumber: number;
  scaleWidth: number;
  activeAnchor?: Anchor | null;
  annotations?: Annotation[];
  activeAnnotation?: Annotation | null;
  searchMatches?: PdfSearchMatch[];
  activeSearchMatch?: PdfSearchMatch | null;
  imageSelectMode?: boolean;
  authorProfiles?: AuthorProfile[];
  dictionaryEntries?: DictionaryEntry[];
  captureImageScale?: number;
  canTranslate?: boolean;
  canAskAi?: boolean;
}>(), {
  canTranslate: true,
  canAskAi: true,
});

const { t } = useI18n();

const emit = defineEmits<{
  (event: "selection", payload: { pageIndex: number; text: string; rectsPct: RectPct[]; font?: { font_name: string; font_size: number }; position: { left: number; top: number; bottom?: number } }): void;
  (event: "rendered", payload: { pageIndex: number; element: HTMLElement | null; metrics?: PdfPageMetrics }): void;
  (event: "annotationClick", annotation: Annotation): void;
  (event: "textItems", payload: { pageIndex: number; items: PdfTextItem[] }): void;
  (event: "imageSelection", payload: { pageIndex: number; dataUrl: string; rectPct: RectPct }): void;
  (event: "linkClick", link: PdfLinkAnnotation): void;
  (event: "linkPreview", payload: { link: PdfLinkAnnotation; position: { left: number; top: number } }): void;
  (event: "clearReferencePreview"): void;
  (event: "referencePreview", payload: { reference: PdfReferenceCandidate; position: { left: number; top: number } }): void;
  (event: "referenceJump", reference: PdfReferenceCandidate): void;
  (event: "symbolClick", payload: { symbol: string; pageIndex: number }): void;
  (event: "authorHover", payload: { author: AuthorProfile; position: { left: number; top: number } }): void;
  (event: "clearAuthorHover"): void;
  (event: "dictionaryHover", payload: { entry: DictionaryEntry; position: { left: number; top: number } }): void;
  (event: "clearDictionaryHover"): void;
  (event: "paragraphAction", payload: { action: "translate" | "quote" | "askAi"; pageIndex: number; text: string; rectsPct: RectPct[]; position: { left: number; top: number; bottom?: number }; source: "paragraph" }): void;
}>();

const pageRef = ref<HTMLElement | null>(null);
const metrics = ref<PdfPageMetrics | null>(null);
const ratio = ref(1.294);
const nearViewport = ref(false);
const canvasRendered = ref(false);
const renderError = ref("");
const canvasElement = ref<HTMLCanvasElement | null>(null);
const pageTextItems = ref<PdfTextItem[]>([]);
const pageLinks = ref<PdfLinkAnnotation[]>([]);
const imageDrag = ref<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
let observer: IntersectionObserver | null = null;

const pageIndex = computed(() => props.pageNumber - 1);
const placeholderWidth = computed(() => Math.max(360, Math.round(props.scaleWidth || 720)));
const placeholderHeight = computed(() => Math.round(placeholderWidth.value * ratio.value));
const pageWidth = computed(() => placeholderWidth.value);
const pageHeight = computed(() => placeholderHeight.value);

onMounted(() => {
  const root = pageRef.value?.closest(".pdf-scroll") || null;
  observer = new IntersectionObserver((entries) => {
    const nextNearViewport = entries.some((entry) => entry.isIntersecting);
    nearViewport.value = nextNearViewport;
    if (!nextNearViewport) {
      canvasRendered.value = false;
      renderError.value = "";
      canvasElement.value = null;
      imageDrag.value = null;
      pageTextItems.value = [];
      pageLinks.value = [];
    }
  }, {
    root,
    rootMargin: "900px 0px",
    threshold: 0.01,
  });
  if (pageRef.value) observer.observe(pageRef.value);
  emit("rendered", { pageIndex: pageIndex.value, element: pageRef.value });
});

onBeforeUnmount(() => {
  observer?.disconnect();
});

function handleCanvasLoading() {
  canvasRendered.value = false;
  renderError.value = "";
}

function handleCanvasRendered(payload: { pageIndex: number; metrics: PdfPageMetrics }) {
  metrics.value = payload.metrics;
  ratio.value = payload.metrics.height / Math.max(1, payload.metrics.width);
  canvasRendered.value = true;
  renderError.value = "";
  emit("rendered", { pageIndex: payload.pageIndex, element: pageRef.value, metrics: payload.metrics });
}

function handleRenderError(payload: { pageIndex: number; message: string }) {
  renderError.value = payload.message;
  canvasRendered.value = false;
  pageTextItems.value = [];
  emit("rendered", { pageIndex: payload.pageIndex, element: pageRef.value });
}

function handleTextItems(payload: { pageIndex: number; items: PdfTextItem[] }) {
  pageTextItems.value = payload.items;
  emit("textItems", payload);
}

const imageSelectionStyle = computed(() => {
  if (!imageDrag.value) return {};
  const left = Math.min(imageDrag.value.startX, imageDrag.value.currentX);
  const top = Math.min(imageDrag.value.startY, imageDrag.value.currentY);
  const width = Math.abs(imageDrag.value.currentX - imageDrag.value.startX);
  const height = Math.abs(imageDrag.value.currentY - imageDrag.value.startY);
  return { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` };
});

function pointerPoint(event: PointerEvent) {
  const box = pageRef.value?.getBoundingClientRect();
  if (!box) return null;
  return {
    x: Math.min(pageWidth.value, Math.max(0, event.clientX - box.left)),
    y: Math.min(pageHeight.value, Math.max(0, event.clientY - box.top)),
  };
}

function startImageSelection(event: PointerEvent) {
  if (!props.imageSelectMode) return;
  const point = pointerPoint(event);
  if (!point) return;
  event.preventDefault();
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  imageDrag.value = { startX: point.x, startY: point.y, currentX: point.x, currentY: point.y };
}

function moveImageSelection(event: PointerEvent) {
  if (!props.imageSelectMode || !imageDrag.value) return;
  const point = pointerPoint(event);
  if (!point) return;
  imageDrag.value = { ...imageDrag.value, currentX: point.x, currentY: point.y };
}

function finishImageSelection(event: PointerEvent) {
  if (!props.imageSelectMode || !imageDrag.value) return;
  const drag = imageDrag.value;
  imageDrag.value = null;
  const width = Math.abs(drag.currentX - drag.startX);
  const height = Math.abs(drag.currentY - drag.startY);
  if (width < 8 || height < 8) return;
  const canvas = canvasElement.value;
  if (!canvas) return;
  const scaleX = canvas.width / Math.max(1, pageWidth.value);
  const scaleY = canvas.height / Math.max(1, pageHeight.value);
  const sx = Math.round(Math.min(drag.startX, drag.currentX) * scaleX);
  const sy = Math.round(Math.min(drag.startY, drag.currentY) * scaleY);
  const sw = Math.round(width * scaleX);
  const sh = Math.round(height * scaleY);
  const rectPct = {
    left: Math.min(drag.startX, drag.currentX) / Math.max(1, pageWidth.value),
    top: Math.min(drag.startY, drag.currentY) / Math.max(1, pageHeight.value),
    width: width / Math.max(1, pageWidth.value),
    height: height / Math.max(1, pageHeight.value),
  };
  const output = document.createElement("canvas");
  const captureScale = Math.min(6, Math.max(1, Number(props.captureImageScale) || 1));
  const outputWidth = Math.max(1, Math.round(sw * captureScale));
  const outputHeight = Math.max(1, Math.round(sh * captureScale));
  output.width = outputWidth;
  output.height = outputHeight;
  const context = output.getContext("2d");
  if (!context) return;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(canvas, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
  emit("imageSelection", { pageIndex: pageIndex.value, dataUrl: output.toDataURL("image/png"), rectPct });
  try {
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture may already be released by the browser.
  }
}

function cancelImageSelection() {
  imageDrag.value = null;
}
</script>

<template>
  <div
    ref="pageRef"
    class="pdf-page"
    :class="{ 'image-selecting': imageSelectMode }"
    :style="{ width: `${pageWidth}px`, height: `${pageHeight}px` }"
    :data-page-index="pageIndex"
    @pointerdown="startImageSelection"
    @pointermove="moveImageSelection"
    @pointerup="finishImageSelection"
    @pointercancel="cancelImageSelection"
  >
    <PdfCanvasPage
      v-if="nearViewport"
      :pdf-document="pdfDocument"
      :page-number="pageNumber"
      :scale-width="scaleWidth"
      :near-viewport="nearViewport"
      @loading="handleCanvasLoading"
      @rendered="handleCanvasRendered"
      @render-error="handleRenderError"
      @canvas="canvasElement = $event"
    />
    <div v-if="renderError" class="page-placeholder page-error">{{ t("pdf.pageFailed", { page: pageNumber }) }}<small>{{ renderError }}</small></div>
    <div v-else-if="!canvasRendered" class="page-placeholder">{{ nearViewport ? `${t("common.page")} ${pageNumber}` : "" }}</div>
    <PdfTextLayer
      v-if="canvasRendered"
      :pdf-document="pdfDocument"
      :page-number="pageNumber"
      :metrics="metrics"
      :page-element="pageRef"
      :disabled="imageSelectMode"
      :author-profiles="authorProfiles"
      @selection="emit('selection', $event)"
      @text-items="handleTextItems"
      @symbol-click="emit('symbolClick', $event)"
      @author-hover="emit('authorHover', $event)"
      @clear-author-hover="emit('clearAuthorHover')"
    />
    <PdfLinkLayer
      v-if="canvasRendered"
      :pdf-document="pdfDocument"
      :page-number="pageNumber"
      :metrics="metrics"
      @link-click="emit('linkClick', $event)"
      @link-preview="emit('linkPreview', $event)"
      @clear-link-preview="emit('clearReferencePreview')"
      @links="pageLinks = $event"
    />
    <PdfReferenceLayer
      v-if="canvasRendered && pageTextItems.length"
      :page-index="pageIndex"
      :text-items="pageTextItems"
      :link-annotations="pageLinks"
      @preview="emit('referencePreview', $event)"
      @clear-preview="emit('clearReferencePreview')"
      @jump="emit('referenceJump', $event)"
    />
    <PdfAuthorLayer
      v-if="canvasRendered && pageTextItems.length"
      :page-index="pageIndex"
      :text-items="pageTextItems"
      :author-profiles="authorProfiles || []"
      @author-hover="emit('authorHover', $event)"
      @clear-author-hover="emit('clearAuthorHover')"
    />
    <PdfDictionaryLayer
      v-if="canvasRendered && pageTextItems.length"
      :text-items="pageTextItems"
      :entries="dictionaryEntries || []"
      @dictionary-hover="emit('dictionaryHover', $event)"
      @clear-dictionary-hover="emit('clearDictionaryHover')"
    />
    <PdfParagraphActionLayer
      v-if="canvasRendered && pageTextItems.length && !imageSelectMode"
      :page-index="pageIndex"
      :text-items="pageTextItems"
      :metrics="metrics"
      :can-translate="canTranslate !== false"
      :can-ask-ai="canAskAi !== false"
      @paragraph-action="emit('paragraphAction', $event)"
    />
    <AnnotationOverlay
      v-if="canvasRendered"
      :page-index="pageIndex"
      :active-anchor="activeAnchor"
      :annotations="annotations"
      :active-annotation="activeAnnotation"
      :search-matches="searchMatches"
      :active-search-match="activeSearchMatch"
      @annotation-click="emit('annotationClick', $event)"
    />
    <div v-if="imageDrag" class="image-selection-box" :style="imageSelectionStyle" />
    <span class="page-number">{{ pageNumber }}</span>
  </div>
</template>
