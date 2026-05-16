import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { pdfAnchorToRectPct, pdfDestinationAnchor, rectAroundPoint, usePdfPreviewActions } from "@/composables/usePdfPreviewActions";
import type { PdfHoverPreview, PdfLinkAnnotation, PdfTableSheet } from "@/pdf/pdfTypes";
import type { RectPct } from "@/types";

function fakePage(width = 1000, height = 2000) {
  return {
    getViewport: () => ({
      width,
      height,
      convertToViewportPoint: (x: number, y: number): [number, number] => [x, y],
    }),
  };
}

function fakePdfDocument() {
  const pageReference = { num: 5 };
  return {
    numPages: 10,
    getDestination: vi.fn(async () => [pageReference, { name: "XYZ" }, 500, 800, 2]),
    getPageIndex: vi.fn(async () => 4),
    getPage: vi.fn(async () => fakePage()),
  };
}

function createPreviewActions() {
  const scrollToPage = vi.fn();
  const actions = usePdfPreviewActions({
    pdfDocument: ref(fakePdfDocument()),
    referencePreview: ref<PdfHoverPreview | null>({
      preview_kind: "link",
      source: "pdf-link",
      link: {
        link_id: "source-link",
        page_index: 1,
        rects_pct: [{ left: 0.1, top: 0.2, width: 0.3, height: 0.04 }],
        title: "Existing preview",
      },
      target_page_index: 4,
      origin_page_index: 1,
      preview_rect_pct: { left: 0, top: 0, width: 1, height: 1 },
      preview_page_index: 4,
      anchor: { left: 20, top: 30 },
      loading: false,
    }),
    referencePreviewFixed: ref(true),
    referencePreviewFixedPosition: ref({ left: 20, top: 30 }),
    tableSheet: ref<PdfTableSheet | null>(null),
    rightPanelCollapsed: ref(false),
    rightPanelWidth: ref(560),
    currentPageIndex: ref(0),
    currentPageNumber: ref(1),
    scrollToPage,
    showNotice: vi.fn(),
  });
  return { actions, scrollToPage };
}

describe("pdf preview actions", () => {
  it("normalizes empty destinations to a full-page preview", () => {
    expect(pdfDestinationAnchor(null)).toEqual({ point: null });
    expect(pdfAnchorToRectPct(fakePage(), { point: null })).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });

  it("normalizes XYZ destinations with zoom-aware preview size", () => {
    const anchor = pdfDestinationAnchor([{}, { name: "XYZ" }, 500, 800, 2]);
    expect(anchor).toEqual({ point: { x: 500, y: 800 }, zoom: 2 });
    expect(pdfAnchorToRectPct(fakePage(), anchor)).toEqual({ left: 0.32, top: 0.28500000000000003, width: 0.36, height: 0.23 });
  });

  it("normalizes FitH destinations without zoom", () => {
    const anchor = pdfDestinationAnchor([{}, { name: "FitH" }, 0, 600]);
    expect(anchor).toEqual({ point: { x: 0, y: 600 }, zoom: undefined });
    expect(pdfAnchorToRectPct(fakePage(), anchor)).toEqual({ left: 0, top: 0.06999999999999998, width: 0.72, height: 0.46 });
  });

  it("clamps point previews to page bounds", () => {
    expect(rectAroundPoint({ x: 0.98, y: 0.99 }, 0.4, 0.3)).toEqual({ left: 0.6, top: 0.7, width: 0.4, height: 0.3 });
  });

  it("clicking an internal PDF link scrolls to target and records a persistent return target", async () => {
    const { actions, scrollToPage } = createPreviewActions();
    const sourceRect: RectPct = { left: 0.12, top: 0.34, width: 0.18, height: 0.05 };
    const link: PdfLinkAnnotation = {
      link_id: "link-1",
      page_index: 2,
      rects_pct: [sourceRect],
      destination: "dest-1",
      title: "Internal PDF link",
    };

    await actions.handlePdfLinkClick(link);

    expect(actions.pdfLinkReturnTarget.value).toEqual({
      pageIndex: 2,
      rectsPct: [sourceRect],
      label: "Internal PDF link",
    });
    expect(scrollToPage).toHaveBeenCalledWith(4, {
      rectsPct: [{ left: 0.32, top: 0.28500000000000003, width: 0.36, height: 0.23 }],
      block: "center",
    });
  });

  it("returning to the PDF link source scrolls back without closing the return bar", async () => {
    const { actions, scrollToPage } = createPreviewActions();
    const sourceRect: RectPct = { left: 0.12, top: 0.34, width: 0.18, height: 0.05 };
    await actions.handlePdfLinkClick({
      link_id: "link-1",
      page_index: 2,
      rects_pct: [sourceRect],
      destination: "dest-1",
      title: "Internal PDF link",
    });
    scrollToPage.mockClear();

    actions.returnToPdfLinkSource();

    expect(scrollToPage).toHaveBeenCalledWith(2, { rectsPct: [sourceRect], block: "center" });
    expect(actions.pdfLinkReturnTarget.value).not.toBeNull();

    actions.closePdfLinkReturnTarget();
    expect(actions.pdfLinkReturnTarget.value).toBeNull();
  });
});
