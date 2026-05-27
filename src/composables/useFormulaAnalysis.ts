import { ref, watch, type Ref } from "vue";
import type { I18nKey } from "@/i18n";
import type { PdfDocumentProxyLike, PdfTextItem } from "@/pdf/pdfTypes";
import { extractPdfPageTextItems } from "@/pdf/pdfText";
import { renderPdfRegionImage } from "@/pdf/pdfImageRendering";
import { toIpcPlainObject } from "@/services/IpcPayloadService";
import {
  buildPendingFormulaFromCandidate,
  extractFormulaCandidatesFromLatex,
  extractPdfFullTextFormulaCandidates,
  formulaIdForCandidate,
  mergeFormulaAnalyses,
  parseAiFormulaAnalyses,
  type FormulaCandidate,
  type FormulaExtractionProgress,
} from "@/services/FormulaAnalysisService";
import type { DocumentContext, FormulaAnalysis, RectPct, Settings, SymbolDefinition } from "@/types";

type UseFormulaAnalysisOptions = {
  context: Ref<DocumentContext | null>;
  loading: Ref<boolean>;
  formulas: Ref<FormulaAnalysis[]>;
  pageTextItems: Ref<Record<number, PdfTextItem[]>>;
  pdfDocument: Ref<PdfDocumentProxyLike | null>;
  settings: Ref<Settings | null>;
  symbols: Ref<SymbolDefinition[]>;
  requestFormulaAi: (params: {
    mode: "batch" | "single";
    source: "pdf" | "latex";
    symbols: SymbolDefinition[];
    candidates?: FormulaCandidate[];
    candidate?: FormulaCandidate;
    latex?: string;
    rawText?: string;
  }) => Promise<string>;
  showNotice: (message: string) => void;
  t: (key: I18nKey, params?: Record<string, string | number>) => string;
};

function mergeRects(rects: RectPct[] = []) {
  const valid = rects.filter((rect) => rect.width > 0 && rect.height > 0);
  if (!valid.length) return null;
  const left = Math.min(...valid.map((rect) => rect.left));
  const top = Math.min(...valid.map((rect) => rect.top));
  const right = Math.max(...valid.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...valid.map((rect) => rect.top + rect.height));
  return { left, top, width: right - left, height: bottom - top };
}

function sameDocument(options: UseFormulaAnalysisOptions, documentId: string) {
  return options.context.value?.document.document_id === documentId;
}

function formulaErrorMessage(cause: unknown) {
  const raw = cause instanceof Error ? cause.message : String(cause);
  const withoutIpcPrefix = raw.replace(/^Error invoking remote method '[^']+':\s*/i, "").trim();
  if (/fetch failed/i.test(withoutIpcPrefix)) {
    return "AI request failed before a response was received. Check the Agent API URL, API key, proxy, and network connection, then retry.";
  }
  return withoutIpcPrefix || "Formula analysis failed.";
}

