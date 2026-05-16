<script setup lang="ts">
import { computed } from "vue";
import { FileText, X } from "lucide-vue-next";
import type { LibraryDocument } from "@/types";

const props = defineProps<{
  documents: LibraryDocument[];
  openDocumentIds: string[];
  activeDocumentId: string;
}>();

const emit = defineEmits<{
  (event: "openDocument", documentId: string): void;
  (event: "closeTab", documentId: string): void;
}>();

const documentsById = computed(() => new Map(props.documents.map((document) => [document.document_id, document])));
const openDocuments = computed(() => props.openDocumentIds
  .map((documentId) => documentsById.value.get(documentId))
  .filter((document): document is LibraryDocument => Boolean(document)));
</script>

<template>
  <nav v-if="openDocuments.length" class="file-tabs" aria-label="Open files">
    <div class="file-tab-list">
      <div
        v-for="document in openDocuments"
        :key="document.document_id"
        class="file-tab"
        :class="{ active: activeDocumentId === document.document_id }"
        :title="document.file_name"
      >
        <button type="button" class="file-tab-open" @click="emit('openDocument', document.document_id)">
          <FileText :size="16" />
          <span>{{ document.title || document.file_name }}</span>
        </button>
        <button
          type="button"
          class="file-tab-close"
          title="Close file"
          aria-label="Close file"
          @click.stop="emit('closeTab', document.document_id)"
        >
          <X :size="14" />
        </button>
      </div>
    </div>
  </nav>
</template>
