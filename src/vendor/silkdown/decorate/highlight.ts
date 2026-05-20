import { Decoration } from "@codemirror/view";
import type { EditorSelection, Range, Text } from "@codemirror/state";
import { HIDE, pushAtomicRange } from "./shared.js";

function selectionTouches(sel: EditorSelection, from: number, to: number): boolean {
  for (const range of sel.ranges) {
    if (range.from <= to && range.to >= from) return true;
  }
  return false;
}

function isEscaped(text: string, index: number) {
  let slashCount = 0;
  for (let pos = index - 1; pos >= 0 && text[pos] === "\\"; pos -= 1) slashCount += 1;
  return slashCount % 2 === 1;
}

export function decorateHighlight(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  doc: Text,
  sel: EditorSelection,
  from: number,
  to: number,
): void {
  const mark = Decoration.mark({ class: "sd-highlight" });
  const fromLine = doc.lineAt(Math.max(0, from)).number;
  const toLine = doc.lineAt(Math.min(doc.length, to)).number;

  for (let lineNumber = fromLine; lineNumber <= toLine; lineNumber += 1) {
    const line = doc.line(lineNumber);
    let index = 0;
    while (index < line.text.length) {
      const open = line.text.indexOf("==", index);
      if (open < 0) break;
      if (isEscaped(line.text, open)) {
        index = open + 2;
        continue;
      }
      const close = line.text.indexOf("==", open + 2);
      if (close < 0 || close === open + 2) break;
      const fromPos = line.from + open;
      const toPos = line.from + close + 2;
      ranges.push(mark.range(fromPos + 2, toPos - 2));
      if (!selectionTouches(sel, fromPos, toPos)) {
        pushAtomicRange(ranges, atomicRanges, HIDE, fromPos, fromPos + 2);
        pushAtomicRange(ranges, atomicRanges, HIDE, toPos - 2, toPos);
      }
      index = close + 2;
    }
  }
}
