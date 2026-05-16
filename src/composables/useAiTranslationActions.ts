import type { Ref } from "vue";
import type { RightPanelTab } from "@/components/ReaderPanelTabs";
import { renderPdfRegionImage } from "@/pdf/pdfImageRendering";
import { findPdfFigureTargets } from "@/pdf/pdfReferences";
import type { PdfDocumentProxyLike, PdfTextItem } from "@/pdf/pdfTypes";
import { toIpcPlainObject } from "@/services/IpcPayloadService";
import {
  buildParagraphTranslationSaveRequest,
  findParagraphTranslationCache,
  normalizeParagraphTranslationText,
} from "@/services/ParagraphTranslationCacheService";
import { buildChatMessages } from "@/services/ReaderAiService";
import { buildReaderContextPayload } from "@/services/ReaderContextService";
import { filterReaderContextForAi } from "@/services/AiContextFilterService";
import type { AiChatRequest, Anchor, Annotation, DocumentContext, ReaderContextPayload, Settings } from "@/types";

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
  aiMessages: Ref<Array<{ role: "user" | "assistant"; content: string }>>;
  aiLoading: Ref<boolean>;
  pendingAiTask: Ref<AiChatRequest["task"] | null>;
  translationModal: Ref<TranslationModalState | null>;
  pageTextItems: Ref<Record<number, PdfTextItem[]>>;
  pdfDocument: Ref<PdfDocumentProxyLike | null>;
  rightPanelCollapsed: Ref<boolean>;
  rightPanelTab: Ref<RightPanelTab>;
  ensureAnchor: (createdFrom?: Anchor["created_from"]) => Promise<Anchor | null>;
  showNotice: (message: string) => void;
  onAiHistorySaved?: (documentId: string, history: Array<{ role: "user" | "assistant"; content: string }>) => void;
};

type TranslateSelectionOptions = {
  paragraphCache?: {
    pageIndex: number;
  };
};

export function useAiTranslationActions(options: UseAiTranslationActionsOptions) {
  let activeAiStreamCancel: (() => void) | null = null;

  function summaryFigureLimit() {
    const value = Number(options.settings.value?.summary_figure_attachment_limit ?? 10);
    if (!Number.isFinite(value)) return 10;
    return Math.min(20, Math.max(0, Math.trunc(value)));
  }

  async function saveAiHistory() {
    if (!options.context.value) return;
    const history = options.aiMessages.value
      .filter((message) => message.content.trim())
      .map((message) => ({ role: message.role, content: message.content }));
    const documentId = options.context.value.document.document_id;
    await window.paperReaderPlus.saveAiHistory(documentId, toIpcPlainObject(history));
    options.context.value.ai_history = history;
    options.onAiHistorySaved?.(documentId, history);
  }

  function buildExtractedPdfSummarySource() {
    const chunks = Object.entries(options.pageTextItems.value)
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([pageIndex, items]) => {
        const text = items.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();
        return text ? `Page ${Number(pageIndex) + 1}\n${text}` : "";
      })
      .filter(Boolean);
    return {
      mode: "pdf-extractor" as const,
      label: "PDF text extracted from loaded pages",
      content: chunks.join("\n\n").slice(0, 120000) || "(no loaded PDF text; scroll pages to load text or choose another summary source)",
    };
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
            content: latex.content.slice(0, 120000),
          },
        };
      } catch (cause) {
        options.showNotice(cause instanceof Error ? cause.message : String(cause));
        return { ...base, summary_source: buildExtractedPdfSummarySource() };
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
          label: "PDF text extracted from loaded pages",
          content: "(loaded PDF text context disabled in AI Context settings)",
        },
      };
    }
    const figureLimit = summaryFigureLimit();
    const next: ReaderContextPayload = { ...base, summary_source: buildExtractedPdfSummarySource() };
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
    return filterReaderContextForAi(buildReaderContextPayload({
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
    }), options.settings.value);
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

  async function sendAi(task: "chat" | "translate" | "summary" | "metaphor" = "chat", sendOptions?: {
    displayContent?: string;
    messages?: AiChatRequest["messages"];
    readerContext?: ReaderContextPayload;
  }) {
    if (!options.context.value || options.aiLoading.value) return;
    const initialReaderContext = sendOptions?.readerContext || buildCurrentReaderContext();
    if (!initialReaderContext) return;
    const readerContext = task === "summary"
      ? filterReaderContextForAi(await buildSummaryReaderContext(initialReaderContext), options.settings.value)
      : filterReaderContextForAi(initialReaderContext, options.settings.value);
    const userContent = sendOptions?.displayContent || (task === "summary" ? "Generate an evidence-linked summary." : options.aiInput.value.trim());
    if (!userContent && task !== "summary") return;
    const requestMessages = sendOptions?.messages || (task === "summary" ? [] : buildChatMessages(readerContext, options.aiInput.value.trim()));
    const history = options.aiMessages.value.map((message) => ({ role: message.role, content: message.content }));
    options.aiMessages.value.push({ role: "user", content: userContent });
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
      try {
        const response = await window.paperReaderPlus.aiChat(payload);
        options.aiMessages.value.push({ role: "assistant", content: response.content });
        options.summaryDraft.value = response.content;
        await saveAiHistory();
      } catch (cause) {
        options.aiMessages.value.push({ role: "assistant", content: cause instanceof Error ? cause.message : String(cause) });
        await saveAiHistory();
      } finally {
        options.aiLoading.value = false;
        options.pendingAiTask.value = null;
      }
      return;
    }

    const assistantIndex = options.aiMessages.value.push({ role: "assistant", content: "" }) - 1;
    const updateAssistant = (content: string) => {
      const current = options.aiMessages.value[assistantIndex];
      if (!current) return;
      options.aiMessages.value[assistantIndex] = { ...current, content };
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
    handlePanelSendAi,
    cancelActiveAiStream,
  };
}
