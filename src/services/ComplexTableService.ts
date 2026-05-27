export type ComplexTableCell = {
  tag: "th" | "td";
  text: string;
  rowspan: number;
  colspan: number;
  align: "left" | "center" | "right" | null;
};

export type ComplexTable = {
  start: number;
  end: number;
  width: string;
  columnWidths: string[];
  rows: ComplexTableCell[][];
};

export type ComplexTablePoint = { row: number; col: number };

export type ComplexTableSelectionRange = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

export type ComplexTableCellBounds = {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
};

export type ComplexTableCellOrigin = ComplexTablePoint & {
  sourceRow: number;
  sourceCol: number;
};

export type ComplexTableGrid = {
  gridMap: Array<Array<string | null>>;
  cellBounds: Record<string, ComplexTableCellBounds>;
  cellOrigins: Record<string, ComplexTableCellOrigin>;
  rowCount: number;
  colCount: number;
};

const TABLE_PATTERN = /<table\b[^>]*>[\s\S]*?<\/table>/gi;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function unescapeHtml(value: string) {
  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = value;
    return textarea.value;
  }
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&");
}

function attrValue(source: string, name: string) {
  return source.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, "i"))?.slice(1).find(Boolean) || "";
}

function spanValue(source: string, name: "rowspan" | "colspan") {
  const value = Number(attrValue(source, name) || "1");
  return Number.isFinite(value) && value > 1 ? Math.min(Math.floor(value), 99) : 1;
}

function alignValue(source: string): ComplexTableCell["align"] {
  const align = attrValue(source, "align").toLowerCase();
  if (align === "left" || align === "center" || align === "right") return align;
  const textAlign = source.match(/\btext-align\s*:\s*(left|center|right)\b/i)?.[1]?.toLowerCase();
  if (textAlign === "left" || textAlign === "center" || textAlign === "right") return textAlign;
  return null;
}

