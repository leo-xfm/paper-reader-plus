<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import katex from "katex";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Columns3,
  Code,
  Copy,
  Heading3,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Redo2,
  Rows3,
  Scan,
  Sigma,
  Table2,
  Trash2,
  Underline,
  Undo2,
  MoreVertical,
} from "lucide-vue-next";
import { baseKeymap, chainCommands, createParagraphNear, liftEmptyBlock, newlineInCode, setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { InputRule, inputRules, wrappingInputRule, textblockTypeInputRule, smartQuotes, emDash, ellipsis } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { Fragment } from "prosemirror-model";
import type { MarkType, Node as ProseMirrorNode, NodeType } from "prosemirror-model";
import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import type { Command, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { liftListItem, sinkListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import {
  markdownOffsetFromDocPosition,
  parseMarkdownToDoc,
  proseMirrorMarkdownSchema,
  serializeDocToMarkdown,
} from "@/services/ProseMirrorMarkdownService";
import { createSourceRevealPlugin, findClickedImageInfo, stripMarkdownFormattingForPlainPaste } from "@/services/ProseMirrorMarkdownUiService";
import { useI18n } from "@/i18n";

const props = defineProps<{ modelValue: string; placeholder?: string; documentId?: string }>();
const emit = defineEmits<{
  (event: "update:modelValue", value: string): void;
  (event: "linkClick", payload: { href: string; event: MouseEvent }): void;
  (event: "imagePaste", payload: { dataUrl: string; selection?: { start: number; end: number } }): void;
  (event: "imageInsert", payload: { selection?: { start: number; end: number } }): void;
  (event: "imageContext", payload: { assetPath: string; event: MouseEvent }): void;
  (event: "selectionChange", payload: { start: number; end: number }): void;
}>();
const { t } = useI18n();

const editorRoot = ref<HTMLDivElement | null>(null);
const currentMarkdown = ref((props.modelValue || "").replace(/\r\n/g, "\n"));
const activeMarks = ref({ strong: false, em: false, underline: false, code: false, link: false });
const activeBlocks = ref({ paragraph: false, h1: false, h2: false, h3: false, blockquote: false, bulletList: false, orderedList: false });
const canUndo = ref(false);
const canRedo = ref(false);
const tableMenuOpen = ref(false);
const tableHover = ref({ rows: 3, cols: 3 });
const tableMoreOpen = ref(false);
const tableResizeOpen = ref(false);
const tableResizeHover = ref({ rows: 3, cols: 3 });
const imageResizeMenu = ref({
  open: false,
  top: 0,
  left: 0,
  imagePos: null as number | null,
  naturalWidth: 0,
  naturalHeight: 0,
  assetPath: "",
  readerHref: "",
  submenuLeft: false,
});
const mathPreviewRoot = ref<HTMLDivElement | null>(null);
const mathPreview = ref({
  open: false,
  top: 0,
  left: 0,
  latex: "",
  display: false,
});
const activeTable = ref({
  active: false,
  top: 0,
  left: 0,
  rowIndex: 0,
  colIndex: 0,
  align: null as "left" | "center" | "right" | null,
});
const assetUrlCache = new Map<string, string>();
const dataUrlAssetPaths = new Map<string, string>();
let view: EditorView | null = null;
let syncingFromEditor = false;

const schema = proseMirrorMarkdownSchema;
const nodes = schema.nodes;
const marks = schema.marks;
const IMAGE_SIZE_TITLE_PREFIX = "PRP_SIZE:";
const IMAGE_RESIZE_PERCENTAGES = [25, 50, 75, 100, 150, 200];

const placeholderText = computed(() => props.placeholder || "Write markdown...");

function readPastedImage(event: ClipboardEvent) {
  const item = [...(event.clipboardData?.items || [])].find((entry) => entry.kind === "file" && entry.type.startsWith("image/"));
  const file = item?.getAsFile();
  if (!file) return null;
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read pasted image."));
    reader.readAsDataURL(file);
  });
}

function selectionMarkdownRange(state: EditorState) {
  return {
    start: markdownOffsetFromDocPosition(state.doc, state.selection.from),
    end: markdownOffsetFromDocPosition(state.doc, state.selection.to),
  };
}

function publishSelection(state: EditorState) {
  emit("selectionChange", selectionMarkdownRange(state));
}

function runCommand(command: Command) {
  if (!view) return false;
  const handled = command(view.state, view.dispatch, view);
  if (handled) view.focus();
  updateToolbarState();
  return handled;
}

function markIsActive(type: MarkType) {
  if (!view) return false;
  const { from, $from, to, empty } = view.state.selection;
  return empty ? Boolean(type.isInSet(view.state.storedMarks || $from.marks())) : view.state.doc.rangeHasMark(from, to, type);
}

function blockIsActive(type: NodeType, attrs?: Record<string, unknown>) {
  if (!view) return false;
  const { from, to } = view.state.selection;
  let active = false;
  view.state.doc.nodesBetween(from, to, (node) => {
    if (active || node.type !== type) return;
    if (!attrs || Object.entries(attrs).every(([key, value]) => node.attrs[key] === value)) active = true;
  });
  return active;
}

function updateToolbarState() {
  if (!view) return;
  activeMarks.value = {
    strong: markIsActive(marks.strong),
    em: markIsActive(marks.em),
    underline: markIsActive(marks.underline),
    code: markIsActive(marks.code),
    link: markIsActive(marks.link),
  };
  activeBlocks.value = {
    paragraph: blockIsActive(nodes.paragraph),
    h1: blockIsActive(nodes.heading, { level: 1 }),
    h2: blockIsActive(nodes.heading, { level: 2 }),
    h3: blockIsActive(nodes.heading, { level: 3 }),
    blockquote: blockIsActive(nodes.blockquote),
    bulletList: blockIsActive(nodes.bullet_list),
    orderedList: blockIsActive(nodes.ordered_list),
  };
  canUndo.value = undo(view.state);
  canRedo.value = redo(view.state);
  updateTableToolbarState();
}

function closeImageResizeMenu() {
  imageResizeMenu.value = { ...imageResizeMenu.value, open: false, imagePos: null, assetPath: "", readerHref: "", submenuLeft: false };
}

function closeMathPreview() {
  if (!mathPreview.value.open) return;
  mathPreview.value = { ...mathPreview.value, open: false, latex: "" };
}

function dispatchTransaction(transaction: Transaction) {
  if (!view) return;
  const nextState = view.state.apply(transaction);
  view.updateState(nextState);
  if (transaction.docChanged) {
    const markdown = serializeDocToMarkdown(nextState.doc);
    currentMarkdown.value = markdown;
    syncingFromEditor = true;
    emit("update:modelValue", markdown);
    void nextTick(() => { syncingFromEditor = false; });
  }
  if (transaction.docChanged || transaction.selectionSet) publishSelection(nextState);
  updateToolbarState();
  updateMathPreviewState(nextState);
  if (transaction.docChanged) void nextTick(resolveEditorAssetImages);
}

function findImageAtEvent(viewInstance: EditorView, event: MouseEvent) {
  const imageContainer = (event.target as HTMLElement | null)?.closest(".live-reader-image-wrap") as HTMLElement | null;
  const image = ((event.target as HTMLElement | null)?.closest("img") || imageContainer?.querySelector("img")) as HTMLImageElement | null;
  if (!image) return null;
  const position = viewInstance.posAtDOM(imageContainer || image, 0);
  const node = viewInstance.state.doc.nodeAt(position);
  if (!node || node.type.name !== "image") return null;
  return { image, position, node };
}

function readerHrefForImageNode(node: ProseMirrorNode | null | undefined) {
  const href = String(node?.marks.find((mark) => mark.type.name === "link")?.attrs.href || "");
  return href.startsWith("/reader?") ? href : "";
}

function documentIdFromReaderHref(href: string) {
  if (!href.startsWith("/reader?")) return "";
  try {
    return new URL(href, "http://reader.local").searchParams.get("documentId") || "";
  } catch {
    return "";
  }
}

function emitReaderImageLink(href: string, event: MouseEvent) {
  if (!href) return false;
  emit("linkClick", { href, event });
  closeImageResizeMenu();
  return true;
}

function jumpToActiveImageSource(event: MouseEvent) {
  emitReaderImageLink(imageResizeMenu.value.readerHref, event);
}

function resizeActiveImage(percent: number) {
  if (!view || imageResizeMenu.value.imagePos === null) return;
  const node = view.state.doc.nodeAt(imageResizeMenu.value.imagePos);
  if (!node || node.type.name !== "image") {
    closeImageResizeMenu();
    return;
  }
  const width = Math.max(1, Math.round(imageResizeMenu.value.naturalWidth * percent / 100));
  const height = Math.max(1, Math.round(imageResizeMenu.value.naturalHeight * percent / 100));
  const title = `${IMAGE_SIZE_TITLE_PREFIX}${width}x${height}`;
  view.dispatch(view.state.tr.setNodeMarkup(imageResizeMenu.value.imagePos, undefined, { ...node.attrs, title }).scrollIntoView());
  closeImageResizeMenu();
  view.focus();
}

function applyImageElementSize(image: HTMLImageElement, title: string) {
  const [, widthValue, heightValue] = title.match(/^PRP_SIZE:([1-9]\d{0,3})?x([1-9]\d{0,3})?$/) || [];
  if (widthValue) image.style.width = `${widthValue}px`;
  else image.style.removeProperty("width");
  if (heightValue) image.style.height = `${heightValue}px`;
  else image.style.removeProperty("height");
}

function candidateDocumentIdsForImageNode(node: ProseMirrorNode) {
  const documentIds: string[] = [];
  if (props.documentId) documentIds.push(props.documentId);
  const readerDocumentId = documentIdFromReaderHref(readerHrefForImageNode(node));
  if (readerDocumentId && !documentIds.includes(readerDocumentId)) documentIds.push(readerDocumentId);
  return documentIds;
}

async function resolveImageAssetForElement(image: HTMLImageElement, node: ProseMirrorNode) {
  const rawSrc = String(node.attrs.src || "");
  const normalized = normalizeAssetPath(rawSrc);
  applyImageElementSize(image, String(node.attrs.title || ""));
  if (!/^assets\//i.test(normalized)) {
    image.removeAttribute("data-asset-path");
    image.removeAttribute("data-asset-document-id");
    return;
  }
  image.setAttribute("data-asset-path", normalized);
  if (!window.paperReaderPlus) return;
  const candidateDocumentIds = candidateDocumentIdsForImageNode(node);
  const resolveKey = `${rawSrc}\n${candidateDocumentIds.join("\n")}`;
  image.setAttribute("data-asset-resolve-key", resolveKey);
  for (const documentId of candidateDocumentIds) {
    const cacheKey = `${documentId}:${normalized}`;
    try {
      const dataUrl = assetUrlCache.get(cacheKey) || await window.paperReaderPlus.getAssetDataUrl(documentId, normalized);
      assetUrlCache.set(cacheKey, dataUrl);
      if (image.getAttribute("data-asset-resolve-key") !== resolveKey || image.getAttribute("data-original-src") !== rawSrc) return;
      dataUrlAssetPaths.set(dataUrl, normalized);
      image.setAttribute("data-asset-document-id", documentId);
      image.setAttribute("src", dataUrl);
      return;
    } catch {
      // ReaderM captures store the image asset on the markdown document, while
      // the surrounding reader link points to the source PDF. Try both scopes.
    }
  }
}

function saveActiveImageAs() {
  if (!view || imageResizeMenu.value.imagePos === null) return;
  const node = view.state.doc.nodeAt(imageResizeMenu.value.imagePos);
  if (!node || node.type.name !== "image") {
    closeImageResizeMenu();
    return;
  }
  const escapedAssetPath = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(imageResizeMenu.value.assetPath) : imageResizeMenu.value.assetPath.replace(/"/g, '\\"');
  const image = view.dom.querySelector(`img[data-asset-path="${escapedAssetPath}"]`) as HTMLImageElement | null;
  const href = image?.getAttribute("src") || String(node.attrs.src || "");
  const filename = String(node.attrs.src || "image").split("/").pop()?.split(/[?#]/)[0] || "image";
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  closeImageResizeMenu();
}

function deleteActiveImage() {
  if (!view || imageResizeMenu.value.imagePos === null) return;
  const node = view.state.doc.nodeAt(imageResizeMenu.value.imagePos);
  if (!node || node.type.name !== "image") {
    closeImageResizeMenu();
    return;
  }
  view.dispatch(view.state.tr.delete(imageResizeMenu.value.imagePos, imageResizeMenu.value.imagePos + node.nodeSize).scrollIntoView());
  closeImageResizeMenu();
  view.focus();
}

function setLink() {
  if (!view) return;
  const current = marks.link.isInSet(view.state.storedMarks || view.state.selection.$from.marks());
  const existingHref = current?.attrs.href || "";
  const href = window.prompt("Link URL", existingHref);
  if (href === null) return;
  const trimmed = href.trim();
  if (!trimmed) {
    runCommand(toggleMark(marks.link));
    return;
  }
  runCommand(toggleMark(marks.link, { href: trimmed, title: null }));
}

function insertMathFormula() {
  if (!view) return;
  insertPairedMarkdownText(view.state, view.dispatch, "$");
  view.focus();
}

function requestImageInsertion() {
  if (!view) return;
  const range = selectionMarkdownRange(view.state);
  emit("selectionChange", range);
  emit("imageInsert", { selection: range });
}

function insertTable(rows = tableHover.value.rows, cols = tableHover.value.cols) {
  if (!view) return;
  tableMenuOpen.value = false;
  const safeRows = Math.min(Math.max(2, rows), 10);
  const safeCols = Math.min(Math.max(2, cols), 10);
  const cell = (text: string, header = false) => nodes.table_cell.create({ header }, text ? schema.text(text) : undefined);
  const row = (rowIndex: number) => nodes.table_row.create(
    null,
    Array.from({ length: safeCols }, (_value, colIndex) => cell(rowIndex === 0 ? `Column ${colIndex + 1}` : "", rowIndex === 0)),
  );
  const table = nodes.table.create(null, Array.from({ length: safeRows }, (_value, rowIndex) => row(rowIndex)));
  view.dispatch(view.state.tr.replaceSelectionWith(table).scrollIntoView());
  view.focus();
}

function setTableHover(rows: number, cols: number) {
  tableHover.value = { rows, cols };
}

function setTableResizeHover(rows: number, cols: number) {
  tableResizeHover.value = { rows, cols };
}

function closeFloatingMenus() {
  tableMenuOpen.value = false;
  tableMoreOpen.value = false;
  tableResizeOpen.value = false;
  closeImageResizeMenu();
}

function handleGlobalPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest(".live-table-menu, .live-table-context-toolbar, .live-image-resize-menu")) return;
  if (!target?.closest(".live-prosemirror-editor")) finalizeMathSourceEditing();
  closeFloatingMenus();
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  closeFloatingMenus();
}

type TableInfo = {
  table: ProseMirrorNode;
  tablePos: number;
  rowIndex: number;
  colIndex: number;
};

function getTableInfo(state = view?.state): TableInfo | null {
  if (!state) return null;
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type !== nodes.table) continue;
    return {
      table: $from.node(depth),
      tablePos: $from.before(depth),
      rowIndex: Math.max(0, $from.index(depth)),
      colIndex: Math.max(0, $from.index(depth + 1)),
    };
  }
  return null;
}

