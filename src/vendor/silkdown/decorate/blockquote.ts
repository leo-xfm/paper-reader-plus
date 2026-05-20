import { Decoration, WidgetType } from "@codemirror/view";
import type { EditorSelection, Range, Text } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { getMarkdownCalloutMeta, type MarkdownCalloutKind } from "@/services/MarkdownCalloutService";
import { selectionTouchesLineRange } from "../util/selection.js";
import { children } from "../util/tree.js";
import { HIDE, pushAtomicRange, pushRevealableMark } from "./shared.js";

const LINE_CLASS = Decoration.line({ class: "sd-blockquote" });
const LINE_CLASSES = Array.from({ length: 6 }, (_value, index) =>
  Decoration.line({ class: `sd-blockquote sd-blockquote-depth-${index + 1}` }));
const CALLOUT_CLASS_MAP: Record<string, string> = {
  NOTE: "sd-callout sd-callout-note",
  TIP: "sd-callout sd-callout-tip",
  IMPORTANT: "sd-callout sd-callout-important",
  WARNING: "sd-callout sd-callout-warning",
  CAUTION: "sd-callout sd-callout-caution",
};
const CALLOUT_MARKER_PATTERN = /^\s{0,3}>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i;
const CALLOUT_BLANK_LINE_PATTERN = /^\s{0,3}>\s*$/;

class CalloutTitleWidget extends WidgetType {
  constructor(private readonly kind: MarkdownCalloutKind) {
    super();
  }

  override eq(other: CalloutTitleWidget): boolean {
    return other.kind === this.kind;
  }

  override toDOM(): HTMLElement {
    const meta = getMarkdownCalloutMeta(this.kind);
    const title = document.createElement("span");
    title.className = "sd-callout-title-render";

    const icon = document.createElement("span");
    icon.className = `sd-callout-icon sd-callout-icon-${meta.icon}`;
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "sd-callout-label";
    label.textContent = meta.label;

    title.append(icon, label);
    return title;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

function quoteDepth(lineText: string) {
  let depth = 0;
  let index = 0;
  while (index < lineText.length) {
    while (lineText[index] === " " || lineText[index] === "\t") index += 1;
    if (lineText[index] !== ">") break;
    depth += 1;
    index += 1;
    if (lineText[index] === " ") index += 1;
  }
  return Math.max(1, Math.min(depth, LINE_CLASSES.length));
}

function calloutKind(lineText: string) {
  const match = lineText.match(CALLOUT_MARKER_PATTERN);
  return (match?.[1] || "").toUpperCase();
}

function calloutMarkerRange(lineText: string) {
  const match = lineText.match(CALLOUT_MARKER_PATTERN);
  return match ? { from: match.index || 0, to: (match.index || 0) + match[0].length } : null;
}

function isCalloutBlankLine(lineText: string) {
  return CALLOUT_BLANK_LINE_PATTERN.test(lineText);
}

export function decorateBlockquote(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  node: SyntaxNode,
  doc: Text,
  sel: EditorSelection,
): void {
  let pos = node.from;
  const firstLine = doc.lineAt(node.from);
  const kind = calloutKind(firstLine.text);
  const calloutClass = kind ? CALLOUT_CLASS_MAP[kind] : "";
  const startLineNumber = firstLine.number;
  const endLineNumber = doc.lineAt(node.to).number;
  const revealed = selectionTouchesLineRange(doc, sel, node.from, node.to);
  let lastVisibleLineNumber = endLineNumber;
  if (kind && !revealed) {
    let scan = node.to;
    while (scan >= node.from) {
      const line = doc.lineAt(scan);
      if (!isCalloutBlankLine(line.text)) {
        lastVisibleLineNumber = line.number;
        break;
      }
      if (line.from <= node.from) break;
      scan = line.from - 1;
    }
  }
  while (pos <= node.to) {
    const line = doc.lineAt(pos);
    const lineClasses = [];
    if (kind) {
      lineClasses.push(calloutClass);
      if (line.number === startLineNumber) lineClasses.push("sd-callout-first sd-callout-title");
      if (line.number === lastVisibleLineNumber) lineClasses.push("sd-callout-last");
      if (!revealed && isCalloutBlankLine(line.text)) lineClasses.push("sd-callout-blank-line");
    }
    const deco = kind
      ? Decoration.line({ class: lineClasses.join(" ") })
      : (LINE_CLASSES[quoteDepth(line.text) - 1] || LINE_CLASS);
    ranges.push(deco.range(line.from));
    if (line.to >= node.to) break;
    pos = line.to + 1;
  }

  for (const child of children(node)) {
    if (child.name !== "QuoteMark") continue;
    if (kind && doc.lineAt(child.from).number === firstLine.number) continue;
    // Cover the "> " prefix (mark plus the trailing space) when present.
    const next = doc.sliceString(child.to, child.to + 1);
    const markTo = next === " " ? child.to + 1 : child.to;
    pushRevealableMark(ranges, atomicRanges, revealed, child.from, markTo);
  }
  if (kind) {
    const marker = calloutMarkerRange(firstLine.text);
    if (marker) {
      const from = firstLine.from + marker.from;
      let to = firstLine.from + marker.to;
      if (doc.sliceString(to, to + 1) === " ") to += 1;
      if (revealed) {
        ranges.push(Decoration.mark({ class: "sd-mark" }).range(from, to));
      } else {
        pushAtomicRange(ranges, atomicRanges, HIDE, from, to);
        ranges.push(Decoration.widget({
          widget: new CalloutTitleWidget(kind.toLowerCase() as MarkdownCalloutKind),
          side: 1,
        }).range(to));
      }
    }
    return;
  }
}
