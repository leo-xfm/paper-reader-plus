<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  BadgeInfo,
  Bold,
  ChevronLeft,
  ChevronRight,
  Code,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Italic,
  Lightbulb,
  List,
  ListOrdered,
  OctagonAlert,
  Pilcrow,
  Save,
  Search,
  ShieldAlert,
  Sigma,
  Table2,
  TriangleAlert,
  Type,
  Underline,
  Upload,
  Wand2,
} from "lucide-vue-next";
import UiDropdown from "@/components/UiDropdown.vue";
import LiveMarkdownEditor from "@/components/LiveMarkdownEditor.vue";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import SegmentedModeSwitch from "@/components/SegmentedModeSwitch.vue";
import { useMarkdownZoom } from "@/composables/useMarkdownZoom";
import { useI18n, type I18nKey } from "@/i18n";
import {
  clearMarkdownFormatting,
  insertCalloutBlock,
  insertTableSource,
  setHeading,
  toggleFontColor,
  toggleListPrefix,
  toggleWrappedMarkdown,
  type SourceEdit,
  type SourceSelection,
} from "@/services/LiveMarkdownSourceService";
import { markdownCodeFontFamily, markdownFontOptions } from "@/services/MarkdownFontOptionsService";
import type { MarkdownEditorMode, Settings } from "@/types";

const props = defineProps<{
  title: string;
  titleDraft: string;
  editingTitle: boolean;
  markdown: string;
  mode: MarkdownEditorMode;
  documentId: string;
  settings?: Settings | null;
}>();

const emit = defineEmits<{
  (event: "update:titleDraft", value: string): void;
  (event: "update:markdown", value: string): void;
  (event: "update:mode", value: MarkdownEditorMode): void;
  (event: "editTitle"): void;
  (event: "saveTitle"): void;
  (event: "save"): void;
  (event: "upgrade"): void;
  (event: "linkClick", payload: { href: string; event: MouseEvent; force?: boolean }): void;
  (event: "updateSettings", patch: Partial<Settings>): void;
}>();

const textarea = ref<HTMLTextAreaElement | null>(null);
const liveEditor = ref<InstanceType<typeof LiveMarkdownEditor> | null>(null);
const previewRoot = ref<HTMLElement | null>(null);
const previewSearchInput = ref<HTMLInputElement | null>(null);
const searchOpen = ref(false);
const searchQuery = ref("");
const activePreviewMatchIndex = ref(0);
const textareaSelection = ref<SourceSelection>({ start: 0, end: 0 });
const calloutKind = ref<"NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION">("NOTE");
const { markdownFontSize, handleMarkdownWheel } = useMarkdownZoom();
const { t } = useI18n();
const markdownLineHeight = computed(() => props.settings?.markdown_line_height || 1.6);
const markdownCodeFontFamilyCss = computed(() => markdownCodeFontFamily(props.settings?.markdown_code_font_family || "Consolas"));

