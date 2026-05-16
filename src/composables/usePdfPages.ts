import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from "vue";
import { buildContainerZoomAnchor, pagePctFromViewportPoint, scrollForPagePoint, scrollForZoomAnchor, scrollToPageTarget } from "@/pdf/pdfViewport";
import type { RectPct } from "@/types";

type ZoomAnchor = {
  pointInViewport: { x: number; y: number };
  contentPoint: { x: number; y: number };
  page?: {
    pageIndex: number;
    pagePct: { x: number; y: number };
  };
};

export type ScrollToPageOptions = {
  rectsPct?: RectPct[];
  block?: "start" | "center";
  behavior?: ScrollBehavior;
};

export function usePdfPages(pageNumbers: Ref<number[]>) {
  const pdfScroll = ref<HTMLElement | null>(null);
  const currentPageIndex = ref(0);
  const pdfZoom = ref(1);
  const pageElements = new Map<number, HTMLElement>();
  const pageVisibilityRatios = new Map<number, number>();
  let resizeObserver: ResizeObserver | null = null;
  let pageObserver: IntersectionObserver | null = null;
  let lastZoomClientPoint: { x: number; y: number } | null = null;
  let zoomCorrectionToken = 0;
  let pendingScrollTarget: { pageIndex: number; options: ScrollToPageOptions } | null = null;

  const currentPageNumber = computed(() => Math.min(pageNumbers.value.length || 1, currentPageIndex.value + 1));
  const pageScaleWidth = computed(() => Math.max(360, (pdfScroll.value?.clientWidth || 850) - 56));
  const pageRenderWidth = computed(() => Math.round(pageScaleWidth.value * pdfZoom.value));

  function setupObservers() {
    resizeObserver?.disconnect();
    pageObserver?.disconnect();
    pageVisibilityRatios.clear();
    const scroll = pdfScroll.value;
    if (!scroll) return;
    resizeObserver = new ResizeObserver(() => {
      pageNumbers.value = [...pageNumbers.value];
    });
    resizeObserver.observe(scroll);
    pageObserver = new IntersectionObserver(handlePageIntersections, {
      root: scroll,
      threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
    });
    for (const element of pageElements.values()) pageObserver.observe(element);
  }

  function setPdfScrollElement(element: HTMLElement | null) {
    pdfScroll.value = element;
    if (element) flushPendingScrollTarget();
  }

  function setPageElement(pageIndex: number, element: HTMLElement | null) {
    const previous = pageElements.get(pageIndex);
    if (previous) pageObserver?.unobserve(previous);
    if (element) {
      pageElements.set(pageIndex, element);
      pageObserver?.observe(element);
    } else {
      pageElements.delete(pageIndex);
      pageVisibilityRatios.delete(pageIndex);
    }
    if (element && pendingScrollTarget?.pageIndex === pageIndex) flushPendingScrollTarget();
  }

  function handlePageIntersections(entries: IntersectionObserverEntry[]) {
    for (const entry of entries) {
      const pageIndex = Number((entry.target as HTMLElement).dataset.pageIndex);
      if (!Number.isFinite(pageIndex)) continue;
      pageVisibilityRatios.set(pageIndex, entry.isIntersecting ? entry.intersectionRatio : 0);
    }
    let best = currentPageIndex.value;
    let bestRatio = 0;
    for (const [pageIndex, ratio] of pageVisibilityRatios.entries()) {
      if (ratio > bestRatio) {
        best = pageIndex;
        bestRatio = ratio;
      }
    }
    currentPageIndex.value = best;
  }

  function performScrollToPage(pageIndex: number, options: ScrollToPageOptions = {}) {
    const stage = pdfScroll.value;
    const element = pageElements.get(pageIndex);
    if (!stage || !element) return false;
    if (!options.rectsPct?.length) {
      element.scrollIntoView({ behavior: options.behavior || "smooth", block: options.block || "start" });
      return true;
    }
    const target = scrollToPageTarget(
      {
        clientWidth: stage.clientWidth,
        clientHeight: stage.clientHeight,
        scrollLeft: stage.scrollLeft,
        scrollTop: stage.scrollTop,
        scrollWidth: stage.scrollWidth,
        scrollHeight: stage.scrollHeight,
      },
      stage.getBoundingClientRect(),
      element.getBoundingClientRect(),
      options,
    );
    stage.scrollTo({ left: target.left, top: target.top, behavior: options.behavior || "smooth" });
    return true;
  }

  function flushPendingScrollTarget() {
    const pending = pendingScrollTarget;
    if (!pending) return;
    if (!performScrollToPage(pending.pageIndex, pending.options)) return;
    pendingScrollTarget = null;
    void nextTick(() => {
      requestAnimationFrame(() => {
        performScrollToPage(pending.pageIndex, { ...pending.options, behavior: "auto" });
      });
    });
  }

  function scrollToPage(pageIndex: number, options: ScrollToPageOptions = {}) {
    pendingScrollTarget = null;
    if (performScrollToPage(pageIndex, options)) return;
    pendingScrollTarget = { pageIndex, options };
  }

  function viewportCenter(stage: HTMLElement) {
    const rect = stage.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function pageUnderPoint(point: { x: number; y: number }) {
    for (const [pageIndex, element] of pageElements.entries()) {
      const rect = element.getBoundingClientRect();
      if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) {
        return { pageIndex, element, rect };
      }
    }
    const pageIndex = currentPageIndex.value;
    const element = pageElements.get(pageIndex) || pageElements.values().next().value as HTMLElement | undefined;
    if (!element) return null;
    return { pageIndex, element, rect: element.getBoundingClientRect() };
  }

  function buildZoomAnchor(stage: HTMLElement, point: { x: number; y: number }): ZoomAnchor {
    const page = pageUnderPoint(point);
    const stageRect = stage.getBoundingClientRect();
    const pointInViewport = {
      x: point.x - stageRect.left,
      y: point.y - stageRect.top,
    };
    const anchor = buildContainerZoomAnchor(stage, pointInViewport);
    if (!page) {
      return anchor;
    }
    return {
      ...anchor,
      page: {
        pageIndex: page.pageIndex,
        pagePct: pagePctFromViewportPoint(point, page.rect),
      },
    };
  }

  function applyZoomAnchor(stage: HTMLElement, anchor: ZoomAnchor, ratio: number) {
    if (anchor.page) {
      const element = pageElements.get(anchor.page.pageIndex);
      if (element) {
        const stageRect = stage.getBoundingClientRect();
        const target = scrollForPagePoint(
          {
            clientWidth: stage.clientWidth,
            clientHeight: stage.clientHeight,
            scrollLeft: stage.scrollLeft,
            scrollTop: stage.scrollTop,
            scrollWidth: stage.scrollWidth,
            scrollHeight: stage.scrollHeight,
          },
          element.getBoundingClientRect(),
          {
            pointInViewport: {
              x: stageRect.left + anchor.pointInViewport.x,
              y: stageRect.top + anchor.pointInViewport.y,
            },
            pagePct: anchor.page.pagePct,
          },
        );
        stage.scrollLeft = target.left;
        stage.scrollTop = target.top;
        return;
      }
    }
    const target = scrollForZoomAnchor(
      {
        clientWidth: stage.clientWidth,
        clientHeight: stage.clientHeight,
        scrollLeft: stage.scrollLeft,
        scrollTop: stage.scrollTop,
        scrollWidth: stage.scrollWidth,
        scrollHeight: stage.scrollHeight,
      },
      anchor,
      ratio,
    );
    stage.scrollLeft = target.left;
    stage.scrollTop = target.top;
  }

  function applyImmediateZoomAnchor(stage: HTMLElement, anchor: ZoomAnchor, ratio: number) {
    const target = scrollForZoomAnchor(
      {
        clientWidth: stage.clientWidth,
        clientHeight: stage.clientHeight,
        scrollLeft: stage.scrollLeft,
        scrollTop: stage.scrollTop,
        scrollWidth: Math.max(stage.clientWidth, Math.round(stage.scrollWidth * ratio)),
        scrollHeight: Math.max(stage.clientHeight, Math.round(stage.scrollHeight * ratio)),
      },
      anchor,
      ratio,
    );
    stage.scrollLeft = target.left;
    stage.scrollTop = target.top;
  }

  function scheduleZoomCorrection(stage: HTMLElement, anchor: ZoomAnchor, ratio: number) {
    const token = ++zoomCorrectionToken;
    applyImmediateZoomAnchor(stage, anchor, ratio);
    const correct = () => {
      if (token !== zoomCorrectionToken) return;
      applyZoomAnchor(stage, anchor, ratio);
    };
    void nextTick(() => {
      applyImmediateZoomAnchor(stage, anchor, ratio);
      requestAnimationFrame(() => {
        correct();
        requestAnimationFrame(correct);
      });
      window.setTimeout(correct, 80);
      window.setTimeout(correct, 180);
    });
  }
  function zoomAt(nextZoom: number, clientPoint?: { x: number; y: number } | null) {
    const stage = pdfScroll.value;
    const previousZoom = pdfZoom.value;
    const clampedZoom = Math.min(4, Math.max(0.55, nextZoom));
    if (!stage || clampedZoom === previousZoom) {
      pdfZoom.value = clampedZoom;
      return;
    }
    const rect = stage.getBoundingClientRect();
    const anchorPoint = clientPoint || lastZoomClientPoint || {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    const anchor = buildZoomAnchor(stage, anchorPoint);
    const ratio = clampedZoom / previousZoom;
    pdfZoom.value = clampedZoom;
    scheduleZoomCorrection(stage, anchor, ratio);
  }

  function handleWheel(event: WheelEvent) {
    lastZoomClientPoint = { x: event.clientX, y: event.clientY };
    if (!event.ctrlKey) return;
    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? 1.22 : 1 / 1.22;
    zoomAt(pdfZoom.value * zoomFactor, lastZoomClientPoint);
  }

  function zoom(delta: number) {
    const direction = delta >= 0 ? 1 : -1;
    const stage = pdfScroll.value;
    zoomAt(pdfZoom.value * (direction > 0 ? 1.22 : 1 / 1.22), stage ? viewportCenter(stage) : null);
  }

  function resetZoom() {
    const stage = pdfScroll.value;
    zoomAt(1, stage ? viewportCenter(stage) : null);
  }

  function clearPages() {
    pageElements.clear();
    pageVisibilityRatios.clear();
    pendingScrollTarget = null;
    currentPageIndex.value = 0;
  }

  watch(pdfScroll, setupObservers);
  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    pageObserver?.disconnect();
  });

  return {
    pdfScroll,
    currentPageIndex,
    currentPageNumber,
    pdfZoom,
    pageRenderWidth,
    setPdfScrollElement,
    setPageElement,
    setupObservers,
    scrollToPage,
    handleWheel,
    zoom,
    resetZoom,
    clearPages,
  };
}
