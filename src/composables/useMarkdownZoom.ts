import { ref } from "vue";

const MIN_MARKDOWN_FONT_SIZE = 11;
const MAX_MARKDOWN_FONT_SIZE = 28;
const DEFAULT_MARKDOWN_FONT_SIZE = 15;
const DEFAULT_MARKDOWN_LINE_HEIGHT = 1.6;
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

export function scaledMarkdownLineHeight(lineHeight: unknown, baseFontSize: unknown) {
  const numericLineHeight = Number(lineHeight);
  const numericBaseFontSize = clampMarkdownFontSize(baseFontSize, DEFAULT_MARKDOWN_FONT_SIZE);
  const resolvedLineHeight = Number.isFinite(numericLineHeight) && numericLineHeight > 0
    ? numericLineHeight
    : DEFAULT_MARKDOWN_LINE_HEIGHT;
  return Math.round(resolvedLineHeight * (markdownFontSize.value / numericBaseFontSize) * 100) / 100;
}
