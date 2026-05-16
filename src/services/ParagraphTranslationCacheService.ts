import type { ParagraphTranslation, ParagraphTranslationProvider, ParagraphTranslationSaveRequest } from "@/types";

export function normalizeParagraphTranslationText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function hashParagraphTranslationSource(text: string) {
  const normalized = normalizeParagraphTranslationText(text);
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function paragraphTranslationCacheKey(value: Pick<ParagraphTranslation, "source_hash" | "target_language" | "provider">) {
  return `${value.source_hash}\n${value.target_language.trim().toLowerCase()}\n${value.provider}`;
}

export function findParagraphTranslationCache(
  entries: ParagraphTranslation[] | undefined,
  sourceText: string,
  targetLanguage: string,
  provider: ParagraphTranslationProvider,
) {
  const sourceHash = hashParagraphTranslationSource(sourceText);
  const key = paragraphTranslationCacheKey({ source_hash: sourceHash, target_language: targetLanguage, provider });
  return (entries || []).find((entry) => paragraphTranslationCacheKey(entry) === key) || null;
}

export function buildParagraphTranslationSaveRequest(input: {
  pageIndex: number;
  sourceText: string;
  targetLanguage: string;
  provider: ParagraphTranslationProvider;
  translatedText: string;
}): ParagraphTranslationSaveRequest | null {
  const sourceText = normalizeParagraphTranslationText(input.sourceText);
  const translatedText = input.translatedText.trim();
  const targetLanguage = input.targetLanguage.trim();
  if (!sourceText || !translatedText || !targetLanguage) return null;
  return {
    page_index: Math.max(0, Math.trunc(input.pageIndex)),
    source_text: sourceText,
    source_hash: hashParagraphTranslationSource(sourceText),
    target_language: targetLanguage,
    provider: input.provider,
    translated_text: translatedText,
  };
}
