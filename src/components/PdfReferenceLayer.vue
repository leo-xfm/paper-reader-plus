<script setup lang="ts">
import { computed } from "vue";
import { pctStyle, rectsIntersect } from "@/pdf/pdfCoordinates";
import { findPdfReferenceCandidates } from "@/pdf/pdfReferences";
import type { PdfLinkAnnotation, PdfReferenceCandidate, PdfTextItem } from "@/pdf/pdfTypes";

const props = defineProps<{
  pageIndex: number;
  textItems: PdfTextItem[];
  linkAnnotations?: PdfLinkAnnotation[];
}>();

const emit = defineEmits<{
  (event: "preview", payload: { reference: PdfReferenceCandidate; position: { left: number; top: number } }): void;
  (event: "clearPreview"): void;
  (event: "jump", reference: PdfReferenceCandidate): void;
}>();

const references = computed(() => findPdfReferenceCandidates(props.pageIndex, props.textItems)
  .filter((reference) => !props.linkAnnotations?.some((link) => (
    reference.rects_pct.some((referenceRect) => link.rects_pct.some((linkRect) => rectsIntersect(referenceRect, linkRect)))
  ))));

function emitPreview(reference: PdfReferenceCandidate, event: MouseEvent) {
  emit("preview", {
    reference,
    position: { left: event.clientX + 14, top: event.clientY + 14 },
  });
}
</script>

<template>
  <div v-if="references.length" class="pdf-reference-layer">
    <button
      v-for="reference in references"
      :key="reference.reference_id"
      type="button"
      class="pdf-reference-hotspot"
      :style="pctStyle(reference.rects_pct[0])"
      :title="`Preview ${reference.label}`"
      @mouseenter="emitPreview(reference, $event)"
      @mousemove="emitPreview(reference, $event)"
      @mouseleave="emit('clearPreview')"
      @click.stop="emit('jump', reference)"
    />
  </div>
</template>
