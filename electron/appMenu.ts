import { Menu, type MenuItemConstructorOptions } from "electron";
import { menuLabel } from "./i18n.js";
import type { Settings } from "./services/SettingsTypes.js";

export type MenuAction =
  | "import-pdf"
  | "import-arxiv"
  | "import-readerp"
  | "import-readerm"
  | "create-readerp-from-pdf"
  | "create-readerp-from-markdown"
  | "create-readerm-empty"
  | "create-readerm-from-markdown"
  | "export-readerp"
  | "export-readerm"
  | "export-markdown-readerp"
  | "split-readerp"
  | "attach-latex"
  | "toggle-panel"
  | "select-tool"
  | "highlight-tool"
  | "underline-tool"
  | "note-tool"
  | "image-tool"
  | "copy-quote"
  | "quote-to-note"
  | "ask-ai"
  | "translate-selection"
  | "toggle-search"
  | "toggle-outline"
  | "settings-agent-api"
  | "settings-translation-api"
  | "settings-network-proxy"
  | "settings-file-associations"
  | "settings-system-prompt"
  | "settings-summary-prompt";

export function createApplicationMenu(
  sendMenuAction: (action: MenuAction) => void,
  language: Settings["ui_language"] = "system",
  openHelp: () => void = () => {},
) {
  const label = (key: Parameters<typeof menuLabel>[1]) => menuLabel(language, key);
  const template: MenuItemConstructorOptions[] = [
    {
      label: label("file"),
      submenu: [
        { label: label("importReaderp"), click: () => sendMenuAction("import-readerp") },
        { label: label("importPdf"), accelerator: "CmdOrCtrl+O", click: () => sendMenuAction("import-pdf") },
        { label: label("importArxiv"), accelerator: "CmdOrCtrl+Shift+O", click: () => sendMenuAction("import-arxiv") },
        { label: label("attachLatex"), click: () => sendMenuAction("attach-latex") },
        { type: "separator" },
        { label: label("importReaderm"), click: () => sendMenuAction("import-readerm") },
        { label: label("createEmptyReaderm"), click: () => sendMenuAction("create-readerm-empty") },
        { label: label("createReadermFromMarkdown"), click: () => sendMenuAction("create-readerm-from-markdown") },
        { type: "separator" },
        { label: label("exportReaderp"), accelerator: "CmdOrCtrl+E", click: () => sendMenuAction("export-readerp") },
        { label: label("exportReaderm"), click: () => sendMenuAction("export-readerm") },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: label("edit"),
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "copy" },
        { role: "paste" },
        { type: "separator" },
        { label: label("searchLoadedPages"), accelerator: "CmdOrCtrl+F", click: () => sendMenuAction("toggle-search") },
        { type: "separator" },
        { label: label("copyQuote"), accelerator: "CmdOrCtrl+Shift+C", click: () => sendMenuAction("copy-quote") },
        { label: label("quoteToNote"), accelerator: "CmdOrCtrl+Shift+N", click: () => sendMenuAction("quote-to-note") },
      ],
    },
    {
      label: label("view"),
      submenu: [
        { label: label("toggleReaderPanel"), accelerator: "CmdOrCtrl+B", click: () => sendMenuAction("toggle-panel") },
        { type: "separator" },
        { role: "togglefullscreen", accelerator: "F11" },
      ],
    },
    {
      label: label("reader"),
      submenu: [
        { label: label("select"), accelerator: "Esc", click: () => sendMenuAction("select-tool") },
        { label: label("highlight"), accelerator: "CmdOrCtrl+H", click: () => sendMenuAction("highlight-tool") },
        { label: label("underline"), accelerator: "CmdOrCtrl+U", click: () => sendMenuAction("underline-tool") },
        { label: label("note"), accelerator: "CmdOrCtrl+Shift+H", click: () => sendMenuAction("note-tool") },
        { label: label("copyImageRegionTool"), accelerator: "CmdOrCtrl+Shift+I", click: () => sendMenuAction("image-tool") },
        { type: "separator" },
        { label: label("askAiSelection"), accelerator: "CmdOrCtrl+Shift+A", click: () => sendMenuAction("ask-ai") },
        { label: label("translateSelection"), accelerator: "CmdOrCtrl+Shift+T", click: () => sendMenuAction("translate-selection") },
      ],
    },
    {
      label: label("settings"),
      submenu: [
        { label: label("agentApi"), accelerator: "CmdOrCtrl+,", click: () => sendMenuAction("settings-agent-api") },
        { label: label("translationApi"), click: () => sendMenuAction("settings-translation-api") },
        { type: "separator" },
        { label: label("defaultSystemPrompt"), click: () => sendMenuAction("settings-system-prompt") },
        { label: label("defaultSummaryPrompt"), click: () => sendMenuAction("settings-summary-prompt") },
        { type: "separator" },
        { label: label("networkProxy"), click: () => sendMenuAction("settings-network-proxy") },
        { type: "separator" },
        { label: label("fileAssociations"), click: () => sendMenuAction("settings-file-associations") },
      ],
    },
    {
      label: label("help"),
      submenu: [
        { label: label("openHelp"), accelerator: "F1", click: () => openHelp() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
