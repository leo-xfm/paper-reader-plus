import type { Mark, Node as ProseMirrorNode, Schema } from "prosemirror-model";
import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";

export type SourceRevealState = {
  imagePos: number | null;
};

export const sourceRevealPluginKey = new PluginKey<SourceRevealState>("liveMarkdownSourceReveal");

const IMAGE_SIZE_TITLE_PREFIX = "PRP_SIZE:";

function escapeMarkdownLabel(value: string) {
  return value.replace(/]/g, "\\]");
}

function escapeMarkdownUrl(value: string) {
  return value.replace(/[()]/g, "\\$&");
}

export function markdownForImageNode(node: ProseMirrorNode, parentLinkMark?: Mark | null) {
  const src = String(node.attrs.src || "");
  const title = String(node.attrs.title || "");
  const sizeMatch = title.match(/^PRP_SIZE:([1-9]\d{0,3})?x([1-9]\d{0,3})?$/);
  const size = sizeMatch ? ` =${sizeMatch[1] || ""}x${sizeMatch[2] || ""}` : "";
  const titlePart = title && !sizeMatch ? ` "${title.replace(/"/g, '\\"')}"` : "";
  const imageMarkdown = `![${escapeMarkdownLabel(String(node.attrs.alt || ""))}](${escapeMarkdownUrl(src)}${size}${titlePart})`;
  return parentLinkMark ? `[${imageMarkdown}](${escapeMarkdownUrl(String(parentLinkMark.attrs.href || ""))})` : imageMarkdown;
}

export function activeMarkRanges(state: EditorState) {
  const { from, empty, $from } = state.selection;
  const position = empty ? from : state.selection.from;
  const marks = empty ? state.storedMarks || $from.marks() : state.selection.$from.marks();
  const supported = marks.filter((mark) => ["strong", "em", "underline", "code", "link"].includes(mark.type.name));
  const parent = $from.parent;
  const parentStart = $from.start();
  const offset = Math.max(0, Math.min(position - parentStart, parent.content.size));

  return supported.flatMap((mark) => {
    let start = offset;
    let end = offset;
    parent.forEach((node, nodeOffset) => {
      const nodeStart = nodeOffset;
      const nodeEnd = nodeOffset + node.nodeSize;
      if (offset < nodeStart || offset > nodeEnd || !mark.isInSet(node.marks)) return;
      start = nodeStart;
      end = nodeEnd;
    });
    parent.forEach((node, nodeOffset) => {
      if (nodeOffset + node.nodeSize !== start || !mark.isInSet(node.marks)) return;
      start = nodeOffset;
    });
    parent.forEach((node, nodeOffset) => {
      if (nodeOffset !== end || !mark.isInSet(node.marks)) return;
      end = nodeOffset + node.nodeSize;
    });
    if (start === end) return [];
    return [{
      mark,
      from: parentStart + start,
      to: parentStart + end,
    }];
  });
}

export function markRangeForDeletedSourceMarker(state: EditorState, key: string) {
  if (!state.selection.empty || (key !== "Backspace" && key !== "Delete")) return null;
  const cursor = state.selection.from;
  const ranges = activeMarkRanges(state);
  return ranges.find((range) => {
    if (key === "Backspace") return cursor === range.to || cursor === range.from;
    return cursor === range.from || cursor === range.to;
  }) || null;
}

function nodeSourceRangeForDeletedMarker(state: EditorState, key: string) {
  if (!state.selection.empty || (key !== "Backspace" && key !== "Delete")) return null;
  const cursor = state.selection.from;
  const $from = state.selection.$from;
  const before = cursor > 0 ? state.doc.nodeAt(cursor - 1) : null;
  const after = state.doc.nodeAt(cursor);
  if (key === "Backspace" && before && ["math_inline", "math_block"].includes(before.type.name)) {
    return { from: cursor - 1, to: cursor, node: before };
  }
  if (key === "Delete" && after && ["math_inline", "math_block"].includes(after.type.name)) {
    return { from: cursor, to: cursor + after.nodeSize, node: after };
  }
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (!["math_inline", "math_block"].includes(node.type.name)) continue;
    const from = $from.before(depth);
    return { from, to: from + node.nodeSize, node };
  }
  return null;
}

