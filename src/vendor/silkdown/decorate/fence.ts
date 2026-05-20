import { Decoration, WidgetType } from "@codemirror/view";
import type { EditorSelection, Range, Text } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { isMermaidFenceInfo } from "@/services/MermaidRenderService";
import { selectionTouchesLineRange } from "../util/selection.js";
import { firstChildNamed, lastChildNamed } from "../util/tree.js";
import { HIDE, pushAtomicRange } from "./shared.js";
import { MermaidBlockWidget } from "../widgets/mermaid.js";
import { LiveBlockLineNumberWidget } from "../widgets/liveBlock.js";
import type { SilkdownLiveBlockLabels } from "../plugin.js";

const BLOCK_LINE = Decoration.line({ class: "sd-code-block" });
const BLOCK_LINE_FIRST = Decoration.line({ class: "sd-code-block sd-code-block-first" });
const BLOCK_LINE_LAST = Decoration.line({ class: "sd-code-block sd-code-block-last" });
const BLOCK_LINE_ONLY = Decoration.line({
  class: "sd-code-block sd-code-block-first sd-code-block-last",
});

class CodeLineNumberWidget extends WidgetType {
  constructor(private readonly lineNumber: number) {
    super();
  }

  override eq(other: CodeLineNumberWidget): boolean {
    return other.lineNumber === this.lineNumber;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "sd-code-line-number";
    span.textContent = String(this.lineNumber);
    return span;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

function selectionTouches(sel: EditorSelection, from: number, to: number): boolean {
  for (const range of sel.ranges) {
    if (range.from <= to && range.to >= from) return true;
  }
  return false;
}

function fencedCodeInfo(node: SyntaxNode, doc: Text, openMark: SyntaxNode | null) {
  const openLine = doc.lineAt(openMark?.from ?? node.from);
  const infoFrom = openMark ? openMark.to : openLine.from;
  return doc.sliceString(infoFrom, openLine.to).trim();
}

function fencedCodeContent(node: SyntaxNode, doc: Text, openMark: SyntaxNode | null, closeMark: SyntaxNode | null) {
  const startLine = doc.lineAt(node.from);
  const endLine = doc.lineAt(node.to);
  const openLine = doc.lineAt(openMark?.from ?? node.from);
  const closeLine = closeMark && closeMark !== openMark ? doc.lineAt(closeMark.from) : null;
  const contentFrom = openLine.number < endLine.number ? doc.line(openLine.number + 1).from : openLine.to;
  const contentTo = closeLine ? closeLine.from : endLine.to;
  return doc.sliceString(Math.min(contentFrom, contentTo), contentTo);
}

function decorateMermaidFencedCode(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  node: SyntaxNode,
  doc: Text,
  sel: EditorSelection,
  labels: SilkdownLiveBlockLabels,
  openMark: SyntaxNode | null,
  closeMark: SyntaxNode | null,
): void {
  const startLine = doc.lineAt(node.from);
  const endLine = doc.lineAt(node.to);
  const source = fencedCodeContent(node, doc, openMark, closeMark);
  const sourceLineCount = endLine.number - startLine.number + 1;
  const editing = selectionTouches(sel, node.from, node.to);

  if (editing) {
    for (let number = startLine.number; number <= endLine.number; number++) {
      const line = doc.line(number);
      ranges.push(Decoration.line({ class: "sd-live-block-source-line sd-mermaid-block-source-line" }).range(line.from));
      if (number > startLine.number && number < endLine.number) {
        ranges.push(
          Decoration.widget({
            widget: new LiveBlockLineNumberWidget(number - startLine.number),
            side: -1,
          }).range(line.from),
        );
      }
    }
    ranges.push(
      Decoration.widget({
        widget: new MermaidBlockWidget(source, node.from, node.to, sourceLineCount, true, labels.mermaidDiagram),
        block: true,
        side: 1,
      }).range(node.to),
    );
    return;
  }

  pushAtomicRange(
    ranges,
    atomicRanges,
    Decoration.replace({
      widget: new MermaidBlockWidget(source, node.from, node.to, sourceLineCount, false, labels.mermaidDiagram),
    }),
    node.from,
    node.to,
  );
}

export function decorateFencedCode(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  node: SyntaxNode,
  doc: Text,
  sel: EditorSelection,
  showLineNumbers = true,
  labels?: SilkdownLiveBlockLabels,
): void {
  const startLine = doc.lineAt(node.from);
  const endLine = doc.lineAt(node.to);
  const lineCount = endLine.number - startLine.number + 1;
  const openMark = firstChildNamed(node, "CodeMark");
  const closeMark = lastChildNamed(node, "CodeMark");
  if (labels && isMermaidFenceInfo(fencedCodeInfo(node, doc, openMark))) {
    decorateMermaidFencedCode(ranges, atomicRanges, node, doc, sel, labels, openMark, closeMark);
    return;
  }
  const contentStartLineNumber = openMark ? doc.lineAt(openMark.from).number + 1 : startLine.number + 1;
  const contentEndLineNumber = closeMark && closeMark !== openMark ? doc.lineAt(closeMark.from).number - 1 : endLine.number;
  const revealed = selectionTouchesLineRange(doc, sel, node.from, node.to);

  for (let n = startLine.number; n <= endLine.number; n++) {
    const line = doc.line(n);
    const deco =
      lineCount === 1
        ? BLOCK_LINE_ONLY
        : n === startLine.number
          ? BLOCK_LINE_FIRST
          : n === endLine.number
            ? BLOCK_LINE_LAST
            : BLOCK_LINE;
    ranges.push(deco.range(line.from));
    if (showLineNumbers && n >= contentStartLineNumber && n <= contentEndLineNumber) {
      ranges.push(Decoration.widget({
        widget: new CodeLineNumberWidget(n - contentStartLineNumber + 1),
        side: -1,
      }).range(line.from));
    }
  }

  if (revealed) return;

  if (openMark) {
    const openLine = doc.lineAt(openMark.from);
    pushAtomicRange(ranges, atomicRanges, HIDE, openLine.from, openLine.to);
  }

  if (closeMark && closeMark !== openMark) {
    const closeLine = doc.lineAt(closeMark.from);
    pushAtomicRange(ranges, atomicRanges, HIDE, closeLine.from, closeLine.to);
  }
}
