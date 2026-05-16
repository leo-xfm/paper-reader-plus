<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { renderMarkdown } from "@/services/MarkdownRenderService";

const props = defineProps<{ source: string; documentId?: string }>();
const emit = defineEmits<{
  (event: "linkClick", payload: { href: string; event: MouseEvent }): void;
  (event: "imageContext", payload: { assetPath: string; event: MouseEvent }): void;
}>();

const resolvedSource = ref("");
const assetUrlCache = new Map<string, string>();
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
  () => [props.source, props.documentId] as const,
  async ([source, documentId], _oldValue, onCleanup) => {
    let canceled = false;
    onCleanup(() => { canceled = true; });
    const resolved = await resolveAssetUrls(source || "", documentId);
    if (!canceled) resolvedSource.value = resolved;
  },
  { immediate: true },
);

const renderedHtml = computed(() => renderMarkdown(resolvedSource.value || ""));

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
  <div class="markdown-preview" @click="handleClick" @contextmenu="handleContextMenu" v-html="renderedHtml" />
</template>
