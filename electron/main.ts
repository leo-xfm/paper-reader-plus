import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { createApplicationMenu, type MenuAction } from "./appMenu.js";
import { createIpcContext, flushStore, getSettings, initStorage, registerIpc } from "./ipc/registerIpc.js";
import { importMarkdownDocumentFromPath, importSupportedFileFromPath } from "./ipc/libraryIpc.js";
import { dialogLabel } from "./i18n.js";
import { fileAssociationArg } from "./services/FileAssociationService.js";
import { openHelpWindow, registerHelpIpc } from "./services/HelpWindowService.js";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const appIconPath = join(app.getAppPath(), "icon/256.png");
let mainWindow: BrowserWindow | null = null;
let closeConfirmed = false;
let pendingOpenFilePath = "";
let quitAfterStoreFlush = false;

function isAllowedExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function createWindow() {
  closeConfirmed = false;
  const window = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    title: "Paper Reader Plus",
    icon: appIconPath,
    backgroundColor: "#f6f7f9",
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(app.getAppPath(), "dist-electron/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow = window;
  window.setAutoHideMenuBar(false);
  window.setMenuBarVisibility(true);

  if (isDev) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL!);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadFile(join(app.getAppPath(), "dist/index.html"));
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  window.on("close", (event) => {
    if (closeConfirmed) return;
    event.preventDefault();
    if (!window.isDestroyed()) window.webContents.send("app:close-request");
  });

  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  registerIpc(window);
}

ipcMain.handle("app:open-external-url", async (_event, url: string) => {
  if (!isAllowedExternalUrl(url)) throw new Error("ERR_UNSUPPORTED_EXTERNAL_URL");
  await shell.openExternal(url);
});

function sendMenuAction(action: MenuAction) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("menu:action", action);
}

async function importAssociatedFile(filePath: string) {
  if (!mainWindow || !filePath) return;
  try {
    const ctx = createIpcContext(mainWindow);
    const document = filePath.toLowerCase().endsWith(".md")
      ? await importMarkdownDocumentFromPath(ctx, filePath)
      : await importSupportedFileFromPath(ctx, filePath);
    mainWindow.webContents.send("app:open-file-request", document);
  } catch (cause) {
    await dialog.showMessageBox(mainWindow, {
      type: "error",
      message: dialogLabel(getSettings().ui_language, "dialog.openFileError.message"),
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

function refreshApplicationMenu() {
  createApplicationMenu(sendMenuAction, getSettings().ui_language, (topic) => openHelpWindow(mainWindow, topic));
}

ipcMain.handle("app:confirm-save-on-close", async (_event, title: string) => {
  const result = await dialog.showMessageBox(mainWindow!, {
    type: "question",
    buttons: [
      dialogLabel(getSettings().ui_language, "button.save"),
      dialogLabel(getSettings().ui_language, "button.dontSave"),
      dialogLabel(getSettings().ui_language, "button.cancel"),
    ],
    defaultId: 0,
    cancelId: 2,
    message: dialogLabel(getSettings().ui_language, "dialog.saveClose.message"),
    detail: title
      ? dialogLabel(getSettings().ui_language, "dialog.saveClose.detail", { title })
      : dialogLabel(getSettings().ui_language, "dialog.saveClose.detailUntitled"),
  });
  if (result.response === 0) return "save";
  if (result.response === 1) return "discard";
  return "cancel";
});

ipcMain.handle("app:confirm-save-on-tab-close", async (_event, title: string) => {
  const result = await dialog.showMessageBox(mainWindow!, {
    type: "question",
    buttons: [
      dialogLabel(getSettings().ui_language, "button.save"),
      dialogLabel(getSettings().ui_language, "button.dontSave"),
      dialogLabel(getSettings().ui_language, "button.cancel"),
    ],
    defaultId: 0,
    cancelId: 2,
    message: dialogLabel(getSettings().ui_language, "dialog.saveTab.message"),
    detail: title
      ? dialogLabel(getSettings().ui_language, "dialog.saveTab.detail", { title })
      : dialogLabel(getSettings().ui_language, "dialog.saveTab.detailUntitled"),
  });
  if (result.response === 0) return "save";
  if (result.response === 1) return "discard";
  return "cancel";
});

ipcMain.handle("app:close-response", (_event, shouldClose: boolean) => {
  if (!shouldClose || !mainWindow) return;
  closeConfirmed = true;
  mainWindow.close();
});

app.whenReady().then(() => {
  initStorage();
  registerHelpIpc();
  pendingOpenFilePath = fileAssociationArg(process.argv);
  createWindow();
  refreshApplicationMenu();
  if (pendingOpenFilePath) {
    mainWindow?.webContents.once("did-finish-load", () => void importAssociatedFile(pendingOpenFilePath));
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const filePath = fileAssociationArg(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    if (filePath) void importAssociatedFile(filePath);
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (quitAfterStoreFlush) return;
  event.preventDefault();
  quitAfterStoreFlush = true;
  void flushStore().finally(() => app.quit());
});
