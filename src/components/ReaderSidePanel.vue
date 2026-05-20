<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import {
  ArrowUp,
  Bot,
  Check,
  Plus,
  Pencil,
  FunnelX,
  ImagePlus,
  MapPin,
  PanelRightClose,
  RefreshCw,
  Save,
  Star,
  Trash2,
  X,
} from "lucide-vue-next";
import ColorDropdown from "@/components/ColorDropdown.vue";
import LiveMarkdownEditor from "@/components/LiveMarkdownEditor.vue";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import { readerPanelTabs, type RightPanelTab } from "@/components/ReaderPanelTabs";
import SegmentedModeSwitch from "@/components/SegmentedModeSwitch.vue";
import UiDropdown from "@/components/UiDropdown.vue";
import { useMarkdownZoom } from "@/composables/useMarkdownZoom";
import { useI18n } from "@/i18n";
import { markdownCodeFontFamily } from "@/services/MarkdownFontOptionsService";
import { hasActiveAnnotationFilters, parseTagsInput, type AnnotationFilters } from "@/services/ReaderAnnotationService";
import { displaySymbolText, normalizeSymbol } from "@/services/SymbolTrackerService";
import type { Annotation, AnnotationType, MarkdownEditorMode, Settings, SymbolDefinition } from "@/types";

const props = defineProps<{
  activeTab: RightPanelTab;
  documentId?: string;
  notesMode: MarkdownEditorMode;
  summaryMode: MarkdownEditorMode;
  noteDraft: string;
  summaryDraft: string;
  annotations: Annotation[];
  allAnnotations: Annotation[];
  allAnnotationCount: number;
  activeAnnotation: Annotation | null;
  annotationFilters: AnnotationFilters;
  agentLabel: string;
  aiMessages: Array<{ role: "user" | "assistant"; content: string }>;
  aiInput: string;
  aiLoading: boolean;
  summaryWaiting: boolean;
  symbols: SymbolDefinition[];
  activeSymbol: string;
  symbolRefreshProgress: { status: string; percent?: number } | null;
  settings?: Settings | null;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  (event: "update:activeTab", value: RightPanelTab): void;
  (event: "update:annotationFilters", value: AnnotationFilters): void;
  (event: "update:notesMode", value: MarkdownEditorMode): void;
  (event: "update:summaryMode", value: MarkdownEditorMode): void;
  (event: "update:noteDraft", value: string): void;
  (event: "update:summaryDraft", value: string): void;
  (event: "update:aiInput", value: string): void;
  (event: "collapse"): void;
  (event: "saveNote"): void;
  (event: "saveSummary"): void;
  (event: "insertImage", payload: { target: "notes" | "summary"; selection?: { start: number; end: number }; kind?: "image" | "formula" }): void;
  (event: "pasteImage", payload: { target: "notes" | "summary"; dataUrl: string; selection?: { start: number; end: number } }): void;
  (event: "resizeImage", payload: { target: "notes" | "summary"; assetPath: string }): void;
  (event: "sendAi", value?: "chat" | "summary"): void;
  (event: "stopAi"): void;
  (event: "selectAnnotation", annotation: Annotation): void;
  (event: "updateAnnotation", payload: { annotation: Annotation; patch: { type?: AnnotationType; color?: string; comment?: string; tags?: string[] } }): void;
  (event: "deleteAnnotation", annotation: Annotation): void;
  (event: "linkClick", payload: { href: string; event: MouseEvent; force?: boolean }): void;
  (event: "selectSymbol", symbol: SymbolDefinition): void;
  (event: "updateSymbol", symbol: SymbolDefinition): void;
  (event: "deleteSymbol", symbol: SymbolDefinition): void;
  (event: "setSymbolAnchor", symbol: SymbolDefinition): void;
  (event: "refreshSymbols"): void;
  (event: "updateSettings", patch: Partial<Settings>): void;
}>();

const pageOptions = computed(() => {
  const pages = new Set(props.allAnnotations.map((annotation) => annotation.page_index));
  return [...pages].sort((left, right) => left - right);
});