export function useFormulaAnalysis(options: UseFormulaAnalysisOptions) {
  const formulaRefreshProgress = ref<FormulaExtractionProgress | null>(null);
  const activeFormulaId = ref("");
  let formulaSaveTimer: number | null = null;
  let lastFormulaPersistKey = "";

  async function persistFormulas(documentId: string, nextFormulas = options.formulas.value) {
    if (!documentId) return;
    const payload = nextFormulas.map((formula) => ({ ...formula }));
    const key = `${documentId}:${JSON.stringify(payload)}`;
    if (key === lastFormulaPersistKey) return;
    lastFormulaPersistKey = key;
    try {
      const saved = await window.paperReaderPlus.saveFormulas(documentId, toIpcPlainObject(payload));
      if (sameDocument(options, documentId) && options.context.value) {
        options.formulas.value = saved;
        options.context.value.formulas = saved;
      }
    } catch (cause) {
      options.showNotice(formulaErrorMessage(cause));
    }
  }

  watch(() => options.formulas.value, () => {
    if (!options.context.value || options.loading.value) return;
    const documentId = options.context.value.document.document_id;
    if (formulaSaveTimer !== null) window.clearTimeout(formulaSaveTimer);
    formulaSaveTimer = window.setTimeout(() => {
      formulaSaveTimer = null;
      void persistFormulas(documentId);
    }, 700);
  }, { deep: true });

  async function extractWholePdfTextItems() {
    const document = options.pdfDocument.value;
    const sourceItems = options.pageTextItems.value;
    if (!document) return sourceItems;
    const next = { ...sourceItems };
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

  async function candidatesForCurrentDocument(source: "pdf" | "latex") {
    const current = options.context.value;
    if (!current) return [];
    const documentId = current.document.document_id;
    if (source === "latex") {
      if (!current.document.latex_path) throw new Error(options.t("app.attachLatexFirst"));
      formulaRefreshProgress.value = { status: options.t("formula.progress.collectingCandidates"), percent: 8 };
      const latex = await window.paperReaderPlus.getLatexSource(documentId);
      return extractFormulaCandidatesFromLatex(documentId, latex.content);
    }
    formulaRefreshProgress.value = { status: options.t("formula.progress.collectingCandidates"), percent: 8 };
    const pageItems = await extractWholePdfTextItems();
    return extractPdfFullTextFormulaCandidates(documentId, pageItems);
  }

  async function enrichPdfLatex(documentId: string, formulas: FormulaAnalysis[], candidates: FormulaCandidate[]) {
    if (!options.pdfDocument.value) return formulas;
    if (!formulas.some((formula) => formula.source === "pdf")) return formulas;
    if (!options.settings.value?.simpletex_ocr_token?.trim()) return formulas;
    const candidateByFormulaId = new Map(candidates.map((candidate) => [formulaIdForCandidate(documentId, candidate), candidate]));
    const next: FormulaAnalysis[] = [];
    for (let index = 0; index < formulas.length; index += 1) {
      const formula = formulas[index];
      if (formula.source !== "pdf") {
        next.push(formula);
        continue;
      }
      formulaRefreshProgress.value = {
        status: options.t("formula.progress.ocr", { current: index + 1, total: formulas.length }),
        percent: 55 + Math.round(((index + 1) / Math.max(1, formulas.length)) * 28),
      };
      try {
        const candidate = candidateByFormulaId.get(formula.formula_id);
        const rect = mergeRects(candidate?.rects_pct || formula.rects_pct);
        if (!rect) throw new Error("Formula region is unavailable.");
        const dataUrl = await renderPdfRegionImage(options.pdfDocument.value, formula.page_index ?? candidate?.page_index ?? 0, rect, {
          targetWidth: 1200,
          minScale: 1.8,
          maxScale: 3.5,
        });
        const recognized = await window.paperReaderPlus.recognizeLatexImage(dataUrl);
        next.push({
          ...formula,
          latex: recognized.latex || formula.latex,
          request_id: recognized.request_id || formula.request_id,
          confidence: Math.max(formula.confidence || 0, recognized.conf || 0),
          updated_at: new Date().toISOString(),
        });
      } catch (cause) {
        next.push({
          ...formula,
          status: "error",
          error: cause instanceof Error ? cause.message : String(cause),
          updated_at: new Date().toISOString(),
        });
      }
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
    }
    return next;
  }

  async function refreshFormulas(source?: "pdf" | "latex") {
    if (!options.context.value || formulaRefreshProgress.value) return;
    const documentId = options.context.value.document.document_id;
    const chosenSource = source || (options.context.value.document.latex_path ? "latex" : "pdf");
    try {
      const candidates = await candidatesForCurrentDocument(chosenSource);
      if (!candidates.length) {
        options.showNotice(options.t("formula.noCandidates"));
        return;
      }
      formulaRefreshProgress.value = { status: options.t("formula.progress.aiSelecting"), percent: 28 };
      const response = await options.requestFormulaAi({
        mode: "batch",
        source: chosenSource,
        symbols: options.symbols.value,
        candidates,
      });
      formulaRefreshProgress.value = { status: options.t("formula.progress.parsing"), percent: 52 };
      let generated = parseAiFormulaAnalyses(response, documentId, candidates, options.formulas.value);
      if (!generated.length) throw new Error("AI did not return any important formula analyses.");
      generated = await enrichPdfLatex(documentId, generated, candidates);
      if (!sameDocument(options, documentId)) return;
      formulaRefreshProgress.value = { status: options.t("formula.progress.saving"), percent: 94 };
      options.formulas.value = mergeFormulaAnalyses(options.formulas.value, generated);
      await persistFormulas(documentId, options.formulas.value);
      options.showNotice(options.t("formula.refreshed", { count: generated.length }));
    } catch (cause) {
      options.showNotice(formulaErrorMessage(cause));
    } finally {
      formulaRefreshProgress.value = null;
    }
  }

  async function analyzeFormulaCandidate(candidate: FormulaCandidate, force = true) {
    if (!options.context.value) return null;
    const documentId = options.context.value.document.document_id;
    const formulaId = formulaIdForCandidate(documentId, candidate);
    const existing = options.formulas.value.find((formula) => formula.formula_id === formulaId);
    if (existing && !force && existing.status === "parsed") return existing;
    let pending = buildPendingFormulaFromCandidate(documentId, candidate, { importance_score: existing?.importance_score || 0.75 });
    options.formulas.value = [pending, ...options.formulas.value.filter((formula) => formula.formula_id !== formulaId)];
    try {
      if (candidate.source === "pdf") {
        if (!options.pdfDocument.value) throw new Error("PDF document is not loaded.");
        if (!options.settings.value?.simpletex_ocr_token?.trim()) throw new Error(options.t("formula.simpletexRequired"));
        const rect = mergeRects(candidate.rects_pct);
        if (!rect) throw new Error("Formula region is unavailable.");
        const dataUrl = await renderPdfRegionImage(options.pdfDocument.value, candidate.page_index || 0, rect, {
          targetWidth: 1200,
          minScale: 1.8,
          maxScale: 3.5,
        });
        const recognized = await window.paperReaderPlus.recognizeLatexImage(dataUrl);
        pending = {
          ...pending,
          latex: recognized.latex || pending.latex,
          request_id: recognized.request_id,
          confidence: recognized.conf,
        };
      }
      const analysis = await options.requestFormulaAi({
        mode: "single",
        source: candidate.source,
        symbols: options.symbols.value,
        candidate,
        latex: pending.latex || candidate.latex,
        rawText: candidate.raw_text,
      });
      const parsed: FormulaAnalysis = {
        ...pending,
        latex: pending.latex || candidate.latex || candidate.raw_text,
        analysis: analysis.trim(),
        status: "parsed",
        confidence: Math.max(pending.confidence || 0, 0.72),
        updated_at: new Date().toISOString(),
      };
      options.formulas.value = [parsed, ...options.formulas.value.filter((formula) => formula.formula_id !== formulaId)];
      await persistFormulas(documentId, options.formulas.value);
      return parsed;
    } catch (cause) {
      const failed = {
        ...pending,
        status: "error" as const,
        error: formulaErrorMessage(cause),
        updated_at: new Date().toISOString(),
      };
      options.formulas.value = [failed, ...options.formulas.value.filter((formula) => formula.formula_id !== formulaId)];
      await persistFormulas(documentId, options.formulas.value);
      options.showNotice(failed.error || "Formula analysis failed.");
      return failed;
    }
  }

  function updateFormula(formula: FormulaAnalysis) {
    const now = new Date().toISOString();
    options.formulas.value = [
      { ...formula, updated_at: now },
      ...options.formulas.value.filter((item) => item.formula_id !== formula.formula_id),
    ];
    void persistFormulas(options.context.value?.document.document_id || "", options.formulas.value);
  }

  function deleteFormula(formula: FormulaAnalysis) {
    options.formulas.value = options.formulas.value.filter((item) => item.formula_id !== formula.formula_id);
    void persistFormulas(options.context.value?.document.document_id || "", options.formulas.value);
  }

  function selectFormula(formula: FormulaAnalysis) {
    activeFormulaId.value = formula.formula_id;
  }

  return {
    formulaRefreshProgress,
    activeFormulaId,
    refreshFormulas,
    analyzeFormulaCandidate,
    updateFormula,
    deleteFormula,
    selectFormula,
  };
}
