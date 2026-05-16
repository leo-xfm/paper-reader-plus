<script setup lang="ts">
import { computed } from "vue";
import { Check, ChevronDown } from "lucide-vue-next";
import { useDropdownPopover } from "@/composables/useDropdownPopover";

export type DropdownOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

const props = withDefaults(defineProps<{
  modelValue: string;
  options: DropdownOption[];
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
      <span class="ui-dropdown-label">{{ triggerLabel }}</span>
      <ChevronDown :size="15" class="ui-dropdown-chevron" />
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        class="ui-dropdown-menu"
        :class="menuClass"
        :style="menuStyle"
        role="listbox"
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
          <span>{{ option.label }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>
