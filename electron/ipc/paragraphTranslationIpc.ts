import { ipcMain } from "electron";
import type { StoredParagraphTranslation } from "../storeMigration.js";
import type { IpcContext } from "./storeContext.js";

function cleanNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanProvider(value: unknown): StoredParagraphTranslation["provider"] {
  return value === "baidu" ? "baidu" : "google";
}

function cleanParagraphTranslation(documentId: string, payload: Record<string, unknown>, timestamp: string): StoredParagraphTranslation | null {
  const sourceText = String(payload.source_text || "").replace(/\s+/g, " ").trim();
  const sourceHash = String(payload.source_hash || "").trim();
  const targetLanguage = String(payload.target_language || "").trim();
  const translatedText = String(payload.translated_text || "").trim();
  if (!sourceText || !sourceHash || !targetLanguage || !translatedText) return null;
  return {
    document_id: documentId,
    page_index: Math.max(0, Math.trunc(cleanNumber(payload.page_index))),
    source_text: sourceText,
    source_hash: sourceHash,
    target_language: targetLanguage,
    provider: cleanProvider(payload.provider),
    translated_text: translatedText,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function cacheKey(entry: Pick<StoredParagraphTranslation, "source_hash" | "target_language" | "provider">) {
  return `${entry.source_hash}\n${entry.target_language.trim().toLowerCase()}\n${entry.provider}`;
}

export function registerParagraphTranslationIpc(ctx: IpcContext) {
  ipcMain.handle("paragraph-translations:list", (_event, documentId: string) => {
    ctx.getDocument(documentId);
    return ctx.listParagraphTranslations(documentId);
  });

  ipcMain.handle("paragraph-translations:save", (_event, documentId: string, payload: Record<string, unknown>) => {
    const document = ctx.getDocument(documentId);
    const timestamp = ctx.now();
    const entry = cleanParagraphTranslation(documentId, ctx.isRecord(payload) ? payload : {}, timestamp);
    if (!entry) throw new Error("Invalid paragraph translation.");
    const existing = ctx.listParagraphTranslations(documentId);
    const key = cacheKey(entry);
    const previous = existing.find((item) => cacheKey(item) === key);
    const nextEntry = previous ? { ...entry, created_at: previous.created_at, updated_at: timestamp } : entry;
    ctx.store.paragraph_translations[documentId] = [
      ...existing.filter((item) => cacheKey(item) !== key),
      nextEntry,
    ].sort((left, right) => left.updated_at.localeCompare(right.updated_at));
    document.updated_at = timestamp;
    ctx.saveStore();
    return nextEntry;
  });
}
