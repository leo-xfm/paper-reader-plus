import type { Ref } from "vue";
import type { RightPanelTab } from "@/components/ReaderPanelTabs";
import { extractPdfPageTextItems } from "@/pdf/pdfText";
import { renderPdfRegionImage } from "@/pdf/pdfImageRendering";
import { findPdfFigureTargets } from "@/pdf/pdfReferences";
import type { PdfDocumentProxyLike, PdfTextItem } from "@/pdf/pdfTypes";
import { toIpcPlainObject } from "@/services/IpcPayloadService";
import { buildPdfExtractorSummarySource } from "@/services/PdfSummarySourceService";
import { buildPdfTextBlocks, type PdfTextBlock } from "@/services/PdfParagraphActionService";
import {
  buildParagraphTranslationSaveRequest,
  findParagraphTranslationCache,
  normalizeParagraphTranslationText,
} from "@/services/ParagraphTranslationCacheService";
import { buildChatMessages } from "@/services/ReaderAiService";
import { buildReaderContextPayload, collectReaderEvidences } from "@/services/ReaderContextService";
import { filterReaderContextForAi } from "@/services/AiContextFilterService";
import type {
  AiChatRequest,
  AiHistoryVersion,
  AiRedoMode,
  Anchor,
  Annotation,
  DocumentContext,
  ReaderContextPayload,
  ReaderPackageAiHistory,
  ReaderPackageAiMessage,
  RectPct,
  Settings,
} from "@/types";

type TextSelection = {
  text: string;
  pageIndex: number;
  position?: { left: number; top: number; bottom?: number };
};

type TranslationModalState = {
  provider: "google" | "baidu";
  targetLanguage: string;
  sourceText: string;
  translatedText: string;
  loading: boolean;
  error: string;
  position: { left: number; top: number; bottom?: number } | null;
};

type UseAiTranslationActionsOptions = {
  context: Ref<DocumentContext | null>;
  selectionState: Ref<TextSelection | null>;
  activeAnchor: Ref<Anchor | null>;
  activeAnnotation: Ref<Annotation | null>;
  noteDraft: Ref<string>;
  summaryDraft: Ref<string>;
  settings: Ref<Settings | null>;
  aiInput: Ref<string>;
  aiMessages: Ref<ReaderPackageAiHistory>;
  aiLoading: Ref<boolean>;
  pendingAiTask: Ref<AiChatRequest["task"] | null>;
  aiSummaryOutputChars: Ref<number | null>;
  translationModal: Ref<TranslationModalState | null>;
  pageTextItems: Ref<Record<number, PdfTextItem[]>>;
  pdfDocument: Ref<PdfDocumentProxyLike | null>;
  rightPanelCollapsed: Ref<boolean>;
  rightPanelTab: Ref<RightPanelTab>;
  ensureAnchor: (createdFrom?: Anchor["created_from"]) => Promise<Anchor | null>;
  showNotice: (message: string) => void;
  onAiHistorySaved?: (documentId: string, history: ReaderPackageAiHistory) => void;
};

type TranslateSelectionOptions = {
  paragraphCache?: {
    pageIndex: number;
  };
};

function markdownIndentWidth(indent: string) {
  return indent.replace(/\t/g, "    ").length;
}

function lineHasIndentedChild(lines: string[], index: number, indentWidth: number) {
  for (let i = index + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    const match = /^(\s*)/.exec(line);
    const width = markdownIndentWidth(match?.[1] || "");
    if (width <= indentWidth) return false;
    return true;
  }
  return false;
}

function expandFoldableMarkdownLists(source: string) {
  const lines = source.split("\n");
  let changed = false;
  const nextLines = lines.map((line, index) => {
    const match = /^(\s*)\*(\s+)(?!\[[ xX]\](?:\s|$))/.exec(line);
    if (!match) return line;
    const [, indent, gap] = match;
    if (!lineHasIndentedChild(lines, index, markdownIndentWidth(indent))) return line;
    changed = true;
    return `${indent}+${gap}${line.slice(match[0].length)}`;
  });
  return changed ? nextLines.join("\n") : source;
}

