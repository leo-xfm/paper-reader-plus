<script setup lang="ts">
import { onMounted, ref } from "vue";
import MarkdownPreview from "@/components/MarkdownPreview.vue";

const source = ref("# Paper Reader Plus Help\n\nLoading...");
const topic = new URLSearchParams(window.location.search).get("help") || "guide";

onMounted(async () => {
  try {
    source.value = await window.paperReaderPlus.getHelpContent(topic);
  } catch (cause) {
    source.value = `# Paper Reader Plus Help\n\n${cause instanceof Error ? cause.message : String(cause)}`;
  }
});
</script>

<template>
  <main class="help-page">
    <MarkdownPreview class="help-page-content" :source="source" />
  </main>
</template>
