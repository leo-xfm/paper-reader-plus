import { markRaw, shallowRef } from "vue";
import * as pdfjsLib from "pdfjs-dist";
import type { PdfDocumentProxyLike, PdfOutlineItem } from "@/pdf/pdfTypes";

export function usePdfDocument() {
  const pdfDocument = shallowRef<PdfDocumentProxyLike | null>(null);
  const pageNumbers = shallowRef<number[]>([]);
  const outlineItems = shallowRef<PdfOutlineItem[]>([]);

  async function loadPdf(data: ArrayBuffer) {
    const pdf = markRaw(await pdfjsLib.getDocument({ data }).promise as PdfDocumentProxyLike);
    pdfDocument.value = pdf;
    pageNumbers.value = Array.from({ length: pdf.numPages }, (_, index) => index + 1);
    outlineItems.value = await loadOutline(pdf);
    return pdf;
  }

  function clearPdf() {
    pdfDocument.value = null;
    pageNumbers.value = [];
    outlineItems.value = [];
  }

  async function loadOutline(pdf: PdfDocumentProxyLike) {
    if (!pdf.getOutline) return [];
    const outline = await pdf.getOutline();
    if (!outline) return [];
    const result: PdfOutlineItem[] = [];
    async function visit(items: Array<Record<string, unknown>>, level = 0) {
      for (const item of items) {
        let pageIndex = 0;
        const dest = typeof item.dest === "string" && pdf.getDestination ? await pdf.getDestination(item.dest) : Array.isArray(item.dest) ? item.dest : null;
        if (dest?.[0] && pdf.getPageIndex) pageIndex = await pdf.getPageIndex(dest[0]);
        result.push({ id: `${result.length}`, title: String(item.title || "Untitled"), page_index: pageIndex, level });
        if (Array.isArray(item.items)) await visit(item.items as Array<Record<string, unknown>>, level + 1);
      }
    }
    await visit(outline);
    return result;
  }

  return {
    pdfDocument,
    pageNumbers,
    outlineItems,
    loadPdf,
    clearPdf,
  };
}
