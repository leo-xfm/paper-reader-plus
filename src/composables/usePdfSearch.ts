import { computed, ref, watch, type Ref } from "vue";
import type { ScrollToPageOptions } from "@/composables/usePdfPages";
import { extractPdfPageTextItems } from "@/pdf/pdfText";
import type { PdfDocumentProxyLike, PdfSearchMatch, PdfTextItem } from "@/pdf/pdfTypes";

export function usePdfSearch(
  pageTextItems: Ref<Record<number, PdfTextItem[]>>,
  scrollToPage: (pageIndex: number, options?: ScrollToPageOptions) => void,
  pdfDocument?: Ref<PdfDocumentProxyLike | null>,
) {
  const searchOpen = ref(false);
  const searchQuery = ref("");
  const activeSearchMatchId = ref("");
  let extractionToken = 0;

  const searchMatches = computed<PdfSearchMatch[]>(() => {
    const clean = searchQuery.value.trim().toLowerCase();
    if (!clean) return [];
    const matches: PdfSearchMatch[] = [];
    for (const [pageIndexText, items] of Object.entries(pageTextItems.value)) {
      const pageIndex = Number(pageIndexText);
      for (const [index, item] of items.entries()) {
        if (!item.text.toLowerCase().includes(clean)) continue;
        matches.push({
          match_id: `${pageIndex}-${index}`,
          page_index: pageIndex,
          text: item.text,
          snippet: item.text,
          rects_pct: [item.rectPct],
        });
      }
    }
    return matches;
  });

  const activeSearchIndex = computed(() => searchMatches.value.findIndex((item) => item.match_id === activeSearchMatchId.value));
  const activeSearchMatch = computed(() => searchMatches.value[activeSearchIndex.value] || null);

  function syncActiveSearchMatch() {
    if (!searchMatches.value.length) activeSearchMatchId.value = "";
    else if (!searchMatches.value.some((item) => item.match_id === activeSearchMatchId.value)) activeSearchMatchId.value = searchMatches.value[0].match_id;
  }

  function nextSearch(delta: number) {
    if (!searchMatches.value.length) return;
    const next = (activeSearchIndex.value + delta + searchMatches.value.length) % searchMatches.value.length;
    const match = searchMatches.value[next];
    activeSearchMatchId.value = match.match_id;
    scrollToPage(match.page_index, { rectsPct: match.rects_pct, block: "center" });
  }

  async function loadAllPageTextForSearch(token: number) {
    const document = pdfDocument?.value;
    if (!document || !searchQuery.value.trim()) return;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const pageIndex = pageNumber - 1;
      if (pageTextItems.value[pageIndex]?.length) continue;
      try {
        const items = await extractPdfPageTextItems(document, pageNumber);
        if (token !== extractionToken || document !== pdfDocument?.value) return;
        pageTextItems.value = { ...pageTextItems.value, [pageIndex]: items };
      } catch {
        if (token !== extractionToken || document !== pdfDocument?.value) return;
        pageTextItems.value = { ...pageTextItems.value, [pageIndex]: [] };
      }
    }
  }

  watch([searchQuery, () => pdfDocument?.value], () => {
    const token = ++extractionToken;
    if (!searchQuery.value.trim() || !pdfDocument?.value) return;
    void loadAllPageTextForSearch(token);
  });

  return {
    searchOpen,
    searchQuery,
    activeSearchMatchId,
    searchMatches,
    activeSearchIndex,
    activeSearchMatch,
    syncActiveSearchMatch,
    nextSearch,
  };
}
