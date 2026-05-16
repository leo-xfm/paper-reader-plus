<script setup lang="ts">
import { ref, watch } from "vue";
import { rectsIntersect, selectionRectsToPct } from "@/pdf/pdfCoordinates";
import { extractPdfPageTextItems } from "@/pdf/pdfText";
import type { PdfDocumentProxyLike, PdfPageMetrics, PdfTextItem } from "@/pdf/pdfTypes";
import { isSymbolToken } from "@/services/SymbolTrackerService";
import type { AuthorProfile } from "@/types";
import type { RectPct } from "@/types";

const props = defineProps<{
  pdfDocument: PdfDocumentProxyLike | null;
  pageNumber: number;
  metrics: PdfPageMetrics | null;
  pageElement: HTMLElement | null;
  disabled?: boolean;
  authorProfiles?: AuthorProfile[];
}>();

const emit = defineEmits<{
  (event: "selection", payload: { pageIndex: number; text: string; rectsPct: RectPct[]; font?: { font_name: string; font_size: number }; position: { left: number; top: number; bottom?: number } }): void;
  (event: "textItems", payload: { pageIndex: number; items: PdfTextItem[] }): void;
  (event: "symbolClick", payload: { symbol: string; pageIndex: number }): void;
  (event: "authorHover", payload: { author: AuthorProfile; position: { left: number; top: number } }): void;
  (event: "clearAuthorHover"): void;
  (event: "ready", value: boolean): void;
}>();

const textItems = ref<PdfTextItem[]>([]);
let textToken = 0;

watch(() => [props.pdfDocument, props.pageNumber, props.metrics], () => {
  void renderTextLayer();
}, { immediate: true });

async function renderTextLayer() {
  if (!props.pdfDocument || !props.metrics) {
    textItems.value = [];
    emit("ready", false);
    return;
  }
  const token = ++textToken;
  try {
    textItems.value = await extractPdfPageTextItems(props.pdfDocument, props.pageNumber, props.metrics.scale);
    if (token !== textToken) return;
    emit("textItems", { pageIndex: props.pageNumber - 1, items: textItems.value });
    emit("ready", true);
  } catch {
    textItems.value = [];
    emit("ready", false);
  }
}

function handleSelection() {
  if (props.disabled) return;
  const selection = window.getSelection();
  const exact = selection?.toString().trim() || "";
  const pageElement = props.pageElement;
  if (!selection || !exact || !pageElement || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!pageElement.contains(range.commonAncestorContainer)) return;
  const pageBox = pageElement.getBoundingClientRect();
  const selectedRects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  if (!selectedRects.length) return;
  const textRects = Array.from(pageElement.querySelectorAll(".text-layer span"))
    .map((span) => span.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0 && selectedRects.some((selected) => rectsIntersect(rect, selected)));
  const rectsPct = selectionRectsToPct(selectedRects, textRects, pageBox);
  if (!rectsPct.length) return;
  emit("selection", {
    pageIndex: props.pageNumber - 1,
    text: exact,
    rectsPct,
    font: textItems.value[0] ? { font_name: textItems.value[0].fontName, font_size: textItems.value[0].fontSize } : undefined,
    position: {
      left: Math.min(...selectedRects.map((rect) => rect.left)),
      top: Math.min(...selectedRects.map((rect) => rect.top)),
      bottom: Math.max(...selectedRects.map((rect) => rect.bottom)),
    },
  });
}

function authorForItem(item: PdfTextItem) {
  const exact = item.text.trim();
  if (!exact || !props.authorProfiles?.length) return null;
  return props.authorProfiles.find((profile) => profile.name === exact) || null;
}

function handleAuthorHover(item: PdfTextItem, event: MouseEvent) {
  const author = authorForItem(item);
  if (!author) return;
  emit("authorHover", {
    author,
    position: { left: event.clientX + 14, top: event.clientY + 14 },
  });
}
</script>

<template>
  <div
    v-if="metrics && !disabled"
    class="text-layer"
    :style="{ width: `${metrics.width}px`, height: `${metrics.height}px` }"
    @mouseup="handleSelection"
  >
    <span
      v-for="(item, index) in textItems"
      :key="`${pageNumber}-${index}`"
      :class="{ 'symbol-token': isSymbolToken(item.text), 'author-token': Boolean(authorForItem(item)) }"
      :style="{
        left: `${item.left}px`,
        top: `${item.top}px`,
        width: `${item.width}px`,
        height: `${item.height}px`,
        fontSize: `${item.fontSize}px`,
        fontFamily: item.fontName,
        transform: `scaleX(${item.hScale || 1})`,
      }"
      @click.stop="isSymbolToken(item.text) && emit('symbolClick', { symbol: item.text, pageIndex: pageNumber - 1 })"
      @mouseenter="handleAuthorHover(item, $event)"
      @mousemove="handleAuthorHover(item, $event)"
      @mouseleave="authorForItem(item) && emit('clearAuthorHover')"
    >{{ item.text }}</span>
  </div>
</template>