function tableColumnAlign(info: TableInfo | null) {
  if (!info) return null;
  const headerRow = info.table.firstChild;
  return (headerRow?.child(info.colIndex)?.attrs.align || null) as "left" | "center" | "right" | null;
}

function updateTableToolbarState() {
  if (!view || !editorRoot.value) {
    activeTable.value = { active: false, top: 0, left: 0, rowIndex: 0, colIndex: 0, align: null };
    return;
  }
  const info = getTableInfo(view.state);
  if (!info) {
    activeTable.value = { active: false, top: 0, left: 0, rowIndex: 0, colIndex: 0, align: null };
    tableMoreOpen.value = false;
    tableResizeOpen.value = false;
    return;
  }
  const tableDom = view.nodeDOM(info.tablePos) as HTMLElement | null;
  const container = editorRoot.value.parentElement as HTMLElement | null;
  if (!tableDom || !container) return;
  const tableRect = tableDom.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  activeTable.value = {
    active: true,
    top: Math.max(34, tableRect.top - containerRect.top - 46),
    left: Math.max(8, tableRect.left - containerRect.left),
    rowIndex: info.rowIndex,
    colIndex: info.colIndex,
    align: tableColumnAlign(info),
  };
}

function mapTableRows(table: ProseMirrorNode, mapper: (rows: ProseMirrorNode[]) => ProseMirrorNode[]) {
  const rows: ProseMirrorNode[] = [];
  table.forEach((row) => rows.push(row));
  return table.type.create(table.attrs, Fragment.from(mapper(rows)));
}

