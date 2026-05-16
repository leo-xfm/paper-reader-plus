import type { RectPct } from "@/types";

type RectLike = Pick<DOMRect, "left" | "top" | "width" | "height"> & Partial<Pick<DOMRect, "right" | "bottom">>;

function rightOf(rect: RectLike) {
  return rect.right ?? rect.left + rect.width;
}

function bottomOf(rect: RectLike) {
  return rect.bottom ?? rect.top + rect.height;
}

export function clampRectToBox(rect: RectLike, box: RectLike) {
  const left = Math.max(rect.left, box.left);
  const top = Math.max(rect.top, box.top);
  const right = Math.min(rightOf(rect), rightOf(box));
  const bottom = Math.min(bottomOf(rect), bottomOf(box));
  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function rectToPct(rect: RectLike, pageBox: RectLike): RectPct {
  const clamped = clampRectToBox(rect, pageBox);
  return {
    left: (clamped.left - pageBox.left) / Math.max(1, pageBox.width),
    top: (clamped.top - pageBox.top) / Math.max(1, pageBox.height),
    width: clamped.width / Math.max(1, pageBox.width),
    height: clamped.height / Math.max(1, pageBox.height),
  };
}

export function itemToPct(item: { left: number; top: number; width: number; height: number }, pageSize: { width: number; height: number }): RectPct {
  return {
    left: item.left / Math.max(1, pageSize.width),
    top: item.top / Math.max(1, pageSize.height),
    width: item.width / Math.max(1, pageSize.width),
    height: item.height / Math.max(1, pageSize.height),
  };
}

export function pctStyle(rect: RectPct) {
  return {
    left: `${rect.left * 100}%`,
    top: `${rect.top * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  };
}

export function rectsIntersect(left: RectLike, right: RectLike) {
  return left.left < rightOf(right) && rightOf(left) > right.left && left.top < bottomOf(right) && bottomOf(left) > right.top;
}

export function mergeLineRects(rects: RectLike[]) {
  const lines = new Map<number, { left: number; top: number; right: number; bottom: number }>();
  for (const rect of rects) {
    const key = Math.round(rect.top / Math.max(2, rect.height) * 2);
    const current = lines.get(key);
    if (!current) {
      lines.set(key, { left: rect.left, top: rect.top, right: rightOf(rect), bottom: bottomOf(rect) });
      continue;
    }
    current.left = Math.min(current.left, rect.left);
    current.top = Math.min(current.top, rect.top);
    current.right = Math.max(current.right, rightOf(rect));
    current.bottom = Math.max(current.bottom, bottomOf(rect));
  }
  return [...lines.values()].map((line) => ({
    left: line.left,
    top: line.top,
    width: line.right - line.left,
    height: line.bottom - line.top,
  }));
}

function verticalOverlapRatio(left: RectLike, right: RectLike) {
  const overlap = Math.min(bottomOf(left), bottomOf(right)) - Math.max(left.top, right.top);
  return Math.max(0, overlap) / Math.max(1e-6, Math.min(left.height, right.height));
}

function mergeRectBounds(left: RectLike, right: RectLike) {
  const mergedLeft = Math.min(left.left, right.left);
  const mergedTop = Math.min(left.top, right.top);
  const mergedRight = Math.max(rightOf(left), rightOf(right));
  const mergedBottom = Math.max(bottomOf(left), bottomOf(right));
  return {
    left: mergedLeft,
    top: mergedTop,
    width: mergedRight - mergedLeft,
    height: mergedBottom - mergedTop,
  };
}

export function mergeContinuousLineRects(rects: RectLike[]) {
  const ordered = rects
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .slice()
    .sort((left, right) => left.top - right.top || left.left - right.left);
  const lines: RectLike[][] = [];
  for (const rect of ordered) {
    const line = lines.find((items) => items.some((item) => verticalOverlapRatio(item, rect) >= 0.55));
    if (line) {
      line.push(rect);
    } else {
      lines.push([rect]);
    }
  }

  const merged: RectLike[] = [];
  for (const line of lines) {
    const segments = line.slice().sort((left, right) => left.left - right.left);
    let current = segments[0];
    for (const rect of segments.slice(1)) {
      const gap = rect.left - rightOf(current);
      const tolerance = Math.max(0.0015, Math.min(current.height, rect.height) * 0.35);
      if (gap <= tolerance) {
        current = mergeRectBounds(current, rect);
      } else {
        merged.push(current);
        current = rect;
      }
    }
    if (current) merged.push(current);
  }

  return merged.sort((left, right) => left.top - right.top || left.left - right.left).map((rect) => ({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }));
}

function lineBounds(rect: RectLike, textRects: RectLike[]) {
  const related = textRects.filter((textRect) => rectsIntersect(rect, textRect));
  if (!related.length) return rect;
  const top = Math.max(rect.top, Math.min(...related.map((item) => item.top)));
  const bottom = Math.min(bottomOf(rect), Math.max(...related.map((item) => bottomOf(item))));
  return {
    left: rect.left,
    top,
    width: rect.width,
    height: Math.max(0, bottom - top),
  };
}

export function selectionRectsToPct(selectionRects: RectLike[], textRects: RectLike[], pageBox: RectLike) {
  return mergeLineRects(selectionRects)
    .map((rect) => lineBounds(rect, textRects))
    .map((rect) => rectToPct(rect, pageBox))
    .filter((rect) => rect.width > 0 && rect.height > 0);
}
