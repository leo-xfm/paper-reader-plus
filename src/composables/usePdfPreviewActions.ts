import { ref, type Ref } from "vue";
import type { PdfDocumentProxyLike, PdfHoverPreview, PdfLinkAnnotation, PdfReferenceCandidate, PdfReferenceTarget, PdfTableSheet } from "@/pdf/pdfTypes";
import { renderPdfRegionImage } from "@/pdf/pdfImageRendering";
import { extractPdfPreviewTextItems, extractTableSheet, findPdfReferenceTarget } from "@/pdf/pdfReferences";
import type { RectPct } from "@/types";

type PdfLinkTarget = {
  pageIndex: number;
  rectPct: RectPct;
};

export type PdfLinkReturnTarget = {
  pageIndex: number;
  rectsPct: RectPct[];
  label: string;
};

export type PdfDestinationAnchor = {
  point: { x: number; y: number } | null;
  zoom?: number;
};

type OpenPdfPagePreviewOptions = {
  id: string;
  title: string;
  pageIndex: number;
  originPageIndex?: number | null;
  rectPct?: RectPct;
  anchor: { left: number; top: number };
  fixed?: boolean;
  source?: "pdf-link" | "page-preview" | "reference";
  link?: PdfLinkAnnotation;
  reference?: PdfReferenceCandidate;
  referenceTarget?: PdfReferenceTarget;
};

type UsePdfPreviewActionsOptions = {
  pdfDocument: Ref<PdfDocumentProxyLike | null>;
  referencePreview: Ref<PdfHoverPreview | null>;
  referencePreviewFixed: Ref<boolean>;
  referencePreviewFixedPosition: Ref<{ left: number; top: number } | null>;
  tableSheet: Ref<PdfTableSheet | null>;
  rightPanelCollapsed: Ref<boolean>;
  rightPanelWidth: Ref<number>;
  currentPageIndex: Ref<number>;
  currentPageNumber: Ref<number>;
  scrollToPage: (pageIndex: number, options?: { rectsPct?: RectPct[]; block?: "start" | "center" }) => void;
  showNotice: (message: string) => void;
};

export function rectAroundPoint(point: { x: number; y: number }, width = 0.72, height = 0.46): RectPct {
  const clampedWidth = Math.min(1, Math.max(0.1, width));
  const clampedHeight = Math.min(1, Math.max(0.1, height));
  return {
    left: Math.min(Math.max(0, point.x - clampedWidth / 2), 1 - clampedWidth),
    top: Math.min(Math.max(0, point.y - clampedHeight / 2), 1 - clampedHeight),
    width: clampedWidth,
    height: clampedHeight,
  };
}

export function pdfDestinationAnchor(destination: unknown[] | null | undefined): PdfDestinationAnchor {
  if (!destination) return { point: null };
  const kind = typeof destination[1] === "object" && destination[1] !== null && "name" in destination[1]
    ? String((destination[1] as { name?: unknown }).name || "")
    : String(destination[1] || "");
  const left = Number(destination[2]);
  const top = Number(destination[3]);
  const right = Number(destination[4]);
  const bottom = Number(destination[5]);
  const zoom = kind === "XYZ" && Number.isFinite(Number(destination[4])) && Number(destination[4]) > 0
    ? Number(destination[4])
    : undefined;
  if (kind === "XYZ" || kind === "FitH" || kind === "FitBH") {
    return {
      point: {
        x: Number.isFinite(left) ? left : 0,
        y: Number.isFinite(top) ? top : 0,
      },
      zoom,
    };
  }
  if (kind === "FitV" || kind === "FitBV") {
    return {
      point: {
        x: Number.isFinite(left) ? left : 0,
        y: 0,
      },
    };
  }
  if (kind === "FitR") {
    return {
      point: {
        x: (Number.isFinite(left) && Number.isFinite(right)) ? (left + right) / 2 : 0,
        y: (Number.isFinite(top) && Number.isFinite(bottom)) ? (top + bottom) / 2 : 0,
      },
    };
  }
  return { point: null };
}

export function pdfAnchorToRectPct(page: { getViewport(options: { scale: number }): { width: number; height: number; convertToViewportPoint(x: number, y: number): [number, number] } }, anchor: PdfDestinationAnchor): RectPct {
  if (!anchor.point) return { left: 0, top: 0, width: 1, height: 1 };
  const viewport = page.getViewport({ scale: 1 });
  const [x, y] = viewport.convertToViewportPoint(anchor.point.x, anchor.point.y);
  const zoom = Math.min(Math.max(anchor.zoom || 1, 0.5), 6);
  return rectAroundPoint({
    x: x / Math.max(1, viewport.width),
    y: y / Math.max(1, viewport.height),
  }, 0.72 / zoom, 0.46 / zoom);
}

