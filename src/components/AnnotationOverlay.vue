<script setup lang="ts">
import { computed } from "vue";
import { mergeContinuousLineRects, pctStyle } from "@/pdf/pdfCoordinates";
import type { PdfSearchMatch } from "@/pdf/pdfTypes";
import type { Anchor, Annotation, RectPct } from "@/types";

const props = defineProps<{
  pageIndex: number;
  activeAnchor?: Anchor | null;
  annotations?: Annotation[];
  activeAnnotation?: Annotation | null;
  searchMatches?: PdfSearchMatch[];
  activeSearchMatch?: PdfSearchMatch | null;
}>();

const emit = defineEmits<{
  (event: "annotationClick", annotation: Annotation): void;
}>();

const pageAnnotations = computed(() => (props.annotations || []).filter((item) => item.page_index === props.pageIndex));
const activeRects = computed(() => props.activeAnchor?.page_index === props.pageIndex ? props.activeAnchor.rects_pct : []);
const pageSearchMatches = computed(() => (props.searchMatches || []).filter((item) => item.page_index === props.pageIndex));

function annotationRects(annotation: Annotation) {
  return mergeContinuousLineRects(annotation.target.rects_pct) as RectPct[];
}

function textBodyRect(rect: RectPct) {
  return {
    ...rect,
    top: rect.top + rect.height * 0.03,
    height: rect.height * 0.6,
  };
}

function underlineRect(rect: RectPct) {
  return {
    ...rect,
    height: rect.height * 0.9,
  };
}

function annotationStyle(annotation: Annotation, rect: RectPct) {
  const color = annotation.color || "#BBD4F6";
  if (annotation.type === "underline") {
    const base = pctStyle(underlineRect(rect));
    return { ...base, backgroundColor: "transparent", boxShadow: `inset 0 -1.5px 0 ${color}` };
  }
  if (annotation.type === "note") {
    const base = pctStyle(rect);
    return { ...base, backgroundColor: `${color}22`, outline: `1px dashed ${color}` };
  }
  const base = pctStyle(textBodyRect(rect));
  return { ...base, backgroundColor: `${color}52` };
}
</script>

<template>
  <template v-for="match in pageSearchMatches" :key="match.match_id">
    <div
      v-for="(rect, index) in match.rects_pct"
      :key="`${match.match_id}-${index}`"
      class="search-highlight"
      :class="{ active: activeSearchMatch?.match_id === match.match_id }"
      :style="pctStyle(rect)"
    />
  </template>
  <div
    v-for="(rect, index) in activeRects"
    :key="`anchor-${index}`"
    class="anchor-flash"
    :style="pctStyle(rect)"
  />
  <template v-for="annotation in pageAnnotations" :key="annotation.annotation_id">
    <button
      v-for="(rect, index) in annotationRects(annotation)"
      :key="`${annotation.annotation_id}-${index}`"
      type="button"
      class="annotation-overlay"
      :class="[`annotation-${annotation.type}`, { active: activeAnnotation?.annotation_id === annotation.annotation_id }]"
      :style="annotationStyle(annotation, rect)"
      :title="annotation.comment || annotation.target.text_quote?.exact"
      @click.stop="emit('annotationClick', annotation)"
      tabindex="-1"
      aria-hidden="true"
    />
    <button
      v-if="(annotation.type === 'note' || annotation.comment.trim()) && annotation.target.rects_pct.length"
      type="button"
      class="note-marker"
      :class="{ active: activeAnnotation?.annotation_id === annotation.annotation_id }"
      :style="{ left: `${annotation.target.rects_pct[0].left * 100}%`, top: `${annotation.target.rects_pct[0].top * 100}%`, backgroundColor: annotation.color }"
      @click.stop="emit('annotationClick', annotation)"
    />
  </template>
</template>
