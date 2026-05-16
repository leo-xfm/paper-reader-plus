<script setup lang="ts">
import { computed } from "vue";
import { Check, ChevronDown } from "lucide-vue-next";
import { useDropdownPopover } from "@/composables/useDropdownPopover";
import { ANNOTATION_COLORS } from "@/services/ReaderAnnotationService";
import { useI18n, type I18nKey } from "@/i18n";

const COLOR_LABEL_KEYS: Record<string, I18nKey> = {
  "#FACC15": "color.yellow",
  "#F87171": "color.red",
  "#55AE3A": "color.green",
  "#38A6D9": "color.blue",
  "#9B80D9": "color.purple",
  "#D75CE5": "color.magenta",
  "#F7982B": "color.orange",
  "#A3A3A3": "color.gray",
};

const props = defineProps<{
  modelValue: string;
  title?: string;
  includeAll?: boolean;
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: string): void;
}>();

const { t } = useI18n();
const {
  open,
  rootRef,
  triggerRef,
  menuStyle,
  closeMenu,
  toggleOpen,
} = useDropdownPopover(".color-dropdown-menu");

const selectedColor = computed(() => {
  if (props.includeAll && props.modelValue === "all") return "transparent";
  const match = ANNOTATION_COLORS.find((color) => color.toLowerCase() === props.modelValue.toLowerCase());
  return match || props.modelValue || ANNOTATION_COLORS[0];
});

function selectColor(color: string) {
  emit("update:modelValue", color);
  closeMenu();
}
</script>

<template>
  <div ref="rootRef" class="color-dropdown">
    <button
      ref="triggerRef"
      type="button"
      class="color-dropdown-trigger"
      :title="title || 'Annotation color'"
      :aria-expanded="open"
      @click="toggleOpen"
    >
      <span class="color-dropdown-swatch" :class="{ empty: includeAll && modelValue === 'all' }" :style="{ backgroundColor: selectedColor }" />
      <ChevronDown :size="15" />
    </button>
    <Teleport to="body">
      <div v-if="open" class="color-dropdown-menu" :style="menuStyle" role="listbox">
        <button
          v-if="includeAll"
          type="button"
          class="color-dropdown-option"
          :class="{ selected: modelValue === 'all' }"
          role="option"
          :aria-selected="modelValue === 'all'"
          @click="selectColor('all')"
        >
          <Check :size="16" class="color-dropdown-check" />
          <span class="color-dropdown-option-swatch empty" />
          <span>{{ t("annotation.filter.allColors") }}</span>
        </button>
        <button
          v-for="color in ANNOTATION_COLORS"
          :key="color"
          type="button"
          class="color-dropdown-option"
          :class="{ selected: selectedColor.toLowerCase() === color.toLowerCase() }"
          role="option"
          :aria-selected="selectedColor.toLowerCase() === color.toLowerCase()"
          @click="selectColor(color)"
        >
          <Check :size="16" class="color-dropdown-check" />
          <span class="color-dropdown-option-swatch" :style="{ backgroundColor: color }" />
          <span>{{ COLOR_LABEL_KEYS[color] ? t(COLOR_LABEL_KEYS[color]) : color }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>
