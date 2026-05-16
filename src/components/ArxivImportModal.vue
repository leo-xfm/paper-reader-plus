<script setup lang="ts">
import { useI18n } from "@/i18n";
import type { ArxivImportProgress } from "@/env";

defineProps<{
  modelValue: string;
  mode: "pdf" | "pdf-latex";
  importing: boolean;
  progress: ArxivImportProgress | null;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  (event: "update:modelValue", value: string): void;
  (event: "update:mode", value: "pdf" | "pdf-latex"): void;
  (event: "cancel"): void;
  (event: "import"): void;
}>();
</script>

<template>
  <div class="modal-backdrop">
    <section class="modal">
      <h2>{{ t("arxiv.title") }}</h2>
      <p class="modal-meta">{{ t("arxiv.description") }}</p>
      <label>
        {{ t("arxiv.inputLabel") }}
        <input
          :value="modelValue"
          :placeholder="t('arxiv.inputPlaceholder')"
          @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
          @keydown.enter.prevent="emit('import')"
        />
      </label>
      <div class="arxiv-import-options" role="group" aria-label="arXiv import mode">
        <button type="button" :class="{ active: mode === 'pdf' }" :disabled="importing" @click="emit('update:mode', 'pdf')">{{ t("arxiv.pdfOnly") }}</button>
        <button type="button" :class="{ active: mode === 'pdf-latex' }" :disabled="importing" @click="emit('update:mode', 'pdf-latex')">{{ t("arxiv.pdfLatex") }}</button>
      </div>
      <div v-if="importing && progress" class="arxiv-import-progress" role="status" aria-live="polite">
        <div class="arxiv-import-progress-header">
          <span>{{ progress.status }}</span>
          <span v-if="progress.percent !== undefined">{{ progress.percent }}%</span>
        </div>
        <div class="arxiv-import-progress-track">
          <div class="arxiv-import-progress-fill" :style="{ width: `${progress.percent ?? 18}%` }"></div>
        </div>
        <p v-if="progress.receivedBytes !== undefined" class="modal-meta">
          {{ (progress.receivedBytes / 1024 / 1024).toFixed(2) }} MB
          <template v-if="progress.totalBytes"> / {{ (progress.totalBytes / 1024 / 1024).toFixed(2) }} MB</template>
        </p>
      </div>
      <div class="modal-actions">
        <button type="button" :disabled="importing" @click="emit('cancel')">{{ t("common.cancel") }}</button>
        <button type="button" class="primary" :disabled="importing" @click="emit('import')">{{ importing ? t("common.importing") : t("common.import") }}</button>
      </div>
    </section>
  </div>
</template>