const annotationTypeFilterOptions = computed(() => [
  { value: "all", label: t("annotation.filter.option.allTypes") },
  { value: "highlight", label: t("annotation.filter.option.highlight") },
  { value: "underline", label: t("annotation.filter.option.underline") },
]);

const annotationPageFilterOptions = computed(() => [
  { value: "all", label: t("annotation.filter.option.allPages") },
  ...pageOptions.value.map((page) => ({ value: String(page), label: t("annotation.filter.option.page", { page: page + 1 }) })),
]);

const annotationContentFilterOptions = computed(() => [
  { value: "all", label: t("annotation.filter.option.allContent") },
  { value: "commented", label: t("annotation.filter.option.commented") },
  { value: "tagged", label: t("annotation.filter.option.tagged") },
]);

const filteredSymbols = computed(() => {
  const sourceSymbols = draftSymbol.value
    ? [draftSymbol.value, ...props.symbols.filter((symbol) => symbol.normalized_symbol !== draftSymbol.value?.normalized_symbol)]
    : props.symbols;
  return sourceSymbols.filter((symbol) => {
  if (symbolKindFilter.value !== "all" && symbol.kind !== symbolKindFilter.value) return false;
  if (symbolFavoriteFilter.value === "favorite" && !symbol.favorite) return false;
  if (symbolFavoriteFilter.value === "unfavorite" && symbol.favorite) return false;
  return true;
  }).sort((left, right) => {
  const editingKey = editingSymbolKey.value;
  if (!editingKey) return 0;
  if (symbolKey(left) === editingKey) return -1;
  if (symbolKey(right) === editingKey) return 1;
  return 0;
  });
});

const summaryIsEmpty = computed(() => !props.summaryDraft.trim());
const summaryActionLabel = computed(() => props.summaryWaiting ? t("common.waiting") : t("summary.aiSummary"));
const aiInputHasText = computed(() => Boolean(props.aiInput.trim()));
const noteTextarea = ref<HTMLTextAreaElement | null>(null);
const summaryTextarea = ref<HTMLTextAreaElement | null>(null);
const aiTextarea = ref<HTMLTextAreaElement | null>(null);
const { markdownFontSize, handleMarkdownWheel } = useMarkdownZoom();
const markdownLineHeight = computed(() => props.settings?.markdown_line_height || 1.6);
const markdownCodeFontScale = computed(() => props.settings?.markdown_code_font_scale || 0.86);
const markdownCodeLineHeight = computed(() => props.settings?.markdown_code_line_height || 1.22);
const markdownCodeFontFamilyCss = computed(() => markdownCodeFontFamily(props.settings?.markdown_code_font_family || "Consolas"));
const editingSymbolKey = ref("");
const symbolEditDraft = ref({ symbol: "", definition: "" });
const draftSymbol = ref<SymbolDefinition | null>(null);
const symbolKindFilter = ref<"all" | "symbol" | "abbreviation">("all");
const symbolFavoriteFilter = ref<"all" | "favorite" | "unfavorite">("all");
const liveSelections = ref<Record<"notes" | "summary", { start: number; end: number } | undefined>>({
  notes: undefined,
  summary: undefined,
});

