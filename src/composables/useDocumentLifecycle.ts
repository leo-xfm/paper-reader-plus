import { nextTick, type Ref } from "vue";
import type { PdfHoverPreview, PdfTableSheet, PdfTextItem } from "@/pdf/pdfTypes";
import { toIpcPlainObject } from "@/services/IpcPayloadService";
import type { ReaderSelection } from "@/services/ReaderAnchorService";
import type { ArxivImportProgress } from "@/env";
import type {
  Anchor,
  Annotation,
  AuthorHoverPreview,
  DictionaryHoverPreview,
  DocumentContext,
  LibraryDocument,
  RectPct,
  SymbolDefinition,
} from "@/types";

type TextSelection = ReaderSelection & { position: { left: number; top: number; bottom?: number } };

type UseDocumentLifecycleOptions = {
  documents: Ref<LibraryDocument[]>;
  selectedDocumentId: Ref<string>;
  context: Ref<DocumentContext | null>;
  loading: Ref<boolean>;
  error: Ref<string>;
  noteDraft: Ref<string>;
  summaryDraft: Ref<string>;
  titleDraft: Ref<string>;
  editingTitle: Ref<boolean>;
  selectionState: Ref<TextSelection | null>;
  activeAnchor: Ref<Anchor | null>;
  activeAnnotation: Ref<Annotation | null>;
  referencePreview: Ref<PdfHoverPreview | null>;
  tableSheet: Ref<PdfTableSheet | null>;
  authorPreview: Ref<AuthorHoverPreview | null>;
  dictionaryPreview: Ref<DictionaryHoverPreview | null>;
  latexSymbols: Ref<SymbolDefinition[]>;
  savedSymbols: Ref<SymbolDefinition[]>;
  activeSymbol: Ref<string>;
  arxivIdDraft: Ref<string>;
  arxivImportMode: Ref<"pdf" | "pdf-latex">;
  arxivImportOpen: Ref<boolean>;
  arxivImporting: Ref<boolean>;
  arxivImportProgress: Ref<ArxivImportProgress | null>;
  aiMessages: Ref<Array<{ role: "user" | "assistant"; content: string }>>;
  pageTextItems: Ref<Record<number, PdfTextItem[]>>;
  showNotice: (message: string) => void;
  clearPages: () => void;
  clearPdf: () => void;
  loadPdf: (data: ArrayBuffer) => Promise<unknown>;
  scrollToPage: (pageIndex: number, options?: { rectsPct?: RectPct[]; block?: "start" | "center" }) => void;
};

