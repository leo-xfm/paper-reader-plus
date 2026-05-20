<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { ChevronLeft, ChevronRight, Columns2, Download, FileText, Save, Search } from "lucide-vue-next";
import LiveMarkdownEditor from "@/components/LiveMarkdownEditor.vue";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import SegmentedModeSwitch from "@/components/SegmentedModeSwitch.vue";
import { useMarkdownZoom } from "@/composables/useMarkdownZoom";
import { useI18n } from "@/i18n";
import { markdownCodeFontFamily } from "@/services/MarkdownFontOptionsService";
import type { ReadermEditorMode, ReadermReference, Settings } from "@/types";

const props = defineProps<{
  title: string;
  titleDraft: string;
  editingTitle: boolean;
  markdown: string;
  mode: ReadermEditorMode;
  documentId: string;
  references: ReadermReference[];
  activeReferenceId: string;
  settings?: Settings | null;
}>();

const emit = defineEmits<{
  (event: "update:titleDraft", value: string): void;
  (event: "update:markdown", value: string): void;
  (event: "update:mode", value: ReadermEditorMode): void;
  (event: "editTitle"): void;
  (event: "saveTitle"): void;
  (event: "save"): void;
  (event: "export"): void;
  (event: "captureRegion", payload?: { selection?: { start: number; end: number }; kind?: "image" | "formula" }): void;
  (event: "pasteImage", payload: { dataUrl: string; selection?: { start: number; end: number } }): void;
  (event: "resizeImage", payload: { assetPath: string }): void;
  (event: "linkClick", payload: { href: string; event: MouseEvent; force?: boolean }): void;
  (event: "updateSettings", patch: Partial<Settings>): void;
}>();

const textarea = ref<HTMLTextAreaElement | null>(null);
const liveEditor = ref<InstanceType<typeof LiveMarkdownEditor> | null>(null);
const previewRoot = ref<HTMLElement | null>(null);
const previewSearchInput = ref<HTMLInputElement | null>(null);
const liveSelection = ref<{ start: number; end: number } | undefined>(undefined);
const { markdownFontSize, handleMarkdownWheel } = useMarkdownZoom();
const searchOpen = ref(false);
const searchQuery = ref("");
const activePreviewMatchIndex = ref(0);
const { t } = useI18n();
const resolvedCount = computed(() => props.references.filter((reference) => reference.status === "resolved").length);
const previewPosition = computed(() => props.settings?.readerm_preview_position === "bottom" ? "bottom" : "right");
const markdownLineHeight = computed(() => props.settings?.markdown_line_height || 1.6);
const markdownCodeFontScale = computed(() => props.settings?.markdown_code_font_scale || 0.86);
const markdownCodeLineHeight = computed(() => props.settings?.markdown_code_line_height || 1.22);
const markdownCodeFontFamilyCss = computed(() => markdownCodeFontFamily(props.settings?.markdown_code_font_family || "Consolas"));
const previewMatches = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query || props.mode !== "preview") return [] as HTMLElement[];
  const root = previewRoot.value;
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>("[data-readerm-search-index]"));
});
const editSearchMatchCount = computed(() => {
  const query = searchQuery.value.trim();
  if (!query || (props.mode !== "edit" && props.mode !== "edit-preview")) return 0;
  return props.markdown.toLowerCase().split(query.toLowerCase()).length - 1;
});

function currentSelection() {
  return textarea.value ? { start: textarea.value.selectionStart, end: textarea.value.selectionEnd } : liveSelection.value;
}

function scrollTextareaToHeading(headingId: string) {
  const editor = textarea.value;
  if (!editor) return false;
  const match = headingId.match(/^markdown-heading-(\d+)$/);
  const targetLine = match ? Number(match[1]) : -1;
  if (!Number.isFinite(targetLine) || targetLine < 0) return false;
  const lines = props.markdown.replace(/\r\n/g, "\n").split("\n");
  let offset = 0;
  for (let index = 0; index < Math.min(targetLine, lines.length); index += 1) {
    offset += lines[index].length + 1;
  }
  editor.focus();
  editor.setSelectionRange(offset, offset);
  const lineHeight = Number.parseFloat(getComputedStyle(editor).lineHeight) || 22;
  editor.scrollTop = Math.max(0, targetLine * lineHeight - 12);
  return true;
}

function scrollToHeading(headingId: string) {
  if (props.mode === "live") return liveEditor.value?.scrollToHeading(headingId) ?? false;
  if (props.mode === "edit" || props.mode === "edit-preview") return scrollTextareaToHeading(headingId);
  return previewRoot.value
    ?.querySelector<HTMLElement>(`[data-readerm-heading-id="${CSS.escape(headingId)}"]`)
    ?.scrollIntoView({ block: "start", behavior: "smooth" }) !== undefined;
}