function emptyTableCell(reference?: ProseMirrorNode, header = false) {
  return nodes.table_cell.create({ header, align: reference?.attrs.align || null });
}

function replaceActiveTable(nextTable: ProseMirrorNode, focusCell?: { row: number; col: number }) {
  if (!view) return false;
  const info = getTableInfo(view.state);
  if (!info) return false;
  let transaction = view.state.tr.replaceWith(info.tablePos, info.tablePos + info.table.nodeSize, nextTable);
  if (focusCell) {
    let target = info.tablePos + 1;
    for (let row = 0; row < Math.min(focusCell.row, nextTable.childCount - 1); row += 1) target += nextTable.child(row).nodeSize;
    target += 1;
    const targetRow = nextTable.child(Math.min(focusCell.row, nextTable.childCount - 1));
    for (let col = 0; col < Math.min(focusCell.col, targetRow.childCount - 1); col += 1) target += targetRow.child(col).nodeSize;
    transaction = transaction.setSelection(TextSelection.near(transaction.doc.resolve(target + 1)));
  }
  view.dispatch(transaction.scrollIntoView());
  view.focus();
  tableMoreOpen.value = false;
  tableResizeOpen.value = false;
  return true;
}

function adjustActiveTable() {
  const info = getTableInfo();
  if (!info) return;
  const maxCols = Math.max(1, ...Array.from({ length: info.table.childCount }, (_value, index) => info.table.child(index).childCount));
  const nextTable = mapTableRows(info.table, (rows) => rows.map((row, rowIndex) => {
    const cells: ProseMirrorNode[] = [];
    row.forEach((cell) => cells.push(cell));
    while (cells.length < maxCols) cells.push(emptyTableCell(cells[cells.length - 1], rowIndex === 0));
    return row.type.create(row.attrs, Fragment.from(cells.slice(0, maxCols)));
  }));
  replaceActiveTable(nextTable, { row: info.rowIndex, col: info.colIndex });
}

function resizeActiveTable(rows = tableResizeHover.value.rows, cols = tableResizeHover.value.cols) {
  const info = getTableInfo();
  if (!info) return;
  const safeRows = Math.min(Math.max(1, rows), 10);
  const safeCols = Math.min(Math.max(1, cols), 10);
  const sourceRows: ProseMirrorNode[] = [];
  info.table.forEach((row) => sourceRows.push(row));
  const firstRowCells: ProseMirrorNode[] = [];
  sourceRows[0]?.forEach((cell) => firstRowCells.push(cell));
  const nextRows = Array.from({ length: safeRows }, (_value, rowIndex) => {
    const sourceRow = sourceRows[rowIndex];
    const sourceCells: ProseMirrorNode[] = [];
    sourceRow?.forEach((cell) => sourceCells.push(cell));
    const nextCells = Array.from({ length: safeCols }, (_cellValue, colIndex) => {
      return sourceCells[colIndex] || emptyTableCell(sourceCells[colIndex - 1] || firstRowCells[colIndex] || firstRowCells[firstRowCells.length - 1], rowIndex === 0);
    });
    return nodes.table_row.create(null, Fragment.from(nextCells));
  });
  replaceActiveTable(nodes.table.create(info.table.attrs, Fragment.from(nextRows)), {
    row: Math.min(info.rowIndex, safeRows - 1),
    col: Math.min(info.colIndex, safeCols - 1),
  });
}

function setActiveColumnAlign(align: "left" | "center" | "right") {
  const info = getTableInfo();
  if (!info) return;
  const nextAlign = tableColumnAlign(info) === align ? null : align;
  const nextTable = mapTableRows(info.table, (rows) => rows.map((row) => {
    const cells: ProseMirrorNode[] = [];
    row.forEach((cell, _offset, index) => {
      cells.push(index === info.colIndex ? cell.type.create({ ...cell.attrs, align: nextAlign }, cell.content, cell.marks) : cell);
    });
    return row.type.create(row.attrs, Fragment.from(cells));
  }));
  replaceActiveTable(nextTable, { row: info.rowIndex, col: info.colIndex });
}

function insertTableRow(direction: "above" | "below") {
  const info = getTableInfo();
  if (!info) return;
  const targetIndex = direction === "above" ? info.rowIndex : info.rowIndex + 1;
  const columnCount = Math.max(1, ...Array.from({ length: info.table.childCount }, (_value, index) => info.table.child(index).childCount));
  const referenceRow = info.table.child(Math.min(info.rowIndex, info.table.childCount - 1));
  const referenceCells: ProseMirrorNode[] = [];
  referenceRow.forEach((cell) => referenceCells.push(cell));
  const newRow = nodes.table_row.create(null, Fragment.from(Array.from({ length: columnCount }, (_value, col) => emptyTableCell(referenceCells[col] || referenceCells[referenceCells.length - 1], targetIndex === 0))));
  const nextTable = mapTableRows(info.table, (rows) => [...rows.slice(0, targetIndex), newRow, ...rows.slice(targetIndex)]);
  replaceActiveTable(nextTable, { row: targetIndex, col: info.colIndex });
}

function insertTableColumn(direction: "left" | "right") {
  const info = getTableInfo();
  if (!info) return;
  const targetIndex = direction === "left" ? info.colIndex : info.colIndex + 1;
  const nextTable = mapTableRows(info.table, (rows) => rows.map((row, rowIndex) => {
    const cells: ProseMirrorNode[] = [];
    row.forEach((cell) => cells.push(cell));
    const reference = cells[Math.min(info.colIndex, cells.length - 1)];
    const nextCells = [...cells.slice(0, targetIndex), emptyTableCell(reference, rowIndex === 0), ...cells.slice(targetIndex)];
    return row.type.create(row.attrs, Fragment.from(nextCells));
  }));
  replaceActiveTable(nextTable, { row: info.rowIndex, col: targetIndex });
}

function moveTableRow(direction: "up" | "down") {
  const info = getTableInfo();
  if (!info) return;
  const targetIndex = direction === "up" ? info.rowIndex - 1 : info.rowIndex + 1;
  if (targetIndex < 0 || targetIndex >= info.table.childCount) return;
  const nextTable = mapTableRows(info.table, (rows) => {
    const nextRows = [...rows];
    [nextRows[info.rowIndex], nextRows[targetIndex]] = [nextRows[targetIndex], nextRows[info.rowIndex]];
    return nextRows;
  });
  replaceActiveTable(nextTable, { row: targetIndex, col: info.colIndex });
}

