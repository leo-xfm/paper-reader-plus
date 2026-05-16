import * as pdfjsLib from "pdfjs-dist";
import { itemToPct } from "@/pdf/pdfCoordinates";
import type { PdfDocumentProxyLike, PdfTextItem } from "@/pdf/pdfTypes";

type PdfTextContent = {
  items?: Array<{
    str?: string;
    width?: number;
    height?: number;
    fontName?: string;
    transform: number[];
  }>;
  styles?: Record<string, { fontFamily?: string; ascent?: number }>;
};

let measureContext: CanvasRenderingContext2D | null = null;

function measureTextWidth(text: string, fontFamily: string, fontSize: number) {
  if (typeof document === "undefined") return 0;
  if (!measureContext) {
    measureContext = document.createElement("canvas").getContext("2d");
  }
  if (!measureContext) return 0;
  measureContext.font = `${fontSize}px ${fontFamily}`;
  return measureContext.measureText(text).width;
}

export async function extractPdfPageTextItems(pdfDocument: PdfDocumentProxyLike, pageNumber: number, scale = 1): Promise<PdfTextItem[]> {
  const page = await pdfDocument.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const content = await page.getTextContent() as PdfTextContent;
  const styles = content.styles || {};
  const pageSize = { width: viewport.width, height: viewport.height };

  return (content.items || []).map((item) => {
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]) || Number(item.height || 0) || 10;
    const style = styles[item.fontName || ""] || {};
    const fontName = String(style.fontFamily || "serif");
    const targetWidth = Math.max(1, Number(item.width || 0) * viewport.scale);
    const measuredWidth = measureTextWidth(String(item.str || ""), fontName, fontHeight);
    const ascent = Number(style.ascent || 0.86);
    const top = tx[5] - fontHeight * Math.min(1, Math.max(0.5, ascent));
    const base = {
      text: String(item.str || ""),
      left: tx[4],
      top,
      width: targetWidth,
      height: Math.max(1, fontHeight),
      fontName,
      fontSize: fontHeight,
      hScale: measuredWidth > 0 ? targetWidth / measuredWidth : 1,
    };
    return { ...base, rectPct: itemToPct(base, pageSize) };
  }).filter((item: PdfTextItem) => item.text.trim());
}
