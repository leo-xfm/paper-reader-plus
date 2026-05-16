<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { PdfDocumentProxyLike, PdfPageMetrics } from "@/pdf/pdfTypes";

const props = defineProps<{
  pdfDocument: PdfDocumentProxyLike | null;
  pageNumber: number;
  scaleWidth: number;
  nearViewport: boolean;
}>();

const emit = defineEmits<{
  (event: "rendered", payload: { pageIndex: number; metrics: PdfPageMetrics }): void;
  (event: "renderError", payload: { pageIndex: number; message: string }): void;
  (event: "loading", payload: { pageIndex: number }): void;
  (event: "canvas", value: HTMLCanvasElement | null): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let renderToken = 0;
let renderTask: { promise: Promise<unknown>; cancel: () => void } | null = null;
let renderQueue = Promise.resolve();

watch(() => [props.pdfDocument, props.pageNumber, props.scaleWidth, props.nearViewport], () => {
  if (!props.nearViewport) return;
  void renderCanvas();
}, { immediate: true });

onBeforeUnmount(() => {
  emit("canvas", null);
  cancelRenderTask();
  renderTask = null;
  renderToken += 1;
});

async function renderCanvas() {
  renderQueue = renderQueue.then(() => renderCanvasNow());
  await renderQueue;
}

function cancelRenderTask() {
  if (!renderTask) return null;
  const task = renderTask;
  renderTask = null;
  try {
    task.cancel();
  } catch {
    // PDF.js cancel can throw if the task has already settled.
  }
  return task.promise.catch(() => undefined);
}

async function renderCanvasNow() {
  if (!props.pdfDocument || !props.nearViewport) return;
  const token = ++renderToken;
  await cancelRenderTask();
  if (token !== renderToken) return;
  emit("loading", { pageIndex: props.pageNumber - 1 });
  await nextTick();
  const canvas = canvasRef.value;
  const context = canvas?.getContext("2d", { alpha: false });
  if (!canvas || !context) {
    emit("renderError", { pageIndex: props.pageNumber - 1, message: "Unable to initialize PDF canvas." });
    return;
  }

  try {
    const page = await props.pdfDocument.getPage(props.pageNumber);
    if (token !== renderToken) return;
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(5, Math.max(0.5, props.scaleWidth / baseViewport.width));
    const viewport = page.getViewport({ scale });
    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);
    const outputScale = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(width * outputScale);
    canvas.height = Math.floor(height * outputScale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const task = page.render({
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
    });
    renderTask = task;
    await task.promise.catch((cause: unknown) => {
      if (renderTask === task) renderTask = null;
      throw cause;
    });
    if (renderTask === task) renderTask = null;
    if (token !== renderToken) return;
    emit("canvas", canvas);
    emit("rendered", { pageIndex: props.pageNumber - 1, metrics: { pageIndex: props.pageNumber - 1, width, height, scale } });
  } catch (cause) {
    if (token !== renderToken) return;
    if (cause instanceof Error && cause.name === "RenderingCancelledException") return;
    emit("renderError", { pageIndex: props.pageNumber - 1, message: cause instanceof Error ? cause.message : String(cause) });
  }
}
</script>

<template>
  <canvas ref="canvasRef" />
</template>
