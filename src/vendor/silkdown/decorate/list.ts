import { Decoration } from "@codemirror/view";
import type { EditorSelection, Range, Text } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { children } from "../util/tree.js";
import { BulletMarkerWidget } from "../widgets/list.js";
import { TaskCheckboxWidget } from "../widgets/task.js";
import { pushAtomicRange } from "./shared.js";

const ITEM_LINE = Decoration.line({ class: "sd-list-item" });

export function decorateListItem(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  node: SyntaxNode,
  doc: Text,
  _sel: EditorSelection,
): void {
  const startLine = doc.lineAt(node.from);
  ranges.push(ITEM_LINE.range(startLine.from));
  const isTaskItem = /^\s*[-+*]\s+\[[ xX]\](?:\s|$)/.test(startLine.text);
  let listMarkFrom = -1;

  for (const child of children(node)) {
    if (child.name !== "ListMark") continue;
    listMarkFrom = child.from;
    const marker = doc.sliceString(child.from, child.to);
    if (!isTaskItem && /^[-+*]$/.test(marker)) {
      const indent = doc.sliceString(startLine.from, child.from);
      const level = Math.floor(indent.replace(/\t/g, "    ").length / 4);
      pushAtomicRange(
        ranges,
        atomicRanges,
        Decoration.replace({ widget: new BulletMarkerWidget(marker, level) }),
        child.from,
        child.to,
      );
    }
    break;
  }

  // GFM task shape: ListItem > Task > TaskMarker covers the literal "[ ]" / "[x]".
  for (const child of children(node)) {
    if (child.name !== "Task") continue;
    for (const inner of children(child)) {
      if (inner.name !== "TaskMarker") continue;
      const text = doc.sliceString(inner.from, inner.to);
      const checked = text.toLowerCase().includes("x");
      const from = listMarkFrom >= 0 ? listMarkFrom : inner.from;
      const prefix = doc.sliceString(from, inner.from);
      pushAtomicRange(
        ranges,
        atomicRanges,
        Decoration.replace({
          widget: new TaskCheckboxWidget(checked, from, inner.to, prefix),
        }),
        from,
        inner.to,
      );
    }
  }
}