function moveTableColumn(direction: "left" | "right") {
  const info = getTableInfo();
  if (!info) return;
  const targetIndex = direction === "left" ? info.colIndex - 1 : info.colIndex + 1;
  const firstRow = info.table.firstChild;
  if (!firstRow || targetIndex < 0 || targetIndex >= firstRow.childCount) return;
  const nextTable = mapTableRows(info.table, (rows) => rows.map((row) => {
    const cells: ProseMirrorNode[] = [];
    row.forEach((cell) => cells.push(cell));
    [cells[info.colIndex], cells[targetIndex]] = [cells[targetIndex], cells[info.colIndex]];
    return row.type.create(row.attrs, Fragment.from(cells));
  }));
  replaceActiveTable(nextTable, { row: info.rowIndex, col: targetIndex });
}

async function copyActiveTable() {
  const info = getTableInfo();
  if (!info) return;
  const markdown = serializeDocToMarkdown(nodes.doc.create(null, [info.table]));
  await navigator.clipboard?.writeText(markdown);
  tableMoreOpen.value = false;
}

function formatActiveTableSource() {
  adjustActiveTable();
}

function deleteActiveTable() {
  if (!view) return;
  const info = getTableInfo(view.state);
  if (!info) return;
  view.dispatch(view.state.tr.delete(info.tablePos, info.tablePos + info.table.nodeSize).scrollIntoView());
  tableMoreOpen.value = false;
  view.focus();
}

function markInputRule(regexp: RegExp, markName: "em" | "strong" | "underline") {
  return new InputRule(regexp, (state, match, start, end) => {
    const prefix = match.length > 2 ? match[1] || "" : "";
    const text = match.length > 2 ? match[2] : match[1];
    if (!text) return null;
    const mark = marks[markName].create();
    return state.tr
      .replaceWith(start, end, prefix ? [schema.text(prefix), schema.text(text, [mark])] : schema.text(text, [mark]))
      .removeStoredMark(marks[markName]);
  });
}

function immediateInlineSyntaxTransaction(state: EditorState) {
  if (!state.selection.empty) return null;
  const { $from } = state.selection;
  if ($from.parent.type !== nodes.paragraph && $from.parent.type !== nodes.table_cell) return null;
  const parentStart = $from.start();
  const cursorOffset = $from.parentOffset;
  const before = $from.parent.textBetween(0, cursorOffset, "\n", "\n");
  const after = $from.parent.textBetween(cursorOffset, $from.parent.content.size, "\n", "\n");
  const pairedRules: Array<{ regexp: RegExp; close: string; replace: (content: string, start: number, end: number) => Transaction }> = [
    {
      regexp: /\*\*([^*\s](?:[^*]*[^*\s])?)$/,
      close: "**",
      replace: (content, start, end) => {
        const mark = marks.strong.create();
        const transaction = state.tr.replaceWith(start, end, schema.text(content, [mark]));
        return transaction.setSelection(TextSelection.create(transaction.doc, start + content.length)).addStoredMark(mark);
      },
    },
    {
      regexp: /(^|[^*])\*([^*\s](?:[^*]*[^*\s])?)$/,
      close: "*",
      replace: (content, start, end) => {
        const mark = marks.em.create();
        const transaction = state.tr.replaceWith(start, end, schema.text(content, [mark]));
        return transaction.setSelection(TextSelection.create(transaction.doc, start + content.length)).addStoredMark(mark);
      },
    },
    {
      regexp: /`([^`\s](?:[^`]*[^`\s])?)$/,
      close: "`",
      replace: (content, start, end) => {
        const mark = marks.code.create();
        const transaction = state.tr.replaceWith(start, end, schema.text(content, [mark]));
        return transaction.setSelection(TextSelection.create(transaction.doc, start + content.length)).addStoredMark(mark);
      },
    },
    {
      regexp: /<u>([^<\s](?:[\s\S]*?[^<\s])?)$/,
      close: "</u>",
      replace: (content, start, end) => {
        const mark = marks.underline.create();
        const transaction = state.tr.replaceWith(start, end, schema.text(content, [mark]));
        return transaction.setSelection(TextSelection.create(transaction.doc, start + content.length)).addStoredMark(mark);
      },
    },
  ];
  for (const rule of pairedRules) {
    const match = before.match(rule.regexp);
    if (!match || !after.startsWith(rule.close)) continue;
    const fullMatch = match[0];
    const content = match[match.length - 1];
    const start = parentStart + cursorOffset - fullMatch.length + (rule.close === "*" && match[1] ? match[1].length : 0);
    const end = parentStart + cursorOffset + rule.close.length;
    return rule.replace(content, start, end).scrollIntoView();
  }
  const rules: Array<{ regexp: RegExp; replace: (match: RegExpMatchArray, start: number, end: number) => Transaction }> = [
    {
      regexp: /^\$\$([^$\s](?:[\s\S]*[^$\s])?)\$\$$/,
      replace: (match) => {
        if ($from.parent.type !== nodes.paragraph) return state.tr;
        return state.tr.replaceWith($from.before(), $from.after(), nodes.math_block.create({ latex: match[1].trim() }));
      },
    },
    {
      regexp: /\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/,
      replace: (match, start, end) => state.tr.replaceWith(start, end, schema.text(match[1], [marks.strong.create()])).removeStoredMark(marks.strong),
    },
    {
      regexp: /(^|[^*])\*([^*\s](?:[^*]*[^*\s])?)\*$/,
      replace: (match, start, end) => {
        const prefix = match[1] || "";
        return state.tr
          .replaceWith(start, end, prefix ? [schema.text(prefix), schema.text(match[2], [marks.em.create()])] : schema.text(match[2], [marks.em.create()]))
          .removeStoredMark(marks.em);
      },
    },
    {
      regexp: /`([^`\s](?:[^`]*[^`\s])?)`$/,
      replace: (match, start, end) => state.tr.replaceWith(start, end, schema.text(match[1], [marks.code.create()])).removeStoredMark(marks.code),
    },
    {
      regexp: /<u>([^<\s](?:[\s\S]*?[^<\s])?)<\/u>$/,
      replace: (match, start, end) => state.tr.replaceWith(start, end, schema.text(match[1], [marks.underline.create()])).removeStoredMark(marks.underline),
    },
    {
      regexp: /\$([^$\s](?:[^$\n]*[^$\s])?)\$$/,
      replace: (match, start, end) => state.tr.replaceWith(start, end, nodes.math_inline.create({ latex: match[1].trim(), display: false })),
    },
  ];
  for (const rule of rules) {
    const match = before.match(rule.regexp);
    if (!match) continue;
    const start = parentStart + cursorOffset - match[0].length;
    const end = parentStart + cursorOffset;
    return rule.replace(match, start, end).scrollIntoView();
  }
  return null;
}

function inactiveMathSyntaxTransaction(state: EditorState, force = false) {
  const selectionFrom = state.selection.from;
  let result: Transaction | null = null;
  state.doc.descendants((node, pos) => {
    if (result || (node.type !== nodes.paragraph && node.type !== nodes.table_cell)) return true;
    const text = node.textBetween(0, node.content.size, "\n", "\n");
    const blockMatch = text.match(/^\$\$([^$\s](?:[\s\S]*[^$\s])?)\$\$$/);
    const textStart = pos + 1;
    if (blockMatch && node.type === nodes.paragraph) {
      const from = pos;
      const to = pos + node.nodeSize;
      if (force || selectionFrom <= from || selectionFrom >= to) {
        result = state.tr.replaceWith(from, to, nodes.math_block.create({ latex: blockMatch[1].trim() })).scrollIntoView();
        return false;
      }
    }
    const inlinePattern = /(^|[^$])\$([^$\n\s](?:[^$\n]*[^$\n\s])?)\$(?!\$)/g;
    let match: RegExpExecArray | null;
    while ((match = inlinePattern.exec(text))) {
      const prefixLength = match[1]?.length || 0;
      const from = textStart + match.index + prefixLength;
      const to = from + match[0].length - prefixLength;
      if (!force && selectionFrom > from && selectionFrom < to) continue;
      result = state.tr.replaceWith(from, to, nodes.math_inline.create({ latex: match[2].trim(), display: false })).scrollIntoView();
      return false;
    }
    return true;
  });
  return result;
}

function finalizeMathSourceEditing() {
  if (!view) return;
  const transaction = inactiveMathSyntaxTransaction(view.state, true) as Transaction | null;
  if (transaction) view.dispatch(transaction.setMeta("liveInlineSyntax", true));
  closeMathPreview();
}

function createImmediateInlineSyntaxPlugin() {
  return new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      if (
        !transactions.some((transaction) => transaction.docChanged || transaction.selectionSet)
        || transactions.some((transaction) => transaction.getMeta("liveInlineSyntax") || transaction.getMeta("skipLiveInlineSyntax"))
      ) return null;
      const transaction = immediateInlineSyntaxTransaction(newState) || inactiveMathSyntaxTransaction(newState);
      return transaction ? transaction.setMeta("liveInlineSyntax", true) : null;
    },
  });
}

function insertPairedMarkdownText(state: EditorState, dispatch: ((transaction: Transaction) => void) | undefined, open: string, close = open) {
  const { from, to, empty } = state.selection;
  if (!dispatch) return true;
  const selectedText = empty ? "" : state.doc.textBetween(from, to, "\n", "\n");
  const text = `${open}${selectedText}${close}`;
  const cursor = from + open.length + selectedText.length;
  const transaction = state.tr.insertText(text, from, to);
  dispatch(transaction.setSelection(TextSelection.create(transaction.doc, cursor)).setMeta("skipLiveInlineSyntax", true).scrollIntoView());
  return true;
}

function createPairedMarkdownInputPlugin() {
  return new Plugin({
    props: {
      handleTextInput(_viewInstance, from, to, text) {
        const state = _viewInstance.state;
        if (text === "$") {
          const before = state.doc.textBetween(Math.max(0, from - 1), from, "\n", "\n");
          const after = state.doc.textBetween(from, Math.min(state.doc.content.size, from + 2), "\n", "\n");
          const { $from } = state.selection;
          const parentStart = $from.start();
          const cursorOffset = $from.parentOffset;
          const parentBefore = $from.parent.textBetween(0, cursorOffset, "\n", "\n");
          const parentAfter = $from.parent.textBetween(cursorOffset, $from.parent.content.size, "\n", "\n");
          const blockMath = parentBefore.match(/^\$\$([^$\s](?:[\s\S]*[^$\s])?)$/);
          if (blockMath && parentAfter === "$$" && $from.parent.type === nodes.paragraph) {
            const transaction = state.tr.replaceWith($from.before(), $from.after(), nodes.math_block.create({ latex: blockMath[1].trim() }));
            transaction.setSelection(TextSelection.near(transaction.doc.resolve($from.before() + 1))).setMeta("skipLiveInlineSyntax", true);
            _viewInstance.dispatch(transaction.scrollIntoView());
            return true;
          }
          const inlineMath = parentBefore.match(/\$([^$\n\s](?:[^$\n]*[^$\n\s])?)$/);
          if (inlineMath && parentAfter.startsWith("$") && !parentBefore.endsWith("$$")) {
            const start = parentStart + cursorOffset - inlineMath[0].length;
            const transaction = state.tr.replaceWith(start, parentStart + cursorOffset + 1, nodes.math_inline.create({ latex: inlineMath[1].trim(), display: false }));
            transaction.setSelection(TextSelection.create(transaction.doc, start + 1)).setMeta("skipLiveInlineSyntax", true);
            _viewInstance.dispatch(transaction.scrollIntoView());
            return true;
          }
          if (before !== "$") return insertPairedMarkdownText(state, _viewInstance.dispatch, "$");
          const replaceTo = after.startsWith("$") ? from + 1 : to;
          const transaction = state.tr.delete(from - 1, replaceTo);
          transaction.insertText("$$$$", from - 1, from - 1);
          transaction.setSelection(TextSelection.create(transaction.doc, from + 1)).setMeta("skipLiveInlineSyntax", true);
          _viewInstance.dispatch(transaction.scrollIntoView());
          return true;
        }
        if (text !== "*") return false;
        const before = state.doc.textBetween(Math.max(0, from - 1), from, "\n", "\n");
        if (before === "*") {
          const after = state.doc.textBetween(from, Math.min(state.doc.content.size, from + 1), "\n", "\n");
          const replaceTo = after === "*" ? from + 1 : to;
          const transaction = state.tr.delete(from - 1, replaceTo);
          transaction.insertText("****", from - 1, from - 1);
          transaction.setSelection(TextSelection.create(transaction.doc, from + 1)).setMeta("skipLiveInlineSyntax", true);
          _viewInstance.dispatch(transaction.scrollIntoView());
          return true;
        }
        return insertPairedMarkdownText(state, _viewInstance.dispatch, "*");
      },
    },
  });
}

function inlineCodeInputRule() {
  return new InputRule(/`([^`\s](?:[^`]*[^`\s])?)`$/, (state, match, start, end) => {
    const text = match[1];
    if (!text) return null;
    return state.tr
      .replaceWith(start, end, schema.text(text, [marks.code.create()]))
      .removeStoredMark(marks.code);
  });
}

