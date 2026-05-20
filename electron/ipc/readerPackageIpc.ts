import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { dialog, ipcMain } from "electron";
import { createReaderPackageBuffer, readReaderPackageBuffer } from "../ReaderPackageService.js";
import { dialogLabel } from "../i18n.js";
import { normalizeMarkdownAssetPath } from "../services/AssetService.js";
import type { StoredAnchor, StoredAnnotation } from "../storeMigration.js";
import type { DbDocument, IpcContext } from "./storeContext.js";

async function fileSize(filePath: string) {
  return (await stat(filePath)).size;
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

export function registerReaderPackageIpc(ctx: IpcContext) {
  ipcMain.handle("readerp:export-current", async (_event, documentId: string, aiHistory: Array<{ role: "user" | "assistant"; content: string }> = []) => {
    const document = ctx.getDocument(documentId);
    const keepAnchors = await confirmExportAnchors(ctx);
    if (keepAnchors === null) return null;
    const result = await dialog.showSaveDialog(ctx.window, {
      title: "Export Reader Package",
      defaultPath: `${document.title || "paper"}.readerp`,
      filters: [{ name: "Reader Package", extensions: ["readerp"] }],
    });
    if (result.canceled || !result.filePath) return null;
    const pdfData = existsSync(document.file_path) && document.source_type !== "markdown"
      ? await readFile(document.file_path)
      : undefined;
    const latexData = document.latex_path && existsSync(document.latex_path) ? await readFile(document.latex_path) : undefined;
    const buffer = await createReaderPackageBuffer({
      document,
      note: ctx.store.notes[documentId]?.content || "",
      summary: ctx.store.summaries[documentId]?.content || "",
      aiHistory,
      anchors: keepAnchors ? ctx.listAnchors(documentId) : [],
      annotations: keepAnchors ? ctx.listAnnotations(documentId) : [],
      symbols: ctx.store.symbols[documentId] || [],
      pdfData,
      latexData,
      assets: await ctx.packageAssetsForDocumentAsync(
        documentId,
        ctx.store.notes[documentId]?.content || "",
        ctx.store.summaries[documentId]?.content || "",
        aiHistory.map((message) => message.content).join("\n"),
      ),
    });
    await writeFile(result.filePath, buffer);
    document.readerp_path = result.filePath;
    document.file_name = basename(result.filePath);
    ctx.store.ai_history[documentId] = aiHistory;
    ctx.saveStore();
    return result.filePath;
  });

  ipcMain.handle("readerp:save-current", async (
    _event,
    documentId: string,
    note: string,
    summary: string,
    aiHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  ) => {
    const document = ctx.getDocument(documentId);
    let targetPath = document.readerp_path;
    if (!targetPath) {
      const result = await dialog.showSaveDialog(ctx.window, {
        title: "Save Reader Package",
        defaultPath: `${document.title || "paper"}.readerp`,
        filters: [{ name: "Reader Package", extensions: ["readerp"] }],
      });
      if (result.canceled || !result.filePath) return null;
      targetPath = result.filePath;
    }

    const timestamp = ctx.now();
    ctx.store.notes[documentId] = { content: String(note || ""), updated_at: timestamp };
    ctx.store.summaries[documentId] = { content: String(summary || ""), updated_at: timestamp };
    ctx.store.ai_history[documentId] = aiHistory;
    document.updated_at = timestamp;
    document.readerp_path = targetPath;
    document.file_name = basename(targetPath);

    const noteContent = ctx.store.notes[documentId]?.content || "";
    const summaryContent = ctx.store.summaries[documentId]?.content || "";
    const aiText = aiHistory.map((message) => message.content).join("\n");
    const pdfData = existsSync(document.file_path) && document.source_type !== "markdown"
      ? await readFile(document.file_path)
      : undefined;
    const latexData = document.latex_path && existsSync(document.latex_path) ? await readFile(document.latex_path) : undefined;
    const buffer = await createReaderPackageBuffer({
      document,
      note: noteContent,
      summary: summaryContent,
      aiHistory,
      anchors: ctx.listAnchors(documentId),
      annotations: ctx.listAnnotations(documentId),
      symbols: ctx.store.symbols[documentId] || [],
      pdfData,
      latexData,
      assets: await ctx.packageAssetsForDocumentAsync(documentId, noteContent, summaryContent, aiText),
    });
    await writeFile(targetPath, buffer);
    ctx.saveStore();
    return targetPath;
  });

  ipcMain.handle("readerp:export-markdown-centered", async (_event, documentId: string, aiHistory: Array<{ role: "user" | "assistant"; content: string }> = []) => {
    const document = ctx.getDocument(documentId);
    const keepAnchors = await confirmExportAnchors(ctx);
    if (keepAnchors === null) return null;
    const note = ctx.store.notes[documentId]?.content || "";
    const summary = ctx.store.summaries[documentId]?.content || "";
    const aiText = aiHistory.map((message) => message.content).join("\n");
    const referencedIds = ctx.extractReaderDocumentIdsFromMarkdown(note, summary, aiText);
    referencedIds.add(documentId);
    const documents = [...referencedIds]
      .map((id) => ctx.store.documents.find((item) => item.document_id === id))
      .filter((item): item is DbDocument => Boolean(item));
    const pdfDataByDocumentId: Record<string, Buffer> = {};
    const latexDataByDocumentId: Record<string, Buffer> = {};
    for (const item of documents) {
      if (item.source_type !== "markdown" && existsSync(item.file_path)) {
        pdfDataByDocumentId[item.document_id] = await readFile(item.file_path);
      }
      if (item.latex_path && existsSync(item.latex_path)) {
        latexDataByDocumentId[item.document_id] = await readFile(item.latex_path);
      }
    }
    const anchors = keepAnchors ? ctx.store.anchors.filter((anchor) => referencedIds.has(anchor.document_id)) : [];
    const annotations = keepAnchors ? ctx.store.annotations.filter((annotation) => referencedIds.has(annotation.document_id)) : [];
    const symbols = [...referencedIds].flatMap((id) => ctx.store.symbols[id] || []);
    const result = await ctx.saveReaderPackageForDocument({
      document,
      documents,
      packageMode: "markdown-centered",
      defaultPath: `${document.title || "paper"}.readerp`,
      note,
      summary,
      aiHistory,
      anchors,
      annotations,
      symbols,
      pdfDataByDocumentId,
      latexDataByDocumentId,
      assets: await ctx.packageAssetsForDocumentAsync(documentId, note, summary, aiText),
    });
    ctx.saveStore();
    return result;
  });

  ipcMain.handle("readerp:split-current", async (_event, documentId: string, aiHistory: Array<{ role: "user" | "assistant"; content: string }> = []) => {
    const document = ctx.getDocument(documentId);
    const result = await dialog.showOpenDialog(ctx.window, {
      title: "Split Reader Package",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const targetDir = result.filePaths[0];
    const baseName = (document.title || "paper").replace(/[<>:"/\\|?*]+/g, "_");
    if (existsSync(document.file_path) && document.source_type !== "markdown") {
      await writeFile(join(targetDir, `${baseName}.pdf`), await readFile(document.file_path));
    }
    if (document.latex_path && existsSync(document.latex_path)) {
      await writeFile(join(targetDir, `${baseName}.tex`), await readFile(document.latex_path));
    }
    await writeFile(join(targetDir, `${baseName}.notes.md`), ctx.store.notes[documentId]?.content || "", "utf8");
    await writeFile(join(targetDir, `${baseName}.summary.md`), ctx.store.summaries[documentId]?.content || "", "utf8");
    await writeFile(join(targetDir, `${baseName}.ai-history.json`), JSON.stringify(aiHistory, null, 2), "utf8");
    await writeFile(join(targetDir, `${baseName}.symbols.json`), JSON.stringify(ctx.store.symbols[documentId] || [], null, 2), "utf8");
    const splitAssets = await ctx.packageAssetsForDocumentAsync(
      documentId,
      ctx.store.notes[documentId]?.content || "",
      ctx.store.summaries[documentId]?.content || "",
      aiHistory.map((message) => message.content).join("\n"),
    );
    if (splitAssets.length) {
      const splitAssetsDir = join(targetDir, "assets");
      await mkdir(splitAssetsDir, { recursive: true });
      for (const asset of splitAssets) {
        await writeFile(join(splitAssetsDir, asset.file_name), asset.data);
      }
      await writeFile(join(splitAssetsDir, "assets.json"), JSON.stringify(splitAssets.map((asset) => ({
        asset_id: asset.asset_id,
        document_id: asset.document_id,
        file_name: asset.file_name,
        mime_type: asset.mime_type,
        path: `assets/${asset.file_name}`,
        original_name: asset.original_name,
        created_at: asset.created_at,
      })), null, 2), "utf8");
    }
    ctx.store.ai_history[documentId] = aiHistory;
    ctx.saveStore();
    return targetDir;
  });

  ipcMain.handle("readerp:import", async () => {
    const result = await dialog.showOpenDialog(ctx.window, {
      title: "Import Reader Package",
      filters: [{ name: "Reader Package", extensions: ["readerp"] }],
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const source = result.filePaths[0];
    const packageData = await readReaderPackageBuffer(await readFile(source));
    const timestamp = ctx.now();
    const id = packageData.packageMode === "markdown-centered" ? packageData.document.document_id : randomUUID();
    const target = packageData.pdfData ? join(ctx.libraryDir, `${id}.pdf`) : join(ctx.libraryDir, `${id}.md`);
    if (packageData.pdfData) {
      await writeFile(target, packageData.pdfData);
    } else {
      await writeFile(target, packageData.note || packageData.summary || "", "utf8");
    }
    const latexTarget = packageData.latexData ? ctx.latexTargetPath(id) : undefined;
    if (packageData.latexData && latexTarget) await writeFile(latexTarget, packageData.latexData);
    const document: DbDocument = {
      document_id: id,
      title: packageData.manifest.title || basename(source, extname(source)),
      file_name: basename(source),
      file_path: target,
      file_size: await fileSize(target),
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
        if (pdfData) await writeFile(filePath, pdfData);
        else await writeFile(filePath, "", "utf8");
        if (latexData && packageLatexTarget) await writeFile(packageLatexTarget, latexData);
        ctx.store.documents.push({
          ...packageDocument,
          file_path: filePath,
          file_size: existsSync(filePath) ? await fileSize(filePath) : packageDocument.file_size,
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
      await ctx.createAssetRecordAsync(
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
  });

  ipcMain.handle("readerp:create-from-pdf", async () => {
    const result = await dialog.showOpenDialog(ctx.window, {
      title: "Create Reader Package From PDF",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const source = result.filePaths[0];
    const id = randomUUID();
    const originalName = basename(source);
    const title = originalName.replace(new RegExp(`${extname(originalName)}$`), "");
    const target = join(ctx.libraryDir, `${id}.pdf`);
    const pdfData = await readFile(source);
    await writeFile(target, pdfData);
    const timestamp = ctx.now();
    const document: DbDocument = {
      document_id: id,
      title,
      file_name: originalName,
      file_path: target,
      file_size: await fileSize(target),
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
      pdfData,
    });
    ctx.saveStore();
    return document;
  });

  ipcMain.handle("readerp:create-from-markdown", async () => {
    const result = await dialog.showOpenDialog(ctx.window, {
      title: "Create Reader Package From Markdown",
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const source = result.filePaths[0];
    const id = randomUUID();
    const originalName = basename(source);
    const title = originalName.replace(new RegExp(`${extname(originalName)}$`), "");
    const markdown = await readFile(source, "utf8");
    const target = join(ctx.libraryDir, `${id}.md`);
    await writeFile(target, markdown, "utf8");
    const timestamp = ctx.now();
    const document: DbDocument = {
      document_id: id,
      title,
      file_name: originalName,
      file_path: target,
      file_size: await fileSize(target),
      source_type: "markdown",
      created_at: timestamp,
      updated_at: timestamp,
    };
    ctx.store.documents.unshift(document);
    ctx.store.notes[id] = { content: markdown, updated_at: timestamp };
    ctx.store.summaries[id] = { content: "", updated_at: timestamp };
    ctx.store.ai_history[id] = [];
    ctx.store.symbols[id] = [];
    await ctx.saveReaderPackageForDocument({
      document,
      defaultPath: join(dirname(source), `${title}.readerp`),
      note: markdown,
      summary: "",
      aiHistory: [],
      anchors: [],
      annotations: [],
      symbols: [],
    });
    ctx.saveStore();
    return document;
  });
}