function resizeAiTextarea() {
  const textarea = aiTextarea.value;
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function updateAiInput(event: Event) {
  emit("update:aiInput", (event.target as HTMLTextAreaElement).value);
  resizeAiTextarea();
}

onMounted(() => {
  resizeAiTextarea();
});

watch(() => props.aiInput, async () => {
  await nextTick();
  resizeAiTextarea();
});

function updateTypeFilter(value: string) {
  emit("update:annotationFilters", {
    ...props.annotationFilters,
    type: value === "highlight" || value === "underline" ? value : "all",
  });
}

function updateColorFilter(value: string) {
  emit("update:annotationFilters", { ...props.annotationFilters, color: value || "all" });
}

function updatePageFilter(value: string) {
  emit("update:annotationFilters", {
    ...props.annotationFilters,
    page: value === "all" ? "all" : Number(value),
  });
}

function updateContentFilter(value: string) {
  emit("update:annotationFilters", {
    ...props.annotationFilters,
    content: value === "commented" || value === "tagged" ? value : "all",
  });
}

function clearFilters() {
  emit("update:annotationFilters", { type: "all", color: "all", page: "all", content: "all" });
}

function updateTags(annotation: Annotation, value: string) {
  emit("updateAnnotation", {
    annotation,
    patch: {
      tags: parseTagsInput(value),
    },
  });
}

async function requestInsertImage(target: "notes" | "summary") {
  if (target === "notes" && props.notesMode === "preview") emit("update:notesMode", "live");
  if (target === "summary" && props.summaryMode === "preview") emit("update:summaryMode", "live");
  await nextTick();
  const textarea = target === "notes" ? noteTextarea.value : summaryTextarea.value;
  emit("insertImage", {
    target,
    selection: textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : liveSelections.value[target],
  });
}

function readPastedImage(event: ClipboardEvent) {
  const item = [...(event.clipboardData?.items || [])].find((entry) => entry.kind === "file" && entry.type.startsWith("image/"));
  const file = item?.getAsFile();
  if (!file) return null;
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read pasted image."));
    reader.readAsDataURL(file);
  });
}

async function handleTextareaPaste(event: ClipboardEvent, target: "notes" | "summary") {
  const dataUrl = await readPastedImage(event);
  if (!dataUrl) return;
  event.preventDefault();
  const textarea = event.target as HTMLTextAreaElement;
  emit("pasteImage", {
    target,
    dataUrl,
    selection: { start: textarea.selectionStart, end: textarea.selectionEnd },
  });
}

function forwardLivePaste(target: "notes" | "summary", payload: { dataUrl: string; selection?: { start: number; end: number } }) {
  emit("pasteImage", { target, ...payload });
}

function currentMarkdownSelection(target: "notes" | "summary") {
  if (props.activeTab !== target) return undefined;
  const mode = target === "notes" ? props.notesMode : props.summaryMode;
  const textarea = target === "notes" ? noteTextarea.value : summaryTextarea.value;
  if (mode === "edit" && textarea) {
    return { start: textarea.selectionStart, end: textarea.selectionEnd };
  }
  if (mode === "live") return liveSelections.value[target];
  return undefined;
}

function currentNoteSelection() {
  return currentMarkdownSelection("notes");
}

defineExpose({
  currentMarkdownSelection,
  currentNoteSelection,
});

function symbolLabelSource(symbol: SymbolDefinition) {
  const rawValue = symbol.symbol.trim();
  const value = displaySymbolText(rawValue);
  if (!value || symbol.kind === "abbreviation") return value;
  if (value !== rawValue.replace(/\$/g, "").trim()) return value;
  if (/^\$[^$]+\$$/.test(rawValue)) return rawValue;
  return `$${value.replace(/\$/g, "")}$`;
}

function symbolKey(symbol: SymbolDefinition) {
  return `${symbol.source}:${symbol.normalized_symbol}`;
}

function createSymbolDefinition() {
  const createdAt = new Date().toISOString();
  const existing = new Set(props.symbols.map((symbol) => symbol.normalized_symbol));
  let symbolName = "New Symbol";
  let normalized = normalizeSymbol(symbolName);
  for (let index = 2; existing.has(normalized); index += 1) {
    symbolName = `New Symbol ${index}`;
    normalized = normalizeSymbol(symbolName);
  }
  const symbol: SymbolDefinition = {
    symbol: symbolName,
    normalized_symbol: normalized,
    kind: "symbol",
    definition: "",
    source: "latex",
    confidence: 1,
    favorite: true,
    user_modified: true,
    updated_at: createdAt,
  };
  symbolKindFilter.value = "all";
  symbolFavoriteFilter.value = "all";
  draftSymbol.value = symbol;
  editingSymbolKey.value = symbolKey(symbol);
  symbolEditDraft.value = {
    symbol: symbol.symbol,
    definition: symbol.definition,
  };
}

function startSymbolEdit(symbol: SymbolDefinition) {
  editingSymbolKey.value = symbolKey(symbol);
  symbolEditDraft.value = {
    symbol: symbol.symbol,
    definition: symbol.definition,
  };
}

