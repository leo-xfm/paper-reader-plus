import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";
import type { I18nKey } from "@/i18n";
import type { PdfTextItem } from "@/pdf/pdfTypes";
import { toIpcPlainObject } from "@/services/IpcPayloadService";
import {
  applySymbolRefresh,
  extractSymbolsFromLatexWithProgress,
  extractSymbolsFromPdfPages,
  mergeSymbolDefinitions,
  normalizeSymbol,
  type SymbolExtractionProgress,
} from "@/services/SymbolTrackerService";
import type { DocumentContext, SymbolDefinition } from "@/types";

type UseSymbolTrackingOptions = {
  context: Ref<DocumentContext | null>;
  loading: Ref<boolean>;
  savedSymbols: Ref<SymbolDefinition[]>;
  latexSymbols: Ref<SymbolDefinition[]>;
  pageTextItems: Ref<Record<number, PdfTextItem[]>>;
  showNotice: (message: string) => void;
  t: (key: I18nKey, params?: Record<string, string | number>) => string;
};

export function useSymbolTracking(options: UseSymbolTrackingOptions) {
  const symbolRefreshProgress = ref<SymbolExtractionProgress | null>(null);
  const symbols = computed(() => mergeSymbolDefinitions(options.savedSymbols.value, options.latexSymbols.value));
  let symbolSaveTimer: number | null = null;
  let lastSymbolPersistKey = "";

  function symbolPersistPayload(nextSymbols: SymbolDefinition[], savedSymbols = options.savedSymbols.value) {
    const tombstones = savedSymbols.filter((symbol) => symbol.deleted);
    const byKey = new Map<string, SymbolDefinition>();
    for (const symbol of [...nextSymbols, ...tombstones]) {
      byKey.set(symbol.normalized_symbol, symbol);
    }
    return [...byKey.values()].map((symbol) => ({
      ...symbol,
      updated_at: undefined,
    }));
  }

  async function persistSymbols(documentId: string, nextSymbols: SymbolDefinition[], savedSymbols = options.savedSymbols.value) {
    if (!documentId) return;
    const payload = symbolPersistPayload(nextSymbols, savedSymbols);
    const key = `${documentId}:${JSON.stringify(payload)}`;
    if (key === lastSymbolPersistKey) return;
    lastSymbolPersistKey = key;
    try {
      const savedSymbols = await window.paperReaderPlus.saveSymbols(
        documentId,
        toIpcPlainObject(payload),
      );
      if (options.context.value?.document.document_id === documentId) {
        options.savedSymbols.value = savedSymbols;
        options.context.value.symbols = savedSymbols;
      }
    } catch (cause) {
      options.showNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }

  watch(symbols, () => {
    if (!options.context.value || options.loading.value) return;
    const documentId = options.context.value.document.document_id;
    const nextSymbols = symbols.value;
    const savedSymbols = options.savedSymbols.value;
    if (symbolSaveTimer !== null) window.clearTimeout(symbolSaveTimer);
    symbolSaveTimer = window.setTimeout(() => {
      symbolSaveTimer = null;
      void persistSymbols(documentId, nextSymbols, savedSymbols);
    }, 700);
  }, { deep: true });

  onBeforeUnmount(() => {
    if (symbolSaveTimer !== null) window.clearTimeout(symbolSaveTimer);
  });

  function updateSymbolDefinition(symbol: SymbolDefinition) {
    const normalized = normalizeSymbol(symbol.symbol);
    const timestamp = new Date().toISOString();
    const next = symbols.value
      .filter((item) => item.normalized_symbol !== symbol.normalized_symbol)
      .concat({
        ...symbol,
        normalized_symbol: normalized,
        updated_at: timestamp,
        user_modified: symbol.user_modified === true,
      });
    if (normalized !== symbol.normalized_symbol) {
      next.push({ ...symbol, deleted: true, updated_at: timestamp });
    }
    options.savedSymbols.value = symbolPersistPayload(next);
    void persistSymbols(options.context.value?.document.document_id || "", options.savedSymbols.value);
    return normalized;
  }

  function deleteSymbolDefinition(symbol: SymbolDefinition) {
    const timestamp = new Date().toISOString();
    const next = symbols.value.filter((item) => item.normalized_symbol !== symbol.normalized_symbol);
    next.push({ ...symbol, deleted: true, updated_at: timestamp });
    options.savedSymbols.value = symbolPersistPayload(next);
    void persistSymbols(options.context.value?.document.document_id || "", options.savedSymbols.value);
  }

  async function refreshSymbols() {
    if (!options.context.value || symbolRefreshProgress.value) return;
    const documentId = options.context.value.document.document_id;
    try {
      const source = await window.paperReaderPlus.confirmSymbolRefreshSource();
      if (!source) return;

      let mode: "preserve-user-state" | "reset" = "reset";
      if (options.savedSymbols.value.some((symbol) => symbol.favorite || symbol.user_modified || symbol.deleted)) {
        const choice = await window.paperReaderPlus.confirmSymbolRefreshMode();
        if (!choice) return;
        mode = choice;
      }

      let generated: SymbolDefinition[] = [];
      if (source === "latex") {
        if (!options.context.value.document.latex_path) {
          options.showNotice(options.t("app.attachLatexFirst"));
          return;
        }
        symbolRefreshProgress.value = { status: options.t("symbol.progress.loadingLatex"), percent: 4 };
        const latex = await window.paperReaderPlus.getLatexSource(documentId);
        generated = await extractSymbolsFromLatexWithProgress(latex.content, (progress) => {
          symbolRefreshProgress.value = {
            ...progress,
            status: progress.status.startsWith("Scanning")
              ? options.t("symbol.progress.scanning")
              : progress.status.startsWith("Finalizing")
                ? options.t("symbol.progress.finalizing")
                : options.t("symbol.progress.preparing"),
          };
        });
        options.latexSymbols.value = generated;
      } else {
        const entries = Object.entries(options.pageTextItems.value)
          .sort(([left], [right]) => Number(left) - Number(right));
        if (!entries.length) {
          options.showNotice(options.t("symbol.loadPdfTextFirst"));
          return;
        }
        options.latexSymbols.value = [];
        for (let index = 0; index < entries.length; index += 1) {
          const [pageIndex, items] = entries[index];
          symbolRefreshProgress.value = {
            status: options.t("symbol.progress.scanningPdf", { page: Number(pageIndex) + 1 }),
            percent: Math.round(((index + 1) / entries.length) * 88),
          };
          generated.push(...extractSymbolsFromPdfPages({ [Number(pageIndex)]: items }));
          await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
        }
      }

      if (options.context.value?.document.document_id !== documentId) return;
      symbolRefreshProgress.value = { status: options.t("symbol.progress.saving"), percent: 96 };
      generated = mergeSymbolDefinitions(generated);
      options.savedSymbols.value = applySymbolRefresh(options.savedSymbols.value, generated, mode);
      await persistSymbols(documentId, options.savedSymbols.value);
      options.showNotice(options.t("symbol.refreshed", { count: generated.length }));
    } catch (cause) {
      options.showNotice(cause instanceof Error ? cause.message : String(cause));
    } finally {
      symbolRefreshProgress.value = null;
    }
  }

  return {
    symbols,
    symbolRefreshProgress,
    updateSymbolDefinition,
    deleteSymbolDefinition,
    refreshSymbols,
  };
}
