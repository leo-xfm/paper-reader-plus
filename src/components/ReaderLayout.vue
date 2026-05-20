<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { PanelRightOpen } from "lucide-vue-next";
import { readerPanelTabs, type RightPanelTab } from "@/components/ReaderPanelTabs";
import { useI18n } from "@/i18n";

const props = defineProps<{
  collapsed: boolean;
  rightPanelWidth: number;
  activeTab: RightPanelTab;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  (event: "update:collapsed", value: boolean): void;
  (event: "update:rightPanelWidth", value: number): void;
  (event: "update:activeTab", value: RightPanelTab): void;
}>();

const gridRef = ref<HTMLElement | null>(null);
const resizeHandleWidth = 3;
const defaultPanelWidth = 560;
const minPdfWidth = 620;
const minPanelWidth = 320;
const maxPanelWidth = 860;
const layoutGutter = 12;
const gridWidth = ref(0);
let resizeObserver: ResizeObserver | null = null;
let initializedPanelWidth = false;

const clampedRightPanelWidth = computed(() => clampRightPanelWidth(props.rightPanelWidth));

const gridStyle = computed(() => ({
  gridTemplateColumns: [
    "minmax(620px, 1fr)",
    props.collapsed ? "0" : `${resizeHandleWidth}px`,
    props.collapsed ? "var(--rail-collapsed-width)" : `${clampedRightPanelWidth.value}px`,
  ].join(" "),
}));

function openTab(tab: RightPanelTab) {
  emit("update:activeTab", tab);
  emit("update:collapsed", false);
}

function clampRightPanelWidth(width: number) {
  const availableGridWidth = gridWidth.value || gridRef.value?.clientWidth || 1200;
  const maxByGrid = Math.max(minPanelWidth, availableGridWidth - minPdfWidth - resizeHandleWidth - layoutGutter);
  return Math.min(maxPanelWidth, Math.max(minPanelWidth, Math.min(width, maxByGrid)));
}

function syncRightPanelWidth() {
  if (props.collapsed) return;
  const requestedWidth = !initializedPanelWidth && props.rightPanelWidth < defaultPanelWidth
    ? clampRightPanelWidth(defaultPanelWidth)
    : props.rightPanelWidth;
  initializedPanelWidth = true;
  const targetWidth = clampRightPanelWidth(requestedWidth);
  if (targetWidth !== props.rightPanelWidth) emit("update:rightPanelWidth", targetWidth);
}

onMounted(async () => {
  await nextTick();
  if (gridRef.value) {
    gridWidth.value = gridRef.value.clientWidth;
    resizeObserver = new ResizeObserver((entries) => {
      gridWidth.value = entries[0]?.contentRect.width || gridRef.value?.clientWidth || 0;
      syncRightPanelWidth();
    });
    resizeObserver.observe(gridRef.value);
  }
  syncRightPanelWidth();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

watch(() => [props.collapsed, props.rightPanelWidth, gridWidth.value] as const, syncRightPanelWidth);

function startResize(event: PointerEvent) {
  event.preventDefault();
  const handle = event.currentTarget as HTMLElement;
  handle.setPointerCapture(event.pointerId);
  document.body.classList.add("resizing");
  const startX = event.clientX;
  const startWidth = props.rightPanelWidth;

  const onMove = (moveEvent: PointerEvent) => {
    const delta = startX - moveEvent.clientX;
    emit("update:rightPanelWidth", clampRightPanelWidth(startWidth + delta));
  };
  const onUp = (upEvent: PointerEvent) => {
    if (handle.hasPointerCapture(upEvent.pointerId)) handle.releasePointerCapture(upEvent.pointerId);
    document.body.classList.remove("resizing");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}
</script>

<template>
  <section ref="gridRef" class="reader-grid" :style="gridStyle">
    <slot name="pdf" />
    <button v-if="!collapsed" type="button" class="resize-handle" @pointerdown="startResize" />
    <nav v-if="collapsed" class="right-panel-rail" :aria-label="t('panel.tabs')">
      <div class="right-panel-rail-header">
        <button type="button" class="right-panel-toggle" :title="t('panel.expand')" :aria-label="t('panel.expand')" @click="emit('update:collapsed', false)">
          <PanelRightOpen :size="18" />
        </button>
      </div>
      <div class="right-panel-rail-tabs">
        <button
          v-for="tab in readerPanelTabs"
          :key="tab.key"
          type="button"
          :title="t(tab.titleKey)"
          :aria-label="t(tab.titleKey)"
          :class="{ active: activeTab === tab.key }"
          @click="openTab(tab.key)"
        >
          <component :is="tab.icon" :size="18" />
        </button>
      </div>
    </nav>
    <slot v-else name="right" />
  </section>
</template>
