import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dialog, ipcMain } from "electron";
import { dialogLabel } from "../i18n.js";
import {
  createReadermPackageBuffer,
  readReadermPackageBuffer,
  type ReadermReference,
} from "../services/ReadermPackageService.js";
import { mimeTypeForImagePath, normalizeMarkdownAssetPath, sanitizeAssetFileName } from "../services/AssetService.js";
import { normalizeMarkdownUnorderedListIndent } from "../../shared/MarkdownListNormalizationService.js";
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

async function fileSize(filePath: string) {
  return (await stat(filePath)).size;
}

async function readReferencedFiles(documents: DbDocument[]) {
  const pdfDataByDocumentId: Record<string, Buffer> = {};
  const latexDataByDocumentId: Record<string, Buffer> = {};
  for (const document of documents) {
    if (document.source_type !== "markdown" && document.source_type !== "readerm" && existsSync(document.file_path)) {
      pdfDataByDocumentId[document.document_id] = await readFile(document.file_path);
    }
    if (document.latex_path && existsSync(document.latex_path)) {
      latexDataByDocumentId[document.document_id] = await readFile(document.latex_path);
    }
  }
  return { pdfDataByDocumentId, latexDataByDocumentId };
}

async function confirmExportAnchors(ctx: IpcContext) {
  const language = ctx.getSettings().ui_language;
  const result = await dialog.showMessageBox(ctx.window, {
    type: "question",
    buttons: [
      dialogLabel(language, "button.keepAnchors"),
      dialogLabel(language, "button.removeAnchors"),
      dialogLabel(language, "button.cancel"),
    ],
    defaultId: 0,
    cancelId: 2,
    message: dialogLabel(language, "dialog.exportAnchors.message"),
    detail: dialogLabel(language, "dialog.exportAnchors.detail"),
  });
  if (result.response === 0) return true;
  if (result.response === 1) return false;
  return null;
}

async function createReadermSnapshot(ctx: IpcContext, document: DbDocument, markdown: string, keepAnchors = true) {
  const { references } = ctx.buildReadermReferenceContext(markdown);
  const documents = referencedDocuments(ctx, references, document);
  const { pdfDataByDocumentId, latexDataByDocumentId } = await readReferencedFiles(documents);
  const referencedIds = new Set(references.map((reference) => reference.document_id));
  return createReadermPackageBuffer({
    document,
    markdown,
    references,
    documents,
    anchors: keepAnchors ? ctx.store.anchors.filter((anchor) => referencedIds.has(anchor.document_id)) : [],
    annotations: keepAnchors ? ctx.store.annotations.filter((annotation) => referencedIds.has(annotation.document_id)) : [],
    symbols: [...referencedIds].flatMap((id) => ctx.store.symbols[id] || []),
    formulas: [...referencedIds].flatMap((id) => ctx.store.formulas[id] || []),
    pdfDataByDocumentId,
    latexDataByDocumentId,
    assets: await ctx.packageAssetsForDocumentAsync(document.document_id, markdown),
  });
}

async function createReadermDocument(ctx: IpcContext, title: string, markdown: string) {
  const id = randomUUID();
  const target = join(ctx.libraryDir, `${id}.md`);
  await writeFile(target, markdown, "utf8");
  const timestamp = ctx.now();
  const document: DbDocument = {
    document_id: id,
    title,
    file_name: `${title}.readerm`,
    file_path: target,
    file_size: await fileSize(target),
    source_type: "readerm",
    created_at: timestamp,
    updated_at: timestamp,
  };
  ctx.store.documents.unshift(document);
  ctx.store.notes[id] = { content: markdown, updated_at: timestamp };
  ctx.store.summaries[id] = { content: "", updated_at: timestamp };
  ctx.store.ai_history[id] = [];
  ctx.store.symbols[id] = [];
  ctx.store.formulas[id] = [];
  return document;
}