function inlineMathInputRule() {
  return new InputRule(/\$([^$\s](?:[^$\n]*[^$\s])?)\$$/, (state, match, start, end) => {
    const latex = match[1]?.trim();
    if (!latex) return null;
    return state.tr.replaceWith(start, end, nodes.math_inline.create({ latex, display: false }));
  });
}

function renderKatexElement(element: HTMLElement, latex: string, displayMode: boolean) {
  try {
    katex.render(latex, element, { displayMode, throwOnError: false, strict: false, trust: false });
  } catch {
    element.textContent = latex;
  }
}

function renderMathPreview() {
  void nextTick(() => {
    if (!mathPreviewRoot.value || !mathPreview.value.open) return;
    renderKatexElement(mathPreviewRoot.value, mathPreview.value.latex || " ", mathPreview.value.display);
  });
}

function updateMathPreviewState(state = view?.state) {
  if (!state || !editorRoot.value || !state.selection.empty) {
    closeMathPreview();
    return;
  }
  const { $from } = state.selection;
  if ($from.parent.type !== nodes.paragraph && $from.parent.type !== nodes.table_cell) {
    closeMathPreview();
    return;
  }
  const text = $from.parent.textBetween(0, $from.parent.content.size, "\n", "\n");
  const cursor = $from.parentOffset;
  const blockMatch = text.match(/^\$\$([^$\s](?:[\s\S]*[^$\s])?)\$\$$/);
  let latex = "";
  let display = false;
  let fromOffset = 0;
  let toOffset = 0;
  if (blockMatch && cursor > 1 && cursor < text.length - 1) {
    latex = blockMatch[1].trim();
    display = true;
    fromOffset = 0;
    toOffset = text.length;
  } else {
    const inlinePattern = /(^|[^$])\$([^$\n\s](?:[^$\n]*[^$\n\s])?)\$(?!\$)/g;
    let match: RegExpExecArray | null;
    while ((match = inlinePattern.exec(text))) {
      const prefixLength = match[1]?.length || 0;
      const start = match.index + prefixLength;
      const end = start + match[0].length - prefixLength;
      if (cursor <= start || cursor >= end) continue;
      latex = match[2].trim();
      display = false;
      fromOffset = start;
      toOffset = end;
      break;
    }
  }
  if (!latex) {
    closeMathPreview();
    return;
  }
  const anchor = Math.min($from.start() + toOffset, state.doc.content.size);
  const coords = view?.coordsAtPos(anchor);
  const editorRect = editorRoot.value.getBoundingClientRect();
  if (!coords) {
    closeMathPreview();
    return;
  }
  mathPreview.value = {
    open: true,
    top: Math.max(6, coords.bottom - editorRect.top + 8),
    left: Math.min(Math.max(8, coords.left - editorRect.left), Math.max(8, editorRect.width - 280)),
    latex,
    display,
  };
  renderMathPreview();
}

