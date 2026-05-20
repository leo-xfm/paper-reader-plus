import { WidgetType, type EditorView } from "@codemirror/view";
import { buildComplexTableGrid, complexTableCellId, parseComplexTableSource, serializeComplexTable, type ComplexTable } from "@/services/ComplexTableService";

export class ComplexTableWidget extends WidgetType {
  constructor(
    private readonly tableSource: string,
    private readonly from: number,
    private readonly to: number,
  ) {
    super();
  }

  override eq(other: ComplexTableWidget): boolean {
    return other.tableSource === this.tableSource && other.from === this.from && other.to === this.to;
  }

  override toDOM(view: EditorView): HTMLElement {
    const parsed = parseComplexTableSource(this.tableSource, this.from);
    const wrapper = document.createElement("div");
    wrapper.className = "sd-table-widget sd-complex-table-widget";
    wrapper.dataset.tableKind = "complex";
    wrapper.dataset.tableFrom = String(this.from);
    wrapper.dataset.tableTo = String(this.to);
    if (!parsed) {
      wrapper.textContent = this.tableSource;
      return wrapper;
    }
    wrapper.dataset.tableWidth = parsed.width;
    const table = document.createElement("table");
    table.style.width = parsed.width;
    table.style.tableLayout = "fixed";
    const colgroup = document.createElement("colgroup");
    const grid = buildComplexTableGrid(parsed);
    const columnCount = grid.colCount;
    for (let index = 0; index < columnCount; index += 1) {
      const col = document.createElement("col");
      const width = parsed.columnWidths[index];
      if (width) col.style.width = width;
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);
    wrapper.appendChild(table);

    for (const [rowIndex, row] of parsed.rows.entries()) {
      const tr = document.createElement("tr");
      for (const [colIndex, sourceCell] of row.entries()) {
        const origin = grid.cellOrigins[complexTableCellId(rowIndex, colIndex)] || { row: rowIndex, col: colIndex, sourceRow: rowIndex, sourceCol: colIndex };
        const cell = document.createElement(sourceCell.tag);
        cell.dataset.source = sourceCell.text;
        cell.dataset.row = String(origin.row);
        cell.dataset.col = String(origin.col);
        cell.dataset.sourceRow = String(rowIndex);
        cell.dataset.sourceCol = String(colIndex);
        cell.dataset.rowspan = String(sourceCell.rowspan);
        cell.dataset.colspan = String(sourceCell.colspan);
        if (sourceCell.rowspan > 1) cell.rowSpan = sourceCell.rowspan;
        if (sourceCell.colspan > 1) cell.colSpan = sourceCell.colspan;
        if (sourceCell.align) cell.style.textAlign = sourceCell.align;
        cell.contentEditable = "true";
        cell.spellcheck = false;
        cell.textContent = sourceCell.text;
        addCellEvents(cell, table, origin.row, origin.col);
        addColumnResizeHandle(cell, table, wrapper, view, parsed, origin.col);
        tr.appendChild(cell);
      }
      table.appendChild(tr);
    }

    const commit = () => {
      const nextRows = Array.from(table.rows).map((row) =>
        Array.from(row.cells).map((cell) => {
          const htmlCell = cell as HTMLTableCellElement;
          const tag: "th" | "td" = htmlCell.tagName.toLowerCase() === "th" ? "th" : "td";
          const align = htmlCell.style.textAlign;
          return {
            tag,
            text: (htmlCell.textContent || "").replace(/\r?\n/g, " ").trim(),
            rowspan: htmlCell.rowSpan || 1,
            colspan: htmlCell.colSpan || 1,
            align: align === "left" || align === "center" || align === "right" ? align as "left" | "center" | "right" : null,
          };
        }));
      const next: Pick<ComplexTable, "width" | "rows" | "columnWidths"> = {
        width: wrapper.dataset.tableWidth || parsed.width,
        columnWidths: readColumnWidths(table, parsed.columnWidths),
        rows: nextRows,
      };
      const source = serializeComplexTable(next);
      if (source === this.tableSource) return;
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: source },
        selection: { anchor: Math.min(this.from + source.length, view.state.doc.length - (this.to - this.from) + source.length) },
      });
    };

    table.addEventListener("focusout", (event) => {
      if (event.relatedTarget instanceof Node && table.contains(event.relatedTarget)) return;
      commit();
    });
    table.addEventListener("keydown", (event) => {
      if (event.key === "Tab") {
        event.preventDefault();
        commit();
        focusAdjacentCell(table, event.target as HTMLElement | null, event.shiftKey, view, this.from, this.to, parsed);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
        (event.target as HTMLElement | null)?.blur();
      }
    });

    return wrapper;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

