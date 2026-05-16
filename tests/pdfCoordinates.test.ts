import { describe, expect, it } from "vitest";
import { itemToPct, mergeContinuousLineRects, pctStyle, rectToPct, selectionRectsToPct } from "@/pdf/pdfCoordinates";

describe("pdfCoordinates", () => {
  it("converts DOM rects to page percentages", () => {
    expect(rectToPct(
      { left: 150, top: 240, width: 50, height: 60 },
      { left: 100, top: 200, width: 500, height: 800 },
    )).toEqual({ left: 0.1, top: 0.05, width: 0.1, height: 0.075 });
  });

  it("keeps text item percentage rects independent from zoomed pixels", () => {
    const first = itemToPct({ left: 100, top: 200, width: 50, height: 20 }, { width: 500, height: 1000 });
    const zoomed = itemToPct({ left: 200, top: 400, width: 100, height: 40 }, { width: 1000, height: 2000 });
    expect(zoomed).toEqual(first);
  });

  it("renders percent styles", () => {
    expect(pctStyle({ left: 0.1, top: 0.2, width: 0.3, height: 0.4 })).toEqual({
      left: "10%",
      top: "20%",
      width: "30%",
      height: "40%",
    });
  });

  it("uses selection rects instead of full text spans for selected highlights", () => {
    const rects = selectionRectsToPct(
      [{ left: 120, top: 220, width: 80, height: 30 }],
      [{ left: 100, top: 215, width: 180, height: 40 }],
      { left: 100, top: 200, width: 500, height: 800 },
    );
    expect(rects).toEqual([{ left: 0.04, top: 0.025, width: 0.16, height: 0.0375 }]);
  });

  it("clamps selection rects to the page box", () => {
    const rects = selectionRectsToPct(
      [{ left: 80, top: 190, width: 80, height: 40 }],
      [],
      { left: 100, top: 200, width: 500, height: 800 },
    );
    expect(rects).toEqual([{ left: 0, top: 0, width: 0.12, height: 0.0375 }]);
  });

  it("merges only continuous rects on the same visual line", () => {
    const rects = mergeContinuousLineRects([
      { left: 0.1, top: 0.1, width: 0.08, height: 0.02 },
      { left: 0.181, top: 0.101, width: 0.06, height: 0.02 },
      { left: 0.42, top: 0.1, width: 0.05, height: 0.02 },
      { left: 0.12, top: 0.15, width: 0.14, height: 0.02 },
    ]);
    expect(rects).toHaveLength(3);
    expect(rects[0]).toMatchObject({ left: 0.1, top: 0.1 });
    expect(rects[0].width).toBeCloseTo(0.141);
    expect(rects[0].height).toBeCloseTo(0.021);
    expect(rects[1]).toEqual({ left: 0.42, top: 0.1, width: 0.05, height: 0.02 });
    expect(rects[2]).toEqual({ left: 0.12, top: 0.15, width: 0.14, height: 0.02 });
  });
});
