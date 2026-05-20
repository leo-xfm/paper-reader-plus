import { ref } from "vue";

export function useReaderTabs() {
  const openDocumentIds = ref<string[]>([]);

  function addOpenDocumentTab(documentId: string) {
    if (!documentId || openDocumentIds.value.includes(documentId)) return openDocumentIds.value;
    openDocumentIds.value = [...openDocumentIds.value, documentId];
    return openDocumentIds.value;
  }

  function closeOpenDocumentTab(documentId: string) {
    openDocumentIds.value = openDocumentIds.value.filter((id) => id !== documentId);
    return openDocumentIds.value;
  }

  function filterOpenDocumentTabs(predicate: (documentId: string) => boolean) {
    openDocumentIds.value = openDocumentIds.value.filter(predicate);
    return openDocumentIds.value;
  }

  return {
    openDocumentIds,
    addOpenDocumentTab,
    closeOpenDocumentTab,
    filterOpenDocumentTabs,
  };
}
