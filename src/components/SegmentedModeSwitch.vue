<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@/i18n";
import type { I18nKey } from "@/i18n/messages";
import type { MarkdownEditorMode } from "@/types";

const props = defineProps<{
  modelValue: MarkdownEditorMode;
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: MarkdownEditorMode): void;
}>();

const { t } = useI18n();

const options: Array<{ value: MarkdownEditorMode; labelKey: I18nKey }> = [
  { value: "edit", labelKey: "common.edit" },
  { value: "live", labelKey: "common.live" },
  { value: "preview", labelKey: "common.preview" },
];

const activeIndex = computed(() => Math.max(0, options.findIndex((option) => option.value === props.modelValue)));
</script>

<template>
  <div class="segmented-mode-switch" :style="{ '--active-index': activeIndex }" role="tablist">
    <span class="segmented-mode-thumb" aria-hidden="true" />
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="segmented-mode-option"
      :class="{ active: modelValue === option.value }"
      role="tab"
      :aria-selected="modelValue === option.value"
      @click="emit('update:modelValue', option.value)"
    >
      {{ t(option.labelKey) }}
    </button>
  </div>
</template>
