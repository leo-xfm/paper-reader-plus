<script setup lang="ts">
import { computed } from "vue";
import type { DictionaryHoverPreview } from "@/types";

const props = defineProps<{
  preview: DictionaryHoverPreview | null;
}>();

const emit = defineEmits<{
  (event: "clear"): void;
}>();

const style = computed(() => {
  const left = Math.min(Math.max(12, props.preview?.anchor.left || 12), Math.max(12, window.innerWidth - 380));
  const top = Math.min(Math.max(12, props.preview?.anchor.top || 12), Math.max(12, window.innerHeight - 260));
  return { left: `${left}px`, top: `${top}px` };
});
</script>

<template>
  <aside
    v-if="preview"
    class="dictionary-preview"
    :style="style"
    @mouseenter.stop
    @mouseleave="emit('clear')"
  >
    <header>
      <strong>{{ preview.entry.term }}</strong>
      <button type="button" title="Close dictionary preview" @click="emit('clear')">×</button>
    </header>
    <p>{{ preview.entry.definition }}</p>
  </aside>
</template>
