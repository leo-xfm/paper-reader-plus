<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { pctStyle } from "@/pdf/pdfCoordinates";
import type { PdfDocumentProxyLike, PdfLinkAnnotation, PdfPageMetrics } from "@/pdf/pdfTypes";

const props = defineProps<{
  pdfDocument: PdfDocumentProxyLike | null;
  pageNumber: number;
  metrics: PdfPageMetrics | null;
  previewEnabled?: boolean;
}>();

const emit = defineEmits<{
  (event: "linkClick", link: PdfLinkAnnotation): void;
  (event: "linkPreview", payload: { link: PdfLinkAnnotation; position: { left: number; top: number } }): void;
  (event: "clearLinkPreview"): void;
  (event: "links", links: PdfLinkAnnotation[]): void;
}>();

const links = ref<PdfLinkAnnotation[]>([]);
let token = 0;
let previewTimer: number | null = null;

type PdfAnnotation = {
  subtype?: string;
  rect?: number[];
  url?: string;
  dest?: unknown;
};

watch(() => [props.pdfDocument, props.pageNumber, props.metrics], () => {
  void loadLinks();
}, { immediate: true });

onBeforeUnmount(() => {
  clearPreviewTimer();
});

async function loadLinks() {
  if (!props.pdfDocument || !props.metrics) {
    links.value = [];
    emit("links", []);
    return;
  }
  const current = ++token;
  try {
    const page = await props.pdfDocument.getPage(props.pageNumber);
    const viewport = page.getViewport({ scale: props.metrics.scale });
    const annotations = await page.getAnnotations({ intent: "display" }) as PdfAnnotation[];
    if (current !== token) return;
    links.value = annotations
      .filter((annotation) => annotation.subtype === "Link" && annotation.rect)
      .map((annotation, index: number) => {
        const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(annotation.rect);
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        const url = typeof annotation.url === "string" ? annotation.url : undefined;
        return {
          link_id: `${props.pageNumber}-${index}`,
          page_index: props.pageNumber - 1,
          rects_pct: [{
            left: left / Math.max(1, props.metrics!.width),
            top: top / Math.max(1, props.metrics!.height),
            width: width / Math.max(1, props.metrics!.width),
            height: height / Math.max(1, props.metrics!.height),
          }],
          url,
          destination: annotation.dest,
          title: url || (annotation.dest ? "Internal PDF link" : "PDF link"),
        } satisfies PdfLinkAnnotation;
      });
    emit("links", links.value);
  } catch {
    links.value = [];
    emit("links", []);
  }
}

function clearPreviewTimer() {
  if (previewTimer === null) return;
  window.clearTimeout(previewTimer);
  previewTimer = null;
}

function schedulePreview(link: PdfLinkAnnotation, event: MouseEvent) {
  if (props.previewEnabled === false) return;
  if (link.url) return;
  clearPreviewTimer();
  const position = { left: event.clientX + 14, top: event.clientY + 14 };
  previewTimer = window.setTimeout(() => {
    previewTimer = null;
    emit("linkPreview", { link, position });
  }, 300);
}

function clearPreview() {
  clearPreviewTimer();
  if (props.previewEnabled === false) return;
  emit("clearLinkPreview");
}
</script>

<template>
  <div v-if="links.length" class="pdf-link-layer" :style="{ width: `${metrics?.width || 0}px`, height: `${metrics?.height || 0}px` }">
    <button
      v-for="link in links"
      :key="link.link_id"
      type="button"
      class="pdf-link-hotspot"
      :style="pctStyle(link.rects_pct[0])"
      :title="link.title"
      @mouseenter="schedulePreview(link, $event)"
      @mouseleave="clearPreview"
      @click.stop="emit('linkClick', link)"
    />
  </div>
</template>