function openMathSourceAt(position: number, node: ProseMirrorNode) {
  if (!view || !["math_inline", "math_block"].includes(node.type.name)) return false;
  const latex = String(node.attrs.latex || "");
  const source = node.type.name === "math_block" ? `$$${latex}$$` : `$${latex}$`;
  const replacement = node.type.name === "math_block"
    ? nodes.paragraph.create(null, schema.text(source))
    : schema.text(source);
  const transaction = view.state.tr.replaceWith(position, position + node.nodeSize, replacement);
  const cursor = position + (node.type.name === "math_block" ? 3 : 1) + latex.length;
  transaction.setSelection(TextSelection.create(transaction.doc, cursor)).setMeta("skipLiveInlineSyntax", true);
  view.dispatch(transaction.scrollIntoView());
  view.focus();
  return true;
}

function findMathAtEvent(viewInstance: EditorView, event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const math = target?.closest(".live-math-inline, .live-math-block") as HTMLElement | null;
  if (!math) return null;
  const position = viewInstance.posAtDOM(math, 0);
  const node = viewInstance.state.doc.nodeAt(position);
  if (!node || !["math_inline", "math_block"].includes(node.type.name)) return null;
  return { position, node };
}

function createMathNodeView(displayMode: boolean) {
  return (node: ProseMirrorNode) => {
    const dom = document.createElement(displayMode ? "div" : "span");
    dom.className = displayMode ? "live-math-block" : "live-math-inline";
    dom.dataset.latex = String(node.attrs.latex || "");
    renderKatexElement(dom, String(node.attrs.latex || ""), displayMode);
    return {
      dom,
      update(nextNode: ProseMirrorNode) {
        if (nextNode.type !== node.type) return false;
        dom.dataset.latex = String(nextNode.attrs.latex || "");
        renderKatexElement(dom, String(nextNode.attrs.latex || ""), displayMode);
        return true;
      },
    };
  };
}

function syncImageElement(image: HTMLImageElement, node: ProseMirrorNode) {
  const src = String(node.attrs.src || "");
  if (image.getAttribute("data-original-src") !== src || !image.getAttribute("src")) {
    image.setAttribute("src", src);
  }
  image.setAttribute("data-original-src", src);
  image.alt = String(node.attrs.alt || "");
  image.title = String(node.attrs.title || "");
  applyImageElementSize(image, String(node.attrs.title || ""));
}

function createImageNodeView() {
  return (node: ProseMirrorNode, _viewInstance: EditorView, getPos: (() => number | undefined) | boolean) => {
    const readerHref = readerHrefForImageNode(node);
    const image = document.createElement("img");
    syncImageElement(image, node);
    void resolveImageAssetForElement(image, node);
    if (!readerHref) {
      return {
        dom: image,
        update(nextNode: ProseMirrorNode) {
          if (nextNode.type !== node.type || readerHrefForImageNode(nextNode)) return false;
          syncImageElement(image, nextNode);
          void resolveImageAssetForElement(image, nextNode);
          return true;
        },
      };
    }

    const dom = document.createElement("span");
    dom.className = "live-reader-image-wrap";
    dom.dataset.readerHref = readerHref;
    const anchorButton = document.createElement("button");
    anchorButton.type = "button";
    anchorButton.className = "live-reader-image-anchor";
    anchorButton.title = t("liveMarkdown.jumpToSource");
    anchorButton.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-4.5 7-11a7 7 0 0 0-14 0c0 6.5 7 11 7 11Z"/><circle cx="12" cy="11" r="2.5"/></svg>`;
    anchorButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const position = typeof getPos === "function" ? getPos() : undefined;
      const currentNode = typeof position === "number" ? _viewInstance.state.doc.nodeAt(position) : node;
      emitReaderImageLink(readerHrefForImageNode(currentNode) || readerHref, event);
    });
    dom.append(anchorButton, image);
    return {
      dom,
      update(nextNode: ProseMirrorNode) {
        const nextHref = readerHrefForImageNode(nextNode);
        if (nextNode.type !== node.type || !nextHref) return false;
        dom.dataset.readerHref = nextHref;
        syncImageElement(image, nextNode);
        void resolveImageAssetForElement(image, nextNode);
        return true;
      },
    };
  };
}

