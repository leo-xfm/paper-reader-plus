<script setup lang="ts">
import { computed, ref } from "vue";
import { FilePlus2, Grid2X2, Link, ListTree, PanelLeftClose, PanelLeftOpen, Search, Trash2 } from "lucide-vue-next";
import PdfThumbnail from "@/components/PdfThumbnail.vue";
import { useI18n } from "@/i18n";
import type { PdfDocumentProxyLike, PdfOutlineItem } from "@/pdf/pdfTypes";
import type { LibraryDocument, LibrarySearchResult, PackageHealthReport, ReaderDocumentViewMode } from "@/types";

type SidebarMode = "readerp" | "readerm" | "thumbnails" | "outline";

const props = defineProps<{
  collapsed: boolean;
  documents: LibraryDocument[];
  selectedDocumentId: string;
  pdfDocument: PdfDocumentProxyLike | null;
  pageNumbers: number[];
  currentPageNumber: number;
  outlineItems: PdfOutlineItem[];
  healthReports: Record<string, PackageHealthReport | undefined>;
  searchQuery: string;
  searchResults: LibrarySearchResult[];
  searchLoading: boolean;
  historyReaderpLinkView?: ReaderDocumentViewMode;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  (event: "update:collapsed", value: boolean): void;
  (event: "importPdf"): void;
  (event: "importArxiv"): void;
  (event: "createEmptyReaderm"): void;
  (event: "createReadermFromMarkdown"): void;
  (event: "openDocument", documentId: string): void;
  (event: "documentContextMenu", document: LibraryDocument): void;
  (event: "deleteDocument", document: LibraryDocument): void;
  (event: "clearHistory", mode: "readerp" | "readerm"): void;
  (event: "update:searchQuery", value: string): void;
  (event: "openSearchResult", result: LibrarySearchResult): void;
  (event: "scrollToPage", pageIndex: number): void;
  (event: "outlineItemClick", item: PdfOutlineItem): void;
}>();

const mode = ref<SidebarMode>("readerp");
const canShowPdfViews = computed(() => Boolean(props.pdfDocument));
const canShowOutline = computed(() => props.outlineItems.length > 0);
const visibleDocuments = computed(() =>
  props.documents.filter((document) =>
    mode.value === "readerm"
      ? document.source_type === "readerm"
      : document.source_type !== "readerm",
  ),
);
const searchActive = computed(() => props.searchQuery.trim().length > 0);

function setMode(next: SidebarMode) {
  if (next === "thumbnails" && !canShowPdfViews.value) return;
  if (next === "outline" && !canShowOutline.value) return;
  mode.value = next;
  if (props.collapsed) emit("update:collapsed", false);
}

function healthClass(documentId: string) {
  return props.healthReports[documentId]?.status || "ok";
}

function markdownLinkForDocument(document: LibraryDocument) {
  const scheme = document.source_type === "readerm" ? "readerm" : "readerp";
  const title = document.title.replace(/[[\]\\]/g, "\\$&");
  const view = document.source_type === "readerm" || !props.historyReaderpLinkView || props.historyReaderpLinkView === "pdf"
    ? ""
    : `?view=${props.historyReaderpLinkView}`;
  return `[${title}](${scheme}://document/${encodeURIComponent(document.document_id)}${view})`;
}

async function copyDocumentMarkdownLink(document: LibraryDocument) {
  await navigator.clipboard?.writeText(markdownLinkForDocument(document));
}
</script>

