<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Pin, PinOff, X, ZoomIn, ZoomOut } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import { rectsIntersect, selectionRectsToPct } from "@/pdf/pdfCoordinates";
import type { PdfHoverPreview, PdfPreviewTextItem } from "@/pdf/pdfTypes";
import type { RectPct } from "@/types";

const props = defineProps<{
  preview: PdfHoverPreview | null;
  totalPages: number;
  fixed: boolean;
  fixedPosition: { left: number; top: number } | null;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  (event: "clear"): void;
  (event: "close"): void;
  (event: "keepOpen"): void;
  (event: "toggleFixed"): void;
  (event: "moveFixed", position: { left: number; top: number }): void;
  (event: "jump", pageIndex: number): void;
  (event: "previewPage", delta: number): void;
  (event: "returnPreview"): void;
  (event: "selection", payload: { pageIndex: number; text: string; rectsPct: RectPct[]; position: { left: number; top: number; bottom?: number } }): void;
  (event: "openSpreadsheet"): void;
}>();

const dragState = ref<{ startX: number; startY: number; left: number; top: number } | null>(null);
const resizeState = ref<{ startX: number; startY: number; width: number; height: number } | null>(null);
const windowSize = ref({ width: 620, height: 560 });
const previewZoom = ref(1);
const imageBoxRef = ref<HTMLElement | null>(null);
const imageStageRef = ref<HTMLElement | null>(null);
const imageBaseWidth = ref(0);
const imageSize = ref({ width: 0, height: 0 });
let imageResizeObserver: ResizeObserver | null = null;
let imageBoxResizeObserver: ResizeObserver | null = null;

watch(() => props.preview, () => {
  previewZoom.value = 1;
}, { flush: "post" });

watch(imageBoxRef, (element) => {
  imageBoxResizeObserver?.disconnect();
  imageBoxResizeObserver = null;
  imageBaseWidth.value = 0;
  if (!element) return;
  const update = () => {
    imageBaseWidth.value = Math.max(1, element.clientWidth);
  };
  imageBoxResizeObserver = new ResizeObserver(update);
  imageBoxResizeObserver.observe(element);
  requestAnimationFrame(update);
}, { flush: "post" });

watch(imageStageRef, (element) => {
  imageResizeObserver?.disconnect();
  imageResizeObserver = null;
  imageSize.value = { width: 0, height: 0 };
  if (!element) return;
  const update = () => {
    const image = element.querySelector("img");
    const box = image?.getBoundingClientRect() || element.getBoundingClientRect();
    imageSize.value = { width: box.width, height: box.height };
  };
  imageResizeObserver = new ResizeObserver(update);
  imageResizeObserver.observe(element);
  const image = element.querySelector("img");
  if (image) imageResizeObserver.observe(image);
  requestAnimationFrame(update);
}, { flush: "post" });

