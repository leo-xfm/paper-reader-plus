import { app } from "electron";
import type { Settings } from "./services/SettingsTypes.js";

export type MenuLanguage = Settings["ui_language"];
type ResolvedMenuLanguage = Exclude<MenuLanguage, "system">;

type MenuKey =
  | "file"
  | "importPdf"
  | "importArxiv"
  | "importReaderp"
  | "importReaderm"
  | "createEmptyReaderm"
  | "createReadermFromMarkdown"
  | "attachLatex"
  | "exportReaderp"
  | "exportReaderm"
  | "edit"
  | "copyQuote"
  | "quoteToNote"
  | "view"
  | "toggleReaderPanel"
  | "searchLoadedPages"
  | "outline"
  | "reader"
  | "select"
  | "highlight"
  | "underline"
  | "note"
  | "copyImageRegionTool"
  | "askAiSelection"
  | "translateSelection"
  | "settings"
  | "agentApi"
  | "translationApi"
  | "networkProxy"
  | "fileAssociations"
  | "defaultSystemPrompt"
  | "defaultSummaryPrompt"
  | "help"
  | "openHelp";

const menuMessages: Record<ResolvedMenuLanguage, Partial<Record<MenuKey, string>>> = {
  "en-US": {
    file: "File",
    importPdf: "Create ReaderP from PDF",
    importArxiv: "Create ReaderP from arXiv",
    importReaderp: "Import ReaderP",
    importReaderm: "Import ReaderM",
    createEmptyReaderm: "Create Empty ReaderM",
    createReadermFromMarkdown: "Create ReaderM From Markdown",
    attachLatex: "Attach LaTeX Source",
    exportReaderp: "Export ReaderP",
    exportReaderm: "Export ReaderM",
    edit: "Edit",
    copyQuote: "Copy Quote",
    quoteToNote: "Quote To Note",
    view: "View",
    toggleReaderPanel: "Toggle Reader Panel",
    searchLoadedPages: "Search Loaded Pages",
    outline: "Outline",
    reader: "Reader",
    select: "Select",
    highlight: "Highlight",
    underline: "Underline",
    note: "Note",
    copyImageRegionTool: "Copy Image Region Tool",
    askAiSelection: "Ask AI About Selection",
    translateSelection: "Translate Selection",
    settings: "Settings",
    agentApi: "Agent API",
    translationApi: "Translation API",
    networkProxy: "Network Proxy",
    fileAssociations: "File Associations",
    defaultSystemPrompt: "Default System Prompt",
    defaultSummaryPrompt: "Default Summary Prompt",
    help: "Help",
    openHelp: "Open Help",
  },
  "zh-CN": {
    file: "文件",
    importPdf: "从 PDF 创建 ReaderP",
    importArxiv: "从 arXiv 创建 ReaderP",
    importReaderp: "导入 ReaderP",
    importReaderm: "导入 ReaderM",
    createEmptyReaderm: "创建空白 ReaderM",
    createReadermFromMarkdown: "从 Markdown 创建 ReaderM",
    attachLatex: "附加 LaTeX 源文件",
    exportReaderp: "导出 ReaderP",
    exportReaderm: "导出 ReaderM",
    edit: "编辑",
    copyQuote: "复制引用",
    quoteToNote: "引用到笔记",
    view: "视图",
    toggleReaderPanel: "切换阅读面板",
    searchLoadedPages: "搜索已加载页面",
    outline: "大纲",
    reader: "阅读器",
    select: "选择",
    highlight: "高亮",
    underline: "下划线",
    note: "笔记",
    copyImageRegionTool: "复制图片区域工具",
    askAiSelection: "询问 AI 所选内容",
    translateSelection: "翻译所选内容",
    settings: "设置",
    agentApi: "AI 接口",
    translationApi: "翻译接口",
    networkProxy: "网络代理",
    defaultSystemPrompt: "默认系统提示词",
    defaultSummaryPrompt: "默认摘要提示词",
    help: "帮助",
    openHelp: "打开帮助",
  },
};

export function resolveMenuLanguage(language: MenuLanguage | undefined, systemLanguage?: string): ResolvedMenuLanguage {
  if (language === "zh-CN" || language === "en-US") return language;
  const locale = systemLanguage || app?.getLocale?.() || "";
  return locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

export function menuLabel(language: MenuLanguage | undefined, key: MenuKey) {
  return menuMessages[resolveMenuLanguage(language)][key] || menuMessages["en-US"][key] || key;
}

export function menuLabelKeys() {
  return Object.keys(menuMessages["en-US"]) as MenuKey[];
}
