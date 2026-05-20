import { ref } from "vue";

const MIN_MARKDOWN_FONT_SIZE = 11;
const MAX_MARKDOWN_FONT_SIZE = 28;
const markdownFontSize = ref(15);

function clampMarkdownFontSize(value: unknown, fallback = 15) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(MAX_MARKDOWN_FONT_SIZE, Math.max(MIN_MARKDOWN_FONT_SIZE, Math.round(numeric)));
}

export function useMarkdownZoom() {
  function setMarkdownFontSize(value: unknown) {
    markdownFontSize.value = clampMarkdownFontSize(value, markdownFontSize.value);
  }

  function handleMarkdownWheel(event: WheelEvent) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setMarkdownFontSize(markdownFontSize.value + direction);
  }

  return {
    markdownFontSize,
    setMarkdownFontSize,
    handleMarkdownWheel,
  };
}
