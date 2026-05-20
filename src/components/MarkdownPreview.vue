<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { createLruStringCache } from "@/composables/useLruStringCache";
import { markdownBodyFontFamily, markdownCodeFontFamily } from "@/services/MarkdownFontOptionsService";
import { renderMarkdown } from "@/services/MarkdownRenderService";
import { renderMermaidElements } from "@/services/MermaidRenderService";
import type { Settings } from "@/types";

const props = defineProps<{ source: string; documentId?: string; settings?: Settings | null }>();
const emit = defineEmits<{
  (event: "linkClick", payload: { href: string; event: MouseEvent }): void;
  (event: "imageContext", payload: { assetPath: string; event: MouseEvent }): void;
}>();

const resolvedSource = ref("");
const previewRoot = ref<HTMLDivElement | null>(null);
const assetUrlCache = createLruStringCache(50);
const dataUrlAssetPaths = new Map<string, string>();

function normalizeAssetPath(value: string) {
  return value.trim().replace(/^\.\/+/, "").split(/[?#]/)[0];
}

function documentIdFromReaderHref(href: string) {
  if (!href.startsWith("/reader?")) return "";
  try {
    return new URL(href, "http://reader.local").searchParams.get("documentId") || "";
  } catch {
    return "";
  }
}

async function resolveAssetUrls(source: string, documentId?: string) {
  if (!documentId) return source;
  dataUrlAssetPaths.clear();
  const matches = [...source.matchAll(/(?:\[)?!\[[^\]]*\]\((\.?\/?assets\/[^)\s]+)([^)]*)\)(?:\]\((\/reader\?[^)\s]+)\))?/g)];
  let nextSource = source;
  for (const match of matches) {
    const rawPath = match[1];
    const normalized = normalizeAssetPath(rawPath);
    const candidateDocumentIds = [...new Set([documentId, documentIdFromReaderHref(match[3] || "")].filter(Boolean))];
    try {
      let dataUrl = "";
      for (const candidateDocumentId of candidateDocumentIds) {
        const cacheKey = `${candidateDocumentId}:${normalized}`;
        try {
          dataUrl = assetUrlCache.get(cacheKey) || await window.paperReaderPlus.getAssetDataUrl(candidateDocumentId, normalized);
          assetUrlCache.set(cacheKey, dataUrl);
          break;
        } catch {
          // Try the next likely document id.
        }
      }
      if (!dataUrl) throw new Error("Asset not found.");
      dataUrlAssetPaths.set(dataUrl, normalized);
      nextSource = nextSource.replace(rawPath, dataUrl);
    } catch {
      // Keep the original path so the renderer can still show a broken image marker.
    }
  }
  return nextSource;
}

watch(
  () => props.documentId,
  () => {
    assetUrlCache.clear();
    dataUrlAssetPaths.clear();
  },
);

watch(
  () => [props.source, props.documentId] as const,
  async ([source, documentId], _oldValue, onCleanup) => {
    let canceled = false;
    onCleanup(() => { canceled = true; });
    const resolved = await resolveAssetUrls(source || "", documentId);
    if (!canceled) resolvedSource.value = resolved;
  },
  { immediate: true },
);

const renderOptions = computed(() => ({
  codeLineNumbers: props.settings?.markdown_code_line_numbers !== false,
  highlightEnabled: props.settings?.markdown_highlight_enabled !== false,
  mathEnabled: props.settings?.markdown_math_enabled !== false,
}));
const highlightColor = computed(() => props.settings?.markdown_highlight_color || "#fff3bf");
const bodyFontFamily = computed(() => markdownBodyFontFamily(props.settings?.markdown_font_family || "current"));
const codeFontFamily = computed(() => markdownCodeFontFamily(props.settings?.markdown_code_font_family || "Consolas"));
const lineHeight = computed(() => props.settings?.markdown_line_height || 1.6);
const codeFontScale = computed(() => props.settings?.markdown_code_font_scale || 0.86);
const codeLineHeight = computed(() => props.settings?.markdown_code_line_height || 1.22);
const renderedHtml = computed(() => renderMarkdown(resolvedSource.value || "", renderOptions.value));

watch(
  renderedHtml,
  async () => {
    await nextTick();
    if (previewRoot.value) renderMermaidElements(previewRoot.value);
  },
  { immediate: true, flush: "post" },
);

function handleClick(event: MouseEvent) {
  const link = (event.target as HTMLElement | null)?.closest("a") as HTMLAnchorElement | null;
  if (!link) return;
  emit("linkClick", { href: link.getAttribute("href") || link.href, event });
}

function handleContextMenu(event: MouseEvent) {
  const image = (event.target as HTMLElement | null)?.closest("img") as HTMLImageElement | null;
  if (!image) return;
  const assetPath = dataUrlAssetPaths.get(image.getAttribute("src") || "") || normalizeAssetPath(image.getAttribute("src") || "");
  if (!/^assets\//i.test(assetPath)) return;
  event.preventDefault();
  emit("imageContext", { assetPath, event });
}
</script>

<template>
  <div
    ref="previewRoot"
    class="markdown-preview"
    :style="{ '--markdown-highlight-color': highlightColor, '--markdown-body-font-family': bodyFontFamily, '--markdown-code-font-family': codeFontFamily, '--markdown-line-height': lineHeight, '--markdown-code-font-scale': codeFontScale, '--markdown-code-line-height': codeLineHeight }"
    @click="handleClick"
    @submit.prevent
    @contextmenu="handleContextMenu"
    v-html="renderedHtml"
  />
</template>
