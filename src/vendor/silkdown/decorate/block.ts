import { Decoration } from "@codemirror/view";
import type { EditorSelection, Range, Text } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { selectionTouchesLineRange } from "../util/selection.js";
import { HIDE, pushAtomicRange } from "./shared.js";

const HR_LINE = Decoration.line({ class: "sd-hr" });
const HR_LINE_RENDERED = Decoration.line({ class: "sd-hr sd-hr-rendered" });

export function decorateHorizontalRule(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  node: SyntaxNode,
  doc: Text,
  sel: EditorSelection,
): void {
  const line = doc.lineAt(node.from);
  const revealed = selectionTouchesLineRange(doc, sel, node.from, node.to);
  if (revealed) {
    ranges.push(HR_LINE.range(line.from));
    return;
  }
  ranges.push(HR_LINE_RENDERED.range(line.from));
  pushAtomicRange(ranges, atomicRanges, HIDE, node.from, node.to);
}
