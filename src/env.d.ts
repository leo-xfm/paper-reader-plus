/// <reference types="vite/client" />

import type {
  AiChatRequest,
  AiChatResponse,
  AnchorCreateRequest,
  Annotation,
  AnnotationCreateRequest,
  AnnotationUpdateRequest,
  CleanupUnusedResult,
  DocumentContext,
  DocumentViewState,
  DictionaryEntry,
  LibraryDocument,
  LibrarySearchResult,
  MarkdownImageInsertResult,
  ParagraphTranslation,
  ParagraphTranslationSaveRequest,
  Settings,
  FileAssociationExtension,
  FileAssociationStatus,
  ReaderPackageAiHistory,
  TranslateSelectionRequest,
  TranslateSelectionResponse,
  PromptTemplateStatus,
  PackageHealthReport,
  ConnectionTestResponse,
  SymbolDefinition,
} from "./types";

export type ArxivImportProgress = {
  phase: "checking" | "downloading-pdf" | "downloading-source" | "extracting-source" | "saving" | "done";
  status: string;
  receivedBytes?: number;
  totalBytes?: number;
  percent?: number;
};

type MenuAction =
  | "import-pdf"
  | "import-arxiv"
  | "import-readerp"
  | "import-readerm"
  | "create-readerp-from-pdf"
  | "create-readerp-from-markdown"
  | "create-readerm-empty"
  | "create-readerm-from-markdown"
  | "export-readerp"
  | "export-readerm"
  | "export-markdown-readerp"
  | "split-readerp"
  | "attach-latex"
  | "toggle-panel"
  | "select-tool"
  | "highlight-tool"
  | "underline-tool"
  | "note-tool"
  | "image-tool"
  | "copy-quote"
  | "quote-to-note"
  | "ask-ai"
  | "translate-selection"
  | "toggle-search"
  | "toggle-outline"
  | "settings-general"
  | "settings-markdown"
  | "settings-agent-api"
  | "settings-ocr-api"
  | "settings-translation-api"
  | "settings-network-proxy"
  | "settings-file-associations"
  | "settings-system-prompt"
  | "settings-summary-prompt";

