import type { BrowserWindow } from "electron";
import { registerAnnotationIpc } from "./annotationIpc.js";
import { registerAssetIpc } from "./assetIpc.js";
import { registerDocumentIpc } from "./documentIpc.js";
import { registerLibraryIpc } from "./libraryIpc.js";
import { registerParagraphTranslationIpc } from "./paragraphTranslationIpc.js";
import { registerReaderPackageIpc } from "./readerPackageIpc.js";
import { registerReadermIpc } from "./readermIpc.js";
import { registerSettingsAiIpc } from "./settingsAiIpc.js";
import { createIpcContext, initStorage } from "./storeContext.js";

export { createIpcContext, getSettings, initStorage } from "./storeContext.js";

export function registerIpc(window: BrowserWindow) {
  const ctx = createIpcContext(window);
  registerLibraryIpc(ctx);
  registerDocumentIpc(ctx);
  registerAssetIpc(ctx);
  registerReaderPackageIpc(ctx);
  registerReadermIpc(ctx);
  registerAnnotationIpc(ctx);
  registerParagraphTranslationIpc(ctx);
  registerSettingsAiIpc(ctx);
}
