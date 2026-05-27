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
  | "quit"
  | "edit"
  | "undo"
  | "redo"
  | "copy"
  | "paste"
  | "copyQuote"
  | "quoteToNote"
  | "view"
  | "toggleReaderPanel"
  | "toggleFullscreen"
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
  | "general"
  | "pdf"
  | "markdown"
  | "agentApi"
  | "ocrApi"
  | "translationApi"
  | "networkProxy"
  | "fileAssociations"
  | "defaultSystemPrompt"
  | "defaultSummaryPrompt"
  | "defaultAnalysisPrompt"
  | "help"
  | "openHelp"
  | "openApiGuide";

type DialogKey =
  | "button.cancel"
  | "button.cleanUp"
  | "button.deleteFile"
  | "button.deleteRecordOnly"
  | "button.dontSave"
  | "button.fromLatex"
  | "button.fromAiPdf"
  | "button.fromAiLatex"
  | "button.fromLoadedPdf"
  | "button.complete"
  | "button.keepAnchors"
  | "button.keepUserChanges"
  | "button.ok"
  | "button.removeAnchors"
  | "button.resetAll"
  | "button.save"
  | "dialog.cleanup.detail"
  | "dialog.cleanup.message"
  | "dialog.delete.detail"
  | "dialog.delete.message"
  | "dialog.exportAnchors.detail"
  | "dialog.exportAnchors.message"
  | "dialog.openFileError.message"
  | "dialog.saveClose.detail"
  | "dialog.saveClose.detailUntitled"
  | "dialog.saveClose.message"
  | "dialog.saveTab.detail"
  | "dialog.saveTab.detailUntitled"
  | "dialog.saveTab.message"
  | "dialog.symbolRefreshMode.detail"
  | "dialog.symbolRefreshMode.message"
  | "dialog.symbolAiApplyMode.detail"
  | "dialog.symbolAiApplyMode.message"
  | "dialog.symbolRefreshSource.detail"
  | "dialog.symbolRefreshSource.message";

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
    quit: "Quit",
    edit: "Edit",
    undo: "Undo",
    redo: "Redo",
    copy: "Copy",
    paste: "Paste",
    copyQuote: "Copy Quote",
    quoteToNote: "Quote To Note",
    view: "View",
    toggleReaderPanel: "Toggle Reader Panel",
    toggleFullscreen: "Toggle Full Screen",
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
    general: "General",
    pdf: "PDF",
    markdown: "Markdown",
    agentApi: "Agent API",
    ocrApi: "OCR API",
    translationApi: "Translation API",
    networkProxy: "Network Proxy",
    fileAssociations: "File Associations",
    defaultSystemPrompt: "Default System Prompt",
    defaultSummaryPrompt: "Default Summary Prompt",
    defaultAnalysisPrompt: "Default Analysis Prompt",
    help: "Help",
    openHelp: "Open Help",
    openApiGuide: "API Guide",
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
    quit: "退出",
    edit: "编辑",
    undo: "撤销",
    redo: "重做",
    copy: "复制",
    paste: "粘贴",
    copyQuote: "复制引用",
    quoteToNote: "引用到笔记",
    view: "视图",
    toggleReaderPanel: "切换阅读面板",
    toggleFullscreen: "切换全屏",
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
    general: "通用",
    pdf: "PDF",
    markdown: "Markdown 文件",
    agentApi: "AI 接口",
    ocrApi: "OCR 接口",
    translationApi: "翻译接口",
    networkProxy: "网络代理",
    fileAssociations: "文件关联",
    defaultSystemPrompt: "默认系统提示词",
    defaultSummaryPrompt: "默认摘要提示词",
    defaultAnalysisPrompt: "默认解析提示词",
    help: "帮助",
    openHelp: "打开帮助",
    openApiGuide: "API 调用指南",
  },
};