function markerForMark(mark: Mark, side: "open" | "close") {
  if (mark.type.name === "strong") return "**";
  if (mark.type.name === "em") return "*";
  if (mark.type.name === "underline") return side === "open" ? "<u>" : "</u>";
  if (mark.type.name === "code") return "`";
  if (mark.type.name === "link") return side === "open" ? "[" : `](${mark.attrs.href || ""})`;
  return "";
}

function sourceWidget(text: string, className: string) {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

function imageSourceWidget(text: string) {
  const element = document.createElement("div");
  element.className = "live-markdown-image-source";
  element.textContent = text;
  return element;
}

function imageDecoration(state: EditorState, imagePos: number | null) {
  if (imagePos === null) return [];
  const node = state.doc.nodeAt(imagePos);
  if (!node || node.type.name !== "image") return [];
  const parentLinkMark = node.marks.find((mark) => mark.type.name === "link") || null;
  return [Decoration.widget(imagePos, () => imageSourceWidget(markdownForImageNode(node, parentLinkMark)), { side: -1 })];
}

function markDecorations(state: EditorState) {
  return activeMarkRanges(state).flatMap(({ mark, from, to }) => [
    Decoration.widget(from, () => sourceWidget(markerForMark(mark, "open"), "live-markdown-source-marker"), { side: -1 }),
    Decoration.widget(to, () => sourceWidget(markerForMark(mark, "close"), "live-markdown-source-marker"), { side: 1 }),
  ]);
}

function mathSourceDecorations(state: EditorState) {
  const decorations: Decoration[] = [];
  activeMathNodeRanges(state).forEach(({ node, pos }) => {
    if (node.type.name === "math_inline") {
      decorations.push(
        Decoration.widget(pos, () => sourceWidget("$", "live-markdown-source-marker"), { side: -1 }),
        Decoration.widget(pos + node.nodeSize, () => sourceWidget("$", "live-markdown-source-marker"), { side: 1 }),
      );
    }
    if (node.type.name === "math_block") {
      decorations.push(
        Decoration.widget(pos, () => sourceWidget("$$", "live-markdown-source-marker live-markdown-block-source-marker"), { side: -1 }),
        Decoration.widget(pos + node.nodeSize, () => sourceWidget("$$", "live-markdown-source-marker live-markdown-block-source-marker"), { side: 1 }),
      );
    }
  });
  return decorations;
}

export function activeMathNodeRanges(state: EditorState) {
  const ranges: Array<{ node: ProseMirrorNode; pos: number }> = [];
  const seen = new Set<number>();
  const add = (node: ProseMirrorNode | null | undefined, pos: number) => {
    if (!node || !["math_inline", "math_block"].includes(node.type.name) || seen.has(pos)) return;
    seen.add(pos);
    ranges.push({ node, pos });
  };
  if (state.selection.empty) {
    const cursor = state.selection.from;
    add(state.doc.nodeAt(cursor), cursor);
    if (cursor > 0) add(state.doc.nodeAt(cursor - 1), cursor - 1);
    return ranges;
  }
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
    if (["math_inline", "math_block"].includes(node.type.name)) add(node, pos);
  });
  return ranges;
}

function buildDecorations(state: EditorState, pluginState: SourceRevealState) {
  return DecorationSet.create(state.doc, [
    ...imageDecoration(state, pluginState.imagePos),
    ...markDecorations(state),
    ...mathSourceDecorations(state),
  ]);
}

export function findClickedImageInfo(view: EditorView, event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const image = target?.closest("img") as HTMLImageElement | null;
  if (!image) return null;
  const position = view.posAtDOM(image, 0);
  const node = view.state.doc.nodeAt(position);
  if (!node || node.type.name !== "image") return null;
  const parentLinkMark = node.marks.find((mark) => mark.type.name === "link") || null;
  return {
    position,
    node,
    parentLinkMark,
    markdown: markdownForImageNode(node, parentLinkMark),
  };
}

