import { Decoration } from "@codemirror/view";
import type { EditorSelection, Range, Text } from "@codemirror/state";
import { HIDE, pushAtomicRange } from "./shared.js";
import { MathBlockEditorWidget } from "../widgets/mathBlockEditor.js";
import { MathWidget } from "../widgets/math.js";
import { LiveBlockLineNumberWidget } from "../widgets/liveBlock.js";
import type { SilkdownLiveBlockLabels } from "../plugin.js";

interface MathRange {
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
  openMarkFrom?: number;
  openMarkTo?: number;
  closeMarkFrom?: number;
  closeMarkTo?: number;
  display: boolean;
}

function selectionTouches(sel: EditorSelection, from: number, to: number): boolean {
  for (const range of sel.ranges) {
    if (range.from <= to && range.to >= from) return true;
  }
  return false;
}

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function findClosingDelimiter(text: string, delimiter: "$" | "$$", from: number): number {
  let index = from;
  while (index < text.length) {
    const next = text.indexOf(delimiter, index);
    if (next < 0) return -1;
    if (!isEscaped(text, next) && (delimiter === "$$" || text[next + 1] !== "$")) return next;
    index = next + delimiter.length;
  }
  return -1;
}

function scanLineMath(text: string, lineFrom: number): MathRange[] {
  const ranges: MathRange[] = [];
  let index = 0;
  while (index < text.length) {
    if (text[index] !== "$") {
      index += 1;
      continue;
    }
    if (isEscaped(text, index)) {
      index += 1;
      continue;
    }
    const display = text[index + 1] === "$";
    const delimiter = display ? "$$" : "$";
    const contentStart = index + delimiter.length;
    const end = findClosingDelimiter(text, delimiter, contentStart);
    if (end < 0) break;
    if (end === contentStart) {
      index = end + delimiter.length;
      continue;
    }
    ranges.push({
      from: lineFrom + index,
      to: lineFrom + end + delimiter.length,
      contentFrom: lineFrom + contentStart,
      contentTo: lineFrom + end,
      display,
    });
    index = end + delimiter.length;
  }
  return ranges;
}

function scanBlockMath(doc: Text, fromLine: number, toLine: number): MathRange[] {
  const ranges: MathRange[] = [];
  let open: { from: number; contentFrom: number } | null = null;
  for (let number = fromLine; number <= toLine; number++) {
    const line = doc.line(number);
    const trimmed = line.text.trim();
    if (trimmed !== "$$") continue;
    const markFrom = line.from + line.text.indexOf("$$");
    if (!open) {
      open = { from: markFrom, contentFrom: markFrom + 2 };
    } else {
      ranges.push({
        from: open.from,
        to: markFrom + 2,
        contentFrom: open.contentFrom,
        contentTo: markFrom,
        openMarkFrom: open.from,
        openMarkTo: open.from + 2,
        closeMarkFrom: markFrom,
        closeMarkTo: markFrom + 2,
        display: true,
      });
      open = null;
    }
  }
  return ranges;
}

export function decorateBlockMath(
  ranges: Range<Decoration>[],
  doc: Text,
  sel: EditorSelection,
  labels: SilkdownLiveBlockLabels,
): void {
  const mathRanges = scanBlockMath(doc, 1, doc.lines);
  for (const range of mathRanges) {
    if (selectionTouches(sel, range.from, range.to)) {
      const latex = doc.sliceString(range.contentFrom, range.contentTo).trim();
      const startLine = doc.lineAt(range.from).number;
      const endLine = doc.lineAt(range.to).number;
      for (let number = startLine; number <= endLine; number++) {
        const line = doc.line(number);
        ranges.push(Decoration.line({ class: "sd-live-block-source-line sd-math-block-source-line" }).range(line.from));
        if (number > startLine && number < endLine) {
          ranges.push(
            Decoration.widget({
              widget: new LiveBlockLineNumberWidget(number - startLine),
              side: -1,
            }).range(line.from),
          );
        }
      }
      if (typeof range.openMarkFrom === "number" && typeof range.openMarkTo === "number") {
        ranges.push(HIDE.range(range.openMarkFrom, range.openMarkTo));
      }
      if (typeof range.closeMarkFrom === "number" && typeof range.closeMarkTo === "number") {
        ranges.push(HIDE.range(range.closeMarkFrom, range.closeMarkTo));
      }
      ranges.push(
        Decoration.widget({
          widget: new MathBlockEditorWidget(latex, range.from, range.to, endLine - startLine + 1, labels),
          block: true,
          side: 1,
        }).range(range.to),
      );
      continue;
    }
    const latex = doc.sliceString(range.contentFrom, range.contentTo).trim();
    ranges.push(Decoration.replace({ widget: new MathWidget(latex, true, range.from, range.to, labels) }).range(range.from, range.to));
  }
}

export function decorateMath(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  doc: Text,
  sel: EditorSelection,
  from: number,
  to: number,
  labels: SilkdownLiveBlockLabels,
): void {
  const fromLine = doc.lineAt(Math.max(0, from)).number;
  const toLine = doc.lineAt(Math.min(doc.length, to)).number;
  const blockMathRanges: MathRange[] = scanBlockMath(doc, 1, doc.lines);
  const mathRanges: MathRange[] = [];

  for (let number = fromLine; number <= toLine; number++) {
    const line = doc.line(number);
    if (blockMathRanges.some((range) => line.from >= range.from && line.to <= range.to)) continue;
    mathRanges.push(...scanLineMath(line.text, line.from));
  }

  for (const range of mathRanges.sort((left, right) => left.from - right.from || left.to - right.to)) {
    if (selectionTouches(sel, range.from, range.to)) continue;
    const latex = doc.sliceString(range.contentFrom, range.contentTo).trim();
    if (!latex) continue;
    pushAtomicRange(
      ranges,
      atomicRanges,
      Decoration.replace({ widget: new MathWidget(latex, range.display, undefined, undefined, labels) }),
      range.from,
      range.to,
    );
  }
}
