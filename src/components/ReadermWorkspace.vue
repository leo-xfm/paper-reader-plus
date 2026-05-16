<script setup lang="ts">
import { computed, ref } from "vue";
import { Download, FileText, ImagePlus, Save } from "lucide-vue-next";
import LiveMarkdownEditor from "@/components/LiveMarkdownEditor.vue";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import SegmentedModeSwitch from "@/components/SegmentedModeSwitch.vue";
import { useI18n } from "@/i18n";
import type { MarkdownEditorMode, ReadermReference } from "@/types";

const props = defineProps<{
  title: string;
  titleDraft: string;
  editingTitle: boolean;
  markdown: string;
  mode: MarkdownEditorMode;
  documentId: string;
  references: ReadermReference[];
  activeReferenceId: string;
}>();

const emit = defineEmits<{
  (event: "update:titleDraft", value: string): void;
  (event: "update:markdown", value: string): void;
  (event: "update:mode", value: MarkdownEditorMode): void;
  (event: "editTitle"): void;
  (event: "saveTitle"): void;
  (event: "save"): void;
  (event: "export"): void;
  (event: "captureRegion", selection?: { start: number; end: number }): void;
  (event: "pasteImage", payload: { dataUrl: string; selection?: { start: number; end: number } }): void;
  (event: "resizeImage", payload: { assetPath: string }): void;
  (event: "linkClick", payload: { href: string; event: MouseEvent }): void;
}>();

const textarea = ref<HTMLTextAreaElement | null>(null);
const liveSelection = ref<{ start: number; end: number } | undefined>(undefined);
const { t } = useI18n();
const resolvedCount = computed(() => props.references.filter((reference) => reference.status === "resolved").length);

function currentSelection() {
  return textarea.value ? { start: textarea.value.selectionStart, end: textarea.value.selectionEnd } : liveSelection.value;
}
</script>

<template>
  <section class="readerm-workspace">
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
        <button type="button" :title="t('markdown.captureRegion')" @click="emit('captureRegion', currentSelection())"><ImagePlus :size="16" /></button>
        <button type="button" :title="t('readerm.save')" @click="emit('save')"><Save :size="16" /></button>
        <button type="button" :title="t('readerm.export')" @click="emit('export')"><Download :size="16" /></button>
      </div>
    </header>

    <textarea
      v-if="mode === 'edit'"
      ref="textarea"
      :value="markdown"
      class="readerm-textarea"
      spellcheck="false"
      @input="emit('update:markdown', ($event.target as HTMLTextAreaElement).value)"
    />
    <LiveMarkdownEditor
      v-else-if="mode === 'live'"
      :model-value="markdown"
      :document-id="documentId"
      @update:model-value="emit('update:markdown', $event)"
      @link-click="emit('linkClick', $event)"
      @image-paste="emit('pasteImage', $event)"
      @image-insert="emit('captureRegion', $event.selection)"
      @image-context="emit('resizeImage', { assetPath: $event.assetPath })"
      @selection-change="liveSelection = $event"
    />
    <MarkdownPreview
      v-else
      class="readerm-preview"
      :source="markdown"
      :document-id="documentId"
      @link-click="emit('linkClick', $event)"
      @image-context="emit('resizeImage', { assetPath: $event.assetPath })"
    />
  </section>
</template>