export function setSourceRevealImagePos(transaction: Transaction, imagePos: number | null) {
  return transaction.setMeta(sourceRevealPluginKey, { imagePos } satisfies SourceRevealState);
}

export function stripMarkdownFormattingForPlainPaste(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/```[^\n`]*\n([\s\S]*?)\n```/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<u>([\s\S]*?)<\/u>/gi, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, "$1$2")
    .replace(/(^|[^\w_])_([^_\n]+)_(?!\w)/g, "$1$2")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/^[ \t]{0,3}[-+*][ \t]+\[[ xX]\][ \t]+/gm, "")
    .replace(/^[ \t]{0,3}[-+*][ \t]+/gm, "")
    .replace(/^[ \t]{0,3}\d+\.[ \t]+/gm, "");
}

export function createSourceRevealPlugin() {
  return new Plugin<SourceRevealState>({
    key: sourceRevealPluginKey,
    state: {
      init: () => ({ imagePos: null }),
      apply(transaction, value) {
        const meta = transaction.getMeta(sourceRevealPluginKey) as SourceRevealState | undefined;
        if (meta) return meta;
        if (transaction.docChanged && value.imagePos !== null) {
          const mapped = transaction.mapping.mapResult(value.imagePos);
          return { imagePos: mapped.deleted ? null : mapped.pos };
        }
        return value;
      },
    },
    props: {
      decorations(state) {
        return buildDecorations(state, sourceRevealPluginKey.getState(state) || { imagePos: null });
      },
      handleKeyDown(view, event) {
        const deletedMarkRange = markRangeForDeletedSourceMarker(view.state, event.key);
        if (deletedMarkRange) {
          view.dispatch(view.state.tr.removeMark(deletedMarkRange.from, deletedMarkRange.to, deletedMarkRange.mark.type));
          return true;
        }
        const deletedNodeRange = nodeSourceRangeForDeletedMarker(view.state, event.key);
        if (deletedNodeRange) {
          const latex = String(deletedNodeRange.node.attrs.latex || "");
          const transaction = view.state.tr;
          if (deletedNodeRange.node.type.name === "math_block") {
            const content = latex ? view.state.schema.text(latex) : undefined;
            transaction.replaceWith(deletedNodeRange.from, deletedNodeRange.to, view.state.schema.nodes.paragraph.create(null, content));
            transaction.setSelection(TextSelection.create(transaction.doc, deletedNodeRange.from + 1 + latex.length));
          } else if (latex) {
            transaction.replaceWith(deletedNodeRange.from, deletedNodeRange.to, view.state.schema.text(latex));
            transaction.setSelection(TextSelection.create(transaction.doc, deletedNodeRange.from + latex.length));
          } else {
            transaction.delete(deletedNodeRange.from, deletedNodeRange.to);
          }
          view.dispatch(transaction.setMeta("skipLiveInlineSyntax", true));
          return true;
        }
        if (event.key !== "Escape") return false;
        const pluginState = sourceRevealPluginKey.getState(view.state);
        if (!pluginState?.imagePos) return false;
        view.dispatch(setSourceRevealImagePos(view.state.tr, null));
        return true;
      },
      handleClick(view, _pos, event) {
        const imageInfo = findClickedImageInfo(view, event);
        const pluginState = sourceRevealPluginKey.getState(view.state);
        if (!imageInfo) {
          if (pluginState?.imagePos !== null) view.dispatch(setSourceRevealImagePos(view.state.tr, null));
          return false;
        }
        const nextPos = pluginState?.imagePos === imageInfo.position ? null : imageInfo.position;
        const transaction = setSourceRevealImagePos(view.state.tr.setSelection(TextSelection.create(view.state.doc, imageInfo.position)), nextPos);
        view.dispatch(transaction);
        return false;
      },
    },
  });
}
