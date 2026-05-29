<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ChevronDown, FilePlus, FilePlus2, FileText, Folder, Grid2X2, Link, ListTree, PanelLeftClose, PanelLeftOpen, Search, Star, Trash2 } from "lucide-vue-next";
import PdfThumbnail from "@/components/PdfThumbnail.vue";
import { useI18n } from "@/i18n";
import type { PdfDocumentProxyLike, PdfOutlineItem } from "@/pdf/pdfTypes";
import type { LibraryDocument, LibraryGroup, LibrarySearchResult, PackageHealthReport, ReaderDocumentViewMode } from "@/types";

type SidebarMode = "readerp" | "readerm" | "all" | "thumbnails" | "outline";

const props = defineProps<{
  collapsed: boolean;
  documents: LibraryDocument[];
  groups: LibraryGroup[];
  groupRenameRequest?: { groupId: string; requestId: number } | null;
  selectedDocumentId: string;
  selectedDocumentIds: string[];
  recentGroupId?: string;
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
  (event: "toggleDocumentPinned", document: LibraryDocument): void;
  (event: "documentSelect", payload: { document: LibraryDocument; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): void;
  (event: "documentContextMenu", payload: { document: LibraryDocument; selectedDocumentIds: string[] }): void;
  (event: "groupContextMenu", payload: { group: LibraryGroup; x: number; y: number }): void;
  (event: "renameGroup", payload: { group: LibraryGroup; name: string }): void;
  (event: "libraryContextMenu", payload: { x: number; y: number }): void;
  (event: "moveDocumentsToGroup", payload: { documentIds: string[]; groupId: string | null }): void;
  (event: "deleteDocument", document: LibraryDocument): void;
  (event: "clearHistory", mode: "readerp" | "readerm" | "all"): void;
  (event: "update:searchQuery", value: string): void;
  (event: "openSearchResult", result: LibrarySearchResult): void;
  (event: "scrollToPage", pageIndex: number): void;
  (event: "outlineItemClick", item: PdfOutlineItem): void;
}>();

const mode = ref<SidebarMode>("readerp");
const collapsedGroupIds = ref<Set<string>>(new Set());
const expandedGroupIds = ref<Set<string>>(new Set());
const editingGroupId = ref("");
const editingGroupName = ref("");
const editingGroupOriginalName = ref("");
let groupClickTimer: number | null = null;
const canShowPdfViews = computed(() => Boolean(props.pdfDocument));
const canShowOutline = computed(() => props.outlineItems.length > 0);
const selectedDocumentIdSet = computed(() => new Set(props.selectedDocumentIds));

function documentGroupId(document: LibraryDocument) {
  return document.group_id || "default";
}

function groupIdForDrop(group: LibraryGroup) {
  return group.group_id === "default" ? null : group.group_id;
}

function documentMatchesMode(document: LibraryDocument) {
  if (mode.value === "all") return true;
  if (mode.value === "readerm") return document.source_type === "readerm";
  return document.source_type !== "readerm";
}

function sortDocuments(left: LibraryDocument, right: LibraryDocument) {
    const leftPinned = Boolean(left.pinned_at);
    const rightPinned = Boolean(right.pinned_at);
    if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
    if (leftPinned && rightPinned) {
      const pinned = (right.pinned_at || "").localeCompare(left.pinned_at || "");
      if (pinned) return pinned;
    }
    const leftOpened = left.last_opened_at || left.updated_at || left.created_at;
    const rightOpened = right.last_opened_at || right.updated_at || right.created_at;
    return rightOpened.localeCompare(leftOpened);
}

const visibleDocuments = computed(() =>
  [...props.documents.filter(documentMatchesMode)].sort(sortDocuments),
);

const groupedDocuments = computed(() => {
  const byGroup = new Map<string, LibraryDocument[]>();
  for (const document of visibleDocuments.value) {
    const groupId = documentGroupId(document);
    byGroup.set(groupId, [...(byGroup.get(groupId) || []), document]);
  }
  return props.groups.map((group) => ({
    group,
    documents: byGroup.get(group.group_id) || [],
  }));
});
const searchActive = computed(() => props.searchQuery.trim().length > 0);

watch(
  () => props.groupRenameRequest,
  async (request) => {
    if (!request?.groupId) return;
    const group = props.groups.find((item) => item.group_id === request.groupId);
    if (group) await beginGroupRename(group);
  },
);

onBeforeUnmount(() => {
  cancelScheduledGroupToggle();
});

function setMode(next: SidebarMode) {
  if (next === "thumbnails" && !canShowPdfViews.value) return;
  if (next === "outline" && !canShowOutline.value) return;
  mode.value = next;
  if (props.collapsed) emit("update:collapsed", false);
}

function healthClass(documentId: string) {
  return props.healthReports[documentId]?.status || "ok";
}

function isGroupCollapsed(group: LibraryGroup) {
  if (expandedGroupIds.value.has(group.group_id)) return false;
  if (collapsedGroupIds.value.has(group.group_id)) return true;
  if (props.recentGroupId && props.recentGroupId !== group.group_id) return true;
  return false;
}

function toggleGroup(group: LibraryGroup) {
  if (editingGroupId.value === group.group_id) return;
  const nextCollapsed = new Set(collapsedGroupIds.value);
  const nextExpanded = new Set(expandedGroupIds.value);
  if (isGroupCollapsed(group)) {
    nextCollapsed.delete(group.group_id);
    nextExpanded.add(group.group_id);
  } else {
    nextCollapsed.add(group.group_id);
    nextExpanded.delete(group.group_id);
  }
  collapsedGroupIds.value = nextCollapsed;
  expandedGroupIds.value = nextExpanded;
}

function cancelScheduledGroupToggle() {
  if (!groupClickTimer) return;
  window.clearTimeout(groupClickTimer);
  groupClickTimer = null;
}

function scheduleGroupToggle(group: LibraryGroup) {
  cancelScheduledGroupToggle();
  groupClickTimer = window.setTimeout(() => {
    groupClickTimer = null;
    toggleGroup(group);
  }, 200);
}

async function beginGroupRename(group: LibraryGroup) {
  cancelScheduledGroupToggle();
  if (group.group_id === "default") return;
  editingGroupId.value = group.group_id;
  editingGroupName.value = group.name;
  editingGroupOriginalName.value = group.name;
  await nextTick();
  const input = document.querySelector<HTMLInputElement>(`[data-group-rename-input="${CSS.escape(group.group_id)}"]`);
  input?.focus();
  input?.select();
}

function handleGroupNameDoubleClick(group: LibraryGroup) {
  void beginGroupRename(group);
}

function beforeGroupBodyEnter(element: Element) {
  const body = element as HTMLElement;
  body.style.height = "0";
  body.style.opacity = "0";
}

function groupBodyEnter(element: Element) {
  const body = element as HTMLElement;
  body.style.height = `${body.scrollHeight}px`;
  body.style.opacity = "1";
}

function afterGroupBodyEnter(element: Element) {
  const body = element as HTMLElement;
  body.style.height = "";
  body.style.opacity = "";
}

function beforeGroupBodyLeave(element: Element) {
  const body = element as HTMLElement;
  body.style.height = `${body.scrollHeight}px`;
  body.style.opacity = "1";
}

function groupBodyLeave(element: Element) {
  const body = element as HTMLElement;
  body.style.height = `${body.scrollHeight}px`;
  window.requestAnimationFrame(() => {
    body.style.height = "0";
    body.style.opacity = "0";
  });
}

function finishGroupRename(group: LibraryGroup) {
  if (editingGroupId.value !== group.group_id) return;
  const nextName = editingGroupName.value.trim().replace(/\s+/g, " ");
  editingGroupId.value = "";
  editingGroupName.value = "";
  const originalName = editingGroupOriginalName.value;
  editingGroupOriginalName.value = "";
  if (!nextName || nextName === originalName) return;
  emit("renameGroup", { group, name: nextName });
}

function cancelGroupRename() {
  editingGroupId.value = "";
  editingGroupName.value = "";
  editingGroupOriginalName.value = "";
}

function selectedIdsForDocument(document: LibraryDocument) {
  return selectedDocumentIdSet.value.has(document.document_id)
    ? props.selectedDocumentIds
    : [document.document_id];
}

function handleDocumentDragStart(event: DragEvent, document: LibraryDocument) {
  const ids = selectedIdsForDocument(document);
  event.dataTransfer?.setData("application/x-paper-reader-document-ids", JSON.stringify(ids));
  event.dataTransfer?.setData("text/plain", ids.join(","));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function handleGroupDrop(event: DragEvent, group: LibraryGroup) {
  const raw = event.dataTransfer?.getData("application/x-paper-reader-document-ids") || "";
  let ids: string[] = [];
  try {
    ids = JSON.parse(raw);
  } catch {
    ids = [];
  }
  ids = ids.filter(Boolean);
  if (!ids.length) return;
  emit("moveDocumentsToGroup", { documentIds: ids, groupId: groupIdForDrop(group) });
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
      <div v-if="!collapsed" class="sidebar-tabs">
        <button type="button" :title="t('library.readerpHistory')" :class="{ active: mode === 'readerp' }" @click="setMode('readerp')"><span class="history-glyph">P</span></button>
        <button type="button" :title="t('library.readermHistory')" :class="{ active: mode === 'readerm' }" @click="setMode('readerm')"><span class="history-glyph">M</span></button>
        <button type="button" :title="t('library.allHistory')" :class="{ active: mode === 'all' }" @click="setMode('all')"><Folder :size="16" /></button>
        <button type="button" :title="t('sidebar.thumbnails')" :disabled="!canShowPdfViews" :class="{ active: mode === 'thumbnails' }" @click="setMode('thumbnails')"><Grid2X2 :size="18" /></button>
        <button type="button" :title="t('sidebar.outline')" :disabled="!canShowOutline" :class="{ active: mode === 'outline' }" @click="setMode('outline')"><ListTree :size="18" /></button>
      </div>
    </div>

    <template v-if="!collapsed">
      <div class="library-content" @contextmenu.self.prevent="emit('libraryContextMenu', { x: $event.clientX, y: $event.clientY })">
        <template v-if="mode === 'readerp' || mode === 'readerm' || mode === 'all'">
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
          <section
            v-for="entry in groupedDocuments"
            :key="entry.group.group_id"
            class="library-group"
            :class="{ collapsed: isGroupCollapsed(entry.group) }"
          >
            <div
              class="library-group-header"
              :class="{ empty: !entry.documents.length }"
              role="button"
              tabindex="0"
              @click="scheduleGroupToggle(entry.group)"
              @keydown.enter.prevent="toggleGroup(entry.group)"
              @keydown.space.prevent="toggleGroup(entry.group)"
              @contextmenu.prevent.stop="emit('groupContextMenu', { group: entry.group, x: $event.clientX, y: $event.clientY })"
              @dragover.prevent
              @drop.prevent.stop="handleGroupDrop($event, entry.group)"
            >
              <ChevronDown :size="15" :class="{ collapsed: isGroupCollapsed(entry.group) }" />
              <input
                v-if="editingGroupId === entry.group.group_id"
                v-model="editingGroupName"
                class="library-group-rename-input"
                :data-group-rename-input="entry.group.group_id"
                @click.stop
                @pointerdown.stop
                @keydown.enter.prevent="finishGroupRename(entry.group)"
                @keydown.escape.prevent="cancelGroupRename"
                @blur="finishGroupRename(entry.group)"
              />
              <span v-else @dblclick.stop="handleGroupNameDoubleClick(entry.group)">{{ entry.group.name }}</span>
              <small>{{ entry.documents.length }}</small>
            </div>
            <transition
              name="library-group-body"
              @before-enter="beforeGroupBodyEnter"
              @enter="groupBodyEnter"
              @after-enter="afterGroupBodyEnter"
              @before-leave="beforeGroupBodyLeave"
              @leave="groupBodyLeave"
            >
              <div v-if="!isGroupCollapsed(entry.group)" class="library-group-body">
                <div v-if="!entry.documents.length" class="library-group-empty">{{ t("library.groupEmpty") }}</div>
                <div
                  v-for="document in entry.documents"
                  :key="document.document_id"
                  class="library-item"
                  :class="{ active: selectedDocumentId === document.document_id, selected: selectedDocumentIdSet.has(document.document_id), pinned: Boolean(document.pinned_at) }"
                  draggable="true"
                  @click="emit('documentSelect', { document, shiftKey: $event.shiftKey, ctrlKey: $event.ctrlKey, metaKey: $event.metaKey })"
                  @dragstart="handleDocumentDragStart($event, document)"
                  @contextmenu.prevent.stop="emit('documentContextMenu', { document, selectedDocumentIds: selectedIdsForDocument(document) })"
                >
                  <button type="button" class="library-item-open" :title="document.title" @click.stop="emit('openDocument', document.document_id)">
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
                    class="library-item-pin"
                    :class="{ pinned: Boolean(document.pinned_at) }"
                    :title="t(document.pinned_at ? 'library.unpinDocument' : 'library.pinDocument')"
                    @click.stop="emit('toggleDocumentPinned', document)"
                  >
                    <Star :size="15" />
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
              </div>
            </transition>
          </section>
          <div v-if="!visibleDocuments.length" class="empty-library">
            <p>{{ t("reader.importToBegin") }}</p>
          </div>
          <div class="library-context-space" @contextmenu.prevent.stop="emit('libraryContextMenu', { x: $event.clientX, y: $event.clientY })" />
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
      <div v-if="mode === 'readerp' || mode === 'readerm' || mode === 'all'" class="sidebar-import-actions" :class="{ compact: mode === 'all' }">
        <button v-if="mode !== 'readerm'" type="button" class="secondary" :title="t('app.importPdf')" @click="emit('importPdf')"><FilePlus2 :size="15" /><span class="sidebar-action-label">PDF</span></button>
        <button v-if="mode !== 'readerm'" type="button" class="secondary" :title="t('app.importArxiv')" @click="emit('importArxiv')"><span class="sidebar-text-icon">aX</span><span class="sidebar-action-label">arXiv</span></button>
        <button v-if="mode !== 'readerp'" type="button" class="secondary" :title="t('app.createEmptyReaderm')" @click="emit('createEmptyReaderm')"><FilePlus :size="15" /><span class="sidebar-action-label">{{ t("reader.emptyReaderm") }}</span></button>
        <button v-if="mode !== 'readerp'" type="button" class="secondary" :title="t('app.createReadermFromMarkdown')" @click="emit('createReadermFromMarkdown')"><span class="sidebar-text-icon">md</span><span class="sidebar-action-label">{{ t("reader.markdownReaderm") }}</span></button>
        <button
          type="button"
          class="secondary clear-history-button"
          :title="t(mode === 'all' ? 'library.clearAllHistory' : mode === 'readerm' ? 'library.clearReadermHistory' : 'library.clearReaderpHistory')"
          :disabled="!visibleDocuments.length"
          @click="emit('clearHistory', mode)"
        >
          <Trash2 :size="15" />
        </button>
      </div>
    </template>

    <div v-else class="library-rail">
      <div class="library-rail-nav">
        <button type="button" :title="t('library.readermHistory')" :class="{ active: mode === 'readerm' }" @click="setMode('readerm')"><span class="history-glyph">M</span></button>
        <button type="button" :title="t('library.readerpHistory')" :class="{ active: mode === 'readerp' }" @click="setMode('readerp')"><span class="history-glyph">P</span></button>
        <button type="button" :title="t('library.allHistory')" :class="{ active: mode === 'all' }" @click="setMode('all')"><Folder :size="18" /></button>
        <button type="button" :title="t('sidebar.thumbnails')" :disabled="!canShowPdfViews" :class="{ active: mode === 'thumbnails' }" @click="setMode('thumbnails')"><Grid2X2 :size="18" /></button>
        <button type="button" :title="t('sidebar.outline')" :disabled="!canShowOutline" :class="{ active: mode === 'outline' }" @click="setMode('outline')"><ListTree :size="18" /></button>
      </div>
      <div class="library-rail-actions">
        <button type="button" :title="t('app.importPdf')" class="library-rail-item" @click="emit('importPdf')"><FilePlus2 :size="17" /></button>
        <button type="button" :title="t('app.createEmptyReaderm')" class="library-rail-item" @click="emit('createEmptyReaderm')"><FilePlus :size="17" /></button>
        <button type="button" :title="t('app.importArxiv')" class="library-rail-item" @click="emit('importArxiv')"><span class="sidebar-text-icon">aX</span></button>
        <button type="button" :title="t('app.createReadermFromMarkdown')" class="library-rail-item" @click="emit('createReadermFromMarkdown')"><span class="sidebar-text-icon">md</span></button>
      </div>
    </div>
  </aside>
</template>
