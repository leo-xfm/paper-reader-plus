<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { PdfDocumentProxyLike } from "@/pdf/pdfTypes";

const props = defineProps<{
  pdfDocument: PdfDocumentProxyLike | null;
  pageNumber: number;
  width?: number;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const wrapperRef = ref<HTMLElement | null>(null);
const visible = ref(false);
let observer: IntersectionObserver | null = null;
let token = 0;

watch(() => [props.pdfDocument, props.pageNumber, props.width, visible.value], () => {
  if (visible.value) void renderThumbnail();
}, { immediate: true });

onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    visible.value = entries.some((entry) => entry.isIntersecting);
  }, { root: wrapperRef.value?.closest(".library-content") || null, rootMargin: "600px 0px" });
  if (wrapperRef.value) observer.observe(wrapperRef.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  token += 1;
});

async function renderThumbnail() {
  if (!props.pdfDocument || !visible.value) return;
  const current = ++token;
  await nextTick();
  const canvas = canvasRef.value;
  const context = canvas?.getContext("2d", { alpha: false });
  if (!canvas || !context) return;
  const page = await props.pdfDocument.getPage(props.pageNumber);
  if (current !== token) return;
  const base = page.getViewport({ scale: 1 });
  const cssWidth = props.width || 150;
  const scale = cssWidth / base.width;
  const viewport = page.getViewport({ scale });
  const outputScale = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(viewport.width * outputScale);
  canvas.height = Math.round(viewport.height * outputScale);
  canvas.style.width = `${Math.round(viewport.width)}px`;
  canvas.style.height = `${Math.round(viewport.height)}px`;
  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
  await page.render({ canvasContext: context, viewport }).promise;
}
</script>

<template>
  <div ref="wrapperRef" class="thumbnail-canvas-wrap">
    <canvas ref="canvasRef" />
  </div>
</template>
