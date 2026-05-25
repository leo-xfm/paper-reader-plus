import { Decoration } from "@codemirror/view";
import type { EditorSelection, Range, Text } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { children } from "../util/tree.js";
import { BulletMarkerWidget, ListFoldToggleWidget } from "../widgets/list.js";
import { TaskCheckboxWidget } from "../widgets/task.js";
import { pushAtomicRange } from "./shared.js";

const MAX_LIST_INDENT_LEVEL = 4;

function listIndentLevel(lineText: string, markerFromColumn: number) {
  const indent = lineText.slice(0, markerFromColumn);
  return Math.min(Math.max(0, Math.floor(indent.replace(/\t/g, "    ").length / 4)), MAX_LIST_INDENT_LEVEL);
}

export type ListFoldInfo = {
  marker: string;
  markerFrom: number;
  markerTo: number;
  collapsed: boolean;
  hiddenFrom: number;
  hiddenTo: number;
};

export type DecorateListItemOptions = {
  listFoldingEnabled?: boolean;
};

export type DecorateListItemResult = {
  collapsedRange?: { from: number; to: number };
};

export function listItemFoldInfo(node: SyntaxNode, doc: Text, enabled: boolean): ListFoldInfo | null {
  if (!enabled) return null;
  const startLine = doc.lineAt(node.from);
  if (node.to <= startLine.to) return null;
  if (/^\s*[-+*]\s+\[[ xX]\](?:\s|$)/.test(startLine.text)) return null;

  for (const child of children(node)) {
    if (child.name !== "ListMark") continue;
    const marker = doc.sliceString(child.from, child.to);
    if (!/^[-+*]$/.test(marker)) return null;
    return {
      marker,
      markerFrom: child.from,
      markerTo: child.to,
      collapsed: marker === "*",
      hiddenFrom: startLine.to,
      hiddenTo: node.to,
    };
  }
  return null;
}

export function decorateListItem(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  node: SyntaxNode,
  doc: Text,
  _sel: EditorSelection,
  options: DecorateListItemOptions = {},
): DecorateListItemResult {
  const startLine = doc.lineAt(node.from);
  const isTaskItem = /^\s*[-+*]\s+\[[ xX]\](?:\s|$)/.test(startLine.text);
  const foldInfo = listItemFoldInfo(node, doc, options.listFoldingEnabled !== false);
  let listMarkFrom = -1;
  let level = 0;

  for (const child of children(node)) {
    if (child.name !== "ListMark") continue;
    listMarkFrom = child.from;
    level = listIndentLevel(startLine.text, child.from - startLine.from);
    const marker = doc.sliceString(child.from, child.to);
    if (!isTaskItem && /^[-+*]$/.test(marker)) {
      const indent = doc.sliceString(startLine.from, child.from);
      const level = Math.floor(indent.replace(/\t/g, "    ").length / 4);
      if (foldInfo) {
        ranges.push(
          Decoration.widget({
            widget: new ListFoldToggleWidget(foldInfo.collapsed, child.from, child.to),
            side: -1,
          }).range(child.from),
        );
      }
      pushAtomicRange(
        ranges,
        atomicRanges,
        Decoration.replace({ widget: new BulletMarkerWidget(marker, level, foldInfo?.collapsed === true) }),
        child.from,
        child.to,
      );
    }
    break;
  }

  const foldClass = foldInfo ? ` sd-list-item-foldable ${foldInfo.collapsed ? "sd-list-item-collapsed" : "sd-list-item-expanded"}` : "";
  ranges.push(Decoration.line({ class: `sd-list-item sd-list-item-level-${level}${foldClass}` }).range(startLine.from));

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

  if (foldInfo?.collapsed) {
    return { collapsedRange: { from: foldInfo.hiddenFrom, to: foldInfo.hiddenTo } };
  }
  return {};
}