<template>
  <aside class="library" :class="{ collapsed }">
    <div class="brand">
      <button
        type="button"
        class="library-toggle"
        :title="collapsed ? t('library.expandSidebar') : t('library.collapseSidebar')"
        @click="emit('update:collapsed', !collapsed)"
      >
        <PanelLeftOpen v-if="collapsed" :size="18" />
        <PanelLeftClose v-else :size="18" />
      </button>
      <strong v-if="!collapsed">Paper Reader Plus</strong>
    </div>

    <template v-if="!collapsed">
      <div class="sidebar-tabs">
        <button type="button" :title="t('library.readermHistory')" :class="{ active: mode === 'readerm' }" @click="setMode('readerm')"><span class="history-glyph">M</span></button>
        <button type="button" :title="t('library.readerpHistory')" :class="{ active: mode === 'readerp' }" @click="setMode('readerp')"><span class="history-glyph">P</span></button>
        <button type="button" :title="t('sidebar.thumbnails')" :disabled="!canShowPdfViews" :class="{ active: mode === 'thumbnails' }" @click="setMode('thumbnails')"><Grid2X2 :size="18" /></button>
        <button type="button" :title="t('sidebar.outline')" :disabled="!canShowOutline" :class="{ active: mode === 'outline' }" @click="setMode('outline')"><ListTree :size="18" /></button>
      </div>

      <div class="library-content">
        <template v-if="mode === 'readerp' || mode === 'readerm'">
          <div class="sidebar-import-actions">
            <template v-if="mode === 'readerm'">
              <button type="button" class="secondary" @click="emit('createEmptyReaderm')">{{ t("reader.emptyReaderm") }}</button>
              <button type="button" class="secondary" @click="emit('createReadermFromMarkdown')">{{ t("reader.markdownReaderm") }}</button>
            </template>
            <template v-else>
              <button type="button" class="secondary" @click="emit('importPdf')"><FilePlus2 :size="15" /> PDF</button>
              <button type="button" class="secondary" @click="emit('importArxiv')">arXiv</button>
            </template>
            <button
              type="button"
              class="secondary icon-only"
              :title="t(mode === 'readerm' ? 'library.clearReadermHistory' : 'library.clearReaderpHistory')"
              :disabled="!visibleDocuments.length"
              @click="emit('clearHistory', mode)"
            >
              <Trash2 :size="15" />
            </button>
          </div>
          <label class="library-search">
            <Search :size="15" />
            <input
              :value="searchQuery"
              :placeholder="t('library.searchPlaceholder')"
              @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <template v-if="searchActive">
            <button
              v-for="result in searchResults"
              :key="result.result_id"
              type="button"
              class="library-search-result"
              @click="emit('openSearchResult', result)"
            >
              <span>{{ result.title }}</span>
              <small>{{ result.kind }} · {{ result.snippet }}</small>
            </button>
            <div v-if="!searchResults.length" class="empty-library">
              <p>{{ searchLoading ? t("common.waiting") : t("library.searchEmpty") }}</p>
            </div>
          </template>
          <template v-else>
          <div
            v-for="document in visibleDocuments"
            :key="document.document_id"
            class="library-item"
            :class="{ active: selectedDocumentId === document.document_id }"
            @contextmenu.prevent.stop="emit('documentContextMenu', document)"
          >
            <button type="button" class="library-item-open" :title="document.title" @click="emit('openDocument', document.document_id)">
              <span class="library-item-title">
                <span class="library-item-title-text">{{ document.title }}</span>
              </span>
              <small class="library-item-file">
                <i class="health-dot" :class="healthClass(document.document_id)" />
                <span>{{ document.file_name }}</span>
              </small>
            </button>
            <button
              type="button"
              class="library-item-link"
              :title="t('library.copyMarkdownLink')"
              @click.stop="copyDocumentMarkdownLink(document)"
            >
              <Link :size="15" />
            </button>
            <button
              type="button"
              class="library-item-delete"
              :title="t('pdf.deleteDocument')"
              @click.stop="emit('deleteDocument', document)"
            >
              <Trash2 :size="15" />
            </button>
          </div>
          <div v-if="!visibleDocuments.length" class="empty-library">
            <p>{{ t("reader.importToBegin") }}</p>
          </div>
          </template>
        </template>

        <div v-else-if="mode === 'thumbnails'" class="thumbnail-list">
          <button
            v-for="page in pageNumbers"
            :key="page"
            type="button"
            class="thumbnail-item"
            :class="{ active: currentPageNumber === page }"
            @click="emit('scrollToPage', page - 1)"
          >
            <PdfThumbnail :pdf-document="pdfDocument" :page-number="page" :width="150" />
            <span>{{ page }}</span>
          </button>
        </div>

        <div v-else class="sidebar-outline">
          <button
            v-for="item in outlineItems"
            :key="item.id"
            type="button"
            class="sidebar-outline-item"
            :style="{ paddingLeft: `${10 + Math.min(item.level, 6) * 16}px` }"
            @click="emit('outlineItemClick', item)"
          >
            {{ item.title }}
          </button>
          <div v-if="!outlineItems.length" class="empty-library">{{ t("reader.noOutline") }}</div>
        </div>
      </div>
    </template>

    <div v-else class="library-rail">
      <button type="button" :title="t('reader.importArxiv')" class="library-rail-item" @click="emit('importArxiv')">aX</button>
      <button type="button" :title="t('library.readermHistory')" :class="{ active: mode === 'readerm' }" @click="setMode('readerm')"><span class="history-glyph">M</span></button>
      <button type="button" :title="t('library.readerpHistory')" :class="{ active: mode === 'readerp' }" @click="setMode('readerp')"><span class="history-glyph">P</span></button>
      <button type="button" :title="t('sidebar.thumbnails')" :disabled="!canShowPdfViews" :class="{ active: mode === 'thumbnails' }" @click="setMode('thumbnails')"><Grid2X2 :size="18" /></button>
      <button type="button" :title="t('sidebar.outline')" :disabled="!canShowOutline" :class="{ active: mode === 'outline' }" @click="setMode('outline')"><ListTree :size="18" /></button>
    </div>
  </aside>
</template>
