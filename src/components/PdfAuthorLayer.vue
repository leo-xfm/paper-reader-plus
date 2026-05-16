<script setup lang="ts">
import { computed } from "vue";
import { pctStyle } from "@/pdf/pdfCoordinates";
import type { PdfTextItem } from "@/pdf/pdfTypes";
import { normalizeAuthorName } from "@/services/AuthorNetworkService";
import type { AuthorProfile, RectPct } from "@/types";

const props = defineProps<{
  pageIndex: number;
  textItems: PdfTextItem[];
  authorProfiles: AuthorProfile[];
}>();

const emit = defineEmits<{
  (event: "authorHover", payload: { author: AuthorProfile; position: { left: number; top: number } }): void;
  (event: "clearAuthorHover"): void;
}>();

type LineItem = PdfTextItem & { start: number; end: number };

function bounds(rects: RectPct[]) {
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
  return { left, top, width: right - left, height: bottom - top };
}

function lineItems() {
  const sorted = props.textItems.slice().sort((left, right) => left.top - right.top || left.left - right.left);
  const lines: PdfTextItem[][] = [];
  for (const item of sorted) {
    if (!item.text.trim()) continue;
    const current = lines.at(-1);
    if (!current || Math.abs(current[0].top - item.top) > Math.max(5, item.height * 0.7)) {
      lines.push([item]);
    } else {
      current.push(item);
    }
  }
  return lines.map((items) => {
    let cursor = 0;
    const mapped: LineItem[] = [];
    const parts: string[] = [];
    for (const item of items.sort((left, right) => left.left - right.left)) {
      if (parts.length) cursor += 1;
      parts.push(item.text);
      mapped.push({ ...item, start: cursor, end: cursor + item.text.length });
      cursor += item.text.length;
    }
    return { text: parts.join(" "), items: mapped };
  });
}

const hotspots = computed(() => {
  if (props.pageIndex !== 0 || !props.authorProfiles.length) return [];
  const results: Array<{ id: string; author: AuthorProfile; rect: RectPct }> = [];
  for (const line of lineItems()) {
    const normalizedLine = normalizeAuthorName(line.text);
    for (const author of props.authorProfiles) {
      if (!normalizedLine.includes(author.normalized_name)) continue;
      const parts = author.name.split(/\s+/).filter(Boolean);
      const matchedItems = line.items.filter((item) => parts.some((part) => normalizeAuthorName(item.text) === normalizeAuthorName(part)));
      if (!matchedItems.length) continue;
      results.push({
        id: `${author.normalized_name}-${results.length}`,
        author,
        rect: bounds(matchedItems.map((item) => item.rectPct)),
      });
    }
  }
  return results;
});

function show(author: AuthorProfile, event: MouseEvent) {
  emit("authorHover", {
    author,
    position: { left: event.clientX + 14, top: event.clientY + 14 },
  });
}
</script>

<template>
  <div v-if="hotspots.length" class="pdf-author-layer">
    <button
      v-for="hotspot in hotspots"
      :key="hotspot.id"
      type="button"
      class="pdf-author-hotspot"
      :style="pctStyle(hotspot.rect)"
      :title="`Author network: ${hotspot.author.name}`"
      @mouseenter="show(hotspot.author, $event)"
      @mousemove="show(hotspot.author, $event)"
      @mouseleave="emit('clearAuthorHover')"
    />
  </div>
</template>
