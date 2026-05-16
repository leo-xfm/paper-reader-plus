import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { dialog, ipcMain } from "electron";
import { imageExtensionForMime, markdownForAsset, mimeTypeForImagePath, normalizeMarkdownAssetPath, sanitizeAssetFileName } from "../services/AssetService.js";
import type { IpcContext } from "./storeContext.js";

export function registerAssetIpc(ctx: IpcContext) {
  ipcMain.handle("assets:import-image", async (_event, documentId: string) => {
    ctx.getDocument(documentId);
    const result = await dialog.showOpenDialog(ctx.window, {
      title: "Insert Image",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const source = result.filePaths[0];
    const mimeType = mimeTypeForImagePath(source);
    if (!mimeType) throw new Error("Unsupported image type.");
    const asset = ctx.createAssetRecord(documentId, sanitizeAssetFileName(basename(source)), mimeType, readFileSync(source), basename(source));
    return { asset, markdown: markdownForAsset(asset) };
  });

  ipcMain.handle("assets:save-image-data-url", (_event, documentId: string, dataUrl: string, source?: string) => {
    ctx.getDocument(documentId);
    const match = String(dataUrl || "").match(/^data:(image\/(?:png|jpeg|jpg|gif|webp|svg\+xml));base64,([a-zA-Z0-9+/=]+)$/);
    if (!match) throw new Error("Invalid image data.");
    const mimeType = match[1] === "image/jpg" ? "image/jpeg" : match[1];
    const ext = imageExtensionForMime(mimeType);
    if (!ext) throw new Error("Unsupported image type.");
    const fileName = sanitizeAssetFileName(`${source || "pdf-selection"}${ext}`);
    const asset = ctx.createAssetRecord(documentId, fileName, mimeType, Buffer.from(match[2], "base64"), `${source || "PDF selection"}${ext}`);
    return { asset, markdown: markdownForAsset(asset) };
  });

  ipcMain.handle("assets:get-data-url", (_event, documentId: string, assetPath: string) => {
    const normalized = normalizeMarkdownAssetPath(assetPath);
    if (!normalized) throw new Error("Invalid image asset path.");
    const fileName = basename(normalized);
    const asset = ctx.listAssets(documentId).find((item) => item.file_name === fileName);
    if (!asset) throw new Error("Image asset not found.");
    return ctx.dataUrlForAsset(asset);
  });
}
