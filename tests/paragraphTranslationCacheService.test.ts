import { describe, expect, it } from "vitest";
import {
  buildParagraphTranslationSaveRequest,
  findParagraphTranslationCache,
  hashParagraphTranslationSource,
  normalizeParagraphTranslationText,
} from "@/services/ParagraphTranslationCacheService";
import type { ParagraphTranslation } from "@/types";

function entry(patch: Partial<ParagraphTranslation> = {}): ParagraphTranslation {
  const sourceText = patch.source_text || "A paragraph with irregular spacing.";
  return {
    document_id: "doc-1",
    page_index: 0,
    source_text: sourceText,
    source_hash: patch.source_hash || hashParagraphTranslationSource(sourceText),
    target_language: "Chinese",
    provider: "google",
    translated_text: "一段文字。",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("ParagraphTranslationCacheService", () => {
  it("normalizes source text before hashing", () => {
    expect(normalizeParagraphTranslationText(" A   paragraph\nwith\tspaces. ")).toBe("A paragraph with spaces.");
    expect(hashParagraphTranslationSource("A paragraph with spaces."))
      .toBe(hashParagraphTranslationSource(" A   paragraph\nwith\tspaces. "));
  });

  it("finds cache entries by source hash, target language, and provider", () => {
    const entries = [
      entry({ target_language: "English", translated_text: "wrong language" }),
      entry({ provider: "baidu", translated_text: "wrong provider" }),
      entry(),
    ];

    expect(findParagraphTranslationCache(entries, "A paragraph with irregular   spacing.", "Chinese", "google")?.translated_text)
      .toBe("一段文字。");
    expect(findParagraphTranslationCache(entries, "A paragraph with irregular spacing.", "English", "google")?.translated_text)
      .toBe("wrong language");
    expect(findParagraphTranslationCache(entries, "A paragraph with irregular spacing.", "Chinese", "baidu")?.translated_text)
      .toBe("wrong provider");
  });

  it("builds save requests and skips empty results", () => {
    expect(buildParagraphTranslationSaveRequest({
      pageIndex: 3.8,
      sourceText: " Source   paragraph. ",
      targetLanguage: "Chinese",
      provider: "google",
      translatedText: " 译文 ",
    })).toMatchObject({
      page_index: 3,
      source_text: "Source paragraph.",
      target_language: "Chinese",
      provider: "google",
      translated_text: "译文",
    });
    expect(buildParagraphTranslationSaveRequest({
      pageIndex: 0,
      sourceText: "Source",
      targetLanguage: "Chinese",
      provider: "google",
      translatedText: " ",
    })).toBeNull();
  });
});
