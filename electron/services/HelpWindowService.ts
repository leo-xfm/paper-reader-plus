import { readFileSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, ipcMain, shell } from "electron";

let helpWindow: BrowserWindow | null = null;
let helpIpcRegistered = false;

function readHelpContent() {
  const helpPath = join(app.getAppPath(), "docs/help.md");
  try {
    return readFileSync(helpPath, "utf8");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return `# Paper Reader Plus Help\n\nCould not load \`${helpPath}\`.\n\n${message}`;
  }
}

export function registerHelpIpc() {
  if (helpIpcRegistered) return;
  ipcMain.handle("help:get-content", () => readHelpContent());
  helpIpcRegistered = true;
}

export function openHelpWindow(parent: BrowserWindow | null) {
  registerHelpIpc();
  if (helpWindow && !helpWindow.isDestroyed()) {
    helpWindow.focus();
    return;
  }

  helpWindow = new BrowserWindow({
    width: 920,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    title: "Paper Reader Plus Help",
    icon: join(app.getAppPath(), "icon/256.png"),
    parent: parent || undefined,
    backgroundColor: "#f6f7f9",
    webPreferences: {
      preload: join(app.getAppPath(), "dist-electron/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  helpWindow.setMenuBarVisibility(false);
  helpWindow.on("closed", () => {
    helpWindow = null;
  });
  helpWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void helpWindow.loadURL(`${devServerUrl}?help=1`);
  } else {
    void helpWindow.loadFile(join(app.getAppPath(), "dist/index.html"), { query: { help: "1" } });
  }
}
