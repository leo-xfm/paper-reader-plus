import { onBeforeUnmount, ref, type Ref } from "vue";
import type { PdfOutlineItem } from "@/pdf/pdfTypes";
import { extractMarkdownOutline } from "@/services/MarkdownOutlineService";
import type { DocumentContext } from "@/types";

export function useReadermOutline(context: Ref<DocumentContext | null>, noteDraft: Ref<string>) {
  const readermOutlineItems = ref<PdfOutlineItem[]>([]);
  let readermOutlineTimer: number | null = null;

  function cancelReadermOutlineRefresh() {
    if (readermOutlineTimer === null) return;
    window.clearTimeout(readermOutlineTimer);
    readermOutlineTimer = null;
  }

  function refreshReadermOutlineNow() {
    if (context.value?.document.source_type !== "readerm") {
      readermOutlineItems.value = [];
      return;
    }
    readermOutlineItems.value = extractMarkdownOutline(noteDraft.value);
  }

  function scheduleReadermOutlineRefresh(delay = 220) {
    cancelReadermOutlineRefresh();
    if (context.value?.document.source_type !== "readerm") {
      readermOutlineItems.value = [];
      return;
    }
    readermOutlineTimer = window.setTimeout(() => {
      readermOutlineTimer = null;
      refreshReadermOutlineNow();
    }, delay);
  }

  onBeforeUnmount(cancelReadermOutlineRefresh);

  return {
    readermOutlineItems,
    refreshReadermOutlineNow,
    scheduleReadermOutlineRefresh,
    cancelReadermOutlineRefresh,
  };
}