export function usePdfPreviewActions(options: UsePdfPreviewActionsOptions) {
  let referencePreviewClearTimer: number | null = null;
  let pendingPdfLinkPreviewId = "";
  const pdfLinkReturnTarget = ref<PdfLinkReturnTarget | null>(null);

  async function resolvePdfLinkTarget(link: PdfLinkAnnotation): Promise<PdfLinkTarget | null> {
    if (link.url) {
      return null;
    }
    if (!options.pdfDocument.value || !options.pdfDocument.value.getDestination || !options.pdfDocument.value.getPageIndex) {
      return null;
    }
    const destination = Array.isArray(link.destination)
      ? link.destination
      : typeof link.destination === "string"
        ? await options.pdfDocument.value.getDestination(link.destination)
        : null;
    const reference = destination?.[0];
    if (!reference) return null;
    const pageIndex = await options.pdfDocument.value.getPageIndex(reference);
    const page = await options.pdfDocument.value.getPage(pageIndex + 1);
    return {
      pageIndex,
      rectPct: pdfAnchorToRectPct(page, pdfDestinationAnchor(destination)),
    };
  }

  async function handlePdfLinkClick(link: PdfLinkAnnotation) {
    if (link.url) {
      window.open(link.url, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      const target = await resolvePdfLinkTarget(link);
      if (!target) {
        options.showNotice("PDF link target is not available");
        return;
      }
      keepReferencePreviewOpen();
      options.referencePreview.value = null;
      options.referencePreviewFixed.value = false;
      options.referencePreviewFixedPosition.value = null;
      pdfLinkReturnTarget.value = {
        pageIndex: link.page_index,
        rectsPct: link.rects_pct,
        label: link.title,
      };
      options.scrollToPage(target.pageIndex, { rectsPct: [target.rectPct], block: "center" });
    } catch (cause) {
      options.showNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function openPdfPagePreview(previewOptions: OpenPdfPagePreviewOptions) {
    if (!options.pdfDocument.value) return;
    const rectPct = previewOptions.rectPct || { left: 0, top: 0, width: 1, height: 1 };
    const link = previewOptions.link || {
      link_id: previewOptions.id,
      page_index: previewOptions.pageIndex,
      rects_pct: [rectPct],
      title: previewOptions.title,
    };
    if (previewOptions.fixed) {
      options.referencePreviewFixed.value = true;
      options.referencePreviewFixedPosition.value = previewOptions.anchor;
    }
    options.referencePreview.value = {
      preview_kind: "link",
      source: previewOptions.source || "page-preview",
      reference: previewOptions.reference,
      reference_target: previewOptions.referenceTarget,
      link,
      target_page_index: previewOptions.pageIndex,
      origin_page_index: previewOptions.originPageIndex ?? previewOptions.pageIndex,
      preview_rect_pct: rectPct,
      preview_page_index: previewOptions.pageIndex,
      anchor: previewOptions.anchor,
      loading: true,
    };
    try {
      const [imageUrl, previewTextItems] = await Promise.all([
        renderReferencePreviewImage(previewOptions.pageIndex, rectPct),
        extractPdfPreviewTextItems(options.pdfDocument.value, previewOptions.pageIndex, rectPct),
      ]);
      if (!options.referencePreview.value || options.referencePreview.value.preview_kind !== "link" || options.referencePreview.value.link.link_id !== previewOptions.id) return;
      options.referencePreview.value = {
        ...options.referencePreview.value,
        imageUrl,
        previewTextItems,
        loading: false,
      };
    } catch (cause) {
      if (!options.referencePreview.value || options.referencePreview.value.preview_kind !== "link" || options.referencePreview.value.link.link_id !== previewOptions.id) return;
      options.referencePreview.value = {
        ...options.referencePreview.value,
        loading: false,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }

  async function handlePdfLinkPreview(payload: { link: PdfLinkAnnotation; position: { left: number; top: number } }) {
    if (options.referencePreviewFixed.value) return;
    if (!options.pdfDocument.value || payload.link.url) return;
    if (
      pendingPdfLinkPreviewId === payload.link.link_id ||
      (options.referencePreview.value?.preview_kind === "link" &&
        options.referencePreview.value.source === "pdf-link" &&
        options.referencePreview.value.link.link_id === payload.link.link_id)
    ) {
      keepReferencePreviewOpen();
      return;
    }
    pendingPdfLinkPreviewId = payload.link.link_id;
    keepReferencePreviewOpen();
    try {
      const target = await resolvePdfLinkTarget(payload.link);
      if (pendingPdfLinkPreviewId !== payload.link.link_id) return;
      if (!target) {
        options.referencePreview.value = {
          preview_kind: "link",
          source: "pdf-link",
          link: payload.link,
          target_page_index: null,
          origin_page_index: null,
          preview_rect_pct: null,
          preview_page_index: null,
          anchor: payload.position,
          loading: false,
        };
        return;
      }
      await openPdfPagePreview({
        id: payload.link.link_id,
        title: payload.link.title,
        pageIndex: target.pageIndex,
        originPageIndex: payload.link.page_index,
        rectPct: { left: 0, top: 0, width: 1, height: 1 },
        anchor: payload.position,
        source: "pdf-link",
        link: payload.link,
      });
    } catch (cause) {
      if (pendingPdfLinkPreviewId !== payload.link.link_id) return;
      options.referencePreview.value = {
        preview_kind: "link",
        source: "pdf-link",
        link: payload.link,
        target_page_index: null,
        origin_page_index: null,
        preview_rect_pct: null,
        preview_page_index: null,
        anchor: payload.position,
        loading: false,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }

  async function handleReferencePreview(payload: { reference: PdfReferenceCandidate; position: { left: number; top: number } }) {
    if (options.referencePreviewFixed.value) return;
    if (!options.pdfDocument.value) return;
    keepReferencePreviewOpen();
    const referenceId = payload.reference.reference_id;
    try {
      const target = await findPdfReferenceTarget(options.pdfDocument.value, payload.reference);
      if (!target) {
        options.referencePreview.value = {
          preview_kind: "reference",
          reference: payload.reference,
          target: null,
          origin_page_index: null,
          preview_rect_pct: null,
          preview_page_index: null,
          anchor: payload.position,
          loading: false,
        };
        return;
      }
      await openPdfPagePreview({
        id: referenceId,
        title: payload.reference.label,
        pageIndex: target.page_index,
        rectPct: target.preview_rect_pct,
        anchor: payload.position,
        source: "reference",
        link: {
          link_id: referenceId,
          page_index: payload.reference.page_index,
          rects_pct: payload.reference.rects_pct,
          title: payload.reference.label,
        },
        reference: payload.reference,
        referenceTarget: target,
      });
    } catch (cause) {
      options.referencePreview.value = {
        preview_kind: "reference",
        reference: payload.reference,
        target: null,
        origin_page_index: null,
        preview_rect_pct: null,
        preview_page_index: null,
        anchor: payload.position,
        loading: false,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }

  async function handlePreviewReferencePage(delta: number) {
    if (!options.pdfDocument.value || !options.referencePreview.value) return;
    keepReferencePreviewOpen();
    const currentPage = options.referencePreview.value.preview_page_index
      ?? (options.referencePreview.value.preview_kind === "reference" ? options.referencePreview.value.target?.page_index : options.referencePreview.value.target_page_index)
      ?? null;
    if (currentPage === null) return;
    const pageIndex = Math.min(Math.max(0, currentPage + delta), Math.max(0, options.pdfDocument.value.numPages - 1));
    const preview = options.referencePreview.value;
    if (pageIndex === currentPage || preview.loading) return;
    const referenceTarget = preview.preview_kind === "reference" ? preview.target : preview.reference_target;
    const nextRect = referenceTarget && pageIndex === referenceTarget.page_index
      ? referenceTarget.preview_rect_pct
      : preview.preview_kind === "link" && pageIndex === preview.origin_page_index && preview.preview_rect_pct
        ? preview.preview_rect_pct
        : { left: 0, top: 0, width: 1, height: 1 };
    options.referencePreview.value = { ...preview, preview_page_index: pageIndex, preview_rect_pct: nextRect, loading: true, error: undefined };
    try {
      const [imageUrl, previewTextItems] = await Promise.all([
        renderReferencePreviewImage(pageIndex, nextRect),
        extractPdfPreviewTextItems(options.pdfDocument.value, pageIndex, nextRect),
      ]);
      if (options.referencePreview.value !== null && options.referencePreview.value.preview_page_index === pageIndex) {
        options.referencePreview.value = { ...options.referencePreview.value, imageUrl, previewTextItems, loading: false };
      }
    } catch (cause) {
      if (options.referencePreview.value !== null && options.referencePreview.value.preview_page_index === pageIndex) {
        options.referencePreview.value = {
          ...options.referencePreview.value,
          loading: false,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    }
  }

  async function handleReturnReferencePreview() {
    if (!options.referencePreview.value?.origin_page_index && options.referencePreview.value?.origin_page_index !== 0) return;
    if (options.referencePreview.value.preview_kind === "link" && options.referencePreview.value.source === "pdf-link") {
      const preview = options.referencePreview.value;
      const origin = preview.origin_page_index;
      if (origin === null) return;
      options.scrollToPage(origin, { rectsPct: preview.link.rects_pct, block: "center" });
      keepReferencePreviewOpen();
      if (preview.preview_page_index === origin) return;
      await handlePreviewReferencePage(origin - (preview.preview_page_index ?? origin));
      return;
    }
    const current = options.referencePreview.value.preview_page_index;
    const origin = options.referencePreview.value.origin_page_index;
    if (current === origin) return;
    await handlePreviewReferencePage(origin - (current ?? origin));
  }

  function keepReferencePreviewOpen() {
    if (referencePreviewClearTimer) {
      window.clearTimeout(referencePreviewClearTimer);
      referencePreviewClearTimer = null;
    }
  }

  function clearReferencePreviewSoon() {
    if (options.referencePreviewFixed.value) return;
    pendingPdfLinkPreviewId = "";
    keepReferencePreviewOpen();
    referencePreviewClearTimer = window.setTimeout(() => {
      options.referencePreview.value = null;
      referencePreviewClearTimer = null;
    }, 500);
  }

  function closeReferencePreview() {
    keepReferencePreviewOpen();
    options.referencePreview.value = null;
    options.referencePreviewFixed.value = false;
    options.referencePreviewFixedPosition.value = null;
  }

  function returnToPdfLinkSource() {
    const target = pdfLinkReturnTarget.value;
    if (!target) return;
    options.scrollToPage(target.pageIndex, { rectsPct: target.rectsPct, block: "center" });
    keepReferencePreviewOpen();
  }

  function closePdfLinkReturnTarget() {
    pdfLinkReturnTarget.value = null;
  }

  function toggleReferencePreviewFixed() {
    if (!options.referencePreview.value) return;
    options.referencePreviewFixed.value = !options.referencePreviewFixed.value;
    if (options.referencePreviewFixed.value) {
      options.referencePreviewFixedPosition.value = {
        left: options.referencePreview.value.anchor.left,
        top: options.referencePreview.value.anchor.top,
      };
      keepReferencePreviewOpen();
    } else {
      options.referencePreviewFixedPosition.value = null;
    }
  }

  function moveReferencePreviewFixed(position: { left: number; top: number }) {
    if (!options.referencePreviewFixed.value) return;
    options.referencePreviewFixedPosition.value = position;
  }

  async function handleReferenceJump(reference: PdfReferenceCandidate) {
    if (!options.pdfDocument.value) return;
    try {
      const target = await findPdfReferenceTarget(options.pdfDocument.value, reference);
      if (!target) {
        options.showNotice(`${reference.label} target not found`);
        return;
      }
      options.referencePreview.value = null;
      options.scrollToPage(target.page_index, { rectsPct: [target.preview_rect_pct], block: "center" });
    } catch (cause) {
      options.showNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function renderReferencePreviewImage(pageIndex: number, rectPct: RectPct) {
    if (!options.pdfDocument.value) return "";
    return renderPdfRegionImage(options.pdfDocument.value, pageIndex, rectPct);
  }

  async function openReferenceSpreadsheet() {
    if (!options.pdfDocument.value || !options.referencePreview.value) return;
    const target = options.referencePreview.value.preview_kind === "reference"
      ? options.referencePreview.value.target
      : options.referencePreview.value.reference_target;
    if (!target || target.kind !== "table") return;
    try {
      options.tableSheet.value = await extractTableSheet(options.pdfDocument.value, target);
    } catch (cause) {
      options.showNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function exportTableCsv(csv: string) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${options.tableSheet.value?.title || "table"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function currentPagePreviewAnchor() {
    const left = options.rightPanelCollapsed.value
      ? window.innerWidth - 664
      : Math.max(12, window.innerWidth - options.rightPanelWidth.value - 656);
    return {
      left: Math.min(Math.max(12, left), Math.max(12, window.innerWidth - 640)),
      top: 104,
    };
  }

  async function openCurrentPagePreview() {
    if (!options.pdfDocument.value) return;
    keepReferencePreviewOpen();
    await openPdfPagePreview({
      id: `page-preview-${options.currentPageIndex.value}`,
      title: `Current page ${options.currentPageNumber.value}`,
      pageIndex: options.currentPageIndex.value,
      rectPct: { left: 0, top: 0, width: 1, height: 1 },
      anchor: currentPagePreviewAnchor(),
      fixed: true,
      source: "page-preview",
    });
  }

  return {
    pdfLinkReturnTarget,
    handlePdfLinkClick,
    handlePdfLinkPreview,
    handleReferencePreview,
    handlePreviewReferencePage,
    handleReturnReferencePreview,
    keepReferencePreviewOpen,
    clearReferencePreviewSoon,
    closeReferencePreview,
    toggleReferencePreviewFixed,
    moveReferencePreviewFixed,
    returnToPdfLinkSource,
    closePdfLinkReturnTarget,
    handleReferenceJump,
    openReferenceSpreadsheet,
    exportTableCsv,
    openCurrentPagePreview,
  };
}
