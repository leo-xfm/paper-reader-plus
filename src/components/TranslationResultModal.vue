<script setup lang="ts">
import { computed } from "vue";
import { Copy, X } from "lucide-vue-next";
import { useI18n } from "@/i18n";

const props = defineProps<{
  provider: "google" | "baidu";
  targetLanguage: string;
  sourceText: string;
  translatedText: string;
  loading: boolean;
  error: string;
  position: { left: number; top: number; bottom?: number } | null;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "copy"): void;
}>();

const popoverStyle = computed(() => {
  const popoverWidth = 420;
  const popoverHeight = 300;
  const gap = 8;
  const left = Math.min(Math.max(12, props.position?.left || 12), Math.max(12, window.innerWidth - popoverWidth - 12));
  const selectionTop = props.position?.top || 12;
  const selectionBottom = props.position?.bottom || selectionTop;
  const belowTop = selectionBottom + gap;
  const aboveTop = selectionTop - popoverHeight - gap;
  const top = belowTop + popoverHeight <= window.innerHeight - 12
    ? belowTop
    : Math.max(12, aboveTop);
  return {
    left: `${left}px`,
    top: `${top}px`,
  };
});
</script>

<template>
  <section class="translation-popover" :style="popoverStyle">
    <header class="translation-popover-header">
      <div>
        <h2>{{ t("translation.title") }}</h2>
        <p>{{ provider === "google" ? t("translation.provider.google") : t("translation.provider.baidu") }} to {{ targetLanguage }}</p>
      </div>
      <button type="button" :title="t('common.close')" @click="emit('close')"><X :size="16" /></button>
    </header>

    <div class="translation-popover-body">
      <div class="translation-popover-section">
        <span>{{ t("translation.source") }}</span>
        <pre>{{ sourceText }}</pre>
      </div>

      <div class="translation-popover-section">
        <span>{{ t("translation.result") }}</span>
        <div v-if="loading" class="translation-popover-status">{{ t("translation.translating") }}</div>
        <p v-else-if="error" class="error">{{ error }}</p>
        <pre v-else>{{ translatedText }}</pre>
      </div>
    </div>

    <div class="translation-popover-actions">
      <button type="button" class="primary" :disabled="loading || Boolean(error) || !translatedText" @click="emit('copy')">
        <Copy :size="16" /> {{ t("common.copy") }}
      </button>
    </div>
  </section>
</template>
