import { Decoration } from "@codemirror/view";
import type { EditorSelection, Range, Text } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { children } from "../util/tree.js";
import { BulletMarkerWidget, ListFoldToggleWidget } from "../widgets/list.js";
import { TaskCheckboxWidget } from "../widgets/task.js";
import { pushAtomicRange } from "./shared.js";

const MAX_LIST_INDENT_LEVEL = 4;

function directListMark(node: SyntaxNode, doc: Text) {
  for (const child of children(node)) {
    if (child.name !== "ListMark") continue;
    const startLine = doc.lineAt(child.from);
    const prefix = doc.sliceString(startLine.from, child.from);
    if (!/^[ \t]*$/.test(prefix)) return null;
    return {
      marker: doc.sliceString(child.from, child.to),
      from: child.from,
      to: child.to,
      startLine,
    };
  }
  return null;
}

export function listItemHasLineStartMarker(node: SyntaxNode, doc: Text) {
  return Boolean(directListMark(node, doc));
}

export function listItemVisualLevel(node: SyntaxNode) {
  let level = 0;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.name === "ListItem") level += 1;
  }
  return Math.min(Math.max(0, level), MAX_LIST_INDENT_LEVEL);
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
  const mark = directListMark(node, doc);
  if (!mark || !/^[-+*]$/.test(mark.marker)) return null;
  const startLine = mark.startLine;
  if (node.to <= startLine.to) return null;
  if (/^\s*[-+*]\s+\[[ xX]\](?:\s|$)/.test(startLine.text)) return null;

  return {
    marker: mark.marker,
    markerFrom: mark.from,
    markerTo: mark.to,
    collapsed: mark.marker === "*",
    hiddenFrom: startLine.to,
    hiddenTo: node.to,
  };
}

export function decorateListItem(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  node: SyntaxNode,
  doc: Text,
  _sel: EditorSelection,
  options: DecorateListItemOptions = {},
): DecorateListItemResult {
  const mark = directListMark(node, doc);
  if (!mark) return {};
  const startLine = mark.startLine;
  const isTaskItem = /^\s*[-+*]\s+\[[ xX]\](?:\s|$)/.test(startLine.text);
  const foldInfo = listItemFoldInfo(node, doc, options.listFoldingEnabled !== false);
  const level = listItemVisualLevel(node);
  let listMarkFrom = mark.from;

  if (!isTaskItem && /^[-+*]$/.test(mark.marker)) {
    if (foldInfo) {
      ranges.push(
        Decoration.widget({
          widget: new ListFoldToggleWidget(foldInfo.collapsed, mark.from, mark.to),
          side: -1,
        }).range(mark.from),
      );
    }
    pushAtomicRange(
      ranges,
      atomicRanges,
      Decoration.replace({ widget: new BulletMarkerWidget(mark.marker, level, foldInfo?.collapsed === true) }),
      mark.from,
      mark.to,
    );
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