const style = computed(() => {
  const anchor = props.fixed && props.fixedPosition ? props.fixedPosition : props.preview?.anchor;
  const width = Math.min(windowSize.value.width, Math.max(320, window.innerWidth - 24));
  const height = Math.min(windowSize.value.height, Math.max(260, window.innerHeight - 24));
  const left = Math.min(Math.max(12, anchor?.left || 12), Math.max(12, window.innerWidth - width - 12));
  const top = Math.min(Math.max(12, anchor?.top || 12), Math.max(12, window.innerHeight - height - 12));
  return { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` };
});

const zoomLabel = computed(() => `${Math.round(previewZoom.value * 100)}%`);

const imageStageStyle = computed(() => {
  const width = Math.max(1, imageBaseWidth.value) * previewZoom.value;
  return { width: `${width}px` };
});

const title = computed(() => {
  if (!props.preview) return "";
  return props.preview.preview_kind === "reference" ? props.preview.reference.label : props.preview.link.title;
});

const referenceTarget = computed(() => {
  if (!props.preview) return null;
  return props.preview.preview_kind === "reference" ? props.preview.target : props.preview.reference_target || null;
});

const canRenderPreview = computed(() => Boolean(props.preview?.imageUrl || props.preview?.previewTextItems?.length || currentPageIndex.value !== null));
const currentPageIndex = computed(() => props.preview?.preview_page_index ?? null);
const canPreviewPrevious = computed(() => currentPageIndex.value !== null && currentPageIndex.value > 0);
const canPreviewNext = computed(() => currentPageIndex.value !== null && currentPageIndex.value < props.totalPages - 1);
const isOriginPage = computed(() => props.preview?.origin_page_index !== null && currentPageIndex.value === props.preview?.origin_page_index);
const isPdfLinkPreview = computed(() => props.preview?.preview_kind === "link" && props.preview.source === "pdf-link");
const returnPreviewLabel = computed(() => isPdfLinkPreview.value ? t("preview.back") : t("preview.return"));
const returnPreviewTitle = computed(() => isPdfLinkPreview.value ? t("preview.backToOriginalLink") : t("preview.returnToTargetPage"));
const previewAlt = computed(() => {
  if (!props.preview) return t("preview.pdfPreview");
  return props.preview.preview_kind === "reference" ? props.preview.reference.label : props.preview.link.title;
});
const previewDescription = computed(() => {
  if (!props.preview) return "";
  if (referenceTarget.value?.caption) return referenceTarget.value.caption;
  if (props.preview.preview_kind === "link" && props.preview.target_page_index !== null) return t("preview.linkToPage", { page: props.preview.target_page_index + 1 });
  return "";
});

function jumpPreviewPage() {
  if (currentPageIndex.value !== null) emit("jump", currentPageIndex.value);
}

function emitPreviewSelection(event: MouseEvent) {
  const selection = window.getSelection();
  const text = selection?.toString().trim() || "";
  if (!text || currentPageIndex.value === null || !props.preview) return;
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const stage = imageStageRef.value;
  if (!range || !stage || !stage.contains(range.commonAncestorContainer)) return;
  const rects = range ? Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0) : [];
  if (!rects.length) return;
  const stageBox = stage.getBoundingClientRect();
  const textRects = Array.from(stage.querySelectorAll(".reference-preview-text-layer span"))
    .map((span) => span.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0 && rects.some((selected) => rectsIntersect(rect, selected)));
  const localRectsPct = selectionRectsToPct(rects, textRects, stageBox);
  if (!localRectsPct.length) return;
  const previewRect = props.preview.preview_rect_pct || { left: 0, top: 0, width: 1, height: 1 };
  const rectsPct = localRectsPct.map((rect) => ({
    left: previewRect.left + rect.left * previewRect.width,
    top: previewRect.top + rect.top * previewRect.height,
    width: rect.width * previewRect.width,
    height: rect.height * previewRect.height,
  }));
  const position = rects.length
    ? {
        left: Math.min(...rects.map((rect) => rect.left)),
        top: Math.min(...rects.map((rect) => rect.top)),
        bottom: Math.max(...rects.map((rect) => rect.bottom)),
      }
    : { left: event.clientX, top: event.clientY, bottom: event.clientY };
  emit("selection", {
    pageIndex: currentPageIndex.value,
    text,
    rectsPct,
    position,
  });
}

function previewTextItemStyle(item: PdfPreviewTextItem) {
  const width = Math.max(1, imageSize.value.width);
  const height = Math.max(1, imageSize.value.height);
  const itemHeight = item.rectPct.height * height;
  return {
    left: `${item.rectPct.left * width}px`,
    top: `${item.rectPct.top * height}px`,
    width: `${item.rectPct.width * width}px`,
    height: `${itemHeight}px`,
    fontSize: `${itemHeight}px`,
    fontFamily: item.fontName,
    transform: `scaleX(${item.hScale || 1})`,
  };
}

function zoomPreview(delta: number) {
  const factor = delta > 0 ? 1.2 : 1 / 1.2;
  previewZoom.value = Math.min(4, Math.max(0.5, previewZoom.value * factor));
}

function handlePreviewWheel(event: WheelEvent) {
  if (!event.ctrlKey) return;
  event.preventDefault();
  zoomPreview(event.deltaY < 0 ? 1 : -1);
}

function beginDrag(event: PointerEvent) {
  if (!props.fixed) return;
  if ((event.target as HTMLElement | null)?.closest("button")) return;
  const currentLeft = props.fixedPosition?.left ?? props.preview?.anchor.left ?? 12;
  const currentTop = props.fixedPosition?.top ?? props.preview?.anchor.top ?? 12;
  dragState.value = { startX: event.clientX, startY: event.clientY, left: currentLeft, top: currentTop };
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", endDrag, { once: true });
}

function moveDrag(event: PointerEvent) {
  if (!dragState.value) return;
  emit("moveFixed", {
    left: Math.min(Math.max(12, dragState.value.left + event.clientX - dragState.value.startX), Math.max(12, window.innerWidth - windowSize.value.width - 12)),
    top: Math.min(Math.max(12, dragState.value.top + event.clientY - dragState.value.startY), Math.max(12, window.innerHeight - windowSize.value.height - 12)),
  });
}

function endDrag() {
  dragState.value = null;
  window.removeEventListener("pointermove", moveDrag);
}

function beginResize(event: PointerEvent) {
  event.preventDefault();
  event.stopPropagation();
  resizeState.value = {
    startX: event.clientX,
    startY: event.clientY,
    width: windowSize.value.width,
    height: windowSize.value.height,
  };
  window.addEventListener("pointermove", moveResize);
  window.addEventListener("pointerup", endResize, { once: true });
}

function moveResize(event: PointerEvent) {
  if (!resizeState.value) return;
  windowSize.value = {
    width: Math.min(Math.max(360, resizeState.value.width + event.clientX - resizeState.value.startX), Math.max(360, window.innerWidth - 24)),
    height: Math.min(Math.max(300, resizeState.value.height + event.clientY - resizeState.value.startY), Math.max(300, window.innerHeight - 24)),
  };
}

function endResize() {
  resizeState.value = null;
  window.removeEventListener("pointermove", moveResize);
}

onBeforeUnmount(() => {
  endDrag();
  endResize();
  imageResizeObserver?.disconnect();
  imageBoxResizeObserver?.disconnect();
});
</script>

<template>
  <aside
    v-if="preview"
    class="reference-preview"
    :class="{ fixed }"
    :style="style"
    @mouseenter.stop="emit('keepOpen')"
    @mouseleave="!fixed && emit('clear')"
  >
    <header @pointerdown="beginDrag">
      <strong>{{ title }}</strong>
      <div class="reference-preview-window-tools">
        <button type="button" :title="t('preview.zoomOut')" @click="zoomPreview(-1)"><ZoomOut :size="15" /></button>
        <span class="reference-preview-zoom">{{ zoomLabel }}</span>
        <button type="button" :title="t('preview.zoomIn')" @click="zoomPreview(1)"><ZoomIn :size="15" /></button>
        <button type="button" :title="fixed ? t('preview.unfix') : t('preview.fix')" @click="emit('toggleFixed')">
          <PinOff v-if="fixed" :size="15" />
          <Pin v-else :size="15" />
        </button>
        <button type="button" :title="t('preview.close')" @click="emit('close')"><X :size="15" /></button>
      </div>
    </header>
    <div v-if="currentPageIndex !== null" class="reference-preview-pager">
      <button type="button" :title="t('preview.previousPage')" :disabled="!canPreviewPrevious || preview.loading" @click="emit('previewPage', -1)">{{ t("common.up") }}</button>
      <span>{{ t("common.page") }} {{ currentPageIndex + 1 }} / {{ totalPages }}</span>
      <button type="button" :title="t('preview.nextPage')" :disabled="!canPreviewNext || preview.loading" @click="emit('previewPage', 1)">{{ t("common.down") }}</button>
      <button type="button" :title="returnPreviewTitle" :disabled="isOriginPage || preview.loading" @click="emit('returnPreview')">{{ returnPreviewLabel }}</button>
    </div>
    <div v-if="preview.loading" class="reference-preview-status">{{ t("preview.loading") }}</div>
    <div v-else-if="preview.error" class="reference-preview-status">{{ preview.error }}</div>
    <template v-else-if="canRenderPreview">
      <div v-if="referenceTarget?.kind === 'table'" class="reference-preview-actions">
        <button type="button" class="primary" @click="emit('openSpreadsheet')">{{ t("preview.openSpreadsheet") }}</button>
      </div>
      <div ref="imageBoxRef" class="reference-preview-image" :title="t('preview.imageHint')" @wheel="handlePreviewWheel" @dblclick="jumpPreviewPage">
        <div ref="imageStageRef" class="reference-preview-image-stage" :style="imageStageStyle">
          <span v-if="isOriginPage" class="reference-preview-dot" aria-hidden="true" />
          <img v-if="preview.imageUrl" :src="preview.imageUrl" :alt="previewAlt" />
          <span v-else>{{ t("preview.noImage") }}</span>
          <div v-if="preview.previewTextItems?.length" class="text-layer reference-preview-text-layer" @mouseup.stop="emitPreviewSelection">
            <span
              v-for="(item, index) in preview.previewTextItems"
              :key="`${currentPageIndex}-reference-${index}`"
              :style="previewTextItemStyle(item)"
            >{{ item.text }}</span>
          </div>
        </div>
      </div>
      <p v-if="previewDescription">{{ previewDescription }}</p>
    </template>
    <div v-else class="reference-preview-status">
      {{ preview.preview_kind === "reference" ? t("preview.noCaption") : t("preview.noLinkTarget") }}
    </div>
    <button type="button" class="reference-preview-resize" :title="t('preview.resize')" @pointerdown="beginResize" />
  </aside>
</template>
