import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { app, dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import { readReaderPackageBuffer } from "../ReaderPackageService.js";
import { arxivProgress, extractArxivLatexSource, fetchArxivBuffer, normalizeArxivId, verifyArxivEntry, type ArxivProgress } from "../services/ArxivService.js";
import { normalizeMarkdownAssetPath } from "../services/AssetService.js";
import { createReadermPackageBuffer, readReadermPackageBuffer } from "../services/ReadermPackageService.js";
import { searchLibrary } from "../services/LibrarySearchService.js";
import type { StoredAnchor, StoredAnnotation } from "../storeMigration.js";
import type { DbDocument, IpcContext } from "./storeContext.js";

type ArxivImportOptions = {
  includeSource?: boolean;
  requestId?: string;
};

async function createReadermSnapshot(ctx: IpcContext, document: DbDocument, markdown: string) {
  const { references } = ctx.buildReadermReferenceContext(markdown);
  const referencedIds = new Set(references.map((reference) => reference.document_id));
  const documents = [
    document,
    ...ctx.store.documents.filter((item) => referencedIds.has(item.document_id) && item.document_id !== document.document_id),
  ];
  const pdfDataByDocumentId: Record<string, Buffer> = {};
  const latexDataByDocumentId: Record<string, Buffer> = {};
  for (const item of documents) {
    if (item.source_type !== "markdown" && item.source_type !== "readerm" && existsSync(item.file_path)) {
      pdfDataByDocumentId[item.document_id] = readFileSync(item.file_path);
    }
    if (item.latex_path && existsSync(item.latex_path)) {
      latexDataByDocumentId[item.document_id] = readFileSync(item.latex_path);
    }
  }
  return createReadermPackageBuffer({
    document,
    markdown,
    references,
    documents,
    anchors: ctx.store.anchors.filter((anchor) => referencedIds.has(anchor.document_id)),
    annotations: ctx.store.annotations.filter((annotation) => referencedIds.has(annotation.document_id)),
    symbols: [...referencedIds].flatMap((id) => ctx.store.symbols[id] || []),
    pdfDataByDocumentId,
    latexDataByDocumentId,
    assets: ctx.packageAssetsForDocument(document.document_id, markdown),
  });
}

async function createReaderPFromPdfPath(ctx: IpcContext, source: string) {
  const id = randomUUID();
  const originalName = basename(source);
  const title = originalName.replace(new RegExp(`${extname(originalName)}$`), "");
  const target = join(ctx.libraryDir, `${id}.pdf`);
  writeFileSync(target, readFileSync(source));
  const timestamp = ctx.now();
  const document: DbDocument = {
    document_id: id,
    title,
    file_name: originalName,
    file_path: target,
    file_size: statSync(target).size,
    source_type: "pdf",
    created_at: timestamp,
    updated_at: timestamp,
  };
  ctx.store.documents.unshift(document);
  ctx.store.notes[id] = { content: "", updated_at: timestamp };
  ctx.store.summaries[id] = { content: "", updated_at: timestamp };
  ctx.store.ai_history[id] = [];
  ctx.store.symbols[id] = [];
  await ctx.saveReaderPackageForDocument({
    document,
    defaultPath: join(dirname(source), `${title}.readerp`),
    note: "",
    summary: "",
    aiHistory: [],
    anchors: [],
    annotations: [],
    symbols: [],
    pdfData: readFileSync(target),
  });
  ctx.saveStore();
  return document;
}

async function createReaderMFromMarkdownPath(ctx: IpcContext, source: string) {
  const markdown = readFileSync(source, "utf8");
  const originalName = basename(source);
  const title = originalName.replace(new RegExp(`${extname(originalName)}$`), "");
  const id = randomUUID();
  const target = join(ctx.libraryDir, `${id}.md`);
  writeFileSync(target, markdown, "utf8");
  const timestamp = ctx.now();
  const document: DbDocument = {
    document_id: id,
    title,
    file_name: `${title}.readerm`,
    file_path: target,
    file_size: statSync(target).size,
    source_type: "readerm",
    created_at: timestamp,
    updated_at: timestamp,
  };
  ctx.store.documents.unshift(document);
  ctx.store.notes[id] = { content: markdown, updated_at: timestamp };
  ctx.store.summaries[id] = { content: "", updated_at: timestamp };
  ctx.store.ai_history[id] = [];
  ctx.store.symbols[id] = [];
  const saveResult = await dialog.showSaveDialog(ctx.window, {
    title: "Save ReaderM",
    defaultPath: join(dirname(source), `${title}.readerm`),
    filters: [{ name: "ReaderM", extensions: ["readerm"] }],
  });
  if (!saveResult.canceled && saveResult.filePath) {
    const buffer = await createReadermSnapshot(ctx, document, markdown);
    writeFileSync(saveResult.filePath, buffer);
    document.package_path = saveResult.filePath;
  }
  ctx.saveStore();
  return document;
}

async function importReaderPFromPath(ctx: IpcContext, source: string) {
  const packageData = await readReaderPackageBuffer(readFileSync(source));
  const timestamp = ctx.now();
  const id = packageData.packageMode === "markdown-centered" ? packageData.document.document_id : randomUUID();
  const target = packageData.pdfData ? join(ctx.libraryDir, `${id}.pdf`) : join(ctx.libraryDir, `${id}.md`);
  if (packageData.pdfData) {
    writeFileSync(target, packageData.pdfData);
  } else {
    writeFileSync(target, packageData.note || packageData.summary || "", "utf8");
  }
  const latexTarget = packageData.latexData ? ctx.latexTargetPath(id) : undefined;
  if (packageData.latexData && latexTarget) writeFileSync(latexTarget, packageData.latexData);
  const document: DbDocument = {
    document_id: id,
    title: packageData.manifest.title || basename(source, extname(source)),
    file_name: packageData.manifest.file_name || basename(source),
    file_path: target,
    file_size: statSync(target).size,
    source_type: packageData.pdfData ? "readerp" : "markdown",
    readerp_path: source,
    latex_path: latexTarget,
    latex_file_name: packageData.document.latex_file_name,
    created_at: timestamp,
    updated_at: timestamp,
  };
  ctx.store.documents.unshift(document);
  if (packageData.packageMode === "markdown-centered") {
    for (const packageDocument of packageData.documents || []) {
      if (packageDocument.document_id === id || ctx.store.documents.some((item) => item.document_id === packageDocument.document_id)) continue;
      const pdfData = packageData.pdfDataByDocumentId[packageDocument.document_id];
      const filePath = pdfData ? join(ctx.libraryDir, `${packageDocument.document_id}.pdf`) : join(ctx.libraryDir, `${packageDocument.document_id}.md`);
      const latexData = packageData.latexDataByDocumentId[packageDocument.document_id];
      const packageLatexTarget = latexData ? ctx.latexTargetPath(packageDocument.document_id) : undefined;
      if (pdfData) writeFileSync(filePath, pdfData);
      else writeFileSync(filePath, "", "utf8");
      if (latexData && packageLatexTarget) writeFileSync(packageLatexTarget, latexData);
      ctx.store.documents.push({
        ...packageDocument,
        file_path: filePath,
        file_size: existsSync(filePath) ? statSync(filePath).size : packageDocument.file_size,
        source_type: pdfData ? "readerp" : packageDocument.source_type,
        readerp_path: source,
        latex_path: packageLatexTarget,
      });
    }
  }
  ctx.store.notes[id] = { content: packageData.note, updated_at: timestamp };
  ctx.store.summaries[id] = { content: packageData.summary, updated_at: timestamp };
  ctx.store.ai_history[id] = packageData.aiHistory;
  ctx.store.symbols[id] = (packageData.symbols || []) as typeof ctx.store.symbols[string];
  for (const asset of packageData.assets) {
    ctx.createAssetRecord(
      id,
      basename(normalizeMarkdownAssetPath(`assets/${asset.file_name}`)),
      asset.mime_type,
      asset.data,
      asset.original_name || asset.file_name,
    );
  }
  ctx.store.anchors.push(...(packageData.anchors as StoredAnchor[]).map((anchor) => packageData.packageMode === "markdown-centered" ? anchor : { ...anchor, document_id: id }));
  ctx.store.annotations.push(...(packageData.annotations as StoredAnnotation[]).map((annotation) => packageData.packageMode === "markdown-centered" ? annotation : { ...annotation, document_id: id }));
  ctx.saveStore();
  return document;
}

async function importReaderMFromPath(ctx: IpcContext, source: string) {
  const packageData = await readReadermPackageBuffer(readFileSync(source));
  const timestamp = ctx.now();
  const id = ctx.store.documents.some((item) => item.document_id === packageData.document.document_id)
    ? randomUUID()
    : packageData.document.document_id;
  const target = join(ctx.libraryDir, `${id}.md`);
  writeFileSync(target, packageData.markdown, "utf8");
  const document: DbDocument = {
    document_id: id,
    title: packageData.manifest.title || basename(source, extname(source)),
    file_name: packageData.manifest.file_name || basename(source),
    file_path: target,
    file_size: statSync(target).size,
    source_type: "readerm",
    package_path: source,
    created_at: timestamp,
    updated_at: timestamp,
  };
  ctx.store.documents.unshift(document);
  for (const packageDocument of packageData.documents || []) {
    if (packageDocument.document_id === packageData.document.document_id || ctx.store.documents.some((item) => item.document_id === packageDocument.document_id)) continue;
    const pdfData = packageData.pdfDataByDocumentId[packageDocument.document_id];
    const filePath = pdfData ? join(ctx.libraryDir, `${packageDocument.document_id}.pdf`) : join(ctx.libraryDir, `${packageDocument.document_id}.md`);
    const latexData = packageData.latexDataByDocumentId[packageDocument.document_id];
    const latexTarget = latexData ? ctx.latexTargetPath(packageDocument.document_id) : undefined;
    if (pdfData) writeFileSync(filePath, pdfData);
    else writeFileSync(filePath, "", "utf8");
    if (latexData && latexTarget) writeFileSync(latexTarget, latexData);
    ctx.store.documents.push({
      ...packageDocument,
      file_path: filePath,
      file_size: existsSync(filePath) ? statSync(filePath).size : packageDocument.file_size,
      source_type: pdfData ? "readerp" : packageDocument.source_type,
      readerp_path: source,
      latex_path: latexTarget,
    } as DbDocument);
  }
  ctx.store.notes[id] = { content: packageData.markdown, updated_at: timestamp };
  ctx.store.summaries[id] = { content: "", updated_at: timestamp };
  ctx.store.ai_history[id] = [];
  ctx.store.symbols[id] = [];
  for (const asset of packageData.assets) {
    ctx.createAssetRecord(
      id,
      basename(normalizeMarkdownAssetPath(`assets/${asset.file_name}`)),
      asset.mime_type,
      asset.data,
      asset.original_name || asset.file_name,
    );
  }
  const existingAnchors = new Set(ctx.store.anchors.map((anchor) => `${anchor.document_id}:${anchor.anchor_id}`));
  const existingAnnotations = new Set(ctx.store.annotations.map((annotation) => `${annotation.document_id}:${annotation.annotation_id}`));
  ctx.store.anchors.push(...(packageData.anchors as StoredAnchor[]).filter((anchor) => !existingAnchors.has(`${anchor.document_id}:${anchor.anchor_id}`)));
  ctx.store.annotations.push(...(packageData.annotations as StoredAnnotation[]).filter((annotation) => !existingAnnotations.has(`${annotation.document_id}:${annotation.annotation_id}`)));
  ctx.saveStore();
  return document;
}

export async function importSupportedFileFromPath(ctx: IpcContext, rawPath: string) {
  const source = String(rawPath || "");
  if (!source || !existsSync(source) || !statSync(source).isFile()) {
    throw new Error("File is not available.");
  }
  const extension = extname(source).toLowerCase();
  if (extension === ".pdf") return createReaderPFromPdfPath(ctx, source);
  if (extension === ".md" || extension === ".markdown") return createReaderMFromMarkdownPath(ctx, source);
  if (extension === ".readerp") return importReaderPFromPath(ctx, source);
  if (extension === ".readerm") return importReaderMFromPath(ctx, source);
  throw new Error("Open a .pdf, .md, .readerp, or .readerm file.");
}

export function registerLibraryIpc(ctx: IpcContext) {
  ipcMain.handle("library:import-pdf", async () => {
    const result = await dialog.showOpenDialog(ctx.window, {
      title: "Import PDF",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const source = result.filePaths[0];
    const id = randomUUID();
    const originalName = basename(source);
    const title = originalName.replace(new RegExp(`${extname(originalName)}$`), "");
    const target = join(ctx.libraryDir, `${id}.pdf`);
    writeFileSync(target, readFileSync(source));
    const timestamp = ctx.now();
    const document: DbDocument = {
      document_id: id,
      title,
      file_name: originalName,
      file_path: target,
      file_size: statSync(target).size,
      source_type: "pdf",
      created_at: timestamp,
      updated_at: timestamp,
    };
    ctx.store.documents.unshift(document);
    ctx.store.notes[id] = { content: "", updated_at: timestamp };
    ctx.store.summaries[id] = { content: "", updated_at: timestamp };
    ctx.store.ai_history[id] = [];
    ctx.store.symbols[id] = [];
    await ctx.saveReaderPackageForDocument({
      document,
      defaultPath: join(dirname(source), `${title}.readerp`),
      note: "",
      summary: "",
      aiHistory: [],
      anchors: [],
      annotations: [],
      symbols: [],
      pdfData: readFileSync(target),
    });
    ctx.saveStore();
    return document;
  });

  async function importArxivDocument(
    event: IpcMainInvokeEvent,
    rawId: string,
    options: ArxivImportOptions = {},
  ) {
    const sendProgress = (progress: ArxivProgress) => {
      if (!options.requestId) return;
      event.sender.send(`library:import-arxiv:progress:${options.requestId}`, progress);
    };
    const arxivId = normalizeArxivId(String(rawId || ""));
    const includeSource = options?.includeSource !== false;
    const settings = ctx.getSettings();
    sendProgress(arxivProgress("checking", "Checking arXiv entry"));
    await verifyArxivEntry(arxivId, settings);
    const pdfData = await fetchArxivBuffer(`https://arxiv.org/pdf/${arxivId}`, "arXiv PDF", {
      settings,
      onProgress: (progress) => sendProgress(arxivProgress("downloading-pdf", "Downloading PDF", progress)),
    });
    const id = randomUUID();
    const safeId = arxivId.replace(/[\/\\:]/g, "_");
    const title = `arXiv ${arxivId}`;
    const pdfName = `${safeId}.pdf`;
    const target = join(ctx.libraryDir, `${id}.pdf`);
    sendProgress(arxivProgress("saving", "Saving PDF"));
    writeFileSync(target, pdfData);
    const timestamp = ctx.now();
    let latexPath: string | undefined;
    let latexFileName: string | undefined;
    let latexData: Buffer | undefined;
    let sourceNotice = "";
    if (includeSource) {
      try {
        const sourceData = await fetchArxivBuffer(`https://arxiv.org/e-print/${arxivId}`, "arXiv source", {
          settings,
          onProgress: (progress) => sendProgress(arxivProgress("downloading-source", "Downloading LaTeX source", progress)),
        });
        sendProgress(arxivProgress("extracting-source", "Extracting LaTeX source"));
        const extracted = extractArxivLatexSource(sourceData, safeId);
        latexData = extracted.latexData;
        latexFileName = extracted.latexFileName;
        sourceNotice = extracted.notice;
        if (latexData && latexFileName) {
          latexPath = ctx.latexTargetPath(id);
          writeFileSync(latexPath, latexData);
        }
      } catch (cause) {
        sourceNotice = ` Source download skipped: ${cause instanceof Error ? cause.message : String(cause)}`;
      }
    } else {
      sourceNotice = " Source download skipped: PDF only.";
    }
    const document: DbDocument = {
      document_id: id,
      title,
      file_name: pdfName,
      file_path: target,
      file_size: statSync(target).size,
      source_type: "pdf",
      latex_path: latexPath,
      latex_file_name: latexFileName,
      created_at: timestamp,
      updated_at: timestamp,
    };
    ctx.store.documents.unshift(document);
    ctx.store.notes[id] = { content: `Imported from arXiv: ${arxivId}${sourceNotice}`, updated_at: timestamp };
    ctx.store.summaries[id] = { content: "", updated_at: timestamp };
    ctx.store.ai_history[id] = [];
    ctx.store.symbols[id] = [];
    await ctx.saveReaderPackageForDocument({
      document,
      defaultPath: join(app.getPath("documents"), `${safeId}.readerp`),
      note: ctx.store.notes[id].content,
      summary: "",
      aiHistory: [],
      anchors: [],
      annotations: [],
      symbols: [],
      pdfData,
      latexData,
    });
    ctx.saveStore();
    sendProgress(arxivProgress("done", "Import complete"));
    return document;
  }

  ipcMain.handle("library:import-arxiv", importArxivDocument);

  ipcMain.handle("library:import-dropped-file", async (_event, rawPath: string) => {
    return importSupportedFileFromPath(ctx, rawPath);
  });

  ipcMain.handle("library:list-documents", () => {
    return [...ctx.store.documents].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  });

  ipcMain.handle("library:search", (_event, query: string) => {
    return searchLibrary(ctx.store, query);
  });
}
