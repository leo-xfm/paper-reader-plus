import type { RectPct } from "@/types";

export type ViewportRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ScrollBox = {
  clientWidth: number;
  clientHeight: number;
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  scrollHeight: number;
};

export type ZoomPointAnchor = {
  pointInViewport: { x: number; y: number };
  pagePct: { x: number; y: number };
};

export type ContainerZoomAnchor = {
  pointInViewport: { x: number; y: number };
  contentPoint: { x: number; y: number };
};

export function clampScroll(value: number, viewportSize: number, contentSize: number) {
  return Math.min(Math.max(0, contentSize - viewportSize), Math.max(0, value));
}

export function buildContainerZoomAnchor(scrollBox: Pick<ScrollBox, "scrollLeft" | "scrollTop">, pointInViewport: { x: number; y: number }): ContainerZoomAnchor {
  return {
    pointInViewport,
    contentPoint: {
      x: scrollBox.scrollLeft + pointInViewport.x,
      y: scrollBox.scrollTop + pointInViewport.y,
    },
  };
}

export function scrollForZoomAnchor(scrollBox: ScrollBox, anchor: ContainerZoomAnchor, ratio: number) {
  return {
    left: clampScroll(anchor.contentPoint.x * ratio - anchor.pointInViewport.x, scrollBox.clientWidth, scrollBox.scrollWidth),
    top: clampScroll(anchor.contentPoint.y * ratio - anchor.pointInViewport.y, scrollBox.clientHeight, scrollBox.scrollHeight),
  };
}

export function pagePctFromViewportPoint(point: { x: number; y: number }, pageRect: ViewportRect) {
  return {
    x: Math.min(1, Math.max(0, (point.x - pageRect.left) / Math.max(1, pageRect.width))),
    y: Math.min(1, Math.max(0, (point.y - pageRect.top) / Math.max(1, pageRect.height))),
  };
}

export function pagePointInViewport(pageRect: ViewportRect, pagePct: { x: number; y: number }) {
  return {
    x: pageRect.left + pageRect.width * pagePct.x,
    y: pageRect.top + pageRect.height * pagePct.y,
  };
}

export function zoomCorrectionDelta(anchor: ZoomPointAnchor, pageRect: ViewportRect) {
  const target = pagePointInViewport(pageRect, anchor.pagePct);
  return {
    left: target.x - anchor.pointInViewport.x,
    top: target.y - anchor.pointInViewport.y,
  };
}

export function scrollForPagePoint(
  scrollBox: ScrollBox,
  pageRect: ViewportRect,
  anchor: ZoomPointAnchor,
) {
  const target = pagePointInViewport(pageRect, anchor.pagePct);
  return {
    left: clampScroll(scrollBox.scrollLeft + target.x - anchor.pointInViewport.x, scrollBox.clientWidth, scrollBox.scrollWidth),
    top: clampScroll(scrollBox.scrollTop + target.y - anchor.pointInViewport.y, scrollBox.clientHeight, scrollBox.scrollHeight),
  };
}

export function firstTargetRect(rectsPct: RectPct[] | undefined) {
  return rectsPct?.find((rect) => rect.width > 0 && rect.height > 0) || null;
}

export function targetRectCenterPct(rect: RectPct) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

export function scrollToPageTarget(
  scrollBox: ScrollBox,
  stageRect: ViewportRect,
  pageRect: ViewportRect,
  options: { rectsPct?: RectPct[]; block?: "start" | "center" } = {},
) {
  const targetRect = firstTargetRect(options.rectsPct);
  const block = options.block || "start";
  const targetPct = targetRect ? targetRectCenterPct(targetRect) : { x: 0, y: 0 };
  const targetViewportPoint = pagePointInViewport(pageRect, targetPct);
  const targetContentX = scrollBox.scrollLeft + targetViewportPoint.x - stageRect.left;
  const targetContentY = scrollBox.scrollTop + targetViewportPoint.y - stageRect.top;
  const nextTop = block === "center"
    ? targetContentY - scrollBox.clientHeight / 2
    : scrollBox.scrollTop + pageRect.top - stageRect.top;

  let nextLeft = scrollBox.scrollLeft;
  if (targetRect) {
    const targetLeft = scrollBox.scrollLeft + pageRect.left + pageRect.width * targetRect.left - stageRect.left;
    const targetRight = targetLeft + pageRect.width * targetRect.width;
    const viewportLeft = scrollBox.scrollLeft;
    const viewportRight = scrollBox.scrollLeft + scrollBox.clientWidth;
    if (targetLeft < viewportLeft) nextLeft = targetLeft;
    else if (targetRight > viewportRight) nextLeft = targetRight - scrollBox.clientWidth;
  }

  return {
    left: clampScroll(nextLeft, scrollBox.clientWidth, scrollBox.scrollWidth),
    top: clampScroll(nextTop, scrollBox.clientHeight, scrollBox.scrollHeight),
  };
}
