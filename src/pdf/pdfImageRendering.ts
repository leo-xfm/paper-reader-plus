import type { PdfDocumentProxyLike } from "@/pdf/pdfTypes";
import type { RectPct } from "@/types";

export type PdfRegionImageOptions = {
  targetWidth?: number;
  minScale?: number;
  maxScale?: number;
  mimeType?: "image/png" | "image/jpeg";
  quality?: number;
};

export async function renderPdfRegionImage(
  pdfDocument: PdfDocumentProxyLike,
  pageIndex: number,
  rectPct: RectPct,
  options: PdfRegionImageOptions = {},
) {
  const page = await pdfDocument.getPage(pageIndex + 1);
  const baseViewport = page.getViewport({ scale: 1 });
  const targetWidth = options.targetWidth || 900;
  const previewScale = Math.min(
    options.maxScale || 2.8,
    Math.max(options.minScale || 1.6, targetWidth / Math.max(1, baseViewport.width * rectPct.width)),
  );
  const viewport = page.getViewport({ scale: previewScale });
  const outputScale = Math.max(1, window.devicePixelRatio || 1);
  const source = document.createElement("canvas");
  source.width = Math.floor(viewport.width * outputScale);
  source.height = Math.floor(viewport.height * outputScale);
  const context = source.getContext("2d", { alpha: false });
  if (!context) return "";
  await page.render({
    canvasContext: context,
    viewport,
    transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
  }).promise;
  const sx = Math.max(0, Math.floor(rectPct.left * source.width));
  const sy = Math.max(0, Math.floor(rectPct.top * source.height));
  const sw = Math.min(source.width - sx, Math.max(1, Math.floor(rectPct.width * source.width)));
  const sh = Math.min(source.height - sy, Math.max(1, Math.floor(rectPct.height * source.height)));
  const output = document.createElement("canvas");
  output.width = sw;
  output.height = sh;
  output.getContext("2d")?.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return output.toDataURL(options.mimeType || "image/png", options.quality);
}
