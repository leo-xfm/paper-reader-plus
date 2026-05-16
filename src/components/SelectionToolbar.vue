<script setup lang="ts">
import { computed } from "vue";
import {
  Bot,
  Copy,
  Highlighter,
  Languages,
  MessageSquarePlus,
  Quote,
  Sparkles,
  Underline,
} from "lucide-vue-next";
import { useI18n } from "@/i18n";
import { ANNOTATION_COLORS } from "@/services/ReaderAnnotationService";
import type { AnnotationType } from "@/types";

const props = withDefaults(defineProps<{
  selectedText: string;
  color: string;
  position: { left: number; top: number; bottom?: number } | null;
  canTranslate?: boolean;
  canAskAi?: boolean;
  canMetaphor?: boolean;
}>(), {
  canTranslate: true,
  canAskAi: true,
  canMetaphor: true,
});

const { t } = useI18n();

const emit = defineEmits<{
  (event: "update:color", value: string): void;
  (event: "copy"): void;
  (event: "quote"): void;
  (event: "quoteToNote"): void;
  (event: "annotate", value: AnnotationType): void;
  (event: "askAi"): void;
  (event: "metaphor"): void;
  (event: "translate"): void;
}>();

const toolbarStyle = computed(() => {
  const toolbarWidth = 326;
  const toolbarHeight = 116;
  const gap = 3;
  const left = Math.min(Math.max(12, props.position?.left || 12), Math.max(12, window.innerWidth - toolbarWidth));
  const selectionTop = props.position?.top || 12;
  const selectionBottom = props.position?.bottom || selectionTop;
  const aboveTop = selectionTop - toolbarHeight - gap;
  const belowTop = selectionBottom + gap;
  const top = aboveTop >= 12
    ? aboveTop
    : Math.min(Math.max(12, belowTop), Math.max(12, window.innerHeight - toolbarHeight));
  return {
    left: `${left}px`,
    top: `${top}px`,
  };
});
</script>

<template>
  <div v-if="selectedText && position" class="selection-toolbar" :style="toolbarStyle">
    <div class="selection-toolbar-main">
      <div class="toolbar-swatches">
        <button
          v-for="swatch in ANNOTATION_COLORS"
          :key="swatch"
          type="button"
          class="color-swatch"
          :class="{ active: color.toLowerCase() === swatch.toLowerCase() }"
          :style="{ backgroundColor: swatch }"
          :title="`Use ${swatch}`"
          @click="emit('update:color', swatch)"
        />
      </div>
      <div class="selection-toolbar-bottom">
        <div class="selection-toolbar-group selection-toolbar-annotate-group">
          <button type="button" :title="t('annotation.type.highlight')" @click="emit('annotate', 'highlight')"><Highlighter :size="16" /></button>
          <button type="button" :title="t('annotation.type.underline')" @click="emit('annotate', 'underline')"><Underline :size="16" /></button>
        </div>
      </div>
    </div>
    <div class="selection-toolbar-actions">
      <button type="button" :title="t('selection.copyText')" @click="emit('copy')"><Copy :size="16" /></button>
      <button type="button" :title="t('selection.copyQuote')" @click="emit('quote')"><Quote :size="16" /></button>
      <button type="button" :title="t('selection.quoteToNote')" @click="emit('quoteToNote')"><MessageSquarePlus :size="16" /></button>
      <button type="button" :title="t('pdf.translateSelection')" :disabled="canTranslate === false" @click="emit('translate')"><Languages :size="16" /></button>
      <button type="button" :title="t('selection.metaphor')" :disabled="canMetaphor === false" @click="emit('metaphor')"><Sparkles :size="16" /></button>
      <button type="button" :title="t('selection.askAi')" :disabled="canAskAi === false" @click="emit('askAi')"><Bot :size="16" /></button>
    </div>
  </div>
</template>
