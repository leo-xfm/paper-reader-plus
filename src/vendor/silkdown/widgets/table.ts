import { WidgetType, type EditorView } from "@codemirror/view";
import katex from "katex";

export type TableAlignment = "left" | "center" | "right" | null;

export class TableWidget extends WidgetType {
  constructor(
    private readonly rows: string[][],
    private readonly alignments: TableAlignment[],
    private readonly from: number,
    private readonly to: number,
  ) {
    super();
  }

  override eq(other: TableWidget): boolean {
    return JSON.stringify(other.rows) === JSON.stringify(this.rows) &&
      JSON.stringify(other.alignments) === JSON.stringify(this.alignments) &&
      other.from === this.from &&
      other.to === this.to;
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "sd-table-widget";
    wrapper.dataset.tableKind = "markdown";
    wrapper.dataset.tableFrom = String(this.from);
    wrapper.dataset.tableTo = String(this.to);
    const table = document.createElement("table");
    wrapper.appendChild(table);

    const header = this.rows[0] || [];
    if (header.length) {
      const thead = document.createElement("thead");
      const tr = document.createElement("tr");
      for (const [index, cell] of header.entries()) {
        const th = document.createElement("th");
        prepareEditableCell(th, cell, 0, index, view);
        applyAlignment(th, this.alignments[index]);
        tr.appendChild(th);
      }
      thead.appendChild(tr);
      table.appendChild(thead);
    }

    const bodyRows = this.rows.slice(1);
    if (bodyRows.length) {
      const tbody = document.createElement("tbody");
      for (const [rowIndex, row] of bodyRows.entries()) {
        const tr = document.createElement("tr");
        const width = Math.max(row.length, header.length, this.alignments.length);
        for (let index = 0; index < width; index += 1) {
          const td = document.createElement("td");
          prepareEditableCell(td, row[index] || "", rowIndex + 1, index, view);
          applyAlignment(td, this.alignments[index]);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
    }

    const commit = () => {
      const nextRows = readRows(table);
      const next = tableMarkdown(nextRows, this.alignments);
      const current = view.state.doc.sliceString(this.from, this.to);
      if (next === current) return;
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: next },
        selection: { anchor: Math.min(this.from + next.length, view.state.doc.length - (this.to - this.from) + next.length) },
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
        focusAdjacentCell(table, event.target as HTMLElement | null, event.shiftKey, view, this.from, this.to, this.alignments);
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

function applyAlignment(cell: HTMLTableCellElement, alignment: TableAlignment): void {
  if (alignment) cell.style.textAlign = alignment;
}

function prepareEditableCell(cell: HTMLTableCellElement, value: string, row: number, col: number, view: EditorView): void {
  cell.dataset.source = value;
  renderCellMarkdown(cell, value);
  cell.contentEditable = "true";
  cell.spellcheck = false;
  cell.dataset.row = String(row);
  cell.dataset.col = String(col);
  cell.addEventListener("pointerdown", () => {
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
    cell.textContent = cell.dataset.source || "";
    cell.dispatchEvent(new CustomEvent("silkdown-table-cell-focus", {
      bubbles: true,
      detail: { row, col, kind: "markdown" },
    }));
  });
  cell.addEventListener("blur", () => {
    cell.dataset.source = (cell.textContent || "").replace(/\r?\n/g, " ");
    renderCellMarkdown(cell, cell.dataset.source);
  });
}

function focusAdjacentCell(
  table: HTMLTableElement,
  target: HTMLElement | null,
  reverse: boolean,
  view: EditorView,
  from: number,
  to: number,
  alignments: TableAlignment[],
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
  const rows = readRows(table);
  const width = Math.max(1, ...rows.map((row) => row.length), alignments.length);
  rows.push(Array.from({ length: width }, () => " "));
  const nextSource = tableMarkdown(rows, alignments);
  view.dispatch({
    changes: { from, to, insert: nextSource },
    selection: { anchor: from + nextSource.length },
  });
}

function readRows(table: HTMLTableElement): string[][] {
  return Array.from(table.rows).map((row) =>
    Array.from(row.cells).map((cell) => ((cell as HTMLTableCellElement).dataset.source || cell.textContent || "").replace(/\s+/g, " ").trim()));
}

function tableMarkdown(rows: string[][], alignments: TableAlignment[]): string {
  const width = Math.max(1, ...rows.map((row) => row.length), alignments.length);
  const normalized = rows.map((row) => Array.from({ length: width }, (_value, index) => cleanCell(row[index] || "")));
  const header = normalized[0] || Array.from({ length: width }, () => "");
  const body = normalized.slice(1);
  const separator = Array.from({ length: width }, (_value, index) => alignmentCell(alignments[index]));
  return [header, separator, ...body].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function cleanCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim() || " ";
}

function alignmentCell(alignment: TableAlignment): string {
  if (alignment === "left") return ":---";
  if (alignment === "center") return ":---:";
  if (alignment === "right") return "---:";
  return "---";
}

function renderCellMarkdown(cell: HTMLTableCellElement, source: string): void {
  cell.replaceChildren(...renderInlineMarkdown(source));
}

function renderInlineMarkdown(source: string): Node[] {
  const fragment = document.createDocumentFragment();
  let index = 0;
  const tokenPattern = /(<u>.+?<\/u>|`[^`\n]+`|\*\*[^*\n]+?\*\*|__[^_\n]+?__|\*[^*\n]+?\*|_[^_\n]+?_|~~[^~\n]+?~~|\$\$[^$\n]+?\$\$|\$[^$\n]+?\$|\[[^\]\n]+\]\([^) \n]+(?:\s+[^)\n]*)?\)|(?:^|\n)\s*[-+*]\s+\[[ xX]\]\s+|(?:^|\n)\s*[-+*]\s+)/gi;
  for (const match of source.matchAll(tokenPattern)) {
    const start = match.index || 0;
    if (start > index) appendText(fragment, source.slice(index, start));
    appendRenderedToken(fragment, match[0]);
    index = start + match[0].length;
  }
  if (index < source.length) appendText(fragment, source.slice(index));
  return Array.from(fragment.childNodes);
}

function appendRenderedToken(fragment: DocumentFragment, token: string): void {
  if (/^`[^`\n]+`$/.test(token)) {
    appendElement(fragment, "code", "sd-code", token.slice(1, -1));
    return;
  }
  if (/^(?:\*\*[^*\n]+?\*\*|__[^_\n]+?__)$/.test(token)) {
    const element = document.createElement("strong");
    element.className = "sd-strong";
    appendNestedInline(element, token.slice(2, -2));
    fragment.appendChild(element);
    return;
  }
  if (/^(?:\*[^*\n]+?\*|_[^_\n]+?_)$/.test(token)) {
    const element = document.createElement("em");
    element.className = "sd-em";
    appendNestedInline(element, token.slice(1, -1));
    fragment.appendChild(element);
    return;
  }
  if (/^<u>.+?<\/u>$/i.test(token)) {
    const element = document.createElement("span");
    element.className = "sd-underline";
    appendNestedInline(element, token.slice(3, -4));
    fragment.appendChild(element);
    return;
  }
  if (/^~~[^~\n]+?~~$/.test(token)) {
    const element = document.createElement("s");
    element.className = "sd-strike";
    appendNestedInline(element, token.slice(2, -2));
    fragment.appendChild(element);
    return;
  }
  if (/^\$\$[^$\n]+?\$\$$/.test(token) || /^\$[^$\n]+?\$$/.test(token)) {
    const displayMode = token.startsWith("$$");
    const delimiterLength = displayMode ? 2 : 1;
    const element = document.createElement("span");
    element.className = displayMode ? "sd-math sd-math-block" : "sd-math sd-math-inline";
    try {
      katex.render(token.slice(delimiterLength, -delimiterLength), element, {
        displayMode,
        throwOnError: false,
        strict: false,
        trust: false,
      });
    } catch {
      element.textContent = token.slice(delimiterLength, -delimiterLength);
    }
    fragment.appendChild(element);
    return;
  }
  const link = token.match(/^\[([^\]\n]+)\]\(([^) \n]+)(?:\s+[^)\n]*)?\)$/);
  if (link) {
    const element = document.createElement("span");
    element.className = "sd-link";
    element.dataset.href = link[2];
    appendNestedInline(element, link[1]);
    fragment.appendChild(element);
    return;
  }
  const task = token.match(/^(\n?)(\s*)[-+*]\s+\[([ xX])\]\s+$/);
  if (task) {
    if (task[1]) fragment.appendChild(document.createElement("br"));
    appendListMarker(fragment, task[2], task[3].toLowerCase() === "x");
    return;
  }
  const bullet = token.match(/^(\n?)(\s*)[-+*]\s+$/);
  if (bullet) {
    if (bullet[1]) fragment.appendChild(document.createElement("br"));
    appendListMarker(fragment, bullet[2], null);
    return;
  }
  appendText(fragment, token);
}

function appendNestedInline(parent: HTMLElement, source: string): void {
  parent.append(...renderInlineMarkdown(source));
}

function appendListMarker(fragment: DocumentFragment, indent: string, checked: boolean | null): void {
  const marker = document.createElement("span");
  const level = Math.floor(indent.replace(/\t/g, "    ").length / 4);
  const visualLevel = Math.min(Math.max(0, level), 3);
  marker.className = `sd-list-marker sd-list-marker-${visualLevel}`;
  if (checked === null) {
    marker.textContent = bulletForLevel(visualLevel);
  } else {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.disabled = true;
    checkbox.checked = checked;
    marker.appendChild(checkbox);
  }
  fragment.appendChild(marker);
}

function bulletForLevel(level: number): string {
  if (level === 1) return "◦";
  if (level === 2) return "▪";
  if (level >= 3) return "▫";
  return "•";
}

function appendElement(fragment: DocumentFragment, tag: string, className: string, text: string): void {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  fragment.appendChild(element);
}

function appendText(fragment: DocumentFragment, text: string): void {
  const parts = text.split("\n");
  for (const [index, part] of parts.entries()) {
    if (index > 0) fragment.appendChild(document.createElement("br"));
    if (part) fragment.appendChild(document.createTextNode(part));
  }
}