declare global {
  interface Window {
    paperReaderPlus: {
      importPdf(): Promise<LibraryDocument | null>;
      importArxiv(arxivId: string, options?: { includeSource?: boolean }): Promise<LibraryDocument | null>;
      importArxivWithProgress(arxivId: string, options?: { includeSource?: boolean }, onProgress?: (progress: ArxivImportProgress) => void): Promise<LibraryDocument | null>;
      importReaderPackage(): Promise<LibraryDocument | null>;
      importReadermPackage(): Promise<LibraryDocument | null>;
      exportCurrentReaderPackage(documentId: string, aiHistory: ReaderPackageAiHistory): Promise<string | null>;
      exportCurrentReadermPackage(documentId: string, markdown: string): Promise<string | null>;
      exportMarkdownReaderPackage(documentId: string, aiHistory: ReaderPackageAiHistory): Promise<string | null>;
      splitCurrentReaderPackage(documentId: string, aiHistory: ReaderPackageAiHistory): Promise<string | null>;
      createReaderPackageFromPdf(): Promise<LibraryDocument | null>;
      createReaderPackageFromMarkdown(): Promise<LibraryDocument | null>;
      createEmptyReaderm(): Promise<LibraryDocument | null>;
      createReadermFromMarkdown(): Promise<LibraryDocument | null>;
      upgradeMarkdownToReadermCopy(documentId: string, markdown: string): Promise<LibraryDocument | null>;
      importDroppedFile(filePath: string): Promise<LibraryDocument | null>;
      listDocuments(): Promise<LibraryDocument[]>;
      clearDocumentHistory(mode: "readerp" | "readerm"): Promise<{ removed: number }>;
      searchLibrary(query: string): Promise<LibrarySearchResult[]>;
      getDocumentContext(documentId: string): Promise<DocumentContext>;
      updateDocumentViewState(documentId: string, viewState: DocumentViewState): Promise<DocumentViewState>;
      getDocumentHealth(documentId: string): Promise<PackageHealthReport>;
      getPdfData(documentId: string): Promise<ArrayBuffer>;
      updateDocumentTitle(documentId: string, title: string): Promise<LibraryDocument>;
      attachLatexSource(documentId: string): Promise<LibraryDocument>;
      getLatexSource(documentId: string): Promise<{ file_name: string; content: string }>;
      confirmDeleteDocument(title: string, fileName: string): Promise<"record" | "file" | null>;
      confirmSymbolRefreshSource(): Promise<"latex" | "pdf" | null>;
      confirmSymbolRefreshMode(): Promise<"preserve-user-state" | "reset" | null>;
      showDocumentContextMenu(documentId: string): Promise<{
        action: "open-file" | "show-in-folder" | "properties" | "cleanup" | "delete";
        documentId: string;
        mode?: "record" | "file";
        cleanup?: CleanupUnusedResult;
      } | null>;
      openDocumentFile(documentId: string): Promise<void>;
      showDocumentInFolder(documentId: string): Promise<void>;
      showDocumentProperties(documentId: string): Promise<void>;
      deleteDocument(documentId: string, mode?: "record" | "file"): Promise<void>;
      cleanupUnusedResources(documentId: string): Promise<CleanupUnusedResult>;
      saveNote(documentId: string, content: string): Promise<string>;
      saveSummary(documentId: string, content: string): Promise<string>;
      saveSymbols(documentId: string, symbols: SymbolDefinition[]): Promise<SymbolDefinition[]>;
      listParagraphTranslations(documentId: string): Promise<ParagraphTranslation[]>;
      saveParagraphTranslation(documentId: string, entry: ParagraphTranslationSaveRequest): Promise<ParagraphTranslation>;
      importImageAsset(documentId: string): Promise<MarkdownImageInsertResult | null>;
      saveImageDataUrl(documentId: string, dataUrl: string, source?: string): Promise<MarkdownImageInsertResult>;
      getAssetDataUrl(documentId: string, assetPath: string): Promise<string>;
      createAnchor(documentId: string, payload: AnchorCreateRequest): Promise<DocumentContext["anchors"][number]>;
      createAnnotation(documentId: string, payload: AnnotationCreateRequest): Promise<Annotation>;
      updateAnnotation(documentId: string, annotationId: string, payload: AnnotationUpdateRequest): Promise<Annotation>;
      deleteAnnotation(documentId: string, annotationId: string): Promise<void>;
      listDictionary(): Promise<DictionaryEntry[]>;
      getSettings(): Promise<Settings>;
      updateSettings(settings: Partial<Settings>): Promise<Settings>;
      getPromptTemplates(): Promise<PromptTemplateStatus[]>;
      getFileAssociationStatus(): Promise<FileAssociationStatus>;
      registerFileAssociations(): Promise<FileAssociationStatus>;
      registerFileAssociation(extension: FileAssociationExtension): Promise<FileAssociationStatus>;
      unregisterFileAssociation(extension: FileAssociationExtension): Promise<FileAssociationStatus>;
      testAgentSettings(settings: Partial<Settings>): Promise<ConnectionTestResponse>;
      testTranslationSettings(settings: Partial<Settings>): Promise<ConnectionTestResponse>;
      testSimpleTexOcrSettings(settings: Partial<Settings>): Promise<ConnectionTestResponse>;
      aiChat(payload: AiChatRequest): Promise<AiChatResponse>;
      saveAiHistory(documentId: string, history: ReaderPackageAiHistory): Promise<ReaderPackageAiHistory>;
      saveCurrentReaderPackage(documentId: string, note: string, summary: string, aiHistory: ReaderPackageAiHistory): Promise<string | null>;
      saveCurrentReadermPackage(documentId: string, markdown: string): Promise<string | null>;
      confirmSaveOnClose(title: string): Promise<"save" | "discard" | "cancel">;
      confirmSaveOnTabClose(title: string): Promise<"save" | "discard" | "cancel">;
      finishCloseRequest(shouldClose: boolean): Promise<void>;
      onCloseRequest(callback: () => void): () => void;
      onOpenFileRequest(callback: (documentId: string) => void): () => void;
      aiChatStream(payload: AiChatRequest, callbacks?: {
        onDelta?: (delta: string) => void;
        onDone?: (content: string) => void;
        onError?: (message: string) => void;
        onCancel?: () => void;
      }): () => void;
      translateSelection(payload: TranslateSelectionRequest): Promise<TranslateSelectionResponse>;
      recognizeLatexImage(dataUrl: string): Promise<{ latex: string; conf?: number; request_id?: string }>;
      writeImageToClipboard(dataUrl: string): Promise<void>;
      getHelpContent(topic?: string): Promise<string>;
      openExternalUrl(url: string): Promise<void>;
      onMenuAction(callback: (action: MenuAction) => void): () => void;
    };
  }
}
