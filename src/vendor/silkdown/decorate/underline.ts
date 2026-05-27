import { Decoration } from "@codemirror/view";
import type { EditorSelection, Range, Text } from "@codemirror/state";
import { selectionTouchesRange } from "../util/selection.js";
import { pushRevealableMark, rangeIntersectsAnyRange, type SourceRange } from "./shared.js";

const UNDERLINE_MARK = Decoration.mark({ class: "sd-underline" });
const UNDERLINE_PATTERN = /<u>(.+?)<\/u>/gi;

export function decorateUnderline(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  doc: Text,
  sel: EditorSelection,
  from: number,
  to: number,
  excludedRanges: readonly SourceRange[] = [],
): void {
  const fromLine = doc.lineAt(from).number;
  const toLine = doc.lineAt(to).number;
  for (let lineNumber = fromLine; lineNumber <= toLine; lineNumber += 1) {
    const line = doc.line(lineNumber);
    UNDERLINE_PATTERN.lastIndex = 0;
    for (const match of line.text.matchAll(UNDERLINE_PATTERN)) {
      const start = line.from + (match.index || 0);
      const openTo = start + 3;
      const closeFrom = start + match[0].length - 4;
      const end = start + match[0].length;
      if (openTo >= closeFrom) continue;
      if (rangeIntersectsAnyRange(start, end, excludedRanges)) continue;
      const revealed = selectionTouchesRange(sel, start, end);
      ranges.push(UNDERLINE_MARK.range(openTo, closeFrom));
      pushRevealableMark(ranges, atomicRanges, revealed, start, openTo);
      pushRevealableMark(ranges, atomicRanges, revealed, closeFrom, end);
    }
  }
}
