<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@/i18n";
import type { AuthorHoverPreview } from "@/types";

const props = defineProps<{
  preview: AuthorHoverPreview | null;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  (event: "clear"): void;
  (event: "openDocument", documentId: string): void;
}>();

const style = computed(() => {
  const left = Math.min(Math.max(12, props.preview?.anchor.left || 12), Math.max(12, window.innerWidth - 460));
  const top = Math.min(Math.max(12, props.preview?.anchor.top || 12), Math.max(12, window.innerHeight - 440));
  return { left: `${left}px`, top: `${top}px` };
});

const graphNodes = computed(() => {
  const author = props.preview?.author;
  if (!author) return [];
  return [
    { name: author.name, x: 170, y: 92, r: 28, active: true },
    ...author.coauthors.slice(0, 8).map((edge, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, Math.min(8, author.coauthors.length)) - Math.PI / 2;
      return {
        name: edge.name,
        x: 170 + Math.cos(angle) * 112,
        y: 92 + Math.sin(angle) * 64,
        r: Math.min(24, 13 + edge.count * 3),
        active: false,
      };
    }),
  ];
});
</script>

<template>
  <aside
    v-if="preview"
    class="author-preview"
    :style="style"
    @mouseenter.stop
    @mouseleave="emit('clear')"
  >
    <header>
      <div>
        <strong>{{ preview.author.name }}</strong>
        <small>{{ t("author.localPaperCount", { count: preview.author.local_paper_count, plural: preview.author.local_paper_count === 1 ? "" : "s" }) }}</small>
      </div>
      <button type="button" :title="t('author.closeGraph')" @click="emit('clear')">×</button>
    </header>
    <svg class="author-graph" viewBox="0 0 340 184" role="img" :aria-label="t('author.coauthorGraph')">
      <line
        v-for="node in graphNodes.slice(1)"
        :key="`edge-${node.name}`"
        x1="170"
        y1="92"
        :x2="node.x"
        :y2="node.y"
      />
      <g v-for="node in graphNodes" :key="node.name">
        <circle :cx="node.x" :cy="node.y" :r="node.r" :class="{ active: node.active }" />
        <text :x="node.x" :y="node.y + node.r + 13" text-anchor="middle">{{ node.name.split(' ').slice(-1)[0] }}</text>
      </g>
    </svg>
    <section class="author-preview-section">
      <strong>{{ t("author.closest") }}</strong>
      <button
        v-for="edge in preview.author.coauthors.slice(0, 5)"
        :key="edge.normalized_name"
        type="button"
        class="author-edge"
        :title="edge.papers.map((paper) => paper.title).join('\n')"
      >
        <span>{{ edge.name }}</span>
        <small>{{ t("author.paperCount", { count: edge.count, plural: edge.count === 1 ? "" : "s" }) }}</small>
      </button>
      <div v-if="!preview.author.coauthors.length" class="empty-state">{{ t("author.emptyCoauthors") }}</div>
    </section>
    <section class="author-preview-section">
      <strong>{{ t("author.localPapers") }}</strong>
      <button
        v-for="paper in preview.author.papers.slice(0, 4)"
        :key="paper.document_id"
        type="button"
        class="author-paper"
        @click="emit('openDocument', paper.document_id)"
      >
        {{ paper.title }}
      </button>
    </section>
    <p class="author-preview-note">{{ t("author.note") }}</p>
  </aside>
</template>
