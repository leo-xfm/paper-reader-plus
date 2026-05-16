import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { createApplicationMenu, type MenuAction } from "./appMenu.js";
import { createIpcContext, getSettings, initStorage, registerIpc } from "./ipc/registerIpc.js";
import { importSupportedFileFromPath } from "./ipc/libraryIpc.js";
import { fileAssociationArg } from "./services/FileAssociationService.js";
import { openHelpWindow, registerHelpIpc } from "./services/HelpWindowService.js";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const appIconPath = join(app.getAppPath(), "icon/256.png");
let mainWindow: BrowserWindow | null = null;
let closeConfirmed = false;
let pendingOpenFilePath = "";

function createWindow() {
  closeConfirmed = false;
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1320,
    minHeight: 760,
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
  mainWindow.setAutoHideMenuBar(false);
  mainWindow.setMenuBarVisibility(true);

  if (isDev) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(join(app.getAppPath(), "dist/index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    if (closeConfirmed) return;
    event.preventDefault();
    mainWindow?.webContents.send("app:close-request");
  });

  registerIpc(mainWindow);
}

function sendMenuAction(action: MenuAction) {
  mainWindow?.webContents.send("menu:action", action);
}

async function importAssociatedFile(filePath: string) {
  if (!mainWindow || !filePath) return;
  try {
    const document = await importSupportedFileFromPath(createIpcContext(mainWindow), filePath);
    mainWindow.webContents.send("app:open-file-request", document);
  } catch (cause) {
    await dialog.showMessageBox(mainWindow, {
      type: "error",
      message: "Could not open file",
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

function refreshApplicationMenu() {
  createApplicationMenu(sendMenuAction, getSettings().ui_language, () => openHelpWindow(mainWindow));
}

ipcMain.handle("app:confirm-save-on-close", async (_event, title: string) => {
  const result = await dialog.showMessageBox(mainWindow!, {
    type: "question",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message: "Save before closing?",
    detail: title ? `Save changes to "${title}" before closing Paper Reader Plus?` : "Save the open ReaderP file before closing Paper Reader Plus?",
  });
  if (result.response === 0) return "save";
  if (result.response === 1) return "discard";
  return "cancel";
});

ipcMain.handle("app:confirm-save-on-tab-close", async (_event, title: string) => {
  const result = await dialog.showMessageBox(mainWindow!, {
    type: "question",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message: "Save before closing file?",
    detail: title ? `Save changes to "${title}" before closing this file?` : "Save changes before closing this file?",
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
