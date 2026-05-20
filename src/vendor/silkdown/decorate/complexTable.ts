import { Decoration } from "@codemirror/view";
import type { Range, Text } from "@codemirror/state";
import { findComplexTableRanges } from "@/services/ComplexTableService";
import { ComplexTableWidget } from "../widgets/complexTable.js";

export function decorateComplexTables(
  ranges: Range<Decoration>[],
  doc: Text,
): void {
  const source = doc.toString();
  for (const table of findComplexTableRanges(source)) {
    const tableSource = source.slice(table.start, table.end);
    ranges.push(
      Decoration.replace({
        widget: new ComplexTableWidget(tableSource, table.start, table.end),
      }).range(table.start, table.end),
    );
  }
}
