<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { useI18n } from "@/i18n";

const props = defineProps<{
  currentWidth: string;
  currentHeight: string;
  error?: string;
}>();

const emit = defineEmits<{
  (event: "confirm", value: { width: string; height: string }): void;
  (event: "cancel"): void;
}>();

const { t } = useI18n();
const widthDraft = ref("");
const heightDraft = ref("");
const widthInputRef = ref<HTMLInputElement | null>(null);

watch(
  () => [props.currentWidth, props.currentHeight] as const,
  ([width, height]) => {
    widthDraft.value = width;
    heightDraft.value = height;
    void nextTick(() => widthInputRef.value?.focus());
  },
  { immediate: true },
);

function submit() {
  emit("confirm", { width: widthDraft.value, height: heightDraft.value });
}
</script>

<template>
  <div class="modal-backdrop" @pointerdown.self="emit('cancel')" @keydown.esc="emit('cancel')">
    <form class="modal image-size-modal" @submit.prevent="submit">
      <header class="settings-modal-header">
        <h2>{{ t("markdown.imageSizeTitle") }}</h2>
        <p class="modal-meta">{{ t("markdown.imageSizeDescription") }}</p>
      </header>
      <div class="image-size-grid">
        <label>
          <span>{{ t("markdown.imageWidth") }}</span>
          <input ref="widthInputRef" v-model="widthDraft" type="number" min="0" max="9999" step="1" inputmode="numeric" :placeholder="t('common.auto')" />
        </label>
        <label>
          <span>{{ t("markdown.imageHeight") }}</span>
          <input v-model="heightDraft" type="number" min="0" max="9999" step="1" inputmode="numeric" :placeholder="t('common.auto')" />
        </label>
      </div>
      <p v-if="error" class="modal-error">{{ error }}</p>
      <div class="modal-actions">
        <button type="button" class="secondary" @click="emit('cancel')">{{ t("common.cancel") }}</button>
        <button type="submit" class="primary">{{ t("common.save") }}</button>
      </div>
    </form>
  </div>
</template>
