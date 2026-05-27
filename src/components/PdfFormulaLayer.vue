<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { Bot, RefreshCw } from "lucide-vue-next";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import { useI18n } from "@/i18n";
import type { PdfPageMetrics, PdfTextItem } from "@/pdf/pdfTypes";
import { buildPdfTextBlocks } from "@/services/PdfParagraphActionService";
import { formulaIdForCandidate, pdfBlockToFormulaCandidate, type FormulaCandidate } from "@/services/FormulaAnalysisService";
import type { FormulaAnalysis, Settings } from "@/types";

const props = defineProps<{
  documentId: string;
  pageIndex: number;
  textItems: PdfTextItem[];
  metrics: PdfPageMetrics | null;
  formulas: FormulaAnalysis[];
  settings?: Settings | null;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  (event: "askAi", candidate: FormulaCandidate): void;
  (event: "analyze", candidate: FormulaCandidate): void;
}>();

const activeCandidateId = ref("");
let closeTimer: number | null = null;

const candidates = computed(() => {
  if (!props.metrics || !props.documentId || !props.textItems.length) return [];
  const blocks = buildPdfTextBlocks(props.pageIndex, props.textItems, {
    minTextLength: 1,
    paragraphGapMultiplier: 1.65,
  });
  return blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.kind === "formula")
    .map(({ block, index }) => pdfBlockToFormulaCandidate(props.documentId, block, blocks, index));
});

const formulaById = computed(() => new Map(props.formulas.map((formula) => [formula.formula_id, formula])));

function candidateFormula(candidate: FormulaCandidate) {
  return formulaById.value.get(formulaIdForCandidate(props.documentId, candidate)) || null;
}

function rectBox(candidate: FormulaCandidate) {
  const rects = candidate.rects_pct || [];
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
  return { left, top, right, bottom };
}

function hotspotStyle(candidate: FormulaCandidate) {
  const metrics = props.metrics;
  if (!metrics || !candidate.rects_pct?.length) return {};
  const box = rectBox(candidate);
  return {
    left: `${Math.round(box.left * metrics.width)}px`,
    top: `${Math.round(box.top * metrics.height)}px`,
    width: `${Math.max(8, Math.round((box.right - box.left) * metrics.width))}px`,
    height: `${Math.max(8, Math.round((box.bottom - box.top) * metrics.height))}px`,
  };
}

function popoverStyle(candidate: FormulaCandidate) {
  const metrics = props.metrics;
  if (!metrics) return {};
  const page = document.querySelector<HTMLElement>(`.pdf-page[data-page-index="${props.pageIndex}"]`);
  const pageRect = page?.getBoundingClientRect();
  const box = rectBox(candidate);
  const width = 380;
  const left = pageRect ? pageRect.left + box.left * pageRect.width : box.left * metrics.width;
  const top = pageRect ? pageRect.top + box.bottom * pageRect.height + 8 : box.bottom * metrics.height + 8;
  return {
    left: `${Math.min(Math.max(8, left), Math.max(8, window.innerWidth - width - 8))}px`,
    top: `${Math.min(Math.max(8, top), Math.max(8, window.innerHeight - 240))}px`,
    width: `${width}px`,
  };
}

function openCandidate(candidate: FormulaCandidate) {
  if (closeTimer !== null) {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }
  activeCandidateId.value = candidate.candidate_id;
}

function scheduleClose() {
  if (closeTimer !== null) window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => {
    activeCandidateId.value = "";
    closeTimer = null;
  }, 180);
}

function cancelClose() {
  if (closeTimer !== null) {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }
}

onBeforeUnmount(() => {
  if (closeTimer !== null) window.clearTimeout(closeTimer);
});
</script>

<template>
  <div v-if="metrics && candidates.length" class="pdf-formula-layer" :style="{ width: `${metrics.width}px`, height: `${metrics.height}px` }">
    <div
      v-for="candidate in candidates"
      :key="candidate.candidate_id"
      class="pdf-formula-hotspot"
      :style="hotspotStyle(candidate)"
      @mouseenter="openCandidate(candidate)"
      @mouseleave="scheduleClose"
    />
    <Teleport to="body">
      <div
        v-for="candidate in candidates.filter((item) => item.candidate_id === activeCandidateId)"
        :key="`popover-${candidate.candidate_id}`"
        class="pdf-formula-popover"
        :style="popoverStyle(candidate)"
        @mouseenter="cancelClose"
        @mouseleave="scheduleClose"
        @pointerdown.stop
      >
        <template v-if="candidateFormula(candidate)?.status === 'parsed'">
          <div class="pdf-formula-popover-header">
            <strong>{{ t("formula.hoverParsed") }}</strong>
            <span>{{ candidate.source_label }}</span>
          </div>
          <MarkdownPreview class="pdf-formula-latex" :source="`$$\\n${candidateFormula(candidate)?.latex || candidate.raw_text}\\n$$`" :settings="settings" />
          <MarkdownPreview class="pdf-formula-analysis" :source="candidateFormula(candidate)?.analysis || ''" :settings="settings" />
        </template>
        <template v-else>
          <div class="pdf-formula-popover-header">
            <strong>{{ t("formula.hoverTitle") }}</strong>
            <span>{{ candidate.source_label }}</span>
          </div>
          <p>{{ candidate.raw_text }}</p>
          <div class="pdf-formula-popover-actions">
            <button type="button" @click="emit('askAi', candidate)"><Bot :size="15" /> {{ t("formula.askAi") }}</button>
            <button type="button" @click="emit('analyze', candidate)"><RefreshCw :size="15" /> {{ t("formula.analyze") }}</button>
          </div>
        </template>
      </div>
    </Teleport>
  </div>
</template>
