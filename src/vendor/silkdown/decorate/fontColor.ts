import { Decoration } from "@codemirror/view";
import type { EditorSelection, Range, Text } from "@codemirror/state";
import { selectionTouchesRange } from "../util/selection.js";
import { pushRevealableMark } from "./shared.js";

const FONT_COLOR_PATTERN = /<span\s+style=(["'])color:\s*(#[0-9a-f]{6}|black|red|green|blue|purple)\s*;?\1>([^\n]*?\S[^\n]*?)<\/span>/gi;

export function decorateFontColor(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  doc: Text,
  sel: EditorSelection,
  from: number,
  to: number,
): void {
  const fromLine = doc.lineAt(from).number;
  const toLine = doc.lineAt(to).number;
  for (let lineNumber = fromLine; lineNumber <= toLine; lineNumber += 1) {
    const line = doc.line(lineNumber);
    FONT_COLOR_PATTERN.lastIndex = 0;
    for (const match of line.text.matchAll(FONT_COLOR_PATTERN)) {
      const start = line.from + (match.index || 0);
      const end = start + match[0].length;
      const content = match[3] || "";
      const contentStart = start + match[0].indexOf(content);
      const contentEnd = contentStart + content.length;
      if (contentStart >= contentEnd) continue;
      const revealed = selectionTouchesRange(sel, start, end);
      ranges.push(Decoration.mark({ class: "sd-font-color", attributes: { style: `color: ${match[2]};` } }).range(contentStart, contentEnd));
      pushRevealableMark(ranges, atomicRanges, revealed, start, contentStart);
      pushRevealableMark(ranges, atomicRanges, revealed, contentEnd, end);
    }
  }
}
