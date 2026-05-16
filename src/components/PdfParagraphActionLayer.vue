<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Bot, Languages, Quote } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import type { PdfPageMetrics, PdfParagraphActionBlock, PdfTextItem } from "@/pdf/pdfTypes";
import { buildPdfParagraphActionBlocks } from "@/services/PdfParagraphActionService";
import type { RectPct } from "@/types";

const props = withDefaults(defineProps<{
  pageIndex: number;
  textItems: PdfTextItem[];
  metrics: PdfPageMetrics | null;
  canTranslate?: boolean;
  canAskAi?: boolean;
}>(), {
  canTranslate: true,
  canAskAi: true,
});

const { t } = useI18n();

const emit = defineEmits<{
  (event: "paragraphAction", payload: {
    action: "translate" | "quote" | "askAi";
    pageIndex: number;
    text: string;
    rectsPct: RectPct[];
    position: { left: number; top: number; bottom?: number };
    source: "paragraph";
  }): void;
}>();

const activeBlockId = ref("");
let activateTimer: number | null = null;

const blocks = computed(() => {
  if (!props.metrics || !props.textItems.length) return [];
  return buildPdfParagraphActionBlocks(props.pageIndex, props.textItems);
});

onMounted(() => {
  window.addEventListener("pointerdown", handleOutsidePointerDown);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", handleOutsidePointerDown);
  if (activateTimer) window.clearTimeout(activateTimer);
});

function blockBox(block: PdfParagraphActionBlock) {
  const rects = block.rects_pct;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
  return { left, top, right, bottom };
}

function railStyle(block: PdfParagraphActionBlock) {
  const metrics = props.metrics;
  if (!metrics) return {};
  const box = blockBox(block);
  const railLeft = Math.max(4, Math.round(box.left * metrics.width) - 28);
  const railTop = Math.round(box.top * metrics.height);
  const railHeight = Math.max(18, Math.round((box.bottom - box.top) * metrics.height));
  return {
    left: `${railLeft}px`,
    top: `${railTop}px`,
    height: `${railHeight}px`,
  };
}

function menuStyle(block: PdfParagraphActionBlock) {
  const metrics = props.metrics;
  if (!metrics) return {};
  const box = blockBox(block);
  const page = document.querySelector<HTMLElement>(`.pdf-page[data-page-index="${props.pageIndex}"]`);
  const pageRect = page?.getBoundingClientRect();
  const left = pageRect ? pageRect.left + box.left * pageRect.width - 18 : Math.max(8, Math.round(box.left * metrics.width) - 18);
  const top = pageRect ? pageRect.top + box.top * pageRect.height : Math.round(box.top * metrics.height);
  return {
    left: `${Math.min(Math.max(8, left), Math.max(8, window.innerWidth - 268))}px`,
    top: `${Math.min(Math.max(8, top), Math.max(8, window.innerHeight - 44))}px`,
  };
}

function handleOutsidePointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement | null;
  if (!target || target.closest(".pdf-paragraph-action, .pdf-paragraph-menu")) return;
  activeBlockId.value = "";
}

function activate(block: PdfParagraphActionBlock) {
  activeBlockId.value = block.block_id;
}

function scheduleActivate(block: PdfParagraphActionBlock) {
  if (activateTimer) window.clearTimeout(activateTimer);
  activateTimer = window.setTimeout(() => {
    activate(block);
    activateTimer = null;
  }, 180);
}

function translateDirectly(block: PdfParagraphActionBlock) {
  if (activateTimer) {
    window.clearTimeout(activateTimer);
    activateTimer = null;
  }
  activeBlockId.value = "";
  trigger("translate", block);
}

function trigger(action: "translate" | "quote" | "askAi", block: PdfParagraphActionBlock) {
  const metrics = props.metrics;
  if (!metrics) return;
  const box = blockBox(block);
  const page = document.querySelector<HTMLElement>(`.pdf-page[data-page-index="${props.pageIndex}"]`);
  const pageRect = page?.getBoundingClientRect();
  const left = pageRect ? pageRect.left + box.left * pageRect.width : box.left * metrics.width;
  const top = pageRect ? pageRect.top + box.top * pageRect.height : box.top * metrics.height;
  const bottom = pageRect ? pageRect.top + box.bottom * pageRect.height : box.bottom * metrics.height;
  emit("paragraphAction", {
    action,
    pageIndex: block.page_index,
    text: block.text,
    rectsPct: block.rects_pct,
    position: { left, top, bottom },
    source: "paragraph",
  });
}
</script>

<template>
  <div v-if="metrics && blocks.length" class="pdf-paragraph-action-layer" :style="{ width: `${metrics.width}px`, height: `${metrics.height}px` }">
    <div
      v-for="block in blocks"
      :key="block.block_id"
      class="pdf-paragraph-action"
      :class="{ active: activeBlockId === block.block_id }"
      :style="railStyle(block)"
    >
      <button
        type="button"
        class="pdf-paragraph-rail"
        :title="t('selection.paragraphActions')"
        @pointerdown.stop
        @click.stop="scheduleActivate(block)"
        @dblclick.stop.prevent="translateDirectly(block)"
      />
      <div v-if="activeBlockId === block.block_id" class="pdf-paragraph-menu" :style="menuStyle(block)" @pointerdown.stop>
        <button type="button" :title="t('selection.translateParagraph')" :disabled="canTranslate === false" @click.stop="trigger('translate', block)">
          <Languages :size="15" />
          <span>{{ t("pdf.translateSelection") }}</span>
        </button>
        <button type="button" :title="t('selection.copyQuote')" @click.stop="trigger('quote', block)">
          <Quote :size="15" />
          <span>{{ t("pdf.copyQuote") }}</span>
        </button>
        <button type="button" :title="t('selection.askAiParagraph')" :disabled="canAskAi === false" @click.stop="trigger('askAi', block)">
          <Bot :size="15" />
          <span>{{ t("selection.askAi") }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