defineExpose({
  currentSelection,
  scrollToHeading,
});

function clearPreviewSearchMarks() {
  const root = previewRoot.value;
  if (!root) return;
  root.querySelectorAll("mark.readerm-search-match").forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent || ""));
  });
  root.normalize();
}

function markPreviewSearch() {
  clearPreviewSearchMarks();
  const root = previewRoot.value;
  const query = searchQuery.value.trim();
  if (!root || !query || props.mode !== "preview") return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.toLowerCase().includes(query.toLowerCase())) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      return parent?.closest("script, style, mark") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  let index = 0;
  for (const node of nodes) {
    const text = node.textContent || "";
    const fragment = document.createDocumentFragment();
    let offset = 0;
    let found = text.toLowerCase().indexOf(query.toLowerCase(), offset);
    while (found >= 0) {
      fragment.append(document.createTextNode(text.slice(offset, found)));
      const mark = document.createElement("mark");
      mark.className = "readerm-search-match";
      mark.dataset.readermSearchIndex = String(index);
      mark.textContent = text.slice(found, found + query.length);
      fragment.append(mark);
      index += 1;
      offset = found + query.length;
      found = text.toLowerCase().indexOf(query.toLowerCase(), offset);
    }
    fragment.append(document.createTextNode(text.slice(offset)));
    node.replaceWith(fragment);
  }
  activePreviewMatchIndex.value = Math.min(activePreviewMatchIndex.value, Math.max(0, index - 1));
  void nextTick(scrollToActivePreviewMatch);
}

function scrollToActivePreviewMatch() {
  const matches = previewMatches.value;
  matches.forEach((item) => item.classList.remove("active"));
  const active = matches[activePreviewMatchIndex.value];
  if (!active) return;
  active.classList.add("active");
  active.scrollIntoView({ block: "center", behavior: "smooth" });
}

function nextPreviewSearch(delta: number) {
  const matches = previewMatches.value;
  if (!matches.length) return;
  activePreviewMatchIndex.value = (activePreviewMatchIndex.value + delta + matches.length) % matches.length;
  scrollToActivePreviewMatch();
}

function nextEditSearch(delta: number) {
  const editor = textarea.value;
  const query = searchQuery.value.trim();
  if (!editor || !query) return;
  const source = props.markdown;
  const lowerSource = source.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const cursor = delta >= 0 ? editor.selectionEnd : Math.max(0, editor.selectionStart - 1);
  let index = delta >= 0 ? lowerSource.indexOf(lowerQuery, cursor) : lowerSource.lastIndexOf(lowerQuery, cursor);
  if (index < 0) index = delta >= 0 ? lowerSource.indexOf(lowerQuery) : lowerSource.lastIndexOf(lowerQuery);
  if (index < 0) return;
  editor.focus();
  editor.setSelectionRange(index, index + query.length);
  const line = source.slice(0, index).split("\n").length - 1;
  const lineHeight = Number.parseFloat(getComputedStyle(editor).lineHeight) || 22;
  editor.scrollTop = Math.max(0, line * lineHeight - editor.clientHeight / 3);
}

function focusSearch() {
  if (props.mode === "live") {
    liveEditor.value?.openSearch();
    return;
  }
  searchOpen.value = true;
  void nextTick(() => {
    previewSearchInput.value?.focus();
    previewSearchInput.value?.select();
  });
}

function toggleEditPreview() {
  emit("update:mode", props.mode === "edit-preview" ? "edit" : "edit-preview");
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
    if (props.mode === "live") return;
    event.preventDefault();
    focusSearch();
    return;
  }
  if (event.key === "Escape" && searchOpen.value) {
    searchOpen.value = false;
    clearPreviewSearchMarks();
  }
}

function searchCountText() {
  if (props.mode === "preview") return `${previewMatches.value.length ? activePreviewMatchIndex.value + 1 : 0}/${previewMatches.value.length}`;
  if (props.mode === "edit" || props.mode === "edit-preview") return `${editSearchMatchCount.value}`;
  return "";
}

watch([searchQuery, () => props.mode, () => props.markdown], () => {
  activePreviewMatchIndex.value = 0;
  if (props.mode === "preview") void nextTick(markPreviewSearch);
});
</script>

