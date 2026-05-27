import { existsSync } from "node:fs";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { dialog, ipcMain, Menu, shell } from "electron";
import { createReaderPackageBuffer } from "../ReaderPackageService.js";
import { dialogLabel } from "../i18n.js";
import { buildPackageHealthReport } from "../services/HealthCheckService.js";
import { cleanupUnusedDocumentResources } from "../services/MaintenanceService.js";
import type { IpcContext, StoredSymbolDefinition } from "./storeContext.js";
import type { StoredFormulaAnalysis } from "../storeMigration.js";

type DeleteMode = "record" | "file";
type SymbolRefreshSource = "latex" | "pdf" | "ai-pdf" | "ai-latex";
type SymbolRefreshMode = "preserve-user-state" | "reset";
type SymbolAiApplyMode = "complete" | "replace";
type DocumentContextMenuResult = {
  action: "open-file" | "show-in-folder" | "properties" | "cleanup" | "delete";
  documentId: string;
  mode?: DeleteMode;
  cleanup?: ReturnType<typeof cleanupUnusedDocumentResources>;
} | null;

function primaryDocumentPath(document: { file_path: string; readerp_path?: string; package_path?: string }) {
  return document.package_path || document.readerp_path || document.file_path;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSymbol(value: string) {
  return value
    .replace(/^\\/, "")
    .replace(/[{}$]/g, "")
    .trim()
    .toLowerCase();
}

function cleanNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanSymbolDefinition(value: unknown): StoredSymbolDefinition | null {
  if (!isRecord(value)) return null;
  const symbol = String(value.symbol || "").trim();
  const normalized = String(value.normalized_symbol || normalizeSymbol(symbol)).trim();
  if (!symbol || !normalized) return null;
  const kind: StoredSymbolDefinition["kind"] = value.kind === "abbreviation" ? "abbreviation" : "symbol";
  const source: StoredSymbolDefinition["source"] = value.source === "pdf" || value.source === "grobid" || value.source === "ai" ? value.source : "latex";
  const rectsPct = Array.isArray(value.rects_pct)
    ? value.rects_pct.filter(isRecord).map((rect) => ({
      left: cleanNumber(rect.left),
      top: cleanNumber(rect.top),
      width: cleanNumber(rect.width),
      height: cleanNumber(rect.height),
    })).filter((rect) => rect.width > 0 && rect.height > 0)
    : undefined;
  return {
    symbol,
    normalized_symbol: normalized,
    kind,
    definition: String(value.definition || ""),
    source,
    page_index: Number.isInteger(value.page_index) ? Number(value.page_index) : undefined,
    rects_pct: rectsPct?.length ? rectsPct : undefined,
    paragraph: typeof value.paragraph === "string" ? value.paragraph : undefined,
    latex_line: Number.isInteger(value.latex_line) ? Number(value.latex_line) : undefined,
    confidence: cleanNumber(value.confidence, 0.5),
    favorite: value.favorite === true,
    deleted: value.deleted === true,
    user_modified: value.user_modified === true,
    updated_at: typeof value.updated_at === "string" ? value.updated_at : undefined,
  };
}

async function saveReaderPackageSnapshot(ctx: IpcContext, documentId: string) {
  const document = ctx.getDocument(documentId);
  if (!document.readerp_path) return;
  const note = ctx.store.notes[documentId]?.content || "";
  const summary = ctx.store.summaries[documentId]?.content || "";
  const aiHistory = ctx.store.ai_history[documentId] || [];
  const pdfData = existsSync(document.file_path) && document.source_type !== "markdown" && document.source_type !== "readerm"
    ? await readFile(document.file_path)
    : undefined;
  const latexData = document.latex_path && existsSync(document.latex_path) ? await readFile(document.latex_path) : undefined;
  const buffer = await createReaderPackageBuffer({
    document,
    note,
    summary,
    aiHistory,
    anchors: ctx.listAnchors(documentId),
    annotations: ctx.listAnnotations(documentId),
    symbols: ctx.store.symbols[documentId] || [],
    formulas: ctx.store.formulas[documentId] || [],
    pdfData,
    latexData,
    assets: await ctx.packageAssetsForDocumentAsync(documentId, note, summary, aiHistory.map((message) => message.content).join("\n")),
  });
  await writeFile(document.readerp_path, buffer);
}

async function confirmDeleteDocument(ctx: IpcContext, title: string, fileName: string): Promise<DeleteMode | null> {
  const language = ctx.getSettings().ui_language;
  const displayTitle = title || fileName;
  const result = await dialog.showMessageBox(ctx.window, {
    type: "question",
    buttons: [
      dialogLabel(language, "button.deleteFile"),
      dialogLabel(language, "button.deleteRecordOnly"),
      dialogLabel(language, "button.cancel"),
    ],
    defaultId: 1,
    cancelId: 2,
    message: dialogLabel(language, "dialog.delete.message"),
    detail: dialogLabel(language, "dialog.delete.detail", { title: displayTitle }),
  });
  if (result.response === 0) return "file";
  if (result.response === 1) return "record";
  return null;
}

async function confirmCleanupDocument(ctx: IpcContext, title: string, fileName: string) {
  const language = ctx.getSettings().ui_language;
  const result = await dialog.showMessageBox(ctx.window, {
    type: "question",
    buttons: [dialogLabel(language, "button.cleanUp"), dialogLabel(language, "button.cancel")],
    defaultId: 0,
    cancelId: 1,
    message: dialogLabel(language, "dialog.cleanup.message"),
    detail: dialogLabel(language, "dialog.cleanup.detail", { title: title || fileName }),
  });
  return result.response === 0;
}

async function confirmSymbolRefreshSource(ctx: IpcContext): Promise<SymbolRefreshSource | null> {
  const language = ctx.getSettings().ui_language;
  const result = await dialog.showMessageBox(ctx.window, {
    type: "question",
    buttons: [
      dialogLabel(language, "button.fromLatex"),
      dialogLabel(language, "button.fromLoadedPdf"),
      dialogLabel(language, "button.fromAiPdf"),
      dialogLabel(language, "button.fromAiLatex"),
      dialogLabel(language, "button.cancel"),
    ],
    defaultId: 0,
    cancelId: 4,
    message: dialogLabel(language, "dialog.symbolRefreshSource.message"),
    detail: dialogLabel(language, "dialog.symbolRefreshSource.detail"),
  });
  if (result.response === 0) return "latex";
  if (result.response === 1) return "pdf";
  if (result.response === 2) return "ai-pdf";
  if (result.response === 3) return "ai-latex";
  return null;
}

function cleanFormulaStatus(value: unknown): StoredFormulaAnalysis["status"] {
  if (value === "parsed" || value === "error") return value;
  return "pending";
}

function cleanFormulaAnalysis(value: unknown, documentId: string): StoredFormulaAnalysis | null {
  if (!isRecord(value)) return null;
  const formulaId = String(value.formula_id || "").trim();
  const latex = String(value.latex || "");
  const rawText = String(value.raw_text || "");
  if (!formulaId || (!latex.trim() && !rawText.trim())) return null;
  const rectsPct = Array.isArray(value.rects_pct)
    ? value.rects_pct.filter(isRecord).map((rect) => ({
      left: cleanNumber(rect.left),
      top: cleanNumber(rect.top),
      width: cleanNumber(rect.width),
      height: cleanNumber(rect.height),
    })).filter((rect) => rect.width > 0 && rect.height > 0)
    : undefined;
  return {
    formula_id: formulaId,
    document_id: documentId,
    latex,
    raw_text: rawText,
    analysis: String(value.analysis || ""),
    source: value.source === "latex" ? "latex" : "pdf",
    page_index: Number.isFinite(Number(value.page_index)) ? Math.max(0, Math.trunc(Number(value.page_index))) : undefined,
    rects_pct: rectsPct?.length ? rectsPct : undefined,
    context: typeof value.context === "string" ? value.context : undefined,
    importance_score: Math.min(1, Math.max(0, cleanNumber(value.importance_score, 0.5))),
    status: cleanFormulaStatus(value.status),
    confidence: value.confidence === undefined ? undefined : Math.min(1, Math.max(0, cleanNumber(value.confidence, 0.5))),
    request_id: typeof value.request_id === "string" ? value.request_id : undefined,
    error: typeof value.error === "string" ? value.error : undefined,
    latex_line: Number.isFinite(Number(value.latex_line)) ? Math.max(1, Math.trunc(Number(value.latex_line))) : undefined,
    created_at: typeof value.created_at === "string" ? value.created_at : "",
    updated_at: typeof value.updated_at === "string" ? value.updated_at : "",
  };
}

async function confirmSymbolAiApplyMode(ctx: IpcContext): Promise<SymbolAiApplyMode | null> {
  const language = ctx.getSettings().ui_language;
  const result = await dialog.showMessageBox(ctx.window, {
    type: "question",
    buttons: [
      dialogLabel(language, "button.complete"),
      dialogLabel(language, "button.resetAll"),
      dialogLabel(language, "button.cancel"),
    ],
    defaultId: 0,
    cancelId: 2,
    message: dialogLabel(language, "dialog.symbolAiApplyMode.message"),
    detail: dialogLabel(language, "dialog.symbolAiApplyMode.detail"),
  });
  if (result.response === 0) return "complete";
  if (result.response === 1) return "replace";
  return null;
}

async function confirmSymbolRefreshMode(ctx: IpcContext): Promise<SymbolRefreshMode | null> {
  const language = ctx.getSettings().ui_language;
  const result = await dialog.showMessageBox(ctx.window, {
    type: "question",
    buttons: [
      dialogLabel(language, "button.keepUserChanges"),
      dialogLabel(language, "button.resetAll"),
      dialogLabel(language, "button.cancel"),
    ],
    defaultId: 0,
    cancelId: 2,
    message: dialogLabel(language, "dialog.symbolRefreshMode.message"),
    detail: dialogLabel(language, "dialog.symbolRefreshMode.detail"),
  });
  if (result.response === 0) return "preserve-user-state";
  if (result.response === 1) return "reset";
  return null;
}

async function deleteDocumentById(ctx: IpcContext, documentId: string, mode: DeleteMode = "file") {
  const document = ctx.getDocument(documentId);
  ctx.store.documents = ctx.store.documents.filter((item) => item.document_id !== documentId);
  delete ctx.store.notes[documentId];
  delete ctx.store.summaries[documentId];
  delete ctx.store.ai_history[documentId];
  delete ctx.store.symbols[documentId];
  delete ctx.store.formulas[documentId];
  delete ctx.store.paragraph_translations[documentId];
  delete ctx.store.view_states[documentId];
  ctx.store.assets = ctx.store.assets.filter((item) => item.document_id !== documentId);
  ctx.store.anchors = ctx.store.anchors.filter((item) => item.document_id !== documentId);
  ctx.store.annotations = ctx.store.annotations.filter((item) => item.document_id !== documentId);
  ctx.saveStore();
  if (mode === "file") {
    if (existsSync(document.file_path)) await rm(document.file_path, { force: true });
    if (document.readerp_path && existsSync(document.readerp_path)) await rm(document.readerp_path, { force: true });
    if (document.package_path && existsSync(document.package_path)) await rm(document.package_path, { force: true });
    if (document.latex_path && existsSync(document.latex_path)) await rm(document.latex_path, { force: true });
    const assetDir = ctx.documentAssetDir(documentId);
    if (existsSync(assetDir)) await rm(assetDir, { recursive: true, force: true });
  }
}

async function openDocumentFile(ctx: IpcContext, documentId: string) {
  const document = ctx.getDocument(documentId);
  const target = primaryDocumentPath(document);
  if (!existsSync(target)) throw new Error("File is missing.");
  const error = await shell.openPath(target);
  if (error) throw new Error(error);
}

function showDocumentInFolder(ctx: IpcContext, documentId: string) {
  const document = ctx.getDocument(documentId);
  const target = primaryDocumentPath(document);
  if (!existsSync(target)) throw new Error("File is missing.");
  shell.showItemInFolder(target);
}

async function showDocumentProperties(ctx: IpcContext, documentId: string) {
  const document = ctx.getDocument(documentId);
  const target = primaryDocumentPath(document);
  const size = existsSync(target) ? formatFileSize((await stat(target)).size) : "Missing";
  const details = [
    `Title: ${document.title}`,
    `File name: ${document.file_name}`,
    `Type: ${document.source_type || "pdf"}`,
    `Size: ${size}`,
    `Path: ${target}`,
    document.readerp_path ? `ReaderP: ${document.readerp_path}` : "",
    document.package_path ? `Package: ${document.package_path}` : "",
    document.latex_path ? `LaTeX: ${document.latex_path}` : "",
    `Created: ${document.created_at}`,
    `Updated: ${document.updated_at}`,
  ].filter(Boolean).join("\n");
  await dialog.showMessageBox(ctx.window, {
    type: "info",
    buttons: ["\u786e\u5b9a"],
    message: "\u6587\u4ef6\u5c5e\u6027",
    detail: details,
  });
}

export function registerDocumentIpc(ctx: IpcContext) {
  ipcMain.handle("documents:get-health", (_event, documentId: string) => {
    return buildPackageHealthReport(ctx.store, documentId, ctx.now());
  });

  ipcMain.handle("documents:get-context", (_event, documentId: string) => {
    const document = ctx.getDocument(documentId);
    const note = ctx.store.notes[documentId];
    const summary = ctx.store.summaries[documentId];
    const readerm = document.source_type === "readerm" ? ctx.buildReadermReferenceContext(note?.content || "") : null;
    return {
      document,
      note: { content: note?.content || "" },
      summary: { content: summary?.content || "" },
      anchors: ctx.listAnchors(documentId),
      annotations: ctx.listAnnotations(documentId),
      ai_history: ctx.store.ai_history[documentId] || [],
      assets: ctx.listAssets(documentId),
      symbols: ctx.store.symbols[documentId] || [],
      formulas: ctx.store.formulas[documentId] || [],
      paragraph_translations: ctx.listParagraphTranslations(documentId),
      readerm_references: readerm?.references,
      referenced_documents: readerm?.referencedDocuments,
      view_state: ctx.store.view_states[documentId] || null,
    };
  });

  ipcMain.handle("documents:update-view-state", (_event, documentId: string, viewState: unknown) => {
    ctx.getDocument(documentId);
    const cleaned = ctx.cleanDocumentViewState(viewState);
    ctx.store.view_states[documentId] = cleaned;
    ctx.saveStore();
    return cleaned;
  });

  ipcMain.handle("documents:get-pdf-data", async (_event, documentId: string) => {
    const document = ctx.getDocument(documentId);
    if (document.source_type === "markdown" || document.source_type === "readerm") throw new Error("This document does not contain a PDF.");
    if (!existsSync(document.file_path)) throw new Error("PDF file is missing.");
    return readFile(document.file_path);
  });

  ipcMain.handle("documents:export-pdf", async (_event, documentId: string) => {
    const document = ctx.getDocument(documentId);
    if (document.source_type === "markdown" || document.source_type === "readerm") throw new Error("This document does not contain a PDF.");
    if (!existsSync(document.file_path)) throw new Error("PDF file is missing.");
    const safeTitle = (document.title || basename(document.file_path, ".pdf") || "paper").replace(/[<>:"/\\|?*]+/g, "_");
    const result = await dialog.showSaveDialog(ctx.window, {
      title: "Export PDF",
      defaultPath: `${safeTitle}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, await readFile(document.file_path));
    return result.filePath;
  });

  ipcMain.handle("documents:update-title", (_event, documentId: string, title: string) => {
    const cleanTitle = String(title || "").trim() || "Untitled";
    const document = ctx.getDocument(documentId);
    document.title = cleanTitle;
    document.updated_at = ctx.now();
    ctx.saveStore();
    return ctx.getDocument(documentId);
  });

  ipcMain.handle("documents:attach-latex", async (_event, documentId: string) => {
    const document = ctx.getDocument(documentId);
    const result = await dialog.showOpenDialog(ctx.window, {
      title: "Attach LaTeX Source",
      filters: [{ name: "LaTeX", extensions: ["tex"] }],
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) return document;
    const source = result.filePaths[0];
    const target = ctx.latexTargetPath(documentId);
    await writeFile(target, await readFile(source));
    document.latex_path = target;
    document.latex_file_name = basename(source);
    document.updated_at = ctx.now();
    ctx.saveStore();
    return document;
  });

  ipcMain.handle("documents:get-latex-source", async (_event, documentId: string) => {
    const document = ctx.getDocument(documentId);
    if (!document.latex_path || !existsSync(document.latex_path)) throw new Error("No LaTeX source is attached to this PDF.");
    return {
      file_name: document.latex_file_name || basename(document.latex_path),
      content: await readFile(document.latex_path, "utf8"),
    };
  });

  ipcMain.handle("documents:confirm-delete", async (_event, title: string, fileName: string) => {
    return confirmDeleteDocument(ctx, title, fileName);
  });

  ipcMain.handle("documents:cleanup-unused", async (_event, documentId: string) => {
    ctx.getDocument(documentId);
    const result = cleanupUnusedDocumentResources(ctx.store, documentId);
    ctx.saveStore();
    return result;
  });

  ipcMain.handle("symbols:confirm-refresh-source", async () => {
    return confirmSymbolRefreshSource(ctx);
  });

  ipcMain.handle("symbols:confirm-refresh-mode", async () => {
    return confirmSymbolRefreshMode(ctx);
  });

  ipcMain.handle("symbols:confirm-ai-apply-mode", async () => {
    return confirmSymbolAiApplyMode(ctx);
  });

  ipcMain.handle("documents:open-file", async (_event, documentId: string) => {
    await openDocumentFile(ctx, documentId);
  });

  ipcMain.handle("documents:show-in-folder", (_event, documentId: string) => {
    showDocumentInFolder(ctx, documentId);
  });

  ipcMain.handle("documents:show-properties", async (_event, documentId: string) => {
    await showDocumentProperties(ctx, documentId);
  });

  ipcMain.handle("documents:show-context-menu", (_event, documentId: string) => {
    const document = ctx.getDocument(documentId);
    return new Promise<DocumentContextMenuResult>((resolve) => {
      let settled = false;
      const finish = (result: DocumentContextMenuResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const menu = Menu.buildFromTemplate([
        {
          label: "\u6253\u5f00\u6587\u4ef6",
          click: () => {
            void openDocumentFile(ctx, documentId)
              .then(() => finish({ action: "open-file", documentId }))
              .catch((cause) => {
                dialog.showErrorBox("\u6253\u5f00\u6587\u4ef6\u5931\u8d25", cause instanceof Error ? cause.message : String(cause));
                finish(null);
              });
          },
        },
        {
          label: "\u6253\u5f00\u6240\u5728\u7684\u6587\u4ef6\u5939",
          click: () => {
            try {
              showDocumentInFolder(ctx, documentId);
              finish({ action: "show-in-folder", documentId });
            } catch (cause) {
              dialog.showErrorBox("\u6253\u5f00\u6587\u4ef6\u5939\u5931\u8d25", cause instanceof Error ? cause.message : String(cause));
              finish(null);
            }
          },
        },
        {
          label: "\u5c5e\u6027",
          click: () => {
            void showDocumentProperties(ctx, documentId)
              .then(() => finish({ action: "properties", documentId }))
              .catch((cause) => {
                dialog.showErrorBox("\u663e\u793a\u5c5e\u6027\u5931\u8d25", cause instanceof Error ? cause.message : String(cause));
                finish(null);
              });
          },
        },
        {
          label: "\u6574\u7406\u672a\u4f7f\u7528\u8d44\u6e90",
          click: () => {
            void confirmCleanupDocument(ctx, document.title, document.file_name)
              .then((confirmed) => {
                if (!confirmed) {
                  finish(null);
                  return;
                }
                const cleanup = cleanupUnusedDocumentResources(ctx.store, documentId);
                ctx.saveStore();
                finish({ action: "cleanup", documentId, cleanup });
              })
              .catch((cause) => {
                dialog.showErrorBox("\u6574\u7406\u5931\u8d25", cause instanceof Error ? cause.message : String(cause));
                finish(null);
              });
          },
        },
        { type: "separator" },
        {
          label: "\u5220\u9664",
          click: () => {
            void confirmDeleteDocument(ctx, document.title, document.file_name)
              .then(async (mode) => {
                if (!mode) {
                  finish(null);
                  return;
                }
                await deleteDocumentById(ctx, documentId, mode);
                finish({ action: "delete", documentId, mode });
              })
              .catch((cause) => {
                dialog.showErrorBox("\u5220\u9664\u5931\u8d25", cause instanceof Error ? cause.message : String(cause));
                finish(null);
              });
          },
        },
      ]);
      menu.popup({
        window: ctx.window,
        callback: () => finish(null),
      });
    });
  });

  ipcMain.handle("documents:delete", async (_event, documentId: string, mode: DeleteMode = "file") => {
    await deleteDocumentById(ctx, documentId, mode);
  });

  ipcMain.handle("notes:save", (_event, documentId: string, content: string) => {
    const document = ctx.getDocument(documentId);
    const timestamp = ctx.now();
    ctx.store.notes[documentId] = { content: String(content || ""), updated_at: timestamp };
    document.updated_at = timestamp;
    ctx.saveStore();
    return content;
  });

  ipcMain.handle("summary:save", (_event, documentId: string, content: string) => {
    const document = ctx.getDocument(documentId);
    const timestamp = ctx.now();
    ctx.store.summaries[documentId] = { content: String(content || ""), updated_at: timestamp };
    document.updated_at = timestamp;
    ctx.saveStore();
    return content;
  });

  ipcMain.handle("symbols:save", async (_event, documentId: string, symbols: unknown[]) => {
    const document = ctx.getDocument(documentId);
    const timestamp = ctx.now();
    ctx.store.symbols[documentId] = (Array.isArray(symbols) ? symbols : [])
      .map(cleanSymbolDefinition)
      .filter((symbol): symbol is NonNullable<ReturnType<typeof cleanSymbolDefinition>> => Boolean(symbol))
      .map((symbol) => ({ ...symbol, updated_at: symbol.updated_at || timestamp }));
    document.updated_at = timestamp;
    ctx.saveStore();
    await saveReaderPackageSnapshot(ctx, documentId);
    return ctx.store.symbols[documentId];
  });

  ipcMain.handle("formulas:list", (_event, documentId: string) => {
    ctx.getDocument(documentId);
    return ctx.store.formulas[documentId] || [];
  });

  ipcMain.handle("formulas:save", async (_event, documentId: string, formulas: unknown[]) => {
    const document = ctx.getDocument(documentId);
    const timestamp = ctx.now();
    ctx.store.formulas[documentId] = (Array.isArray(formulas) ? formulas : [])
      .map((formula) => cleanFormulaAnalysis(formula, documentId))
      .filter((formula): formula is StoredFormulaAnalysis => Boolean(formula))
      .map((formula) => ({
        ...formula,
        created_at: formula.created_at || timestamp,
        updated_at: formula.updated_at || timestamp,
      }));
    document.updated_at = timestamp;
    ctx.saveStore();
    await saveReaderPackageSnapshot(ctx, documentId);
    return ctx.store.formulas[documentId];
  });
}
