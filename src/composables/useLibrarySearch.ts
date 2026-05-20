import { onBeforeUnmount, ref, watch } from "vue";
import type { LibrarySearchResult } from "@/types";

export function useLibrarySearch(showNotice: (message: string) => void) {
  const librarySearchQuery = ref("");
  const librarySearchResults = ref<LibrarySearchResult[]>([]);
  const librarySearchLoading = ref(false);
  let librarySearchTimer: number | null = null;
  let searchRequestId = 0;

  function clearLibrarySearchTimer() {
    if (librarySearchTimer === null) return;
    window.clearTimeout(librarySearchTimer);
    librarySearchTimer = null;
  }

  watch(librarySearchQuery, (query) => {
    clearLibrarySearchTimer();
    const clean = query.trim();
    const requestId = ++searchRequestId;
    if (!clean) {
      librarySearchResults.value = [];
      librarySearchLoading.value = false;
      return;
    }
    librarySearchLoading.value = true;
    librarySearchTimer = window.setTimeout(async () => {
      librarySearchTimer = null;
      try {
        const results = await window.paperReaderPlus.searchLibrary(clean);
        if (requestId !== searchRequestId || librarySearchQuery.value.trim() !== clean) return;
        librarySearchResults.value = results;
      } catch (cause) {
        if (requestId !== searchRequestId) return;
        showNotice(cause instanceof Error ? cause.message : String(cause));
        librarySearchResults.value = [];
      } finally {
        if (requestId === searchRequestId) librarySearchLoading.value = false;
      }
    }, 180);
  });

  onBeforeUnmount(() => {
    searchRequestId += 1;
    clearLibrarySearchTimer();
  });

  return {
    librarySearchQuery,
    librarySearchResults,
    librarySearchLoading,
  };
}
