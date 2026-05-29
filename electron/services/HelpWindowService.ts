import { readFileSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, ipcMain, shell } from "electron";

let helpWindow: BrowserWindow | null = null;
let helpIpcRegistered = false;

type HelpTopic = "guide" | "api";

function normalizeHelpTopic(topic: unknown): HelpTopic {
  return topic === "api" ? "api" : "guide";
}

function readMarkdownDoc(fileName: string) {
  const helpPath = join(app.getAppPath(), "docs", fileName);
  try {
    return readFileSync(helpPath, "utf8");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return `Could not load \`${helpPath}\`.\n\n${message}`;
  }
}

function readHelpContent(topic: unknown) {
  const fileName = normalizeHelpTopic(topic) === "api" ? "api.md" : "help.md";
  return `${readMarkdownDoc(fileName).trim()}\n`;
}

function loadHelpTopic(topic: HelpTopic) {
  if (!helpWindow || helpWindow.isDestroyed()) return;
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void helpWindow.loadURL(`${devServerUrl}?help=${topic}`);
  } else {
    void helpWindow.loadFile(join(app.getAppPath(), "dist/index.html"), { query: { help: topic } });
  }
}

export function registerHelpIpc() {
  if (helpIpcRegistered) return;
  ipcMain.handle("help:get-content", (_event, topic) => readHelpContent(topic));
  helpIpcRegistered = true;
}

export function openHelpWindow(parent: BrowserWindow | null, topic: unknown = "guide") {
  registerHelpIpc();
  const helpTopic = normalizeHelpTopic(topic);
  if (helpWindow && !helpWindow.isDestroyed()) {
    loadHelpTopic(helpTopic);
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
      preload: join(app.getAppPath(), "dist-electron/electron/preload.js"),
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
  loadHelpTopic(helpTopic);
}