function cancelSymbolEdit() {
  if (draftSymbol.value && editingSymbolKey.value === symbolKey(draftSymbol.value)) draftSymbol.value = null;
  editingSymbolKey.value = "";
}

function saveSymbolEdit(symbol: SymbolDefinition) {
  const nextSymbol = symbolEditDraft.value.symbol.trim();
  if (!nextSymbol) return;
  emit("updateSymbol", {
    ...symbol,
    symbol: nextSymbol,
    definition: symbolEditDraft.value.definition.trim(),
    favorite: symbol.favorite,
    user_modified: true,
  });
  if (draftSymbol.value && symbolKey(symbol) === symbolKey(draftSymbol.value)) draftSymbol.value = null;
  editingSymbolKey.value = "";
}

function toggleSymbolFavorite(symbol: SymbolDefinition) {
  emit("updateSymbol", {
    ...symbol,
    favorite: !symbol.favorite,
  });
}
</script>

<template>
  <aside class="right-panel">
    <header class="panel-header">
      <strong>{{ t("panel.title") }}</strong>
      <button type="button" :title="t('panel.collapse')" @click="emit('collapse')"><PanelRightClose :size="17" /></button>
    </header>
    <div class="panel-main">
      <div class="panel-content">
    <section v-if="activeTab === 'annotations'" class="panel-body annotation-list">
      <div class="annotation-filters">
        <UiDropdown
          :model-value="annotationFilters.type"
          :title="t('annotation.type')"
          :options="annotationTypeFilterOptions"
          menu-class="annotation-filter-menu"
          @update:model-value="updateTypeFilter"
        />
        <ColorDropdown :model-value="annotationFilters.color" include-all :title="t('annotation.color')" @update:model-value="updateColorFilter" />
        <UiDropdown
          :model-value="String(annotationFilters.page)"
          :title="t('annotation.page')"
          :options="annotationPageFilterOptions"
          menu-class="annotation-filter-menu"
          @update:model-value="updatePageFilter"
        />
        <UiDropdown
          :model-value="annotationFilters.content"
          :title="t('annotation.content')"
          :options="annotationContentFilterOptions"
          menu-class="annotation-filter-menu"
          @update:model-value="updateContentFilter"
        />
        <button type="button" class="annotation-clear-filter" :title="t('annotation.filter.clear')" :disabled="!hasActiveAnnotationFilters(annotationFilters)" @click="clearFilters">
          <FunnelX :size="16" />
        </button>
      </div>
      <div class="annotation-count">{{ t("annotation.count", { visible: annotations.length, total: allAnnotationCount }) }}</div>
      <article
        v-for="annotation in annotations"
        :key="annotation.annotation_id"
        class="annotation-card"
        :class="{ active: activeAnnotation?.annotation_id === annotation.annotation_id }"
        :style="{ '--annotation-accent': annotation.color }"
        @click="emit('selectAnnotation', annotation)"
      >
        <div class="annotation-card-header">
          <strong><span class="annotation-color" :style="{ backgroundColor: annotation.color }" /></strong>
          <span>{{ t("common.page") }} {{ annotation.page_index + 1 }}</span>
        </div>
        <p class="annotation-quote">{{ annotation.target.text_quote?.exact || "" }}</p>
        <p v-if="annotation.comment.trim()" class="annotation-comment-preview">{{ annotation.comment }}</p>
        <div v-if="annotation.tags.length" class="annotation-tags">
          <span v-for="tag in annotation.tags" :key="tag">{{ tag }}</span>
        </div>
        <div v-if="activeAnnotation?.annotation_id === annotation.annotation_id" class="annotation-card-editor">
          <div class="annotation-editor-toolbar">
            <ColorDropdown :model-value="annotation.color" :title="t('annotation.color')" @update:model-value="emit('updateAnnotation', { annotation, patch: { color: $event } })" @click.stop />
            <button type="button" class="annotation-delete" @click.stop="emit('deleteAnnotation', annotation)">{{ t("common.delete") }}</button>
          </div>
          <textarea
            :value="annotation.comment"
            :placeholder="t('annotation.commentPlaceholder')"
            :autofocus="annotation.type === 'note'"
            @change="emit('updateAnnotation', { annotation, patch: { comment: ($event.target as HTMLTextAreaElement).value } })"
            @click.stop
          />
          <input
            :value="annotation.tags.join(', ')"
            :placeholder="t('annotation.tagsPlaceholder')"
            :title="t('annotation.tags')"
            @change="updateTags(annotation, ($event.target as HTMLInputElement).value)"
            @click.stop
          />
        </div>
      </article>
      <div v-if="!annotations.length" class="empty-state">
        {{ t("annotation.empty") }}
      </div>
    </section>

    <section
      v-else-if="activeTab === 'notes'"
      class="panel-body markdown-resize-scope"
      :style="{ '--markdown-editor-font-size': `${markdownFontSize}px`, '--markdown-line-height': markdownLineHeight, '--markdown-code-font-family': markdownCodeFontFamilyCss, '--markdown-code-font-scale': markdownCodeFontScale, '--markdown-code-line-height': markdownCodeLineHeight }"
      @wheel="handleMarkdownWheel"
    >
      <div class="mode-tabs">
        <SegmentedModeSwitch :model-value="notesMode" @update:model-value="emit('update:notesMode', $event)" />
        <button type="button" :title="t('markdown.captureRegion')" @click="requestInsertImage('notes')"><ImagePlus :size="16" /></button>
        <button type="button" :title="t('markdown.saveNotes')" @click="emit('saveNote')"><Save :size="16" /></button>
      </div>
      <textarea
        v-if="notesMode === 'edit'"
        ref="noteTextarea"
        :value="noteDraft"
        class="markdown-textarea"
        @input="emit('update:noteDraft', ($event.target as HTMLTextAreaElement).value)"
        @paste="handleTextareaPaste($event, 'notes')"
      />
      <LiveMarkdownEditor v-else-if="notesMode === 'live'" :model-value="noteDraft" :document-id="documentId" :font-size="markdownFontSize" :settings="settings" @update:model-value="emit('update:noteDraft', $event)" @link-click="emit('linkClick', $event)" @image-paste="forwardLivePaste('notes', $event)" @image-insert="emit('insertImage', { target: 'notes', selection: $event.selection, kind: $event.kind })" @image-context="emit('resizeImage', { target: 'notes', assetPath: $event.assetPath })" @update-settings="emit('updateSettings', $event)" @selection-change="liveSelections.notes = $event" />
      <MarkdownPreview v-else :source="noteDraft || t('markdown.noNotes')" :document-id="documentId" :settings="settings" @link-click="emit('linkClick', $event)" @image-context="emit('resizeImage', { target: 'notes', assetPath: $event.assetPath })" />
    </section>

    <section
      v-else-if="activeTab === 'summary'"
      class="panel-body markdown-resize-scope"
      :style="{ '--markdown-editor-font-size': `${markdownFontSize}px`, '--markdown-line-height': markdownLineHeight, '--markdown-code-font-family': markdownCodeFontFamilyCss, '--markdown-code-font-scale': markdownCodeFontScale, '--markdown-code-line-height': markdownCodeLineHeight }"
      @wheel="handleMarkdownWheel"
    >
      <div class="mode-tabs">
        <SegmentedModeSwitch :model-value="summaryMode" @update:model-value="emit('update:summaryMode', $event)" />
        <button type="button" :title="t('markdown.captureRegion')" @click="requestInsertImage('summary')"><ImagePlus :size="16" /></button>
        <button type="button" :title="t('markdown.saveSummary')" @click="emit('saveSummary')"><Save :size="16" /></button>
      </div>
      <textarea
        v-if="summaryMode === 'edit'"
        ref="summaryTextarea"
        :value="summaryDraft"
        class="markdown-textarea"
        @input="emit('update:summaryDraft', ($event.target as HTMLTextAreaElement).value)"
        @paste="handleTextareaPaste($event, 'summary')"
      />
      <LiveMarkdownEditor v-else-if="summaryMode === 'live'" :model-value="summaryDraft" :document-id="documentId" :font-size="markdownFontSize" :settings="settings" @update:model-value="emit('update:summaryDraft', $event)" @link-click="emit('linkClick', $event)" @image-paste="forwardLivePaste('summary', $event)" @image-insert="emit('insertImage', { target: 'summary', selection: $event.selection, kind: $event.kind })" @image-context="emit('resizeImage', { target: 'summary', assetPath: $event.assetPath })" @update-settings="emit('updateSettings', $event)" @selection-change="liveSelections.summary = $event" />
      <div v-else-if="summaryIsEmpty" class="empty-summary">
        <p>{{ t("summary.empty") }}</p>
      </div>
      <MarkdownPreview v-else :source="summaryDraft" :document-id="documentId" :settings="settings" @link-click="emit('linkClick', $event)" @image-context="emit('resizeImage', { target: 'summary', assetPath: $event.assetPath })" />
      <div class="summary-ai-action-region">
        <button type="button" class="secondary ai-summary-button" :disabled="aiLoading" @click="emit('sendAi', 'summary')"><Bot :size="16" /> {{ summaryActionLabel }}</button>
      </div>
    </section>

    <section v-else-if="activeTab === 'symbols'" class="panel-body symbol-list">
      <div class="symbol-panel-intro">
        <div class="symbol-panel-title-row">
          <strong>{{ t("symbol.title") }}</strong>
          <div class="symbol-panel-title-actions">
            <button type="button" :title="t('symbol.create')" @click="createSymbolDefinition"><Plus :size="15" /></button>
            <button type="button" :title="t('symbol.refresh')" :disabled="Boolean(symbolRefreshProgress)" @click="emit('refreshSymbols')"><RefreshCw :size="15" /></button>
          </div>
        </div>
        <small>{{ t("symbol.description") }}</small>
        <div v-if="symbolRefreshProgress" class="arxiv-import-progress symbol-progress" role="status" aria-live="polite">
          <div class="arxiv-import-progress-header">
            <span>{{ symbolRefreshProgress.status }}</span>
            <span v-if="symbolRefreshProgress.percent !== undefined">{{ symbolRefreshProgress.percent }}%</span>
          </div>
          <div class="arxiv-import-progress-track">
            <div class="arxiv-import-progress-fill" :style="{ width: `${symbolRefreshProgress.percent ?? 18}%` }"></div>
          </div>
        </div>
        <div class="symbol-filter-bar">
          <div class="symbol-segmented-filter" role="group" :aria-label="t('symbol.kindFilter')">
            <button type="button" :class="{ active: symbolKindFilter === 'all' }" @click="symbolKindFilter = 'all'">{{ t("symbol.filter.all") }}</button>
            <button type="button" :class="{ active: symbolKindFilter === 'symbol' }" @click="symbolKindFilter = 'symbol'">{{ t("symbol.kind.symbol") }}</button>
            <button type="button" :class="{ active: symbolKindFilter === 'abbreviation' }" @click="symbolKindFilter = 'abbreviation'">{{ t("symbol.kind.abbreviation") }}</button>
          </div>
          <div class="symbol-segmented-filter" role="group" :aria-label="t('symbol.favoriteFilter')">
            <button type="button" :class="{ active: symbolFavoriteFilter === 'all' }" @click="symbolFavoriteFilter = 'all'">{{ t("symbol.filter.all") }}</button>
            <button type="button" :class="{ active: symbolFavoriteFilter === 'favorite' }" @click="symbolFavoriteFilter = 'favorite'">{{ t("symbol.filter.favorite") }}</button>
            <button type="button" :class="{ active: symbolFavoriteFilter === 'unfavorite' }" @click="symbolFavoriteFilter = 'unfavorite'">{{ t("symbol.filter.unfavorite") }}</button>
          </div>
        </div>
      </div>
      <article
        v-for="symbol in filteredSymbols"
        :key="`${symbol.source}-${symbol.normalized_symbol}`"
        class="symbol-card"
        :class="{ active: activeSymbol === symbol.normalized_symbol, favorite: symbol.favorite }"
        @click="emit('selectSymbol', symbol)"
      >
        <div class="symbol-card-header">
          <input
            v-if="editingSymbolKey === symbolKey(symbol)"
            v-model="symbolEditDraft.symbol"
            class="symbol-card-symbol-input"
            @click.stop
          />
          <MarkdownPreview v-else class="symbol-card-symbol" :source="symbolLabelSource(symbol)" :settings="settings" />
          <span class="symbol-card-meta">{{ symbol.kind }} · {{ symbol.source }}<template v-if="symbol.page_index !== undefined"> · p. {{ symbol.page_index + 1 }}</template></span>
          <div class="symbol-card-actions" @click.stop>
            <template v-if="editingSymbolKey === symbolKey(symbol)">
              <button type="button" :title="t('common.save')" @click="saveSymbolEdit(symbol)"><Check :size="15" /></button>
              <button type="button" :title="t('common.cancel')" @click="cancelSymbolEdit"><X :size="15" /></button>
            </template>
            <template v-else>
              <button type="button" :class="{ active: symbol.favorite }" :title="symbol.favorite ? t('symbol.unfavorite') : t('symbol.favorite')" @click="toggleSymbolFavorite(symbol)"><Star :size="15" /></button>
              <button type="button" :class="{ active: symbol.page_index !== undefined }" :title="t('symbol.setAnchor')" @click="emit('setSymbolAnchor', symbol)"><MapPin :size="15" /></button>
              <button type="button" :title="t('common.edit')" @click="startSymbolEdit(symbol)"><Pencil :size="15" /></button>
              <button type="button" :title="t('common.delete')" @click="emit('deleteSymbol', symbol)"><Trash2 :size="15" /></button>
            </template>
          </div>
        </div>
        <textarea
          v-if="editingSymbolKey === symbolKey(symbol)"
          v-model="symbolEditDraft.definition"
          class="symbol-card-definition-input"
          @click.stop
        />
        <MarkdownPreview v-else class="symbol-card-definition" :source="symbol.definition" :document-id="documentId" :settings="settings" @link-click="emit('linkClick', $event)" />
      </article>
      <div v-if="!filteredSymbols.length" class="empty-state">
        {{ symbols.length ? t("symbol.emptyFiltered") : t("symbol.empty") }}
      </div>
    </section>

    <section v-else class="panel-body ai-tab">
      <div class="ai-messages">
        <article v-for="(message, index) in aiMessages" :key="index" :class="['ai-message', message.role]">
          <MarkdownPreview :source="message.content" :document-id="documentId" :settings="settings" @link-click="emit('linkClick', $event)" />
        </article>
      </div>
      <div class="ai-composer">
        <textarea
          ref="aiTextarea"
          :value="aiInput"
          class="ai-input"
          :placeholder="t('ai.placeholder')"
          rows="1"
          @input="updateAiInput"
          @keydown.ctrl.enter.prevent="emit('sendAi', 'chat')"
        />
        <div class="ai-composer-actions">
          <button v-if="aiLoading" type="button" class="ai-stop-button" @click="emit('stopAi')">{{ t("common.stop") }}</button>
          <button v-else type="button" class="ai-send-button" :class="{ active: aiInputHasText }" :title="t('common.send')" :aria-label="t('common.send')" @click="emit('sendAi', 'chat')">
            <ArrowUp :size="18" />
          </button>
        </div>
      </div>
    </section>
      </div>
      <nav class="panel-tab-rail" :aria-label="t('panel.tabs')">
        <button
          v-for="tab in readerPanelTabs"
          :key="tab.key"
          type="button"
          class="panel-tab-button"
          :class="{ active: activeTab === tab.key }"
          :title="t(tab.titleKey)"
          :aria-label="t(tab.titleKey)"
          :aria-current="activeTab === tab.key ? 'page' : undefined"
          @click="emit('update:activeTab', tab.key)"
        >
          <component :is="tab.icon" :size="20" />
        </button>
      </nav>
    </div>
  </aside>
</template>