function updateMarkdownFontFamily(value: string) {
  emit("updateSettings", { markdown_font_family: value });
}
const FONT_COLOR_OPTIONS = [
  { value: "black", labelKey: "color.black" as I18nKey, swatch: "#111827" },
  { value: "red", labelKey: "color.red" as I18nKey, swatch: "#dc2626" },
  { value: "green", labelKey: "color.green" as I18nKey, swatch: "#16a34a" },
  { value: "blue", labelKey: "color.blue" as I18nKey, swatch: "#2563eb" },
  { value: "purple", labelKey: "color.purple" as I18nKey, swatch: "#7c3aed" },
];
const calloutOptions = computed(() => ([
  { value: "NOTE", label: t("liveMarkdown.calloutNote"), icon: BadgeInfo },
  { value: "TIP", label: t("liveMarkdown.calloutTip"), icon: Lightbulb },
  { value: "IMPORTANT", label: t("liveMarkdown.calloutImportant"), icon: OctagonAlert },
  { value: "WARNING", label: t("liveMarkdown.calloutWarning"), icon: TriangleAlert },
  { value: "CAUTION", label: t("liveMarkdown.calloutCaution"), icon: ShieldAlert },
] as const));
const blockStyleOptions = computed(() => ([
  { value: "paragraph", label: t("liveMarkdown.paragraph"), icon: Pilcrow },
  { value: "h1", label: t("liveMarkdown.heading1"), icon: Heading1 },
  { value: "h2", label: t("liveMarkdown.heading2"), icon: Heading2 },
  { value: "h3", label: t("liveMarkdown.heading3"), icon: Heading3 },
  { value: "h4", label: t("liveMarkdown.heading4"), icon: Heading4 },
  { value: "h5", label: t("liveMarkdown.heading5"), icon: Heading5 },
  { value: "h6", label: t("liveMarkdown.heading6"), icon: Heading6 },
] as const));
const editHasSelection = computed(() => textareaSelection.value.start !== textareaSelection.value.end);
const editCurrentLine = computed(() => lineTextAt(props.markdown, textareaSelection.value.start));
const editActiveBlockStyle = computed(() => {
  const line = editCurrentLine.value;
  if (/^\s*#\s+/.test(line)) return "h1";
  if (/^\s*##\s+/.test(line)) return "h2";
  if (/^\s*###\s+/.test(line)) return "h3";
  if (/^\s*####\s+/.test(line)) return "h4";
  if (/^\s*#####\s+/.test(line)) return "h5";
  if (/^\s*######\s+/.test(line)) return "h6";
  return "paragraph";
});
const editActiveMarks = computed(() => {
  const selection = textareaSelection.value;
  const source = props.markdown;
  const start = Math.min(selection.start, selection.end);
  const end = Math.max(selection.start, selection.end);
  const before = source.slice(Math.max(0, start - 80), start);
  const after = source.slice(end, Math.min(source.length, end + 160));
  return {
    strong: before.includes("**") || after.includes("**"),
    em: /\*(?!\*)/.test(before) || /(?:^|[^*])\*/.test(after),
    underline: before.lastIndexOf("<u>") > before.lastIndexOf("</u>"),
    code: before.includes("`") || after.includes("`"),
  };
});
const editActiveBlocks = computed(() => ({
  bulletList: /^\s*[-+*]\s+/.test(editCurrentLine.value),
  orderedList: /^\s*\d+\.\s+/.test(editCurrentLine.value),
}));
const editActiveFontColor = computed(() => activeFontColorAt(props.markdown, textareaSelection.value.start));
const previewMatches = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query || props.mode !== "preview") return [] as HTMLElement[];
  return Array.from(previewRoot.value?.querySelectorAll<HTMLElement>("[data-markdown-search-index]") || []);
});
const editSearchMatchCount = computed(() => {
  const query = searchQuery.value.trim();
  if (!query || props.mode !== "edit") return 0;
  return props.markdown.toLowerCase().split(query.toLowerCase()).length - 1;
});

function lineTextAt(source: string, position: number) {
  const safePosition = Math.max(0, Math.min(position, source.length));
  const start = source.lastIndexOf("\n", Math.max(0, safePosition - 1)) + 1;
  const nextBreak = source.indexOf("\n", safePosition);
  const end = nextBreak < 0 ? source.length : nextBreak;
  return source.slice(start, end);
}

function activeFontColorAt(source: string, position: number) {
  const safePosition = Math.max(0, Math.min(position, source.length));
  const lineStart = source.lastIndexOf("\n", Math.max(0, safePosition - 1)) + 1;
  const nextBreak = source.indexOf("\n", safePosition);
  const lineEnd = nextBreak < 0 ? source.length : nextBreak;
  const line = source.slice(lineStart, lineEnd);
  const pattern = /<span\s+style=(["'])color:\s*(#[0-9a-f]{6}|black|red|green|blue|purple)\s*;?\1>([^\n]*?\S[^\n]*?)<\/span>/gi;
  for (const match of line.matchAll(pattern)) {
    const start = lineStart + (match.index || 0);
    const end = start + match[0].length;
    if (safePosition >= start && safePosition <= end) return (match[2] || "").toLowerCase();
  }
  return "";
}

function currentTextareaSelection(): SourceSelection {
  const editor = textarea.value;
  return editor
    ? { start: editor.selectionStart, end: editor.selectionEnd }
    : textareaSelection.value;
}

function updateTextareaSelection() {
  textareaSelection.value = currentTextareaSelection();
}

function applyTextareaEdit(factory: (source: string, selection: SourceSelection) => SourceEdit | null) {
  const edit = factory(props.markdown, currentTextareaSelection());
  if (!edit) return;
  textareaSelection.value = edit.selection;
  emit("update:markdown", edit.value);
  void nextTick(() => {
    const editor = textarea.value;
    if (!editor) return;
    editor.focus();
    editor.setSelectionRange(edit.selection.start, edit.selection.end);
    updateTextareaSelection();
  });
}

function setEditBlockStyle(value: string) {
  const level = value === "paragraph" ? 0 : Number(value.replace("h", ""));
  if (!Number.isInteger(level) || level < 0 || level > 6) return;
  applyTextareaEdit((source, selection) => setHeading(source, selection, level));
}

function insertEditCallout(kind: "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION") {
  calloutKind.value = kind;
  applyTextareaEdit((source, selection) => insertCalloutBlock(source, selection, kind));
}

function clearPreviewSearchMarks() {
  const root = previewRoot.value;
  if (!root) return;
  root.querySelectorAll("mark.markdown-search-match").forEach((mark) => {
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
      mark.className = "markdown-search-match";
      mark.dataset.markdownSearchIndex = String(index);
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
  if (props.mode === "edit") return `${editSearchMatchCount.value}`;
  return "";
}

watch([searchQuery, () => props.mode, () => props.markdown], () => {
  activePreviewMatchIndex.value = 0;
  if (props.mode === "preview") void nextTick(markPreviewSearch);
});
</script>

<template>
  <section
    class="markdown-workspace markdown-resize-scope"
    :style="{ '--markdown-editor-font-size': `${markdownFontSize}px`, '--markdown-line-height': markdownLineHeight, '--markdown-code-font-family': markdownCodeFontFamilyCss }"
    @keydown="handleKeydown"
    @wheel="handleMarkdownWheel"
  >
    <header class="markdown-workspace-toolbar">
      <div class="markdown-workspace-title">
        <FileText :size="18" />
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
      </div>
      <div class="markdown-workspace-actions">
        <SegmentedModeSwitch :model-value="mode" @update:model-value="emit('update:mode', $event)" />
        <button type="button" :title="t('pdf.search')" @click="focusSearch"><Search :size="16" /></button>
        <button type="button" :title="t('common.save')" @click="emit('save')"><Save :size="16" /></button>
        <button type="button" class="primary" :title="t('app.upgradeMarkdownToReaderm')" @click="emit('upgrade')">
          <Upload :size="16" />
          <span>{{ t("app.upgradeMarkdownToReaderm") }}</span>
        </button>
      </div>
    </header>

    <div v-if="mode === 'edit'" class="markdown-edit-source-toolbar live-markdown-toolbar" :aria-label="t('liveMarkdown.toolbar')">
      <div class="live-markdown-toolbar-row live-markdown-toolbar-row-properties" role="toolbar" :aria-label="t('liveMarkdown.properties')">
        <span class="live-markdown-toolbar-row-label">{{ t("liveMarkdown.properties") }}</span>
        <UiDropdown
          class="live-markdown-font-dropdown"
          :model-value="settings?.markdown_font_family || 'current'"
          :title="t('settings.markdownFontFamily')"
          :options="markdownFontOptions"
          menu-class="live-markdown-font-dropdown-menu"
          @update:model-value="updateMarkdownFontFamily"
        />
        <button type="button" :class="{ active: editActiveMarks.strong }" :title="t('liveMarkdown.bold')" @click="applyTextareaEdit((source, selection) => toggleWrappedMarkdown(source, selection, '**'))"><Bold :size="15" /></button>
        <button type="button" :class="{ active: editActiveMarks.em }" :title="t('liveMarkdown.italic')" @click="applyTextareaEdit((source, selection) => toggleWrappedMarkdown(source, selection, '*'))"><Italic :size="15" /></button>
        <button type="button" :class="{ active: editActiveMarks.underline }" :title="t('liveMarkdown.underline')" @click="applyTextareaEdit((source, selection) => toggleWrappedMarkdown(source, selection, '<u>', '</u>'))"><Underline :size="15" /></button>
        <button
          v-for="option in FONT_COLOR_OPTIONS"
          :key="option.value"
          type="button"
          class="live-font-color-button"
          :class="{ active: editActiveFontColor === option.value }"
          :title="t('liveMarkdown.fontColor', { color: t(option.labelKey) })"
          :style="{ '--live-font-color': option.swatch }"
          @click="applyTextareaEdit((source, selection) => toggleFontColor(source, selection, option.value))"
        >
          <Type :size="15" />
        </button>
        <button type="button" class="live-toolbar-clear-format" :disabled="!editHasSelection" :title="t('liveMarkdown.clearFormatting')" @click="applyTextareaEdit((source, selection) => clearMarkdownFormatting(source, selection))"><Wand2 :size="15" /></button>
        <button type="button" class="live-toolbar-inline-code" :class="{ active: editActiveMarks.code }" :title="t('liveMarkdown.inlineCode')" @click="applyTextareaEdit((source, selection) => toggleWrappedMarkdown(source, selection, '`'))"><Code :size="15" /></button>
        <span class="live-toolbar-divider" />
        <UiDropdown
          class="live-block-dropdown"
          :model-value="editActiveBlockStyle"
          :title="t('liveMarkdown.paragraph')"
          :options="blockStyleOptions"
          menu-class="live-block-dropdown-menu"
          @update:model-value="setEditBlockStyle"
        />
        <button type="button" class="live-toolbar-list" :class="{ active: editActiveBlocks.bulletList }" :title="t('liveMarkdown.bulletList')" @click="applyTextareaEdit((source, selection) => toggleListPrefix(source, selection, false))"><List :size="15" /></button>
        <button type="button" class="live-toolbar-list" :class="{ active: editActiveBlocks.orderedList }" :title="t('liveMarkdown.orderedList')" @click="applyTextareaEdit((source, selection) => toggleListPrefix(source, selection, true))"><ListOrdered :size="15" /></button>
        <span class="live-toolbar-divider" />
        <button type="button" :title="t('liveMarkdown.mathFormula')" @click="applyTextareaEdit((source, selection) => toggleWrappedMarkdown(source, selection, '$'))"><Sigma :size="15" /></button>
        <button type="button" :title="t('liveMarkdown.table')" @click="applyTextareaEdit((source, selection) => insertTableSource(source, selection, 3, 3))"><Table2 :size="15" /></button>
        <UiDropdown
          class="live-callout-dropdown"
          :model-value="calloutKind"
          :title="t('liveMarkdown.callout')"
          :options="calloutOptions"
          menu-class="live-callout-dropdown-menu"
          @update:model-value="insertEditCallout($event as 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION')"
        />
      </div>
    </div>
    <textarea
      v-if="mode === 'edit'"
      ref="textarea"
      :value="markdown"
      class="markdown-workspace-textarea"
      spellcheck="false"
      @click="updateTextareaSelection"
      @input="emit('update:markdown', ($event.target as HTMLTextAreaElement).value)"
      @keyup="updateTextareaSelection"
      @select="updateTextareaSelection"
    />
    <LiveMarkdownEditor
      v-else-if="mode === 'live'"
      ref="liveEditor"
      :model-value="markdown"
      :document-id="documentId"
      :font-size="markdownFontSize"
      :settings="settings"
      @update:model-value="emit('update:markdown', $event)"
      @link-click="emit('linkClick', $event)"
      @update-settings="emit('updateSettings', $event)"
    />
    <div v-else ref="previewRoot" class="markdown-workspace-preview">
      <MarkdownPreview
        :source="markdown"
        :document-id="documentId"
        :settings="settings"
        @link-click="emit('linkClick', $event)"
      />
    </div>

    <div v-if="searchOpen && mode !== 'live'" class="markdown-search-popover">
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
  </section>
</template>