function makeInputRules() {
  const rules = [
    ...smartQuotes,
    ellipsis,
    emDash,
    wrappingInputRule(/^\s*>\s$/, nodes.blockquote),
    wrappingInputRule(/^\s*([-+*])\s$/, nodes.bullet_list),
    wrappingInputRule(/^(\d+)\.\s$/, nodes.ordered_list, (match) => ({ order: Number(match[1]) })),
    textblockTypeInputRule(/^(#{1,6})\s$/, nodes.heading, (match) => ({ level: match[1].length })),
    textblockTypeInputRule(/^```(\S*)\s$/, nodes.code_block, (match) => ({ params: match[1] || "" })),
    markInputRule(/\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, "strong"),
    markInputRule(/(^|[^*])\*([^*\s](?:[^*]*[^*\s])?)\*$/, "em"),
    markInputRule(/<u>([^<\s](?:[\s\S]*?[^<\s])?)<\/u>$/, "underline"),
    inlineCodeInputRule(),
    inlineMathInputRule(),
  ];
  return inputRules({ rules });
}

function enterCodeFenceCommand(state: EditorState, dispatch?: (transaction: Transaction) => void) {
  if (!state.selection.empty) return false;
  const { $from } = state.selection;
  if ($from.parent.type !== nodes.paragraph) return false;
  const match = $from.parent.textContent.match(/^```(\S*)$/);
  if (!match) return false;
  if (dispatch) {
    const start = $from.before();
    const end = $from.after();
    const codeBlock = nodes.code_block.create({ params: match[1] || "" });
    const transaction = state.tr.replaceWith(start, end, codeBlock);
    dispatch(transaction.setSelection(TextSelection.near(transaction.doc.resolve(start + 1))).scrollIntoView());
  }
  return true;
}

function createState(markdown: string) {
  const listItem = nodes.list_item;
  return EditorState.create({
    schema,
    doc: parseMarkdownToDoc(markdown),
    plugins: [
      history(),
      createSourceRevealPlugin(),
      createPairedMarkdownInputPlugin(),
      createImmediateInlineSyntaxPlugin(),
      makeInputRules(),
      keymap({
        "Mod-z": undo,
        "Mod-y": redo,
        "Mod-Shift-z": redo,
        "Mod-b": toggleMark(marks.strong),
        "Mod-i": toggleMark(marks.em),
        "Mod-u": toggleMark(marks.underline),
        "Mod-e": toggleMark(marks.code),
        "Mod-k": () => {
          setLink();
          return true;
        },
        "Ctrl-k": () => {
          setLink();
          return true;
        },
        "Ctrl-m": () => {
          insertMathFormula();
          return true;
        },
        "Mod-m": () => {
          insertMathFormula();
          return true;
        },
        "Shift-Ctrl-7": wrapInList(nodes.ordered_list),
        "Shift-Ctrl-8": wrapInList(nodes.bullet_list),
        "Ctrl-0": setBlockType(nodes.paragraph),
        "Ctrl-1": setBlockType(nodes.heading, { level: 1 }),
        "Ctrl-2": setBlockType(nodes.heading, { level: 2 }),
        "Ctrl-3": setBlockType(nodes.heading, { level: 3 }),
        "Ctrl-4": setBlockType(nodes.heading, { level: 4 }),
        "Ctrl-5": setBlockType(nodes.heading, { level: 5 }),
        "Ctrl-6": setBlockType(nodes.heading, { level: 6 }),
        "Alt-Ctrl-1": setBlockType(nodes.heading, { level: 1 }),
        "Alt-Ctrl-2": setBlockType(nodes.heading, { level: 2 }),
        "Alt-Ctrl-3": setBlockType(nodes.heading, { level: 3 }),
        Tab: sinkListItem(listItem),
        "Shift-Tab": liftListItem(listItem),
        Enter: chainCommands(enterCodeFenceCommand, newlineInCode, createParagraphNear, liftEmptyBlock, splitListItem(listItem)),
      }),
      keymap(baseKeymap),
    ],
  });
}

function normalizeAssetPath(value: string) {
  return value.trim().replace(/^\.\/+/, "").split(/[?#]/)[0];
}

async function resolveEditorAssetImages() {
  if (!props.documentId || !view) return;
  const imageNodes: Array<{ node: ProseMirrorNode; pos: number }> = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === "image") imageNodes.push({ node, pos });
  });
  for (const { node, pos } of imageNodes) {
    const dom = view.nodeDOM(pos) as HTMLElement | null;
    const image = dom instanceof HTMLImageElement ? dom : (dom?.querySelector("img") as HTMLImageElement | null);
    if (!image) continue;
    await resolveImageAssetForElement(image, node);
  }
}

function handleClick(viewInstance: EditorView, event: MouseEvent) {
  if (!(event.target as HTMLElement | null)?.closest(".live-image-resize-menu")) closeImageResizeMenu();
  const mathInfo = findMathAtEvent(viewInstance, event);
  if (mathInfo) {
    event.preventDefault();
    return openMathSourceAt(mathInfo.position, mathInfo.node);
  }
  if (findClickedImageInfo(viewInstance, event)) return false;
  const link = (event.target as HTMLElement | null)?.closest("a") as HTMLAnchorElement | null;
  if (!link) return false;
  emit("linkClick", { href: link.getAttribute("href") || link.href, event });
  return true;
}

function handleContextMenu(_viewInstance: EditorView, event: MouseEvent) {
  const clicked = findImageAtEvent(_viewInstance, event);
  if (!clicked) return false;
  const assetPath = clicked.image.getAttribute("data-asset-path") || dataUrlAssetPaths.get(clicked.image.getAttribute("src") || "") || normalizeAssetPath(clicked.image.getAttribute("src") || "");
  if (!/^assets\//i.test(assetPath)) return false;
  event.preventDefault();
  const naturalWidth = clicked.image.naturalWidth || clicked.image.width || clicked.image.getBoundingClientRect().width || 1;
  const naturalHeight = clicked.image.naturalHeight || clicked.image.height || clicked.image.getBoundingClientRect().height || 1;
  const readerHref = readerHrefForImageNode(clicked.node);
  imageResizeMenu.value = {
    open: true,
    top: event.clientY + 4,
    left: event.clientX + 4,
    imagePos: clicked.position,
    naturalWidth,
    naturalHeight,
    assetPath,
    readerHref,
    submenuLeft: event.clientX + 4 + 212 + 92 + 16 > window.innerWidth,
  };
  return true;
}

async function handlePaste(viewInstance: EditorView, event: ClipboardEvent) {
  const urlText = event.clipboardData?.getData("text/plain")?.trim() || "";
  const pasteEvent = event as ClipboardEvent & { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };
  if ((pasteEvent.ctrlKey || pasteEvent.metaKey) && pasteEvent.shiftKey) {
    event.preventDefault();
    const plainText = stripMarkdownFormattingForPlainPaste(event.clipboardData?.getData("text/plain") || "");
    if (plainText) {
      const { from, to } = viewInstance.state.selection;
      viewInstance.dispatch(viewInstance.state.tr.insertText(plainText, from, to).setMeta("skipLiveInlineSyntax", true).scrollIntoView());
    }
    return true;
  }
  const imageDataUrl = await readPastedImage(event);
  if (imageDataUrl) {
    event.preventDefault();
    emit("imagePaste", { dataUrl: imageDataUrl, selection: selectionMarkdownRange(viewInstance.state) });
    return true;
  }
  if (urlText && /^(https?:\/\/|\/reader\?|readerp:\/\/|(?:\.\/)?assets\/)/i.test(urlText) && !viewInstance.state.selection.empty) {
    event.preventDefault();
    runCommand(toggleMark(marks.link, { href: urlText, title: null }));
    return true;
  }
  return false;
}

function mountEditor() {
  if (!editorRoot.value) return;
  view = new EditorView(editorRoot.value, {
    state: createState(currentMarkdown.value),
    dispatchTransaction,
    attributes: {
      class: "live-prosemirror-content",
      "data-placeholder": placeholderText.value,
    },
    handleDOMEvents: {
      click: handleClick,
      contextmenu: handleContextMenu,
      paste: (viewInstance, event) => {
        void handlePaste(viewInstance, event as ClipboardEvent);
        return false;
      },
      keyup: (viewInstance) => {
        publishSelection(viewInstance.state);
        updateToolbarState();
        updateMathPreviewState(viewInstance.state);
        return false;
      },
      mouseup: (viewInstance) => {
        publishSelection(viewInstance.state);
        updateToolbarState();
        updateMathPreviewState(viewInstance.state);
        return false;
      },
      focus: (viewInstance) => {
        publishSelection(viewInstance.state);
        updateToolbarState();
        updateMathPreviewState(viewInstance.state);
        return false;
      },
      blur: () => {
        finalizeMathSourceEditing();
        return false;
      },
    },
    nodeViews: {
      image: createImageNodeView(),
      math_inline: createMathNodeView(false),
      math_block: createMathNodeView(true),
    },
  });
  publishSelection(view.state);
  updateToolbarState();
  updateMathPreviewState(view.state);
  void nextTick(resolveEditorAssetImages);
}

onMounted(() => {
  mountEditor();
  window.addEventListener("pointerdown", handleGlobalPointerDown, true);
  window.addEventListener("keydown", handleGlobalKeydown, true);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", handleGlobalPointerDown, true);
  window.removeEventListener("keydown", handleGlobalKeydown, true);
  view?.destroy();
  view = null;
});

watch(() => props.modelValue, (value) => {
  const normalized = (value || "").replace(/\r\n/g, "\n");
  if (syncingFromEditor || normalized === currentMarkdown.value) return;
  currentMarkdown.value = normalized;
  if (!view) return;
  const nextState = createState(normalized);
  view.updateState(nextState);
  publishSelection(nextState);
  updateToolbarState();
  updateMathPreviewState(nextState);
  void nextTick(resolveEditorAssetImages);
});

watch(() => props.documentId, () => {
  void nextTick(resolveEditorAssetImages);
});
</script>

<template>
  <div class="live-editor live-prosemirror-editor">
    <div class="live-markdown-toolbar" role="toolbar" aria-label="Markdown tools">
      <button type="button" :class="{ active: activeMarks.strong }" title="Bold" @click="runCommand(toggleMark(marks.strong))"><Bold :size="15" /></button>
      <button type="button" :class="{ active: activeMarks.em }" title="Italic" @click="runCommand(toggleMark(marks.em))"><Italic :size="15" /></button>
      <button type="button" :class="{ active: activeMarks.underline }" title="Underline" @click="runCommand(toggleMark(marks.underline))"><Underline :size="15" /></button>
      <button type="button" :class="{ active: activeMarks.code }" title="Inline code" @click="runCommand(toggleMark(marks.code))"><Code :size="15" /></button>
      <button type="button" :class="{ active: activeMarks.link }" title="Link" @click="setLink"><LinkIcon :size="15" /></button>
      <button type="button" :title="t('liveMarkdown.mathFormula')" @click="insertMathFormula"><Sigma :size="15" /></button>
      <span class="live-toolbar-divider" />
      <button type="button" :class="{ active: activeBlocks.paragraph }" title="Paragraph" @click="runCommand(setBlockType(nodes.paragraph))"><Pilcrow :size="15" /></button>
      <button type="button" :class="{ active: activeBlocks.h1 }" title="Heading 1" @click="runCommand(setBlockType(nodes.heading, { level: 1 }))"><Heading1 :size="15" /></button>
      <button type="button" :class="{ active: activeBlocks.h2 }" title="Heading 2" @click="runCommand(setBlockType(nodes.heading, { level: 2 }))"><Heading2 :size="15" /></button>
      <button type="button" :class="{ active: activeBlocks.h3 }" title="Heading 3" @click="runCommand(setBlockType(nodes.heading, { level: 3 }))"><Heading3 :size="15" /></button>
      <button type="button" :class="{ active: activeBlocks.blockquote }" title="Quote" @click="runCommand(wrapIn(nodes.blockquote))"><Quote :size="15" /></button>
      <button type="button" :class="{ active: activeBlocks.bulletList }" title="Bullet list" @click="runCommand(wrapInList(nodes.bullet_list))"><List :size="15" /></button>
      <button type="button" :class="{ active: activeBlocks.orderedList }" title="Ordered list" @click="runCommand(wrapInList(nodes.ordered_list))"><ListOrdered :size="15" /></button>
      <span class="live-toolbar-divider" />
      <button type="button" :disabled="!canUndo" title="Undo" @click="runCommand(undo)"><Undo2 :size="15" /></button>
      <button type="button" :disabled="!canRedo" title="Redo" @click="runCommand(redo)"><Redo2 :size="15" /></button>
      <div class="live-table-menu" @mouseleave="setTableHover(3, 3)">
        <button type="button" :class="{ active: tableMenuOpen }" :title="t('liveMarkdown.table')" @click="tableMenuOpen = !tableMenuOpen"><Table2 :size="15" /></button>
        <div v-if="tableMenuOpen" class="live-table-grid" role="menu">
          <div class="live-table-grid-label">{{ tableHover.rows }} x {{ tableHover.cols }}</div>
          <div class="live-table-grid-cells">
            <button
              v-for="index in 100"
              :key="index"
              type="button"
              class="live-table-grid-cell"
              :class="{ active: Math.ceil(index / 10) <= tableHover.rows && ((index - 1) % 10) + 1 <= tableHover.cols }"
              :title="t('liveMarkdown.insertTableSize', { rows: Math.ceil(index / 10), cols: ((index - 1) % 10) + 1 })"
              @mouseenter="setTableHover(Math.ceil(index / 10), ((index - 1) % 10) + 1)"
              @click="insertTable(Math.ceil(index / 10), ((index - 1) % 10) + 1)"
            />
          </div>
        </div>
      </div>
      <button type="button" title="Image" @click="requestImageInsertion"><ImagePlus :size="15" /></button>
    </div>
    <div
      v-if="activeTable.active"
      class="live-table-context-toolbar"
      :style="{ top: `${activeTable.top}px`, left: `${activeTable.left}px` }"
      @mousedown.prevent
    >
      <div class="live-table-resize-menu" @mouseleave="setTableResizeHover(3, 3)">
        <button type="button" :class="{ active: tableResizeOpen }" :title="t('liveMarkdown.adjustTable')" @click="tableResizeOpen = !tableResizeOpen"><Scan :size="15" /></button>
        <div v-if="tableResizeOpen" class="live-table-grid live-table-resize-grid" role="menu">
          <div class="live-table-grid-label">{{ tableResizeHover.rows }} x {{ tableResizeHover.cols }}</div>
          <div class="live-table-grid-cells">
            <button
              v-for="index in 100"
              :key="index"
              type="button"
              class="live-table-grid-cell"
              :class="{ active: Math.ceil(index / 10) <= tableResizeHover.rows && ((index - 1) % 10) + 1 <= tableResizeHover.cols }"
              :title="t('liveMarkdown.resizeTableSize', { rows: Math.ceil(index / 10), cols: ((index - 1) % 10) + 1 })"
              @mouseenter="setTableResizeHover(Math.ceil(index / 10), ((index - 1) % 10) + 1)"
              @click="resizeActiveTable(Math.ceil(index / 10), ((index - 1) % 10) + 1)"
            />
          </div>
        </div>
      </div>
      <button type="button" :class="{ active: activeTable.align === 'left' }" :title="t('liveMarkdown.alignLeft')" @click="setActiveColumnAlign('left')"><AlignLeft :size="15" /></button>
      <button type="button" :class="{ active: activeTable.align === 'center' }" :title="t('liveMarkdown.alignCenter')" @click="setActiveColumnAlign('center')"><AlignCenter :size="15" /></button>
      <button type="button" :class="{ active: activeTable.align === 'right' }" :title="t('liveMarkdown.alignRight')" @click="setActiveColumnAlign('right')"><AlignRight :size="15" /></button>
      <div class="live-table-more-menu">
        <button type="button" :class="{ active: tableMoreOpen }" :title="t('liveMarkdown.moreActions')" @click="tableMoreOpen = !tableMoreOpen"><MoreVertical :size="15" /></button>
        <div v-if="tableMoreOpen" class="live-table-more-popover" role="menu">
          <button type="button" @click="insertTableRow('above')"><Rows3 :size="14" />{{ t("liveMarkdown.insertRowAbove") }}</button>
          <button type="button" @click="insertTableRow('below')"><Rows3 :size="14" />{{ t("liveMarkdown.insertRowBelow") }}</button>
          <button type="button" @click="insertTableColumn('left')"><Columns3 :size="14" />{{ t("liveMarkdown.insertColumnLeft") }}</button>
          <button type="button" @click="insertTableColumn('right')"><Columns3 :size="14" />{{ t("liveMarkdown.insertColumnRight") }}</button>
          <button type="button" @click="moveTableRow('up')"><Rows3 :size="14" />{{ t("liveMarkdown.moveRowUp") }}</button>
          <button type="button" @click="moveTableRow('down')"><Rows3 :size="14" />{{ t("liveMarkdown.moveRowDown") }}</button>
          <button type="button" @click="moveTableColumn('left')"><Columns3 :size="14" />{{ t("liveMarkdown.moveColumnLeft") }}</button>
          <button type="button" @click="moveTableColumn('right')"><Columns3 :size="14" />{{ t("liveMarkdown.moveColumnRight") }}</button>
          <button type="button" @click="copyActiveTable"><Copy :size="14" />{{ t("liveMarkdown.copyTable") }}</button>
          <button type="button" @click="formatActiveTableSource"><Scan :size="14" />{{ t("liveMarkdown.formatTable") }}</button>
          <button type="button" class="danger" @click="deleteActiveTable"><Trash2 :size="14" />{{ t("liveMarkdown.deleteTable") }}</button>
        </div>
      </div>
      <button type="button" class="danger" :title="t('liveMarkdown.deleteTable')" @click="deleteActiveTable"><Trash2 :size="15" /></button>
    </div>
    <div
      v-if="mathPreview.open"
      class="live-math-preview-popover"
      :class="{ block: mathPreview.display }"
      :style="{ top: `${mathPreview.top}px`, left: `${mathPreview.left}px` }"
      @mousedown.prevent
    >
      <div ref="mathPreviewRoot" class="live-math-preview-render" />
    </div>
    <div
      v-if="imageResizeMenu.open"
      class="live-image-resize-menu"
      :class="{ 'submenu-left': imageResizeMenu.submenuLeft }"
      :style="{ top: `${imageResizeMenu.top}px`, left: `${imageResizeMenu.left}px` }"
      @mousedown.prevent
    >
      <div class="live-image-menu-item live-image-menu-submenu">
        <span>{{ t("liveMarkdown.resizeImage") }}</span>
        <span class="live-image-menu-arrow">›</span>
        <div class="live-image-resize-submenu">
          <button
            v-for="percent in IMAGE_RESIZE_PERCENTAGES"
            :key="percent"
            type="button"
            class="live-image-menu-item"
            @click="resizeActiveImage(percent)"
          >
            {{ percent }}%
          </button>
        </div>
      </div>
      <button v-if="imageResizeMenu.readerHref" type="button" class="live-image-menu-item" @click="jumpToActiveImageSource">{{ t("liveMarkdown.jumpToSource") }}</button>
      <button type="button" class="live-image-menu-item" @click="saveActiveImageAs">{{ t("liveMarkdown.saveImageAs") }}</button>
      <button type="button" class="live-image-menu-item danger" @click="deleteActiveImage">{{ t("common.delete") }}</button>
    </div>
    <div ref="editorRoot" class="live-prosemirror-host" />
  </div>
</template>