export function useDocumentLifecycle(options: UseDocumentLifecycleOptions) {
  async function refreshDocuments() {
    options.documents.value = await window.paperReaderPlus.listDocuments();
  }

  async function importPdf() {
    const document = await window.paperReaderPlus.importPdf();
    if (!document) return;
    await refreshDocuments();
    if (document.readerp_path) options.showNotice(`ReaderP saved: ${document.readerp_path}`);
    await openDocument(document.document_id);
  }

  async function importArxiv() {
    const arxivId = options.arxivIdDraft.value.trim();
    if (!arxivId) {
      options.showNotice("Enter an arXiv ID first");
      return;
    }
    options.arxivImporting.value = true;
    options.arxivImportProgress.value = { phase: "checking", status: "Checking arXiv entry" };
    try {
      const includeSource = options.arxivImportMode.value === "pdf-latex";
      const document = await window.paperReaderPlus.importArxivWithProgress(
        arxivId,
        { includeSource },
        (progress) => {
          options.arxivImportProgress.value = progress;
        },
      );
      if (!document) return;
      options.arxivImportOpen.value = false;
      options.arxivIdDraft.value = "";
      await refreshDocuments();
      const parts = [
        document.readerp_path ? `ReaderP saved: ${document.readerp_path}` : "arXiv PDF imported",
        includeSource
          ? document.latex_file_name ? `LaTeX attached: ${document.latex_file_name}` : "No LaTeX source attached"
          : "PDF only",
      ];
      options.showNotice(parts.join(" | "));
      await openDocument(document.document_id);
    } catch (cause) {
      options.showNotice(cause instanceof Error ? cause.message : String(cause));
    } finally {
      options.arxivImporting.value = false;
      options.arxivImportProgress.value = null;
    }
  }

  async function importReaderPackage() {
    const document = await window.paperReaderPlus.importReaderPackage();
    if (!document) return;
    await refreshDocuments();
    if (document.readerp_path) options.showNotice(`ReaderP opened: ${document.readerp_path}`);
    await openDocument(document.document_id);
  }

  async function importReadermPackage() {
    const document = await window.paperReaderPlus.importReadermPackage();
    if (!document) return;
    await refreshDocuments();
    if (document.package_path) options.showNotice(`ReaderM opened: ${document.package_path}`);
    await openDocument(document.document_id);
  }

  async function createReaderPackageFromPdf() {
    const document = await window.paperReaderPlus.createReaderPackageFromPdf();
    if (!document) return;
    await refreshDocuments();
    if (document.readerp_path) options.showNotice(`ReaderP saved: ${document.readerp_path}`);
    await openDocument(document.document_id);
  }

  async function createReaderPackageFromMarkdown() {
    const document = await window.paperReaderPlus.createReaderPackageFromMarkdown();
    if (!document) return;
    await refreshDocuments();
    if (document.readerp_path) options.showNotice(`ReaderP saved: ${document.readerp_path}`);
    await openDocument(document.document_id);
  }

  async function createEmptyReaderm() {
    const document = await window.paperReaderPlus.createEmptyReaderm();
    if (!document) return;
    await refreshDocuments();
    options.showNotice("ReaderM created");
    await openDocument(document.document_id);
  }

  async function createReadermFromMarkdown() {
    const document = await window.paperReaderPlus.createReadermFromMarkdown();
    if (!document) return;
    await refreshDocuments();
    if (document.package_path) options.showNotice(`ReaderM saved: ${document.package_path}`);
    await openDocument(document.document_id);
  }

  async function exportCurrentReaderPackage() {
    if (!options.context.value) {
      options.showNotice("Open a document before exporting ReaderP");
      return;
    }
    const target = await window.paperReaderPlus.exportCurrentReaderPackage(
      options.context.value.document.document_id,
      toIpcPlainObject(options.aiMessages.value),
    );
    if (target) options.showNotice(`ReaderP saved: ${target}`);
  }

  async function exportMarkdownReaderPackage() {
    if (!options.context.value) {
      options.showNotice("Open a document before exporting Markdown ReaderP");
      return;
    }
    const target = await window.paperReaderPlus.exportMarkdownReaderPackage(
      options.context.value.document.document_id,
      toIpcPlainObject(options.aiMessages.value),
    );
    if (target) options.showNotice(`Markdown ReaderP saved: ${target}`);
  }

  async function exportCurrentReadermPackage() {
    if (!options.context.value) {
      options.showNotice("Open a ReaderM document before exporting ReaderM");
      return;
    }
    const target = await window.paperReaderPlus.exportCurrentReadermPackage(
      options.context.value.document.document_id,
      options.noteDraft.value,
    );
    if (target) options.showNotice(`ReaderM saved: ${target}`);
  }

  async function splitCurrentReaderPackage() {
    if (!options.context.value) {
      options.showNotice("Open a ReaderP document before splitting it");
      return;
    }
    const target = await window.paperReaderPlus.splitCurrentReaderPackage(
      options.context.value.document.document_id,
      toIpcPlainObject(options.aiMessages.value),
    );
    if (target) options.showNotice("Reader package split");
  }

  async function openDocument(documentId: string) {
    options.loading.value = true;
    options.error.value = "";
    options.selectedDocumentId.value = documentId;
    options.selectionState.value = null;
    options.activeAnchor.value = null;
    options.activeAnnotation.value = null;
    options.referencePreview.value = null;
    options.tableSheet.value = null;
    options.authorPreview.value = null;
    options.dictionaryPreview.value = null;
    options.latexSymbols.value = [];
    options.savedSymbols.value = [];
    options.activeSymbol.value = "";
    options.clearPages();
    options.pageTextItems.value = {};
    options.clearPdf();
    try {
      options.context.value = await window.paperReaderPlus.getDocumentContext(documentId);
      options.titleDraft.value = options.context.value.document.title;
      options.noteDraft.value = options.context.value.note.content;
      options.summaryDraft.value = options.context.value.summary.content;
      options.aiMessages.value = options.context.value.ai_history || [];
      options.savedSymbols.value = options.context.value.symbols || [];
      if (options.context.value.document.source_type === "readerm") {
        return;
      }
      if (options.context.value.document.source_type === "markdown") {
        options.error.value = "Markdown-only document. Use the right panel to read and edit notes.";
        return;
      }
      const raw = await window.paperReaderPlus.getPdfData(documentId);
      const data = raw instanceof ArrayBuffer ? raw : new Uint8Array(raw).buffer;
      await options.loadPdf(data);
      await nextTick();
      options.scrollToPage(0);
    } catch (cause) {
      options.error.value = cause instanceof Error ? cause.message : String(cause);
      options.context.value = null;
      options.clearPdf();
      options.clearPages();
      options.selectedDocumentId.value = "";
    } finally {
      options.loading.value = false;
    }
  }

  async function deleteDocument(document: LibraryDocument) {
    const mode = await window.paperReaderPlus.confirmDeleteDocument(document.title, document.file_name);
    if (!mode) return;
    await window.paperReaderPlus.deleteDocument(document.document_id, mode);
    if (options.selectedDocumentId.value !== document.document_id) {
      await refreshDocuments();
      options.showNotice(mode === "file" ? "File deleted" : "History record deleted");
      return;
    }
    options.context.value = null;
    options.clearPdf();
    options.clearPages();
    options.pageTextItems.value = {};
    options.selectedDocumentId.value = "";
    await refreshDocuments();
    options.showNotice(mode === "file" ? "File deleted" : "History record deleted");
  }

  async function deleteCurrentDocument() {
    const document = options.context.value?.document
      || options.documents.value.find((item) => item.document_id === options.selectedDocumentId.value);
    if (!document) return;
    await deleteDocument(document);
  }

  async function saveTitle() {
    if (!options.context.value) return;
    options.context.value.document = await window.paperReaderPlus.updateDocumentTitle(
      options.context.value.document.document_id,
      options.titleDraft.value,
    );
    options.editingTitle.value = false;
    await refreshDocuments();
  }

  async function attachLatexSource() {
    if (!options.context.value) {
      options.showNotice("Open a PDF before attaching LaTeX source");
      return;
    }
    const document = await window.paperReaderPlus.attachLatexSource(options.context.value.document.document_id);
    options.context.value.document = document;
    options.latexSymbols.value = [];
    await refreshDocuments();
    options.showNotice(document.latex_file_name ? `LaTeX attached: ${document.latex_file_name}` : "No LaTeX source selected");
  }

  async function saveNote() {
    if (!options.context.value) return;
    await window.paperReaderPlus.saveNote(options.context.value.document.document_id, options.noteDraft.value);
    options.showNotice("Notes saved");
  }

  async function saveReaderm() {
    if (!options.context.value) return;
    const target = await window.paperReaderPlus.saveCurrentReadermPackage(
      options.context.value.document.document_id,
      options.noteDraft.value,
    );
    if (target) {
      options.context.value = await window.paperReaderPlus.getDocumentContext(options.context.value.document.document_id);
      options.showNotice("ReaderM saved");
    }
  }

  async function saveSummary() {
    if (!options.context.value) return;
    await window.paperReaderPlus.saveSummary(options.context.value.document.document_id, options.summaryDraft.value);
    options.showNotice("Summary saved");
  }

  return {
    refreshDocuments,
    importPdf,
    importArxiv,
    importReaderPackage,
    importReadermPackage,
    createReaderPackageFromPdf,
    createReaderPackageFromMarkdown,
    createEmptyReaderm,
    createReadermFromMarkdown,
    exportCurrentReaderPackage,
    exportCurrentReadermPackage,
    exportMarkdownReaderPackage,
    splitCurrentReaderPackage,
    openDocument,
    deleteDocument,
    deleteCurrentDocument,
    saveTitle,
    attachLatexSource,
    saveNote,
    saveReaderm,
    saveSummary,
  };
}
