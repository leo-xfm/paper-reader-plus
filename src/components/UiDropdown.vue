<script setup lang="ts">
import { computed } from "vue";
import { Check, ChevronDown, type LucideIcon } from "lucide-vue-next";
import { useDropdownPopover } from "@/composables/useDropdownPopover";

export type DropdownOption = {
  value: string;
  label: string;
  icon?: LucideIcon;
  disabled?: boolean;
  style?: Record<string, string>;
};

const props = withDefaults(defineProps<{
  modelValue: string;
  options: readonly DropdownOption[];
  title?: string;
  placeholder?: string;
  menuClass?: string;
}>(), {
  title: "",
  placeholder: "",
  menuClass: "",
});

const emit = defineEmits<{
  (event: "update:modelValue", value: string): void;
}>();

const {
  open,
  rootRef,
  triggerRef,
  menuStyle,
  closeMenu,
  toggleOpen,
} = useDropdownPopover(".ui-dropdown-menu", { matchTriggerWidth: true, offset: 7 });

const selectedOption = computed(() => props.options.find((option) => option.value === props.modelValue) || null);
const triggerLabel = computed(() => selectedOption.value?.label || props.placeholder || "");
const triggerIcon = computed(() => selectedOption.value?.icon || null);
const hasOptionIcons = computed(() => props.options.some((option) => Boolean(option.icon)));

function selectOption(option: DropdownOption) {
  if (option.disabled) return;
  emit("update:modelValue", option.value);
  closeMenu();
}
</script>

<template>
  <div ref="rootRef" class="ui-dropdown">
    <button
      ref="triggerRef"
      type="button"
      class="ui-dropdown-trigger"
      :title="title || triggerLabel"
      :aria-expanded="open"
      @click="toggleOpen"
    >
      <component v-if="triggerIcon" :is="triggerIcon" :size="15" class="ui-dropdown-option-icon" />
      <span class="ui-dropdown-label" :style="selectedOption?.style">{{ triggerLabel }}</span>
      <ChevronDown :size="15" class="ui-dropdown-chevron" />
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        class="ui-dropdown-menu"
        :class="[menuClass, { 'has-option-icons': hasOptionIcons }]"
        :style="menuStyle"
        role="listbox"
        @wheel.stop
      >
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="ui-dropdown-option"
          :class="{ selected: option.value === modelValue }"
          :disabled="option.disabled"
          role="option"
          :aria-selected="option.value === modelValue"
          @click="selectOption(option)"
        >
          <Check :size="16" class="ui-dropdown-check" />
          <component v-if="option.icon" :is="option.icon" :size="15" class="ui-dropdown-option-icon" />
          <span :style="option.style">{{ option.label }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>