const dialogMessages: Record<ResolvedMenuLanguage, Partial<Record<DialogKey, string>>> = {
  "en-US": {
    "button.cancel": "Cancel",
    "button.cleanUp": "Clean up",
    "button.deleteFile": "Delete file",
    "button.deleteRecordOnly": "Delete record only",
    "button.dontSave": "Don't Save",
    "button.fromLatex": "From LaTeX",
    "button.fromAiPdf": "From AI (PDF source)",
    "button.fromAiLatex": "From AI (LaTeX source)",
    "button.fromLoadedPdf": "From loaded PDF",
    "button.complete": "Complete missing",
    "button.keepAnchors": "Keep anchors",
    "button.keepUserChanges": "Keep user changes",
    "button.ok": "OK",
    "button.removeAnchors": "Remove anchors",
    "button.resetAll": "Reset all",
    "button.save": "Save",
    "dialog.cleanup.detail": "Remove unused anchors and unreferenced Markdown image assets for \"{title}\". This keeps anchors used by annotations, reader links, and dictionary entries.",
    "dialog.cleanup.message": "Clean unused resources?",
    "dialog.delete.detail": "Choose whether to delete the file for \"{title}\" or only remove it from the history list.",
    "dialog.delete.message": "Delete history item?",
    "dialog.exportAnchors.detail": "Choose whether this exported package should include reader anchors and annotations. Removing anchors does not change local data.",
    "dialog.exportAnchors.message": "Export anchors?",
    "dialog.openFileError.message": "Could not open file",
    "dialog.saveClose.detail": "Save changes to \"{title}\" before closing Paper Reader Plus?",
    "dialog.saveClose.detailUntitled": "Save the open ReaderP file before closing Paper Reader Plus?",
    "dialog.saveClose.message": "Save before closing?",
    "dialog.saveTab.detail": "Save changes to \"{title}\" before closing this file?",
    "dialog.saveTab.detailUntitled": "Save changes before closing this file?",
    "dialog.saveTab.message": "Save before closing file?",
    "dialog.symbolRefreshMode.detail": "Keep favorites, edited definitions, and deleted symbols, or fully reset the symbol tracker before regenerating.",
    "dialog.symbolRefreshMode.message": "Existing symbol changes found",
    "dialog.symbolAiApplyMode.detail": "Choose whether AI results should only add missing symbols and empty definitions, or replace the visible symbol list.",
    "dialog.symbolAiApplyMode.message": "Apply AI symbol results?",
    "dialog.symbolRefreshSource.detail": "Choose the source used to regenerate symbol definitions.",
    "dialog.symbolRefreshSource.message": "Regenerate symbol tracker?",
  },
  "zh-CN": {
    "button.cancel": "取消",
    "button.cleanUp": "清理",
    "button.deleteFile": "删除文件",
    "button.deleteRecordOnly": "仅删除记录",
    "button.dontSave": "不保存",
    "button.fromLatex": "从 LaTeX",
    "button.fromLoadedPdf": "从已加载 PDF",
    "button.keepAnchors": "保留锚点",
    "button.keepUserChanges": "保留用户修改",
    "button.ok": "确定",
    "button.removeAnchors": "移除锚点",
    "button.resetAll": "全部重置",
    "button.save": "保存",
    "dialog.cleanup.detail": "移除 \"{title}\" 中未使用的锚点和未引用的 Markdown 图片资源。批注、阅读器链接和词典条目使用的锚点会保留。",
    "dialog.cleanup.message": "清理未使用资源？",
    "dialog.delete.detail": "选择删除 \"{title}\" 对应的文件，或仅从历史列表中移除记录。",
    "dialog.delete.message": "删除历史项？",
    "dialog.exportAnchors.detail": "选择导出的包是否包含阅读器锚点和批注。移除锚点不会修改本地数据。",
    "dialog.exportAnchors.message": "导出锚点？",
    "dialog.openFileError.message": "无法打开文件",
    "dialog.saveClose.detail": "关闭 Paper Reader Plus 前保存 \"{title}\" 的更改？",
    "dialog.saveClose.detailUntitled": "关闭 Paper Reader Plus 前保存当前 ReaderP 文件？",
    "dialog.saveClose.message": "关闭前保存？",
    "dialog.saveTab.detail": "关闭此文件前保存 \"{title}\" 的更改？",
    "dialog.saveTab.detailUntitled": "关闭此文件前保存更改？",
    "dialog.saveTab.message": "关闭文件前保存？",
    "dialog.symbolRefreshMode.detail": "保留收藏、已编辑定义和已删除符号，或在重新生成前完全重置符号追踪器。",
    "dialog.symbolRefreshMode.message": "发现已有符号修改",
    "dialog.symbolRefreshSource.detail": "选择用于重新生成符号定义的来源。",
    "dialog.symbolRefreshSource.message": "重新生成符号追踪器？",
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

export function dialogLabel(language: MenuLanguage | undefined, key: DialogKey, params: Record<string, string | number> = {}) {
  const template = String(dialogMessages[resolveMenuLanguage(language)][key] || dialogMessages["en-US"][key] || key);
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? ""));
}