function addCellEvents(cell: HTMLTableCellElement, table: HTMLTableElement, row: number, col: number): void {
  cell.addEventListener("pointerdown", (event) => {
    if ((event.target as HTMLElement | null)?.closest(".sd-table-col-resizer")) return;
    cell.dispatchEvent(new CustomEvent("silkdown-table-cell-pointerdown", {
      bubbles: true,
      detail: { row, col, extend: false },
    }));
  });
  cell.addEventListener("pointerover", (event) => {
    if ((event.buttons & 1) !== 1) return;
    cell.dispatchEvent(new CustomEvent("silkdown-table-cell-pointerenter", {
      bubbles: true,
      detail: { row, col },
    }));
  });
  cell.addEventListener("focus", () => {
    cell.dispatchEvent(new CustomEvent("silkdown-table-cell-focus", {
      bubbles: true,
      detail: { row, col, kind: "complex" },
    }));
  });
  table.addEventListener("pointerup", () => {
    table.dispatchEvent(new CustomEvent("silkdown-table-selection-end", { bubbles: true }));
  }, { once: true });
}

function addColumnResizeHandle(
  cell: HTMLTableCellElement,
  table: HTMLTableElement,
  wrapper: HTMLElement,
  view: EditorView,
  parsed: ComplexTable,
  colIndex: number,
): void {
  const handle = document.createElement("span");
  handle.className = "sd-table-col-resizer";
  handle.contentEditable = "false";
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const tableRect = table.getBoundingClientRect();
    const startX = event.clientX;
    const startWidth = cell.getBoundingClientRect().width;
    const guide = document.createElement("div");
    guide.className = "sd-table-resize-guide";
    guide.style.left = `${event.clientX}px`;
    document.body.appendChild(guide);
    const onMove = (moveEvent: PointerEvent) => {
      guide.style.left = `${moveEvent.clientX}px`;
    };
    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      guide.remove();
      const nextWidth = Math.max(36, startWidth + upEvent.clientX - startX);
      const percent = `${((nextWidth / Math.max(1, tableRect.width)) * 100).toFixed(2)}%`;
      const widths = readColumnWidths(table, parsed.columnWidths);
      widths[colIndex] = percent;
      const next = serializeComplexTable({ ...parsed, width: wrapper.dataset.tableWidth || parsed.width, columnWidths: widths });
      view.dispatch({
        changes: { from: parsed.start, to: parsed.end, insert: next },
        selection: { anchor: Math.min(parsed.start + next.length, view.state.doc.length - (parsed.end - parsed.start) + next.length) },
      });
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
  });
  cell.appendChild(handle);
}

function readColumnWidths(table: HTMLTableElement, fallback: string[]): string[] {
  const cols = Array.from(table.querySelectorAll<HTMLTableColElement>("colgroup col"));
  const width = Math.max(cols.length, fallback.length);
  return Array.from({ length: width }, (_value, index) => cols[index]?.style.width || fallback[index] || "");
}

function focusAdjacentCell(
  table: HTMLTableElement,
  target: HTMLElement | null,
  reverse: boolean,
  view: EditorView,
  from: number,
  to: number,
  parsed: ComplexTable,
): void {
  const cells = Array.from(table.querySelectorAll<HTMLTableCellElement>("th, td"));
  const current = target?.closest("th, td") as HTMLTableCellElement | null;
  const index = current ? cells.indexOf(current) : -1;
  const next = cells[index + (reverse ? -1 : 1)];
  if (next) {
    next.focus();
    return;
  }
  if (reverse) {
    cells[cells.length - 1]?.focus();
    return;
  }
  const width = Math.max(1, ...parsed.rows.map((row) => row.length));
  const rows = [
    ...parsed.rows.map((row) => row.map((cell) => ({ ...cell, tag: cell.tag as "th" | "td" }))),
    Array.from({ length: width }, () => ({ tag: "td" as const, text: " ", rowspan: 1, colspan: 1, align: null })),
  ];
  const source = serializeComplexTable({ ...parsed, rows, columnWidths: readColumnWidths(table, parsed.columnWidths) });
  view.dispatch({
    changes: { from, to, insert: source },
    selection: { anchor: from + source.length },
  });
}