<template>
  <section
    class="readerm-workspace markdown-resize-scope"
    :style="{ '--markdown-editor-font-size': `${markdownFontSize}px`, '--markdown-line-height': markdownLineHeight, '--markdown-code-font-family': markdownCodeFontFamilyCss, '--markdown-code-font-scale': markdownCodeFontScale, '--markdown-code-line-height': markdownCodeLineHeight }"
    @keydown="handleKeydown"
    @wheel="handleMarkdownWheel"
  >
    <header class="readerm-toolbar">
      <div class="readerm-title">
        <FileText :size="18" />
        <div>
          <div class="title-edit">
            <input
              v-if="editingTitle"
              :value="titleDraft"
              @input="emit('update:titleDraft', ($event.target as HTMLInputElement).value)"
              @keydown.enter.prevent="emit('saveTitle')"
              @blur="emit('saveTitle')"
            />
            <button v-else type="button" class="title-button" :title="t('pdf.rename')" @click="emit('editTitle')">{{ title }}</button>
          </div>
          <span>{{ t("readerm.referencesResolved", { resolved: resolvedCount, total: references.length }) }}</span>
        </div>
      </div>
      <div class="readerm-actions">
        <SegmentedModeSwitch :model-value="mode" @update:model-value="emit('update:mode', $event)" />
        <button
          v-if="mode === 'edit' || mode === 'edit-preview'"
          type="button"
          :class="{ active: mode === 'edit-preview' }"
          :title="mode === 'edit-preview' ? t('readerm.showEditOnly') : t('readerm.showEditPreview')"
          :aria-label="mode === 'edit-preview' ? t('readerm.showEditOnly') : t('readerm.showEditPreview')"
          @click="toggleEditPreview"
        >
          <Columns2 :size="16" />
        </button>
        <button type="button" :title="t('pdf.search')" @click="focusSearch"><Search :size="16" /></button>
        <button type="button" :title="t('readerm.save')" @click="emit('save')"><Save :size="16" /></button>
        <button type="button" :title="t('readerm.export')" @click="emit('export')"><Download :size="16" /></button>
      </div>
    </header>

    <div
      v-if="mode === 'edit' || mode === 'edit-preview'"
      class="readerm-editor-stage"
      :class="{ split: mode === 'edit-preview', bottom: mode === 'edit-preview' && previewPosition === 'bottom' }"
    >
      <textarea
        ref="textarea"
        :value="markdown"
        class="readerm-textarea"
        spellcheck="false"
        @input="emit('update:markdown', ($event.target as HTMLTextAreaElement).value)"
      />
      <div v-if="mode === 'edit-preview'" ref="previewRoot" class="readerm-preview readerm-split-preview">
        <MarkdownPreview
          :source="markdown"
          :document-id="documentId"
          :settings="settings"
          @link-click="emit('linkClick', $event)"
          @image-context="emit('resizeImage', { assetPath: $event.assetPath })"
        />
      </div>
    </div>
    <div v-if="searchOpen && mode !== 'live'" class="readerm-search-popover">
      <input
        ref="previewSearchInput"
        v-model="searchQuery"
        :placeholder="t('pdf.searchPlaceholder')"
        @keydown.enter.prevent="mode === 'preview' ? nextPreviewSearch($event.shiftKey ? -1 : 1) : nextEditSearch($event.shiftKey ? -1 : 1)"
      />
      <button type="button" @click="mode === 'preview' ? nextPreviewSearch(-1) : nextEditSearch(-1)"><ChevronLeft :size="16" /></button>
      <span>{{ searchCountText() }}</span>
      <button type="button" @click="mode === 'preview' ? nextPreviewSearch(1) : nextEditSearch(1)"><ChevronRight :size="16" /></button>
    </div>
    <LiveMarkdownEditor
      v-if="mode === 'live'"
      ref="liveEditor"
      :model-value="markdown"
      :document-id="documentId"
      :font-size="markdownFontSize"
      :settings="settings"
      @update:model-value="emit('update:markdown', $event)"
      @link-click="emit('linkClick', $event)"
      @image-paste="emit('pasteImage', $event)"
      @image-insert="emit('captureRegion', { selection: $event.selection, kind: $event.kind })"
      @image-context="emit('resizeImage', { assetPath: $event.assetPath })"
      @update-settings="emit('updateSettings', $event)"
      @selection-change="liveSelection = $event"
    />
    <div v-else-if="mode === 'preview'" ref="previewRoot" class="readerm-preview">
      <MarkdownPreview
        :source="markdown"
        :document-id="documentId"
        :settings="settings"
        @link-click="emit('linkClick', $event)"
        @image-context="emit('resizeImage', { assetPath: $event.assetPath })"
      />
    </div>
  </section>
</template>
