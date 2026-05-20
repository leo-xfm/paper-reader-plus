import { Decoration } from "@codemirror/view";
import type { Range, Text } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { TableWidget, type TableAlignment } from "../widgets/table.js";

interface ParsedTable {
  rows: string[][];
  alignments: TableAlignment[];
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const content = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return content.split("|").map((cell) => cell.trim());
}

function alignmentFromCell(cell: string): TableAlignment {
  const trimmed = cell.trim();
  if (/^:-+:$/.test(trimmed)) return "center";
  if (/^:-+$/.test(trimmed)) return "left";
  if (/^-+:$/.test(trimmed)) return "right";
  return null;
}

function parseTable(source: string): ParsedTable | null {
  const lines = source.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return null;
  const separator = splitTableRow(lines[1]);
  if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))) return null;
  return {
    rows: [splitTableRow(lines[0]), ...lines.slice(2).map(splitTableRow)],
    alignments: separator.map(alignmentFromCell),
  };
}

function decorateParsedTable(
  ranges: Range<Decoration>[],
  _atomicRanges: Range<Decoration>[],
  doc: Text,
  from: number,
  to: number,
  parsed: ParsedTable,
): void {
  ranges.push(Decoration.replace({
    widget: new TableWidget(parsed.rows, parsed.alignments, from, to),
    block: true,
  }).range(from, to));
}

export function decorateTable(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  node: SyntaxNode,
  doc: Text,
): void {
  const parsed = parseTable(doc.sliceString(node.from, node.to));
  if (!parsed) return;
  decorateParsedTable(ranges, atomicRanges, doc, node.from, node.to, parsed);
}

export function decorateTablesInRange(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  doc: Text,
  from: number,
  to: number,
  handledStarts: Set<number>,
): void {
  const startLine = doc.lineAt(Math.max(0, from)).number;
  const endLine = doc.lineAt(Math.min(doc.length, to)).number;
  for (let lineNumber = Math.max(1, startLine - 1); lineNumber < endLine; lineNumber += 1) {
    const header = doc.line(lineNumber);
    const separator = doc.line(lineNumber + 1);
    if (handledStarts.has(header.from) || !header.text.includes("|") || !separator.text.includes("|")) continue;
    const separatorCells = splitTableRow(separator.text);
    if (!separatorCells.length || !separatorCells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))) continue;
    let lastLine = lineNumber + 1;
    while (lastLine + 1 <= doc.lines && doc.line(lastLine + 1).text.includes("|")) lastLine += 1;
    const tableFrom = header.from;
    const tableTo = doc.line(lastLine).to;
    const tableSource = doc.sliceString(tableFrom, tableTo);
    const parsed = parseTable(tableSource);
    if (parsed) {
      decorateParsedTable(ranges, atomicRanges, doc, tableFrom, tableTo, parsed);
      handledStarts.add(tableFrom);
    }
    lineNumber = lastLine;
  }
}
