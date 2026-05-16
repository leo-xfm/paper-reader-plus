import { contextBridge, ipcRenderer } from "electron";

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
  | "settings-agent-api"
  | "settings-translation-api"
  | "settings-network-proxy"
  | "settings-file-associations"
  | "settings-system-prompt"
  | "settings-summary-prompt";

type AiChatStreamCallbacks = {
  onDelta?: (delta: string) => void;
  onDone?: (content: string) => void;
  onError?: (message: string) => void;
  onCancel?: () => void;
};

type ArxivImportProgress = {
  phase: "checking" | "downloading-pdf" | "downloading-source" | "extracting-source" | "saving" | "done";
  status: string;
  receivedBytes?: number;
  totalBytes?: number;
  percent?: number;
};

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

contextBridge.exposeInMainWorld("paperReaderPlus", {
  importPdf: () => ipcRenderer.invoke("library:import-pdf"),
  importArxiv: (arxivId: string, options?: { includeSource?: boolean }) => ipcRenderer.invoke("library:import-arxiv", arxivId, options),
  importArxivWithProgress: (arxivId: string, options: { includeSource?: boolean } = {}, onProgress?: (progress: ArxivImportProgress) => void) => {
    const requestId = createRequestId();
    const progressChannel = `library:import-arxiv:progress:${requestId}`;
    const listener = (_event: Electron.IpcRendererEvent, progress: ArxivImportProgress) => onProgress?.(progress);
    ipcRenderer.on(progressChannel, listener);
    return ipcRenderer
      .invoke("library:import-arxiv", arxivId, { ...options, requestId })
      .finally(() => ipcRenderer.off(progressChannel, listener));
  },
  importReaderPackage: () => ipcRenderer.invoke("readerp:import"),
  importReadermPackage: () => ipcRenderer.invoke("readerm:import"),
  exportCurrentReaderPackage: (documentId: string, aiHistory: unknown) => ipcRenderer.invoke("readerp:export-current", documentId, aiHistory),
  exportCurrentReadermPackage: (documentId: string, markdown: string) => ipcRenderer.invoke("readerm:export-current", documentId, markdown),
  exportMarkdownReaderPackage: (documentId: string, aiHistory: unknown) => ipcRenderer.invoke("readerp:export-markdown-centered", documentId, aiHistory),
  splitCurrentReaderPackage: (documentId: string, aiHistory: unknown) => ipcRenderer.invoke("readerp:split-current", documentId, aiHistory),
  createReaderPackageFromPdf: () => ipcRenderer.invoke("readerp:create-from-pdf"),
  createReaderPackageFromMarkdown: () => ipcRenderer.invoke("readerp:create-from-markdown"),
  createEmptyReaderm: () => ipcRenderer.invoke("readerm:create-empty"),
  createReadermFromMarkdown: () => ipcRenderer.invoke("readerm:create-from-markdown"),
  importDroppedFile: (filePath: string) => ipcRenderer.invoke("library:import-dropped-file", filePath),
  listDocuments: () => ipcRenderer.invoke("library:list-documents"),
  searchLibrary: (query: string) => ipcRenderer.invoke("library:search", query),
  getDocumentContext: (documentId: string) => ipcRenderer.invoke("documents:get-context", documentId),
  getDocumentHealth: (documentId: string) => ipcRenderer.invoke("documents:get-health", documentId),
  getPdfData: (documentId: string) => ipcRenderer.invoke("documents:get-pdf-data", documentId),
  updateDocumentTitle: (documentId: string, title: string) => ipcRenderer.invoke("documents:update-title", documentId, title),
  attachLatexSource: (documentId: string) => ipcRenderer.invoke("documents:attach-latex", documentId),
  getLatexSource: (documentId: string) => ipcRenderer.invoke("documents:get-latex-source", documentId),
  confirmDeleteDocument: (title: string, fileName: string) => ipcRenderer.invoke("documents:confirm-delete", title, fileName),
  confirmSymbolRefreshSource: () => ipcRenderer.invoke("symbols:confirm-refresh-source"),
  confirmSymbolRefreshMode: () => ipcRenderer.invoke("symbols:confirm-refresh-mode"),
  showDocumentContextMenu: (documentId: string) => ipcRenderer.invoke("documents:show-context-menu", documentId),
  openDocumentFile: (documentId: string) => ipcRenderer.invoke("documents:open-file", documentId),
  showDocumentInFolder: (documentId: string) => ipcRenderer.invoke("documents:show-in-folder", documentId),
  showDocumentProperties: (documentId: string) => ipcRenderer.invoke("documents:show-properties", documentId),
  deleteDocument: (documentId: string, mode: "record" | "file" = "file") => ipcRenderer.invoke("documents:delete", documentId, mode),
  cleanupUnusedResources: (documentId: string) => ipcRenderer.invoke("documents:cleanup-unused", documentId),
  saveNote: (documentId: string, content: string) => ipcRenderer.invoke("notes:save", documentId, content),
  saveSummary: (documentId: string, content: string) => ipcRenderer.invoke("summary:save", documentId, content),
  saveSymbols: (documentId: string, symbols: unknown) => ipcRenderer.invoke("symbols:save", documentId, symbols),
  listParagraphTranslations: (documentId: string) => ipcRenderer.invoke("paragraph-translations:list", documentId),
  saveParagraphTranslation: (documentId: string, entry: unknown) => ipcRenderer.invoke("paragraph-translations:save", documentId, entry),
  importImageAsset: (documentId: string) => ipcRenderer.invoke("assets:import-image", documentId),
  saveImageDataUrl: (documentId: string, dataUrl: string, source?: string) => ipcRenderer.invoke("assets:save-image-data-url", documentId, dataUrl, source),
  getAssetDataUrl: (documentId: string, assetPath: string) => ipcRenderer.invoke("assets:get-data-url", documentId, assetPath),
  createAnchor: (documentId: string, payload: unknown) => ipcRenderer.invoke("anchors:create", documentId, payload),
  createAnnotation: (documentId: string, payload: unknown) => ipcRenderer.invoke("annotations:create", documentId, payload),
  updateAnnotation: (documentId: string, annotationId: string, payload: unknown) => ipcRenderer.invoke("annotations:update", documentId, annotationId, payload),
  deleteAnnotation: (documentId: string, annotationId: string) => ipcRenderer.invoke("annotations:delete", documentId, annotationId),
  listDictionary: () => ipcRenderer.invoke("dictionary:list"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (settings: unknown) => ipcRenderer.invoke("settings:update", settings),
  getPromptTemplates: () => ipcRenderer.invoke("settings:templates"),
  getFileAssociationStatus: () => ipcRenderer.invoke("settings:file-associations-status"),
  registerFileAssociations: () => ipcRenderer.invoke("settings:register-file-associations"),
  testAgentSettings: (settings: unknown) => ipcRenderer.invoke("settings:test-agent", settings),
  testTranslationSettings: (settings: unknown) => ipcRenderer.invoke("settings:test-translation", settings),
  aiChat: (payload: unknown) => ipcRenderer.invoke("ai:chat", payload),
  saveAiHistory: (documentId: string, history: unknown) => ipcRenderer.invoke("ai:history:save", documentId, history),
  saveCurrentReaderPackage: (documentId: string, note: string, summary: string, aiHistory: unknown) => ipcRenderer.invoke("readerp:save-current", documentId, note, summary, aiHistory),
  saveCurrentReadermPackage: (documentId: string, markdown: string) => ipcRenderer.invoke("readerm:save-current", documentId, markdown),
  confirmSaveOnClose: (title: string) => ipcRenderer.invoke("app:confirm-save-on-close", title),
  confirmSaveOnTabClose: (title: string) => ipcRenderer.invoke("app:confirm-save-on-tab-close", title),
  finishCloseRequest: (shouldClose: boolean) => ipcRenderer.invoke("app:close-response", shouldClose),
  onCloseRequest: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("app:close-request", listener);
    return () => ipcRenderer.off("app:close-request", listener);
  },
  onOpenFileRequest: (callback: (documentId: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, document: { document_id?: string } | null) => {
      if (document?.document_id) callback(document.document_id);
    };
    ipcRenderer.on("app:open-file-request", listener);
    return () => ipcRenderer.off("app:open-file-request", listener);
  },
  aiChatStream: (payload: unknown, callbacks: AiChatStreamCallbacks = {}) => {
    const requestId = createRequestId();
    const deltaChannel = `ai:chat:stream:delta:${requestId}`;
    const doneChannel = `ai:chat:stream:done:${requestId}`;
    const errorChannel = `ai:chat:stream:error:${requestId}`;
    const cancelChannel = `ai:chat:stream:cancelled:${requestId}`;
    const cleanup = () => {
      ipcRenderer.off(deltaChannel, onDelta);
      ipcRenderer.off(doneChannel, onDone);
      ipcRenderer.off(errorChannel, onError);
      ipcRenderer.off(cancelChannel, onCancel);
    };
    const onDelta = (_event: Electron.IpcRendererEvent, data: { delta?: unknown }) => {
      callbacks.onDelta?.(String(data?.delta || ""));
    };
    const onDone = (_event: Electron.IpcRendererEvent, data: { content?: unknown }) => {
      cleanup();
      callbacks.onDone?.(String(data?.content || ""));
    };
    const onError = (_event: Electron.IpcRendererEvent, data: { message?: unknown }) => {
      cleanup();
      callbacks.onError?.(String(data?.message || "AI stream failed."));
    };
    const onCancel = () => {
      cleanup();
      callbacks.onCancel?.();
    };
    ipcRenderer.on(deltaChannel, onDelta);
    ipcRenderer.on(doneChannel, onDone);
    ipcRenderer.on(errorChannel, onError);
    ipcRenderer.on(cancelChannel, onCancel);
    ipcRenderer.send("ai:chat:stream:start", { requestId, payload });
    return () => {
      ipcRenderer.send("ai:chat:stream:cancel", requestId);
    };
  },
  translateSelection: (payload: unknown) => ipcRenderer.invoke("translate:selection", payload),
  writeImageToClipboard: (dataUrl: string) => ipcRenderer.invoke("clipboard:write-image", dataUrl),
  getHelpContent: () => ipcRenderer.invoke("help:get-content"),
  onMenuAction: (callback: (action: MenuAction) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: MenuAction) => callback(action);
    ipcRenderer.on("menu:action", listener);
    return () => ipcRenderer.off("menu:action", listener);
  },
});
