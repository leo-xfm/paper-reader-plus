import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { dialog, ipcMain } from "electron";
import {
  createReadermPackageBuffer,
  readReadermPackageBuffer,
  type ReadermReference,
} from "../services/ReadermPackageService.js";
import { normalizeMarkdownAssetPath } from "../services/AssetService.js";
import type { StoredAnchor, StoredAnnotation } from "../storeMigration.js";
import type { DbDocument, IpcContext } from "./storeContext.js";

function packageDefaultName(document: DbDocument) {
  const title = (document.title || "reader-markdown").replace(/[<>:"/\\|?*]+/g, "_");
  return `${title}.readerm`;
}

function referencedDocuments(ctx: IpcContext, references: ReadermReference[], document: DbDocument) {
  const ids = new Set(references.map((reference) => reference.document_id));
  const documents = ctx.store.documents.filter((item) => ids.has(item.document_id));
  return [document, ...documents.filter((item) => item.document_id !== document.document_id)];
}

function readReferencedFiles(documents: DbDocument[]) {
  const pdfDataByDocumentId: Record<string, Buffer> = {};
  const latexDataByDocumentId: Record<string, Buffer> = {};
  for (const document of documents) {
    if (document.source_type !== "markdown" && document.source_type !== "readerm" && existsSync(document.file_path)) {
      pdfDataByDocumentId[document.document_id] = readFileSync(document.file_path);
    }
    if (document.latex_path && existsSync(document.latex_path)) {
      latexDataByDocumentId[document.document_id] = readFileSync(document.latex_path);
    }
  }
  return { pdfDataByDocumentId, latexDataByDocumentId };
}

async function confirmExportAnchors(ctx: IpcContext) {
  const result = await dialog.showMessageBox(ctx.window, {
    type: "question",
    buttons: ["Keep anchors", "Remove anchors", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message: "Export anchors?",
    detail: "Choose whether this exported ReaderM should include reader anchors and annotations. Removing anchors does not change local data.",
  });
  if (result.response === 0) return true;
  if (result.response === 1) return false;
  return null;
}

async function createReadermSnapshot(ctx: IpcContext, document: DbDocument, markdown: string, keepAnchors = true) {
  const { references } = ctx.buildReadermReferenceContext(markdown);
  const documents = referencedDocuments(ctx, references, document);
  const { pdfDataByDocumentId, latexDataByDocumentId } = readReferencedFiles(documents);
  const referencedIds = new Set(references.map((reference) => reference.document_id));
  return createReadermPackageBuffer({
    document,
    markdown,
    references,
    documents,
    anchors: keepAnchors ? ctx.store.anchors.filter((anchor) => referencedIds.has(anchor.document_id)) : [],
    annotations: keepAnchors ? ctx.store.annotations.filter((annotation) => referencedIds.has(annotation.document_id)) : [],
    symbols: [...referencedIds].flatMap((id) => ctx.store.symbols[id] || []),
    pdfDataByDocumentId,
    latexDataByDocumentId,
    assets: ctx.packageAssetsForDocument(document.document_id, markdown),
  });
}

function createReadermDocument(ctx: IpcContext, title: string, markdown: string) {
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
  return document;
}

export function registerReadermIpc(ctx: IpcContext) {
  ipcMain.handle("readerm:create-empty", async () => {
    const document = createReadermDocument(ctx, "Untitled ReaderM", "");
    ctx.saveStore();
    return document;
  });

  ipcMain.handle("readerm:create-from-markdown", async () => {
    const result = await dialog.showOpenDialog(ctx.window, {
      title: "Create ReaderM From Markdown",
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const source = result.filePaths[0];
    const markdown = readFileSync(source, "utf8");
    const originalName = basename(source);
    const title = originalName.replace(new RegExp(`${extname(originalName)}$`), "");
    const document = createReadermDocument(ctx, title, markdown);
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
  });

  ipcMain.handle("readerm:import", async () => {
    const result = await dialog.showOpenDialog(ctx.window, {
      title: "Import ReaderM",
      filters: [{ name: "ReaderM", extensions: ["readerm"] }],
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const source = result.filePaths[0];
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
  });

  ipcMain.handle("readerm:export-current", async (_event, documentId: string, markdown?: string) => {
    const document = ctx.getDocument(documentId);
    if (document.source_type !== "readerm") throw new Error("Open a ReaderM document before exporting ReaderM.");
    const content = typeof markdown === "string" ? markdown : ctx.store.notes[documentId]?.content || "";
    const keepAnchors = await confirmExportAnchors(ctx);
    if (keepAnchors === null) return null;
    const result = await dialog.showSaveDialog(ctx.window, {
      title: "Export ReaderM",
      defaultPath: packageDefaultName(document),
      filters: [{ name: "ReaderM", extensions: ["readerm"] }],
    });
    if (result.canceled || !result.filePath) return null;
    const buffer = await createReadermSnapshot(ctx, document, content, keepAnchors);
    writeFileSync(result.filePath, buffer);
    document.package_path = result.filePath;
    ctx.saveStore();
    return result.filePath;
  });

  ipcMain.handle("readerm:save-current", async (_event, documentId: string, markdown: string) => {
    const document = ctx.getDocument(documentId);
    if (document.source_type !== "readerm") throw new Error("Open a ReaderM document before saving ReaderM.");
    let targetPath = document.package_path;
    if (!targetPath) {
      const result = await dialog.showSaveDialog(ctx.window, {
        title: "Save ReaderM",
        defaultPath: packageDefaultName(document),
        filters: [{ name: "ReaderM", extensions: ["readerm"] }],
      });
      if (result.canceled || !result.filePath) return null;
      targetPath = result.filePath;
    }
    const timestamp = ctx.now();
    ctx.store.notes[documentId] = { content: String(markdown || ""), updated_at: timestamp };
    document.updated_at = timestamp;
    document.package_path = targetPath;
    writeFileSync(document.file_path, String(markdown || ""), "utf8");
    const buffer = await createReadermSnapshot(ctx, document, String(markdown || ""));
    writeFileSync(targetPath, buffer);
    ctx.saveStore();
    return targetPath;
  });
}