export function useAiTranslationActions(options: UseAiTranslationActionsOptions) {
  let activeAiStreamCancel: (() => void) | null = null;

  function nowIso() {
    return new Date().toISOString();
  }

  function createTurnId() {
    return globalThis.crypto?.randomUUID?.() || `turn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function currentVersionIndex(message: ReaderPackageAiMessage) {
    const versions = message.versions || [];
    if (!versions.length) return -1;
    const index = Number(message.current_version);
    return Number.isFinite(index) ? Math.min(versions.length - 1, Math.max(0, Math.trunc(index))) : versions.length - 1;
  }

  function syncTurnVersion(userIndex: number, assistantIndex: number, versionIndex = currentVersionIndex(options.aiMessages.value[assistantIndex])) {
    const user = options.aiMessages.value[userIndex];
    const assistant = options.aiMessages.value[assistantIndex];
    const version = assistant?.versions?.[versionIndex];
    if (!user || !assistant || !version) return;
    const turnId = assistant.turn_id || user.turn_id || createTurnId();
    options.aiMessages.value[userIndex] = { ...user, turn_id: turnId, content: version.user_content };
    options.aiMessages.value[assistantIndex] = {
      ...assistant,
      turn_id: turnId,
      current_version: versionIndex,
      content: version.assistant_content,
    };
  }

  function ensureTurnMetadata(userIndex: number, assistantIndex: number) {
    const user = options.aiMessages.value[userIndex];
    const assistant = options.aiMessages.value[assistantIndex];
    if (!user || !assistant) return null;
    const turnId = assistant.turn_id || user.turn_id || createTurnId();
    const versions = assistant.versions?.length
      ? assistant.versions
      : [{
        user_content: user.content,
        assistant_content: assistant.content,
        created_at: nowIso(),
      }];
    const current = currentVersionIndex({ ...assistant, versions });
    options.aiMessages.value[userIndex] = { ...user, turn_id: turnId, content: versions[current].user_content };
    options.aiMessages.value[assistantIndex] = {
      ...assistant,
      turn_id: turnId,
      versions,
      current_version: current,
      content: versions[current].assistant_content,
    };
    return { turnId, versions, current };
  }

  function findTurnIndexes(turnId: string) {
    const legacyMatch = /^legacy-(\d+)$/.exec(turnId);
    if (legacyMatch) {
      const userIndex = Number(legacyMatch[1]);
      const assistantIndex = options.aiMessages.value.findIndex((message, index) => index > userIndex && message.role === "assistant");
      return assistantIndex >= 0 ? { userIndex, assistantIndex } : null;
    }
    const userIndex = options.aiMessages.value.findIndex((message) => message.role === "user" && message.turn_id === turnId);
    const assistantIndex = options.aiMessages.value.findIndex((message) => message.role === "assistant" && message.turn_id === turnId);
    return userIndex >= 0 && assistantIndex >= 0 ? { userIndex, assistantIndex } : null;
  }

  function visibleHistoryBefore(userIndex: number) {
    return options.aiMessages.value
      .slice(0, userIndex)
      .filter((message) => message.content.trim())
      .map((message) => ({ role: message.role, content: message.content }));
  }

  function appendTurnVersion(assistantIndex: number, version: AiHistoryVersion) {
    const assistant = options.aiMessages.value[assistantIndex];
    if (!assistant) return -1;
    const versions = [...(assistant.versions || []), version];
    const nextIndex = versions.length - 1;
    options.aiMessages.value[assistantIndex] = {
      ...assistant,
      versions,
      current_version: nextIndex,
      content: version.assistant_content,
    };
    return nextIndex;
  }

  function updateTurnVersion(assistantIndex: number, versionIndex: number, patch: Partial<AiHistoryVersion>) {
    const assistant = options.aiMessages.value[assistantIndex];
    if (!assistant?.versions?.[versionIndex]) return;
    const versions = assistant.versions.map((version, index) => index === versionIndex ? { ...version, ...patch } : version);
    options.aiMessages.value[assistantIndex] = {
      ...assistant,
      versions,
      content: versions[versionIndex]?.assistant_content || assistant.content,
    };
  }

  function redoPrompt(mode: AiRedoMode) {
    const current = options.settings.value;
    if (mode === "longer") return current?.ai_redo_longer_prompt || "";
    if (mode === "shorter") return current?.ai_redo_shorter_prompt || "";
    return current?.ai_redo_try_again_prompt || "";
  }

  function normalizeText(text: string) {
    return text.replace(/\s+/g, " ").trim();
  }

  function clampRect(rect: RectPct): RectPct {
    const left = Math.min(1, Math.max(0, rect.left));
    const top = Math.min(1, Math.max(0, rect.top));
    return {
      left,
      top,
      width: Math.min(1 - left, Math.max(0, rect.width)),
      height: Math.min(1 - top, Math.max(0, rect.height)),
    };
  }

  function mergeRects(rects: RectPct[]): RectPct | null {
    const valid = rects.filter((rect) => rect.width > 0 && rect.height > 0);
    if (!valid.length) return null;
    const left = Math.min(...valid.map((rect) => rect.left));
    const top = Math.min(...valid.map((rect) => rect.top));
    const right = Math.max(...valid.map((rect) => rect.left + rect.width));
    const bottom = Math.max(...valid.map((rect) => rect.top + rect.height));
    return clampRect({ left, top, width: right - left, height: bottom - top });
  }

  function blockEvidenceAnchorRequest(block: PdfTextBlock, blockIndex: number) {
    const rects = block.rects_pct.map(clampRect).filter((rect) => rect.width > 0 && rect.height > 0);
    const rect = rects.length ? mergeRects(rects) : null;
    const quote = normalizeText(block.text).slice(0, 900);
    return {
      page_index: block.page_index,
      page_label: String(block.page_index + 1),
      rects_pct: rects.length ? rects : rect ? [rect] : [],
      text_quote: {
        exact: quote || `PDF page ${block.page_index + 1}`,
      },
      created_from: "ai" as const,
      metadata: {
        kind: "pdf-page-evidence",
        scope: "block",
        block_id: block.block_id,
        block_index: blockIndex,
        block_kind: block.kind,
        source: "pdf-extractor",
      },
    };
  }

  function generatedPdfEvidenceAnchorsForDocument(scope?: "page" | "block") {
    const currentContext = options.context.value;
    const documentId = currentContext?.document.document_id;
    if (!documentId) return [];
    return currentContext.anchors.filter((anchor) => (
      anchor.document_id === documentId
        && anchor.metadata?.kind === "pdf-page-evidence"
        && (!scope || anchor.metadata?.scope === scope)
    ));
  }

  function summaryFigureLimit() {
    const value = Number(options.settings.value?.summary_figure_attachment_limit ?? 10);
    if (!Number.isFinite(value)) return 10;
    return Math.min(20, Math.max(0, Math.trunc(value)));
  }

  function summaryTextCharLimit() {
    const value = Number(options.settings.value?.summary_text_char_limit ?? 120000);
    if (!Number.isFinite(value)) return 120000;
    return Math.min(2000000, Math.max(0, Math.trunc(value)));
  }

  async function saveAiHistory() {
    if (!options.context.value) return;
    const history = options.aiMessages.value
      .filter((message) => message.content.trim())
      .map((message) => ({
        role: message.role,
        content: message.content,
        ...(message.turn_id ? { turn_id: message.turn_id } : {}),
        ...(message.versions?.length ? {
          current_version: currentVersionIndex(message),
          versions: message.versions,
        } : {}),
      }));
    const documentId = options.context.value.document.document_id;
    await window.paperReaderPlus.saveAiHistory(documentId, toIpcPlainObject(history));
    options.context.value.ai_history = history;
    options.onAiHistorySaved?.(documentId, history);
  }

  function limitSummaryText(content: string) {
    const limit = summaryTextCharLimit();
    return limit > 0 ? content.slice(0, limit) : content;
  }

  async function extractWholePdfTextItems() {
    const document = options.pdfDocument.value;
    if (!document) return options.pageTextItems.value;
    const next = { ...options.pageTextItems.value };
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const pageIndex = pageNumber - 1;
      if (next[pageIndex]?.length) continue;
      try {
        next[pageIndex] = await extractPdfPageTextItems(document, pageNumber);
      } catch {
        next[pageIndex] = [];
      }
    }
    options.pageTextItems.value = next;
    return next;
  }

  async function ensurePageLevelEvidenceAnchors(pageItems: Record<number, PdfTextItem[]>) {
    const currentContext = options.context.value;
    if (!currentContext) return [];
    const documentId = currentContext.document.document_id;
    const existingByBlock = new Map(generatedPdfEvidenceAnchorsForDocument("block").map((anchor) => [
      `${anchor.page_index}:${String(anchor.metadata?.block_id || "")}`,
      anchor,
    ]));
    const pages = Object.entries(pageItems)
      .map(([pageIndex, items]) => ({ pageIndex: Number(pageIndex), items }))
      .filter(({ pageIndex, items }) => Number.isFinite(pageIndex) && items.some((item) => item.text.trim()))
      .sort((left, right) => left.pageIndex - right.pageIndex);
    const anchors: Anchor[] = [];
    for (const { pageIndex, items } of pages) {
      const blocks = buildPdfTextBlocks(pageIndex, items, {
        minTextLength: 1,
        paragraphGapMultiplier: 1.65,
      }).filter((block) => normalizeText(block.text).length >= 12);
      for (const [blockIndex, block] of blocks.entries()) {
        const key = `${pageIndex}:${block.block_id}`;
        const existing = existingByBlock.get(key);
        if (existing) {
          anchors.push(existing);
          continue;
        }
        const payload = toIpcPlainObject(blockEvidenceAnchorRequest(block, blockIndex));
        const anchor = await window.paperReaderPlus.createAnchor(documentId, payload);
        currentContext.anchors = [...currentContext.anchors, anchor];
        existingByBlock.set(key, anchor);
        anchors.push(anchor);
      }
      if (blocks.length) {
        continue;
      }
      const rect = mergeRects(items.map((item) => item.rectPct));
      const fallbackBlock: PdfTextBlock = {
        block_id: `${pageIndex}:fallback`,
        page_index: pageIndex,
        kind: "paragraph",
        text: normalizeText(items.map((item) => item.text).join(" ")),
        top: rect?.top || 0,
        height: rect?.height || 0,
        rects_pct: rect ? [rect] : [],
      };
      const fallbackKey = `${pageIndex}:${fallbackBlock.block_id}`;
      const existing = existingByBlock.get(fallbackKey);
      if (existing) {
        anchors.push(existing);
        continue;
      }
      const payload = toIpcPlainObject(blockEvidenceAnchorRequest(fallbackBlock, 0));
      const anchor = await window.paperReaderPlus.createAnchor(documentId, payload);
      currentContext.anchors = [...currentContext.anchors, anchor];
      existingByBlock.set(fallbackKey, anchor);
      anchors.push(anchor);
    }
    return anchors;
  }

  function refreshReaderEvidences(context: ReaderContextPayload): ReaderContextPayload {
    if (!options.context.value) return context;
    const documentId = options.context.value.document.document_id;
    const blockEvidenceAnchors = generatedPdfEvidenceAnchorsForDocument("block");
    const hasBlockEvidenceAnchors = blockEvidenceAnchors.length > 0;
    const evidenceLimit = Math.max(12, blockEvidenceAnchors.length || generatedPdfEvidenceAnchorsForDocument().length);
    return {
      ...context,
      evidences: collectReaderEvidences({
        anchors: options.context.value.anchors.filter((anchor) => (
          anchor.document_id === documentId
            && (!hasBlockEvidenceAnchors || !(anchor.metadata?.kind === "pdf-page-evidence" && anchor.metadata?.scope === "page"))
        )),
        annotations: options.context.value.annotations.filter((annotation) => annotation.document_id === documentId),
      }, evidenceLimit),
    };
  }

  async function buildExtractedPdfSummarySource() {
    const pageItems = await extractWholePdfTextItems();
    return buildPdfExtractorSummarySource({
      documentId: options.context.value?.document.document_id || "",
      pageItems,
      pdfDocument: options.pdfDocument.value,
      settings: {
        simpletex_ocr_enabled: options.settings.value?.simpletex_ocr_enabled === true,
        simpletex_ocr_token: options.settings.value?.simpletex_ocr_token || "",
      },
      textCharLimit: summaryTextCharLimit(),
      recognizeLatexImage: window.paperReaderPlus.recognizeLatexImage,
    });
  }

  async function addLoadedPdfContext(context: ReaderContextPayload): Promise<ReaderContextPayload> {
    if (options.settings.value?.ai_send_loaded_pdf_text === false) return context;
    const pageItems = await extractWholePdfTextItems();
    const source = await buildPdfExtractorSummarySource({
      documentId: options.context.value?.document.document_id || "",
      pageItems,
      pdfDocument: options.pdfDocument.value,
      settings: {
        simpletex_ocr_enabled: options.settings.value?.simpletex_ocr_enabled === true,
        simpletex_ocr_token: options.settings.value?.simpletex_ocr_token || "",
      },
      textCharLimit: summaryTextCharLimit(),
      recognizeLatexImage: window.paperReaderPlus.recognizeLatexImage,
    });
    let next: ReaderContextPayload = { ...context, summary_source: source };
    if (!generatedPdfEvidenceAnchorsForDocument("block").length) {
      await ensurePageLevelEvidenceAnchors(pageItems);
      next = refreshReaderEvidences(next);
    } else if (!next.evidences.length) {
      next = refreshReaderEvidences(next);
    }
    return next;
  }

  async function buildSummaryReaderContext(base: ReaderContextPayload): Promise<ReaderContextPayload> {
    const mode = options.settings.value?.summary_source || "pdf-extractor";
    if (!options.context.value) return base;
    if (mode === "latex") {
      try {
        const latex = await window.paperReaderPlus.getLatexSource(options.context.value.document.document_id);
        return {
          ...base,
          summary_source: {
            mode,
            label: `LaTeX source: ${latex.file_name}`,
            content: limitSummaryText(latex.content),
          },
        };
      } catch (cause) {
        options.showNotice(cause instanceof Error ? cause.message : String(cause));
        return { ...base, summary_source: await buildExtractedPdfSummarySource() };
      }
    }
    if (mode === "pdf-direct") {
      return {
        ...base,
        summary_source: {
          mode,
          label: "PDF file attached directly to the AI request",
          content: "The PDF file is attached directly to this request. Use it as the primary source when your API supports PDF/file inputs.",
        },
      };
    }
    if (options.settings.value?.ai_send_loaded_pdf_text === false) {
      options.showNotice("Loaded PDF text context is disabled in AI Context settings");
      return {
        ...base,
        summary_source: {
          mode: "pdf-extractor",
          label: "PDF text extracted from the whole document",
          content: "(loaded PDF text context disabled in AI Context settings)",
        },
      };
    }
    const figureLimit = summaryFigureLimit();
    const summarySource = await buildExtractedPdfSummarySource();
    const pageItems = options.pageTextItems.value;
    let next: ReaderContextPayload = { ...base, summary_source: summarySource };
    if (!generatedPdfEvidenceAnchorsForDocument("block").length) {
      await ensurePageLevelEvidenceAnchors(pageItems);
      next = refreshReaderEvidences(next);
    } else if (!next.evidences.length) {
      next = refreshReaderEvidences(next);
    }
    if (!options.pdfDocument.value || figureLimit <= 0) return next;
    try {
      const targets = await findPdfFigureTargets(options.pdfDocument.value, figureLimit);
      const figureAttachments = [];
      for (const target of targets.slice(0, figureLimit)) {
        const dataUrl = await renderPdfRegionImage(options.pdfDocument.value, target.page_index, target.preview_rect_pct, {
          targetWidth: 1200,
          minScale: 1,
          maxScale: 2.4,
        });
        if (!dataUrl) continue;
        figureAttachments.push({
          figure_id: target.figure_id,
          label: target.label,
          caption: target.caption,
          page_index: target.page_index,
          rect_pct: target.preview_rect_pct,
          data_url: dataUrl,
        });
      }
      return { ...next, figure_attachments: figureAttachments };
    } catch (cause) {
      options.showNotice(cause instanceof Error ? cause.message : String(cause));
      return next;
    }
  }

  function buildCurrentReaderContext(selectionAnchor = options.activeAnchor.value, selectionAnnotation = options.activeAnnotation.value): ReaderContextPayload | null {
    if (!options.context.value) return null;
    return buildReaderContextPayload({
      document: options.context.value.document,
      context: options.context.value,
      note: options.noteDraft.value,
      summary: options.summaryDraft.value,
      selection: options.selectionState.value ? {
        text: options.selectionState.value.text,
        page_index: options.selectionState.value.pageIndex,
        anchor: selectionAnchor,
        annotation: selectionAnnotation,
      } : null,
      activeAnchor: selectionAnchor,
      activeAnnotation: selectionAnnotation,
    });
  }

  async function askAiAboutSelection() {
    if (!options.selectionState.value) {
      options.showNotice("Select text first");
      return;
    }
    const anchor = await options.ensureAnchor("ai");
    if (!anchor) return;
    options.rightPanelCollapsed.value = false;
    options.rightPanelTab.value = "ai";
    options.aiInput.value = `Explain selected text:\n\n${options.selectionState.value.text}`;
  }

  async function explainSelectionWithMetaphor() {
    if (!options.selectionState.value) {
      options.showNotice("Select text first");
      return;
    }
    const anchor = await options.ensureAnchor("ai");
    if (!anchor) return;
    options.rightPanelCollapsed.value = false;
    options.rightPanelTab.value = "ai";
    const relatedAnnotation = options.activeAnnotation.value?.anchor_id === anchor.anchor_id ? options.activeAnnotation.value : null;
    const readerContext = buildCurrentReaderContext(anchor, relatedAnnotation);
    if (!readerContext) return;
    await sendAi("metaphor", {
      displayContent: `Explain with metaphor:\n\n${options.selectionState.value.text}`,
      messages: [],
      readerContext,
    });
  }

  async function translateSelection(translateOptions: TranslateSelectionOptions = {}) {
    if (!options.selectionState.value) {
      options.showNotice("Select text first");
      return;
    }
    const targetLanguage = options.settings.value?.translator_target_language || "Chinese";
    const provider = options.settings.value?.translation_provider || "google";
    const paragraphCache = translateOptions.paragraphCache;
    if (paragraphCache && options.settings.value?.translator_mode === "api" && options.context.value) {
      const sourceText = normalizeParagraphTranslationText(options.selectionState.value.text);
      const cached = findParagraphTranslationCache(
        options.context.value.paragraph_translations,
        sourceText,
        targetLanguage,
        provider,
      );
      if (cached) {
        options.translationModal.value = {
          provider,
          targetLanguage,
          sourceText: cached.source_text,
          translatedText: cached.translated_text,
          loading: false,
          error: "",
          position: options.selectionState.value.position || null,
        };
        return;
      }
    }
    const anchor = await options.ensureAnchor("ai");
    if (!anchor) return;
    const relatedAnnotation = options.activeAnnotation.value?.anchor_id === anchor.anchor_id ? options.activeAnnotation.value : null;
    const readerContext = buildCurrentReaderContext(anchor, relatedAnnotation);
    if (!readerContext) return;
    if (options.settings.value?.translator_mode === "api") {
      options.translationModal.value = {
        provider,
        targetLanguage,
        sourceText: options.selectionState.value.text,
        translatedText: "",
        loading: true,
        error: "",
        position: options.selectionState.value.position || null,
      };
      try {
        const response = await window.paperReaderPlus.translateSelection(toIpcPlainObject({
          text: options.selectionState.value.text,
          target_language: targetLanguage,
          task: "translate",
          document: options.context.value?.document || null,
          selection: readerContext.selection,
          reader_context: readerContext,
          messages: [],
        }));
        if (options.translationModal.value) {
          options.translationModal.value.translatedText = response.content;
          options.translationModal.value.loading = false;
        }
        if (paragraphCache && options.context.value) {
          const request = buildParagraphTranslationSaveRequest({
            pageIndex: paragraphCache.pageIndex,
            sourceText: options.selectionState.value.text,
            targetLanguage,
            provider,
            translatedText: response.content,
          });
          if (request) {
            const saved = await window.paperReaderPlus.saveParagraphTranslation(options.context.value.document.document_id, toIpcPlainObject(request));
            options.context.value.paragraph_translations = [
              ...(options.context.value.paragraph_translations || []).filter((entry) =>
                !(entry.source_hash === saved.source_hash
                  && entry.target_language.trim().toLowerCase() === saved.target_language.trim().toLowerCase()
                  && entry.provider === saved.provider)
              ),
              saved,
            ];
          }
        }
      } catch (cause) {
        if (options.translationModal.value) {
          options.translationModal.value.error = cause instanceof Error ? cause.message : String(cause);
          options.translationModal.value.loading = false;
        }
      }
      return;
    }

    options.rightPanelCollapsed.value = false;
    options.rightPanelTab.value = "ai";
    await sendAi("translate", {
      displayContent: `Translate selected text to ${targetLanguage}:\n\n${options.selectionState.value.text}`,
      messages: [],
      readerContext,
    });
  }

  async function sendTurnVersion(turnId: string, question: string, redoMode?: AiRedoMode) {
    if (!options.context.value || options.aiLoading.value) return;
    const indexes = findTurnIndexes(turnId);
    const normalizedQuestion = question.trim();
    if (!indexes || !normalizedQuestion) return;
    const metadata = ensureTurnMetadata(indexes.userIndex, indexes.assistantIndex);
    if (!metadata) return;
    const initialReaderContext = buildCurrentReaderContext();
    if (!initialReaderContext) return;
    const readerContext = filterReaderContextForAi(await addLoadedPdfContext(initialReaderContext), options.settings.value);
    const promptAppend = redoMode ? redoPrompt(redoMode) : "";
    const requestMessages = buildChatMessages(readerContext, normalizedQuestion, promptAppend);
    const history = visibleHistoryBefore(indexes.userIndex);
    const versionIndex = appendTurnVersion(indexes.assistantIndex, {
      user_content: normalizedQuestion,
      assistant_content: "",
      ...(redoMode ? { redo_mode: redoMode } : {}),
      ...(promptAppend ? { prompt_append: promptAppend } : {}),
      created_at: nowIso(),
    });
    if (versionIndex < 0) return;
    syncTurnVersion(indexes.userIndex, indexes.assistantIndex, versionIndex);
    options.aiLoading.value = true;
    options.pendingAiTask.value = "chat";
    const payload = toIpcPlainObject({
      task: "chat",
      document: options.context.value.document,
      document_id: options.context.value.document.document_id,
      summary_source_mode: options.settings.value?.summary_source || "pdf-extractor",
      selection: readerContext.selection,
      reader_context: readerContext,
      messages: [...history, ...requestMessages],
    }) as AiChatRequest;
    const setAssistantContent = (content: string) => {
      updateTurnVersion(indexes.assistantIndex, versionIndex, { assistant_content: content });
      syncTurnVersion(indexes.userIndex, indexes.assistantIndex, versionIndex);
    };
    try {
      activeAiStreamCancel = window.paperReaderPlus.aiChatStream(payload, {
        onDelta: (delta) => {
          const current = options.aiMessages.value[indexes.assistantIndex]?.versions?.[versionIndex]?.assistant_content || "";
          setAssistantContent(`${current}${delta}`);
        },
        onDone: (content) => {
          const current = options.aiMessages.value[indexes.assistantIndex]?.versions?.[versionIndex]?.assistant_content || "";
          if (!current && content) setAssistantContent(content);
          void saveAiHistory().finally(() => {
            options.aiLoading.value = false;
            options.pendingAiTask.value = null;
            activeAiStreamCancel = null;
          });
        },
        onError: (message) => {
          const current = options.aiMessages.value[indexes.assistantIndex]?.versions?.[versionIndex]?.assistant_content || "";
          setAssistantContent(current ? `${current}\n\n${message}` : message);
          void saveAiHistory().finally(() => {
            options.aiLoading.value = false;
            options.pendingAiTask.value = null;
            activeAiStreamCancel = null;
          });
        },
        onCancel: () => {
          const current = options.aiMessages.value[indexes.assistantIndex]?.versions?.[versionIndex]?.assistant_content || "";
          setAssistantContent(current ? `${current}\n\n[Stopped]` : "[Stopped]");
          void saveAiHistory().finally(() => {
            options.aiLoading.value = false;
            options.pendingAiTask.value = null;
            activeAiStreamCancel = null;
          });
        },
      });
    } catch (cause) {
      setAssistantContent(cause instanceof Error ? cause.message : String(cause));
      await saveAiHistory();
      options.aiLoading.value = false;
      options.pendingAiTask.value = null;
      activeAiStreamCancel = null;
    }
  }

  async function sendAiForTurnEdit(turnId: string, editedQuestion: string) {
    await sendTurnVersion(turnId, editedQuestion);
  }

  async function redoAiTurn(turnId: string, mode: AiRedoMode) {
    const indexes = findTurnIndexes(turnId);
    if (!indexes) return;
    const metadata = ensureTurnMetadata(indexes.userIndex, indexes.assistantIndex);
    if (!metadata) return;
    const assistant = options.aiMessages.value[indexes.assistantIndex];
    const version = assistant?.versions?.[currentVersionIndex(assistant)];
    await sendTurnVersion(turnId, version?.user_content || options.aiMessages.value[indexes.userIndex]?.content || "", mode);
  }

  async function showAiTurnVersion(turnId: string, versionIndex: number) {
    const indexes = findTurnIndexes(turnId);
    if (!indexes) return;
    const metadata = ensureTurnMetadata(indexes.userIndex, indexes.assistantIndex);
    if (!metadata) return;
    const assistant = options.aiMessages.value[indexes.assistantIndex];
    if (!assistant?.versions?.[versionIndex]) return;
    syncTurnVersion(indexes.userIndex, indexes.assistantIndex, versionIndex);
    await saveAiHistory();
  }

  async function sendAi(task: "chat" | "translate" | "summary" | "metaphor" = "chat", sendOptions?: {
    displayContent?: string;
    messages?: AiChatRequest["messages"];
    readerContext?: ReaderContextPayload;
  }) {
    if (!options.context.value || options.aiLoading.value) return;
    const initialReaderContext = sendOptions?.readerContext || buildCurrentReaderContext();
    if (!initialReaderContext) return;
    const enrichedReaderContext = task === "summary"
      ? await buildSummaryReaderContext(initialReaderContext)
      : task === "chat"
        ? await addLoadedPdfContext(initialReaderContext)
        : initialReaderContext;
    const readerContext = filterReaderContextForAi(enrichedReaderContext, options.settings.value);
    const userContent = sendOptions?.displayContent || (task === "summary" ? "Generate an evidence-linked summary." : options.aiInput.value.trim());
    if (!userContent && task !== "summary") return;
    const requestMessages = sendOptions?.messages || (task === "summary" ? [] : buildChatMessages(readerContext, userContent));
    const history = options.aiMessages.value.map((message) => ({ role: message.role, content: message.content }));
    const turnId = createTurnId();
    options.aiMessages.value.push({ role: "user", content: userContent, turn_id: turnId });
    options.aiInput.value = "";
    options.aiLoading.value = true;
    options.pendingAiTask.value = task;
    const payload = toIpcPlainObject({
      task,
      document: options.context.value.document,
      document_id: options.context.value.document.document_id,
      summary_source_mode: options.settings.value?.summary_source || "pdf-extractor",
      selection: readerContext.selection,
      reader_context: readerContext,
      messages: [...history, ...requestMessages],
    }) as AiChatRequest;
    if (task === "summary") {
      const assistantIndex = options.aiMessages.value.push({
        role: "assistant",
        content: "",
        turn_id: turnId,
        current_version: 0,
        versions: [{
          user_content: userContent,
          assistant_content: "",
          created_at: nowIso(),
        }],
      }) - 1;
      let latestSummaryContent = "";
      let summaryStatusTimer: number | null = window.setInterval(() => {
        options.aiSummaryOutputChars.value = latestSummaryContent.length;
      }, 5000);
      options.aiSummaryOutputChars.value = 0;
      const stopSummaryStatusTimer = () => {
        if (summaryStatusTimer !== null) window.clearInterval(summaryStatusTimer);
        summaryStatusTimer = null;
      };
      const commitSummaryAssistant = (content: string) => {
        const expandedContent = expandFoldableMarkdownLists(content);
        options.summaryDraft.value = expandedContent;
        const current = options.aiMessages.value[assistantIndex];
        if (!current) return;
        const versions = current.versions?.length
          ? current.versions.map((version, index) => index === 0 ? { ...version, assistant_content: expandedContent } : version)
          : [{ user_content: userContent, assistant_content: expandedContent, created_at: nowIso() }];
        options.aiMessages.value[assistantIndex] = { ...current, content: expandedContent, versions, current_version: 0 };
      };
      try {
        activeAiStreamCancel = window.paperReaderPlus.aiChatStream(payload, {
          onDelta: (delta) => {
            latestSummaryContent = `${latestSummaryContent}${delta}`;
          },
          onDone: (content) => {
            if (!latestSummaryContent && content) latestSummaryContent = content;
            options.aiSummaryOutputChars.value = latestSummaryContent.length;
            commitSummaryAssistant(latestSummaryContent);
            void saveAiHistory().finally(() => {
              stopSummaryStatusTimer();
              options.aiLoading.value = false;
              options.pendingAiTask.value = null;
              options.aiSummaryOutputChars.value = null;
              activeAiStreamCancel = null;
            });
          },
          onError: (message) => {
            latestSummaryContent = latestSummaryContent ? `${latestSummaryContent}\n\n${message}` : message;
            options.aiSummaryOutputChars.value = latestSummaryContent.length;
            commitSummaryAssistant(latestSummaryContent);
            void saveAiHistory().finally(() => {
              stopSummaryStatusTimer();
              options.aiLoading.value = false;
              options.pendingAiTask.value = null;
              options.aiSummaryOutputChars.value = null;
              activeAiStreamCancel = null;
            });
          },
          onCancel: () => {
            latestSummaryContent = latestSummaryContent ? `${latestSummaryContent}\n\n[Stopped]` : "[Stopped]";
            options.aiSummaryOutputChars.value = latestSummaryContent.length;
            commitSummaryAssistant(latestSummaryContent);
            void saveAiHistory().finally(() => {
              stopSummaryStatusTimer();
              options.aiLoading.value = false;
              options.pendingAiTask.value = null;
              options.aiSummaryOutputChars.value = null;
              activeAiStreamCancel = null;
            });
          },
        });
      } catch (cause) {
        const content = cause instanceof Error ? cause.message : String(cause);
        latestSummaryContent = content;
        options.aiSummaryOutputChars.value = latestSummaryContent.length;
        commitSummaryAssistant(content);
        await saveAiHistory();
        stopSummaryStatusTimer();
        options.aiLoading.value = false;
        options.pendingAiTask.value = null;
        options.aiSummaryOutputChars.value = null;
        activeAiStreamCancel = null;
      }
      return;
    }

    const assistantIndex = options.aiMessages.value.push({
      role: "assistant",
      content: "",
      turn_id: turnId,
      current_version: 0,
      versions: [{
        user_content: userContent,
        assistant_content: "",
        created_at: nowIso(),
      }],
    }) - 1;
    const updateAssistant = (content: string) => {
      const current = options.aiMessages.value[assistantIndex];
      if (!current) return;
      const versions = current.versions?.length
        ? current.versions.map((version, index) => index === 0 ? { ...version, assistant_content: content } : version)
        : [{ user_content: userContent, assistant_content: content, created_at: nowIso() }];
      options.aiMessages.value[assistantIndex] = { ...current, content, versions, current_version: 0 };
    };
    try {
      activeAiStreamCancel = window.paperReaderPlus.aiChatStream(payload, {
        onDelta: (delta) => {
          const current = options.aiMessages.value[assistantIndex]?.content || "";
          updateAssistant(`${current}${delta}`);
        },
        onDone: (content) => {
          if (!options.aiMessages.value[assistantIndex]?.content && content) updateAssistant(content);
          void saveAiHistory().finally(() => {
            options.aiLoading.value = false;
            options.pendingAiTask.value = null;
            activeAiStreamCancel = null;
          });
        },
        onError: (message) => {
          const current = options.aiMessages.value[assistantIndex]?.content || "";
          updateAssistant(current ? `${current}\n\n${message}` : message);
          void saveAiHistory().finally(() => {
            options.aiLoading.value = false;
            options.pendingAiTask.value = null;
            activeAiStreamCancel = null;
          });
        },
        onCancel: () => {
          const current = options.aiMessages.value[assistantIndex]?.content || "";
          updateAssistant(current ? `${current}\n\n[Stopped]` : "[Stopped]");
          void saveAiHistory().finally(() => {
            options.aiLoading.value = false;
            options.pendingAiTask.value = null;
            activeAiStreamCancel = null;
          });
        },
      });
    } catch (cause) {
      updateAssistant(cause instanceof Error ? cause.message : String(cause));
      await saveAiHistory();
      options.aiLoading.value = false;
      options.pendingAiTask.value = null;
      activeAiStreamCancel = null;
    }
  }

  function handlePanelSendAi(task?: "chat" | "summary") {
    void sendAi(task || "chat");
  }

  function cancelActiveAiStream() {
    activeAiStreamCancel?.();
  }

  return {
    buildCurrentReaderContext,
    askAiAboutSelection,
    explainSelectionWithMetaphor,
    translateSelection,
    sendAi,
    sendAiForTurnEdit,
    redoAiTurn,
    showAiTurnVersion,
    handlePanelSendAi,
    cancelActiveAiStream,
  };
}