function readermDefaultPathFromDocument(document: DbDocument) {
  const baseName = basename(document.file_name || document.file_path || packageDefaultName(document), extname(document.file_name || document.file_path || ""));
  const safeName = (baseName || document.title || "reader-markdown").replace(/[<>:"/\\|?*]+/g, "_");
  const sourceDir = document.source_path ? dirname(document.source_path) : document.file_path ? dirname(document.file_path) : undefined;
  return sourceDir ? join(sourceDir, `${safeName}.readerm`) : `${safeName}.readerm`;
}

function sourceBaseDir(document: DbDocument) {
  return dirname(document.source_path || document.file_path);
}

function localImagePathFromMarkdownUrl(rawUrl: string, document: DbDocument) {
  const withoutQuery = String(rawUrl || "").trim().split(/[?#]/)[0];
  if (!withoutQuery || /^(https?:|data:|readerp:|readerm:|\/reader\?)/i.test(withoutQuery)) return "";
  try {
    if (/^file:\/\//i.test(withoutQuery)) return fileURLToPath(withoutQuery);
  } catch {
    return "";
  }
  const decoded = decodeURIComponent(withoutQuery);
  return isAbsolute(decoded) ? decoded : resolve(sourceBaseDir(document), decoded);
}

async function cloneReferencedAsset(ctx: IpcContext, sourceDocument: DbDocument, targetDocument: DbDocument, assetPath: string) {
  const normalized = normalizeMarkdownAssetPath(assetPath);
  if (!normalized) return false;
  const fileName = basename(normalized);
  const asset = ctx.listAssets(sourceDocument.document_id).find((item) => item.file_name === fileName);
  if (asset && existsSync(asset.path)) {
    await ctx.createAssetRecordAsync(targetDocument.document_id, asset.file_name, asset.mime_type, await readFile(asset.path), asset.original_name);
    return true;
  }
  const sourcePath = resolve(sourceBaseDir(sourceDocument), normalized);
  const mimeType = mimeTypeForImagePath(sourcePath);
  if (!mimeType || !existsSync(sourcePath) || !(await stat(sourcePath)).isFile()) return false;
  await ctx.createAssetRecordAsync(targetDocument.document_id, fileName, mimeType, await readFile(sourcePath), basename(sourcePath));
  return true;
}

async function copyLocalMarkdownImagesToReaderm(ctx: IpcContext, sourceDocument: DbDocument, targetDocument: DbDocument, markdown: string) {
  let output = "";
  let lastIndex = 0;
  const source = String(markdown || "");
  const pattern = /!\[([^\]]*)\]\(([^)\s]+)([^)]*)\)/g;
  for (const match of source.matchAll(pattern)) {
    const full = match[0];
    const alt = match[1] || "";
    const rawUrl = match[2] || "";
    const suffix = match[3] || "";
    output += source.slice(lastIndex, match.index || 0);
    lastIndex = (match.index || 0) + full.length;
    const normalizedAssetPath = normalizeMarkdownAssetPath(rawUrl);
    if (normalizedAssetPath) {
      await cloneReferencedAsset(ctx, sourceDocument, targetDocument, normalizedAssetPath);
      output += full;
      continue;
    }
    const imagePath = localImagePathFromMarkdownUrl(rawUrl, sourceDocument);
    const mimeType = imagePath ? mimeTypeForImagePath(imagePath) : "";
    if (!mimeType || !existsSync(imagePath) || !(await stat(imagePath)).isFile()) {
      output += full;
      continue;
    }
    const asset = await ctx.createAssetRecordAsync(
      targetDocument.document_id,
      sanitizeAssetFileName(basename(imagePath)),
      mimeType,
      await readFile(imagePath),
      basename(imagePath),
    );
    output += `![${alt}](assets/${asset.file_name}${suffix || ""})`;
  }
  return `${output}${source.slice(lastIndex)}`;
}

export function registerReadermIpc(ctx: IpcContext) {
  ipcMain.handle("readerm:create-empty", async () => {
    const document = await createReadermDocument(ctx, "Untitled ReaderM", "");
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
    const markdown = normalizeMarkdownUnorderedListIndent(await readFile(source, "utf8"));
    const originalName = basename(source);
    const title = originalName.replace(new RegExp(`${extname(originalName)}$`), "");
    const document = await createReadermDocument(ctx, title, markdown);
    const saveResult = await dialog.showSaveDialog(ctx.window, {
      title: "Save ReaderM",
      defaultPath: join(dirname(source), `${title}.readerm`),
      filters: [{ name: "ReaderM", extensions: ["readerm"] }],
    });
    if (!saveResult.canceled && saveResult.filePath) {
      const buffer = await createReadermSnapshot(ctx, document, markdown);
      await writeFile(saveResult.filePath, buffer);
      document.package_path = saveResult.filePath;
      document.file_name = basename(saveResult.filePath);
    }
    ctx.saveStore();
    return document;
  });

  ipcMain.handle("readerm:upgrade-markdown-copy", async (_event, documentId: string, markdown?: string) => {
    const sourceDocument = ctx.getDocument(documentId);
    if (sourceDocument.source_type !== "markdown") throw new Error("Open a Markdown document before upgrading to ReaderM.");
    const content = typeof markdown === "string" ? markdown : ctx.store.notes[documentId]?.content || "";
    const document = await createReadermDocument(ctx, sourceDocument.title, content);
    const packagedContent = await copyLocalMarkdownImagesToReaderm(ctx, sourceDocument, document, content);
    if (packagedContent !== content) {
      const timestamp = ctx.now();
      await writeFile(document.file_path, packagedContent, "utf8");
      document.file_size = await fileSize(document.file_path);
      document.updated_at = timestamp;
      ctx.store.notes[document.document_id] = { content: packagedContent, updated_at: timestamp };
    }
    const saveResult = await dialog.showSaveDialog(ctx.window, {
      title: "Save ReaderM",
      defaultPath: readermDefaultPathFromDocument(sourceDocument),
      filters: [{ name: "ReaderM", extensions: ["readerm"] }],
    });
    if (!saveResult.canceled && saveResult.filePath) {
      const buffer = await createReadermSnapshot(ctx, document, packagedContent);
      await writeFile(saveResult.filePath, buffer);
      document.package_path = saveResult.filePath;
      document.file_name = basename(saveResult.filePath);
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
    const packageData = await readReadermPackageBuffer(await readFile(source));
    const markdown = normalizeMarkdownUnorderedListIndent(packageData.markdown);
    const timestamp = ctx.now();
    const id = ctx.store.documents.some((item) => item.document_id === packageData.document.document_id)
      ? randomUUID()
      : packageData.document.document_id;
    const target = join(ctx.libraryDir, `${id}.md`);
    await writeFile(target, markdown, "utf8");
    const document: DbDocument = {
      document_id: id,
      title: packageData.manifest.title || basename(source, extname(source)),
      file_name: basename(source),
      file_path: target,
      file_size: await fileSize(target),
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
      if (pdfData) await writeFile(filePath, pdfData);
      else await writeFile(filePath, "", "utf8");
      if (latexData && latexTarget) await writeFile(latexTarget, latexData);
      ctx.store.documents.push({
        ...packageDocument,
        file_path: filePath,
        file_size: existsSync(filePath) ? await fileSize(filePath) : packageDocument.file_size,
        source_type: pdfData ? "readerp" : packageDocument.source_type,
        readerp_path: source,
        latex_path: latexTarget,
      } as DbDocument);
    }
    ctx.store.notes[id] = { content: markdown, updated_at: timestamp };
    ctx.store.summaries[id] = { content: "", updated_at: timestamp };
    ctx.store.ai_history[id] = [];
    ctx.store.symbols[id] = [];
    ctx.store.formulas[id] = [];
    for (const formula of (packageData.formulas || []) as typeof ctx.store.formulas[string]) {
      const targetDocumentId = formula.document_id || id;
      ctx.store.formulas[targetDocumentId] = [
        ...(ctx.store.formulas[targetDocumentId] || []).filter((item) => item.formula_id !== formula.formula_id),
        formula,
      ];
    }
    for (const asset of packageData.assets) {
      await ctx.createAssetRecordAsync(
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
    await writeFile(result.filePath, buffer);
    document.package_path = result.filePath;
    document.file_name = basename(result.filePath);
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
    document.file_name = basename(targetPath);
    await writeFile(document.file_path, String(markdown || ""), "utf8");
    const buffer = await createReadermSnapshot(ctx, document, String(markdown || ""));
    await writeFile(targetPath, buffer);
    ctx.saveStore();
    return targetPath;
  });
}