function tableWidth(source: string) {
  const styleWidth = source.match(/\bwidth\s*:\s*([^;"]+)/i)?.[1]?.trim();
  const attrWidth = attrValue(source, "width").trim();
  return styleWidth || attrWidth || "100%";
}

function columnWidths(source: string) {
  const colgroup = source.match(/<colgroup\b[^>]*>([\s\S]*?)<\/colgroup>/i)?.[1] || "";
  if (!colgroup) return [];
  const widths: string[] = [];
  for (const colMatch of colgroup.matchAll(/<col\b([^>]*)\/?>/gi)) {
    const attrs = colMatch[1] || "";
    const styleWidth = attrs.match(/\bwidth\s*:\s*([^;"]+)/i)?.[1]?.trim();
    const attrWidth = attrValue(attrs, "width").trim();
    widths.push(styleWidth || attrWidth || "");
  }
  return widths;
}

function cellText(source: string) {
  const breakToken = "__PRP_BR__";
  return unescapeHtml(source.replace(/<br\s*\/?>/gi, breakToken).replace(/<[^>]+>/g, "").replaceAll(breakToken, "<br>"))
    .replace(/\r?\n/g, " ")
    .replace(/\s*<br>\s*/gi, "<br>")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseComplexTableSource(source: string, start = 0): ComplexTable | null {
  const tableMatch = source.match(/^<table\b([^>]*)>[\s\S]*<\/table>\s*$/i);
  if (!tableMatch) return null;
  const rows: ComplexTableCell[][] = [];
  for (const rowMatch of source.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row: ComplexTableCell[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      const attrs = cellMatch[2] || "";
      row.push({
        tag: cellMatch[1].toLowerCase() === "th" ? "th" : "td",
        text: cellText(cellMatch[3] || ""),
        rowspan: spanValue(attrs, "rowspan"),
        colspan: spanValue(attrs, "colspan"),
        align: alignValue(attrs),
      });
    }
    if (row.length) rows.push(row);
  }
  if (!rows.length) return null;
  return { start, end: start + source.length, width: tableWidth(tableMatch[1] || ""), columnWidths: columnWidths(source), rows };
}

export function findComplexTableRanges(source: string): ComplexTable[] {
  const ranges: ComplexTable[] = [];
  TABLE_PATTERN.lastIndex = 0;
  for (const match of source.matchAll(TABLE_PATTERN)) {
    const start = match.index || 0;
    const table = parseComplexTableSource(match[0], start);
    if (table) ranges.push(table);
  }
  return ranges;
}

export function complexTableCellId(sourceRow: number, sourceCol: number) {
  return `${sourceRow}:${sourceCol}`;
}

export function buildComplexTableGrid(table: Pick<ComplexTable, "rows" | "columnWidths">): ComplexTableGrid {
  const gridMap: Array<Array<string | null>> = [];
  const cellBounds: Record<string, ComplexTableCellBounds> = {};
  const cellOrigins: Record<string, ComplexTableCellOrigin> = {};

  const ensureRow = (rowIndex: number) => {
    if (!gridMap[rowIndex]) gridMap[rowIndex] = [];
    return gridMap[rowIndex];
  };

  for (const [sourceRow, row] of table.rows.entries()) {
    const gridRow = ensureRow(sourceRow);
    let col = 0;
    for (const [sourceCol, cell] of row.entries()) {
      while (gridRow[col]) col += 1;
      const rowspan = Math.max(1, Math.floor(cell.rowspan || 1));
      const colspan = Math.max(1, Math.floor(cell.colspan || 1));
      const id = complexTableCellId(sourceRow, sourceCol);
      cellOrigins[id] = { row: sourceRow, col, sourceRow, sourceCol };
      cellBounds[id] = {
        minRow: sourceRow,
        maxRow: sourceRow + rowspan - 1,
        minCol: col,
        maxCol: col + colspan - 1,
      };
      for (let rowOffset = 0; rowOffset < rowspan; rowOffset += 1) {
        const targetRow = ensureRow(sourceRow + rowOffset);
        for (let colOffset = 0; colOffset < colspan; colOffset += 1) {
          targetRow[col + colOffset] = id;
        }
      }
      col += colspan;
    }
  }

  const colCount = Math.max(1, table.columnWidths.length, ...gridMap.map((row) => row.length));
  const rowCount = Math.max(1, gridMap.length, table.rows.length);
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row = ensureRow(rowIndex);
    for (let colIndex = 0; colIndex < colCount; colIndex += 1) {
      if (typeof row[colIndex] === "undefined") row[colIndex] = null;
    }
  }

  return { gridMap, cellBounds, cellOrigins, rowCount, colCount };
}

function clampGridPoint(point: ComplexTablePoint, grid: ComplexTableGrid): ComplexTablePoint {
  return {
    row: Math.max(0, Math.min(grid.rowCount - 1, Math.floor(point.row || 0))),
    col: Math.max(0, Math.min(grid.colCount - 1, Math.floor(point.col || 0))),
  };
}

function cellsInGridRect(range: ComplexTableSelectionRange, gridMap: Array<Array<string | null>>) {
  const ids = new Set<string>();
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const id = gridMap[row]?.[col];
      if (id) ids.add(id);
    }
  }
  return ids;
}

export function calculateComplexTableSelectionRange(
  table: Pick<ComplexTable, "rows" | "columnWidths">,
  anchor: ComplexTablePoint,
  focus: ComplexTablePoint,
): ComplexTableSelectionRange {
  const grid = buildComplexTableGrid(table);
  const start = clampGridPoint(anchor, grid);
  const end = clampGridPoint(focus, grid);
  let current = {
    startRow: Math.min(start.row, end.row),
    endRow: Math.max(start.row, end.row),
    startCol: Math.min(start.col, end.col),
    endCol: Math.max(start.col, end.col),
  };

  let expanding = true;
  while (expanding) {
    expanding = false;
    const next = { ...current };
    for (const cellId of cellsInGridRect(current, grid.gridMap)) {
      const bounds = grid.cellBounds[cellId];
      if (!bounds) continue;
      if (bounds.minRow < next.startRow) {
        next.startRow = bounds.minRow;
        expanding = true;
      }
      if (bounds.maxRow > next.endRow) {
        next.endRow = bounds.maxRow;
        expanding = true;
      }
      if (bounds.minCol < next.startCol) {
        next.startCol = bounds.minCol;
        expanding = true;
      }
      if (bounds.maxCol > next.endCol) {
        next.endCol = bounds.maxCol;
        expanding = true;
      }
    }
    current = next;
  }

  return current;
}

function cellAttrs(cell: ComplexTableCell) {
  const attrs = [];
  if (cell.rowspan > 1) attrs.push(`rowspan="${cell.rowspan}"`);
  if (cell.colspan > 1) attrs.push(`colspan="${cell.colspan}"`);
  if (cell.align) attrs.push(`style="text-align: ${cell.align}"`);
  return attrs.length ? ` ${attrs.join(" ")}` : "";
}

function escapeTableCellHtml(value: string) {
  return escapeHtml(value).replace(/&lt;br\s*\/?&gt;/gi, "<br>");
}

export function serializeComplexTable(table: Pick<ComplexTable, "width" | "rows"> & Partial<Pick<ComplexTable, "columnWidths">>) {
  const width = table.width.trim() || "100%";
  const lines = [`<table class="markdown-complex-table" style="width: ${escapeHtml(width)};">`];
  const widths = table.columnWidths || [];
  if (widths.some((entry) => entry.trim())) {
    lines.push(
      "  <colgroup>",
      ...widths.map((entry) => entry.trim()
        ? `    <col style="width: ${escapeHtml(entry.trim())};">`
        : "    <col>"),
      "  </colgroup>",
    );
  }
  const firstBodyRow = table.rows.findIndex((row) => row.some((cell) => cell.tag === "td"));
  const headRows = firstBodyRow <= 0 ? table.rows.slice(0, 1) : table.rows.slice(0, firstBodyRow);
  const bodyRows = table.rows.slice(headRows.length);
  const renderRows = (rows: ComplexTableCell[][]) => rows.map((row) =>
    `    <tr>\n${row.map((cell) => `      <${cell.tag}${cellAttrs(cell)}>${escapeTableCellHtml(cell.text)}</${cell.tag}>`).join("\n")}\n    </tr>`);
  if (headRows.length) lines.push("  <thead>", ...renderRows(headRows), "  </thead>");
  if (bodyRows.length) lines.push("  <tbody>", ...renderRows(bodyRows), "  </tbody>");
  lines.push("</table>");
  return lines.join("\n");
}

export function complexTableToMarkdown(table: Pick<ComplexTable, "rows">) {
  const pendingRowspans: Array<{ remaining: number; text: string; align: ComplexTableCell["align"] } | null> = [];
  const alignmentGrid: Array<ComplexTableCell["align"][]> = [];
  const rows = table.rows.map((sourceRow, rowIndex) => {
    const row: string[] = [];
    const rowAlignments: ComplexTableCell["align"][] = [];
    let colIndex = 0;
    const consumePending = () => {
      while (pendingRowspans[colIndex]?.remaining) {
        const pending = pendingRowspans[colIndex]!;
        row[colIndex] = pending.text || " ";
        rowAlignments[colIndex] = pending.align;
        pending.remaining -= 1;
        if (pending.remaining <= 0) pendingRowspans[colIndex] = null;
        colIndex += 1;
      }
    };
    consumePending();
    for (const cell of sourceRow) {
      consumePending();
      for (let offset = 0; offset < cell.colspan; offset += 1) {
        row[colIndex + offset] = offset === 0 ? cell.text || " " : " ";
        rowAlignments[colIndex + offset] = cell.align;
        if (cell.rowspan > 1) {
          pendingRowspans[colIndex + offset] = {
            remaining: cell.rowspan - 1,
            text: offset === 0 ? cell.text || " " : " ",
            align: cell.align,
          };
        }
      }
      colIndex += cell.colspan;
    }
    consumePending();
    alignmentGrid[rowIndex] = rowAlignments;
    return row;
  });
  const width = Math.max(1, ...rows.map((row) => row.length));
  const normalized = rows.map((row, rowIndex) => Array.from({ length: width }, (_value, index) => {
    const value = row[index]?.replace(/\|/g, "\\|").trim();
    return value || " ";
  }));
  if (normalized.length === 1) normalized.push(Array.from({ length: width }, () => " "));
  const alignments = Array.from({ length: width }, (_value, index) =>
    alignmentGrid.find((row) => row[index])?.[index] || null);
  const separator = alignments.map((align) => align === "left" ? ":---" : align === "center" ? ":---:" : align === "right" ? "---:" : "---");
  return [`| ${normalized[0].join(" | ")} |`, `| ${separator.join(" | ")} |`, ...normalized.slice(1).map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

export function replaceComplexTableSource(source: string, table: ComplexTable, next: Pick<ComplexTable, "width" | "rows"> & Partial<Pick<ComplexTable, "columnWidths">>) {
  const serialized = serializeComplexTable(next);
  return {
    value: `${source.slice(0, table.start)}${serialized}${source.slice(table.end)}`,
    selection: { start: table.start, end: table.start + serialized.length },
  };
}
