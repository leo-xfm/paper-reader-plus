import { describe, expect, it } from "vitest";
import { buildContainerZoomAnchor, scrollForPagePoint, scrollForZoomAnchor, scrollToPageTarget, zoomCorrectionDelta } from "@/pdf/pdfViewport";

describe("pdfViewport", () => {
  it("centers a target rect vertically in the scroll viewport", () => {
    const target = scrollToPageTarget(
      { clientWidth: 800, clientHeight: 600, scrollLeft: 0, scrollTop: 1000, scrollWidth: 1000, scrollHeight: 3000 },
      { left: 0, top: 0, width: 800, height: 600 },
      { left: 100, top: 200, width: 600, height: 900 },
      { rectsPct: [{ left: 0.1, top: 0.25, width: 0.4, height: 0.05 }], block: "center" },
    );

    expect(target.top).toBe(1147.5);
  });

  it("clamps centered targets to the valid scroll range", () => {
    const topTarget = scrollToPageTarget(
      { clientWidth: 800, clientHeight: 600, scrollLeft: 0, scrollTop: 0, scrollWidth: 1000, scrollHeight: 3000 },
      { left: 0, top: 0, width: 800, height: 600 },
      { left: 100, top: 10, width: 600, height: 900 },
      { rectsPct: [{ left: 0.1, top: 0, width: 0.4, height: 0.02 }], block: "center" },
    );
    const bottomTarget = scrollToPageTarget(
      { clientWidth: 800, clientHeight: 600, scrollLeft: 0, scrollTop: 2400, scrollWidth: 1000, scrollHeight: 3000 },
      { left: 0, top: 0, width: 800, height: 600 },
      { left: 100, top: 500, width: 600, height: 900 },
      { rectsPct: [{ left: 0.1, top: 0.98, width: 0.4, height: 0.02 }], block: "center" },
    );

    expect(topTarget.top).toBe(0);
    expect(bottomTarget.top).toBe(2400);
  });

  it("computes zoom correction deltas from the live page rect", () => {
    const delta = zoomCorrectionDelta(
      { pointInViewport: { x: 350, y: 400 }, pagePct: { x: 0.5, y: 0.25 } },
      { left: 80, top: 120, width: 700, height: 1200 },
    );

    expect(delta).toEqual({ left: 80, top: 20 });
  });

  it("keeps the mouse content point stable with ratio-based zoom scroll", () => {
    const anchor = buildContainerZoomAnchor({ scrollLeft: 300, scrollTop: 500 }, { x: 200, y: 150 });
    const target = scrollForZoomAnchor(
      { clientWidth: 800, clientHeight: 600, scrollLeft: 300, scrollTop: 500, scrollWidth: 2400, scrollHeight: 3200 },
      anchor,
      1.25,
    );

    expect(target).toEqual({ left: 425, top: 662.5 });
  });

  it("computes scroll targets from rect centers independent of page mount timing", () => {
    const target = scrollForPagePoint(
      { clientWidth: 800, clientHeight: 600, scrollLeft: 100, scrollTop: 1200, scrollWidth: 1200, scrollHeight: 4000 },
      { left: 80, top: 240, width: 640, height: 900 },
      { pointInViewport: { x: 400, y: 300 }, pagePct: { x: 0.5, y: 0.25 } },
    );

    expect(target).toEqual({ left: 100, top: 1365 });
  });
});
