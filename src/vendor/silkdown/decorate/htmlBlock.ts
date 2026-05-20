import { Decoration } from "@codemirror/view";
import type { EditorSelection, Range, Text } from "@codemirror/state";
import { findComplexTableRanges } from "@/services/ComplexTableService";
import { findMarkdownHtmlBlockRanges } from "@/services/MarkdownHtmlBlockService";
import { HtmlBlockWidget } from "../widgets/htmlBlock.js";
import { LiveBlockLineNumberWidget } from "../widgets/liveBlock.js";

function selectionTouches(sel: EditorSelection, from: number, to: number): boolean {
  for (const range of sel.ranges) {
    if (range.from <= to && range.to >= from) return true;
  }
  return false;
}

export function decorateHtmlBlocks(
  ranges: Range<Decoration>[],
  doc: Text,
  sel: EditorSelection,
  liveRenderEnabled = true,
): void {
  if (!liveRenderEnabled) return;
  const source = doc.toString();
  const complexTables = findComplexTableRanges(source);
  for (const block of findMarkdownHtmlBlockRanges(source)) {
    if (complexTables.some((table) => block.start < table.end && block.end > table.start)) continue;
    const editing = selectionTouches(sel, block.start, block.end);
    const startLine = doc.lineAt(block.start).number;
    const endLine = doc.lineAt(block.end).number;
    if (editing) {
      for (let number = startLine; number <= endLine; number++) {
        const line = doc.line(number);
        ranges.push(Decoration.line({ class: "sd-live-block-source-line sd-html-block-source-line" }).range(line.from));
        if (number > startLine && number < endLine) {
          ranges.push(
            Decoration.widget({
              widget: new LiveBlockLineNumberWidget(number - startLine),
              side: -1,
            }).range(line.from),
          );
        }
      }
      ranges.push(
        Decoration.widget({
          widget: new HtmlBlockWidget(block.kind, block.source, block.start, block.end, endLine - startLine + 1, true),
          block: true,
          side: 1,
        }).range(block.end),
      );
      continue;
    }
    ranges.push(
      Decoration.replace({
        widget: new HtmlBlockWidget(block.kind, block.source, block.start, block.end, endLine - startLine + 1, false),
      }).range(block.start, block.end),
    );
  }
}
