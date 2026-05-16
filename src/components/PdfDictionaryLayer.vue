<script setup lang="ts">
import { computed } from "vue";
import { pctStyle } from "@/pdf/pdfCoordinates";
import type { PdfTextItem } from "@/pdf/pdfTypes";
import { dictionaryEntryMatchesText } from "@/services/DictionaryService";
import type { DictionaryEntry, RectPct } from "@/types";

const props = defineProps<{
  textItems: PdfTextItem[];
  entries: DictionaryEntry[];
}>();

const emit = defineEmits<{
  (event: "dictionaryHover", payload: { entry: DictionaryEntry; position: { left: number; top: number } }): void;
  (event: "clearDictionaryHover"): void;
}>();

function bounds(rects: RectPct[]) {
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
  return { left, top, width: right - left, height: bottom - top };
}

const hotspots = computed(() => {
  const results: Array<{ id: string; entry: DictionaryEntry; rect: RectPct }> = [];
  for (const entry of props.entries) {
    for (let index = 0; index < props.textItems.length; index += 1) {
      const windowItems = props.textItems.slice(index, index + Math.max(1, entry.normalized_term.split(/\s+/).length + 1));
      const text = windowItems.map((item) => item.text).join(" ");
      if (!dictionaryEntryMatchesText(entry, text)) continue;
      results.push({
        id: `${entry.entry_id}-${index}`,
        entry,
        rect: bounds(windowItems.map((item) => item.rectPct)),
      });
      index += Math.max(0, windowItems.length - 1);
    }
  }
  return results;
});

function show(entry: DictionaryEntry, event: MouseEvent) {
  emit("dictionaryHover", {
    entry,
    position: { left: event.clientX + 14, top: event.clientY + 14 },
  });
}
</script>

<template>
  <div v-if="hotspots.length" class="pdf-dictionary-layer">
    <button
      v-for="hotspot in hotspots"
      :key="hotspot.id"
      type="button"
      class="pdf-dictionary-hotspot"
      :style="pctStyle(hotspot.rect)"
      :title="hotspot.entry.definition"
      @mouseenter="show(hotspot.entry, $event)"
      @mousemove="show(hotspot.entry, $event)"
      @mouseleave="emit('clearDictionaryHover')"
    />
  </div>
</template>
