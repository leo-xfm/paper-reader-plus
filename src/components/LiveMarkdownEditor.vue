<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import katex from "katex";
import {
  AlignCenter,
  AlignHorizontalSpaceBetween,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Bold,
  ChevronsDown,
  ChevronsUp,
  CirclePlus,
  Code,
  Copy,
  BadgeInfo,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Highlighter,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Scan,
  Sigma,
  SquareCode,
  Strikethrough,
  Table2,
  TableCellsMerge,
  TableCellsSplit,
  TableColumnsSplit,
  TableRowsSplit,
  Trash2,
  Type,
  Wand2,
  Underline,
  Lightbulb,
  MoreHorizontal,
  OctagonAlert,
  ShieldAlert,
  TriangleAlert,
} from "lucide-vue-next";
import { EditorSelection, EditorState, Prec, StateEffect, type Extension, type Text } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { defaultHighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { GFM } from "@lezer/markdown";
import UiDropdown from "@/components/UiDropdown.vue";
import { useDropdownPopover } from "@/composables/useDropdownPopover";
import { createLruStringCache } from "@/composables/useLruStringCache";
import { useI18n, type I18nKey } from "@/i18n";
import { markdownHeadingIdFromLine } from "@/services/MarkdownOutlineService";
import {
  buildComplexTableGrid,
  calculateComplexTableSelectionRange,
  complexTableToMarkdown,
  findComplexTableRanges,
  parseComplexTableSource,
  replaceComplexTableSource,
  serializeComplexTable,
  type ComplexTable,
  type ComplexTableCell,
} from "@/services/ComplexTableService";
import {
  continueListOnEnter,
  continueBlockquoteOnEnter,
  completeBlockOnEnter,
  clearMarkdownFormatting,
  deleteListMarkerOnBackspace,
  deleteNextLineListMarkerOnDelete,
  extractImages,
  findLinkAt,
  findTableAt,
  indentSelectedLines,
  insertMathBlockSource,
  insertTableSource,
  insertCalloutBlock,
  markdownCodeLigatureReplacement,
  renderComplexTableHtml,
  replaceTable,
  resizeImageSource,
  setImageAlignmentSource,
  setHeading,
  setLinkHref,
  stripMarkdownFormattingForPlainPaste,
  toggleListPrefix,
  toggleFontColor,
  toggleWrappedMarkdown,
  type SourceEdit,
  type SourceImageRange,
  type SourceSelection,
  type SourceTableRange,
  type ImageAlignment,
} from "@/services/LiveMarkdownSourceService";
import { markdownBodyFontFamily, markdownChineseFontOptions, markdownCodeFontFamily, markdownWesternFontOptions } from "@/services/MarkdownFontOptionsService";
import { silkdownPlugin } from "@/vendor/silkdown/plugin";
import { baseTheme as silkdownBaseTheme } from "@/vendor/silkdown/theme";
import { scaledMarkdownLineHeight } from "@/composables/useMarkdownZoom";
import type { Settings } from "@/types";

const props = defineProps<{ modelValue: string; placeholder?: string; documentId?: string; fontSize?: number; settings?: Settings | null }>();
const emit = defineEmits<{
  (event: "update:modelValue", value: string): void;
  (event: "linkClick", payload: { href: string; event: MouseEvent; force?: boolean }): void;
  (event: "imagePaste", payload: { dataUrl: string; selection?: { start: number; end: number } }): void;
  (event: "imageInsert", payload: { selection?: { start: number; end: number }; kind?: "image" | "formula" }): void;
  (event: "imageContext", payload: { assetPath: string; event: MouseEvent }): void;
  (event: "selectionChange", payload: { start: number; end: number }): void;
  (event: "updateSettings", patch: Partial<Settings>): void;
}>();

const { t, language } = useI18n();
const editorRoot = ref<HTMLDivElement | null>(null);
const tableButtonRef = ref<HTMLButtonElement | null>(null);
const currentMarkdown = ref((props.modelValue || "").replace(/\r\n/g, "\n"));
const highlightColor = computed(() => props.settings?.markdown_highlight_color || "#fff3bf");
const activeMarks = ref({ strong: false, em: false, underline: false, highlight: false, strike: false, code: false, link: false });
const activeFontColor = ref("");
const activeBlocks = ref({ paragraph: true, h1: false, h2: false, h3: false, h4: false, h5: false, h6: false, blockquote: false, bulletList: false, orderedList: false });
const hasSelection = ref(false);
const tableMenuOpen = ref(false);
const calloutKind = ref<"NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION">("NOTE");
const tableHover = ref({ rows: 3, cols: 3 });
const tableMenuPosition = ref({ top: 0, left: 0 });
type TableKind = "markdown" | "complex";
type TableSelectionLevel = "cell" | "range" | "row" | "column" | "table";
type TableSelectionRange = { startRow: number; endRow: number; startCol: number; endCol: number };
type TableInteractionState = {
  active: boolean;
  kind: TableKind;
  start: number;
  end: number;
  rowIndex: number;
  colIndex: number;
  rowCount: number;
  colCount: number;
  align: "left" | "center" | "right" | null;
  level: TableSelectionLevel;
  range: TableSelectionRange | null;
  width: string;
  columnWidths: string[];
};
const emptyTableInteractionState = (): TableInteractionState => ({
  active: false,
  kind: "markdown",
  start: 0,
  end: 0,
  rowIndex: 0,
  colIndex: 0,
  rowCount: 0,
  colCount: 0,
  align: null,
  level: "cell",
  range: null,
  width: "100%",
  columnWidths: [],
});
const tableInteractionState = ref<TableInteractionState>(emptyTableInteractionState());
const tableHoverInsert = ref({
  visible: false,
  kind: "row" as "row" | "column",
  index: 0,
  top: 0,
  left: 0,
});
let tableSelectionAnchor: { row: number; col: number } | null = null;
let tableDragStart: { x: number; y: number; cell: HTMLTableCellElement; extend: boolean } | null = null;
let tableDragSelecting = false;
let suppressTableInteractionUntilTablePointer = false;
type ActiveImageState = {
  image: SourceImageRange;
  naturalWidth: number;
  naturalHeight: number;
  assetPath: string;
  readerHref: string;
  renderedSrc: string;
};
const activeImage = ref<ActiveImageState | null>(null);
const imageResizeMenu = ref({
  open: false,
  top: 0,
  left: 0,
  image: null as SourceImageRange | null,
  naturalWidth: 0,
  naturalHeight: 0,
  assetPath: "",
  readerHref: "",
  submenuLeft: false,
});
const mathPreviewRoot = ref<HTMLDivElement | null>(null);
const mathToolbarRoot = ref<HTMLDivElement | null>(null);
const mathToolbarClearance = ref(98);
const mathPreview = ref({
  open: false,
  top: 0,
  left: 0,
  latex: "",
  display: false,
  start: 0,
  end: 0,
});
const activeMathBlock = ref<MathSourceRange | null>(null);
const mathGroupOpen = ref<string | null>(null);
const mathMenuPosition = ref({ top: 0, left: 0, width: 776, maxHeight: 560 });
const moreToolsMenuSelector = ".live-more-tools-menu, .ui-dropdown-menu, .color-dropdown-menu";
const {
  open: liveMoreToolsOpen,
  rootRef: liveMoreToolsRoot,
  triggerRef: liveMoreToolsTrigger,
  menuStyle: liveMoreToolsStyle,
  closeMenu: closeLiveMoreTools,
  toggleOpen: toggleLiveMoreTools,
} = useDropdownPopover(moreToolsMenuSelector, { offset: 6, align: "right" });
const {
  open: liveInsertMoreToolsOpen,
  rootRef: liveInsertMoreToolsRoot,
  triggerRef: liveInsertMoreToolsTrigger,
  menuStyle: liveInsertMoreToolsStyle,
  closeMenu: closeLiveInsertMoreTools,
  toggleOpen: toggleLiveInsertMoreTools,
} = useDropdownPopover(moreToolsMenuSelector, { offset: 6, align: "right" });
const {
  open: liveTableMoreToolsOpen,
  rootRef: liveTableMoreToolsRoot,
  triggerRef: liveTableMoreToolsTrigger,
  menuStyle: liveTableMoreToolsStyle,
  closeMenu: closeLiveTableMoreTools,
  toggleOpen: toggleLiveTableMoreTools,
} = useDropdownPopover(moreToolsMenuSelector, { offset: 6, align: "right" });
const {
  open: liveImageMoreToolsOpen,
  rootRef: liveImageMoreToolsRoot,
  triggerRef: liveImageMoreToolsTrigger,
  menuStyle: liveImageMoreToolsStyle,
  closeMenu: closeLiveImageMoreTools,
  toggleOpen: toggleLiveImageMoreTools,
} = useDropdownPopover(moreToolsMenuSelector, { offset: 6, align: "right" });
const IMAGE_RESIZE_PERCENTAGES = [25, 50, 75, 100, 150, 200];
const FONT_COLOR_OPTIONS = [
  { value: "black", labelKey: "color.black" as I18nKey, swatch: "#111827" },
  { value: "red", labelKey: "color.red" as I18nKey, swatch: "#dc2626" },
  { value: "green", labelKey: "color.green" as I18nKey, swatch: "#16a34a" },
  { value: "blue", labelKey: "color.blue" as I18nKey, swatch: "#2563eb" },
  { value: "purple", labelKey: "color.purple" as I18nKey, swatch: "#7c3aed" },
];
type MathToolEntry = { label: string; text: string; selectStart?: number; selectEnd?: number };
type MathToolPanelSection = { titleKey: I18nKey; entries: MathToolEntry[] };
type MathToolGroup = { key: string; titleKey: "liveMarkdown.mathSymbols" | "liveMarkdown.mathGreek" | "liveMarkdown.mathFraction" | "liveMarkdown.mathRoot" | "liveMarkdown.mathLimit" | "liveMarkdown.mathTrig" | "liveMarkdown.mathIntegral" | "liveMarkdown.mathLargeOperator" | "liveMarkdown.mathBrackets" | "liveMarkdown.mathMatrix"; preview: string; sections: MathToolPanelSection[] };
const MATH_TOOL_GROUPS: MathToolGroup[] = [
  {
    key: "symbols",
    titleKey: "liveMarkdown.mathSymbols",
    preview: "???",
    sections: [
      {
        titleKey: "liveMarkdown.mathSectionBinaryOperations",
        entries: [
          { label: "+", text: "+" }, { label: "?", text: "-" }, { label: "?", text: "\\times" }, { label: "?", text: "\\div" },
          { label: "?", text: "\\pm" }, { label: "?", text: "\\mp" }, { label: "?", text: "\\triangleleft" }, { label: "?", text: "\\triangleright" },
          { label: "?", text: "\\cdot" }, { label: "?", text: "\\setminus" }, { label: "?", text: "\\star" }, { label: "?", text: "\\ast" },
          { label: "?", text: "\\cup" }, { label: "?", text: "\\cap" }, { label: "?", text: "\\sqcup" }, { label: "?", text: "\\sqcap" },
          { label: "?", text: "\\vee" }, { label: "?", text: "\\wedge" }, { label: "?", text: "\\circ" }, { label: "?", text: "\\bullet" },
          { label: "?", text: "\\oplus" }, { label: "?", text: "\\ominus" }, { label: "?", text: "\\odot" }, { label: "?", text: "\\oslash" },
          { label: "?", text: "\\otimes" }, { label: "?", text: "\\diamond" }, { label: "?", text: "\\uplus" }, { label: "?", text: "\\triangle" },
          { label: "?", text: "\\triangledown" }, { label: "?", text: "\\lhd" }, { label: "?", text: "\\rhd" }, { label: "?", text: "\\unlhd" },
          { label: "?", text: "\\unrhd" }, { label: "?", text: "\\coprod" }, { label: "?", text: "\\int" }, { label: "?", text: "\\dagger" }, { label: "?", text: "\\ddagger" },
        ],
      },
      {
        titleKey: "liveMarkdown.mathSectionBinaryRelations",
        entries: [
          { label: "<", text: "<" }, { label: ">", text: ">" }, { label: "=", text: "=" }, { label: "?", text: "\\le" }, { label: "?", text: "\\ge" },
          { label: "?", text: "\\equiv" }, { label: "?", text: "\\ll" }, { label: "?", text: "\\gg" }, { label: "?", text: "\\doteq" },
          { label: "?", text: "\\prec" }, { label: "?", text: "\\succ" }, { label: "?", text: "\\sim" }, { label: "?", text: "\\preceq" },
          { label: "?", text: "\\succeq" }, { label: "?", text: "\\simeq" }, { label: "?", text: "\\approx" }, { label: "?", text: "\\subset" },
          { label: "?", text: "\\supset" }, { label: "?", text: "\\subseteq" }, { label: "?", text: "\\supseteq" }, { label: "?", text: "\\sqsubset" },
          { label: "?", text: "\\sqsupset" }, { label: "?", text: "\\sqsubseteq" }, { label: "?", text: "\\sqsupseteq" }, { label: "?", text: "\\cong" },
          { label: "?", text: "\\bowtie" }, { label: "?", text: "\\infty" }, { label: "?", text: "\\in" }, { label: "?", text: "\\ni" },
          { label: "?", text: "\\vdash" }, { label: "?", text: "\\dashv" }, { label: "?", text: "\\parallel" }, { label: "?", text: "\\perp" },
          { label: "?", text: "\\ne" }, { label: "?", text: "\\notin" },
        ],
      },
      {
        titleKey: "liveMarkdown.mathSectionArrows",
        entries: [
          { label: "?", text: "\\leftarrow" }, { label: "?", text: "\\rightarrow" }, { label: "?", text: "\\leftarrowtail" }, { label: "?", text: "\\rightarrowtail" },
          { label: "?", text: "\\uparrow" }, { label: "?", text: "\\downarrow" }, { label: "?", text: "\\updownarrow" }, { label: "?", text: "\\leftrightarrow" },
          { label: "?", text: "\\Uparrow" }, { label: "?", text: "\\Downarrow" }, { label: "?", text: "\\Updownarrow" }, { label: "?", text: "\\Leftrightarrow" },
          { label: "?", text: "\\Leftarrow" }, { label: "?", text: "\\Rightarrow" }, { label: "?", text: "\\Longrightarrow" }, { label: "?", text: "\\Longleftrightarrow" },
          { label: "?", text: "\\mapsto" }, { label: "?", text: "\\longmapsto" }, { label: "?", text: "\\nearrow" }, { label: "?", text: "\\searrow" },
          { label: "?", text: "\\swarrow" }, { label: "?", text: "\\nwarrow" }, { label: "?", text: "\\hookleftarrow" }, { label: "?", text: "\\hookrightarrow" },
          { label: "?", text: "\\rightleftarrows" }, { label: "?", text: "\\leftrightharpoons" }, { label: "?", text: "\\leftharpoonup" }, { label: "?", text: "\\rightharpoonup" },
        ],
      },
      {
        titleKey: "liveMarkdown.mathSectionOthers",
        entries: [
          { label: "?", text: "\\because" }, { label: "?", text: "\\therefore" }, { label: "?", text: "\\cdots" }, { label: "?", text: "\\ldots" },
          { label: "?", text: "\\vdots" }, { label: "?", text: "\\ddots" }, { label: "?", text: "\\forall" }, { label: "?", text: "\\exists" },
          { label: "?", text: "\\nexists" }, { label: "?", text: "\\llcorner" }, { label: "?", text: "\\neg" }, { label: "?", text: "/" },
          { label: "?", text: "\\emptyset" }, { label: "?", text: "\\infty" }, { label: "?", text: "\\nabla" }, { label: "?", text: "\\triangle" },
          { label: "?", text: "\\square" }, { label: "?", text: "\\diamond" }, { label: "?", text: "\\perp" }, { label: "?", text: "\\top" },
          { label: "?", text: "\\angle" }, { label: "?", text: "\\sqrt{x}", selectStart: 6, selectEnd: 7 }, { label: "?", text: "\\heartsuit" }, { label: "?", text: "\\clubsuit" },
          { label: "?", text: "\\spadesuit" }, { label: "?", text: "\\flat" }, { label: "?", text: "\\natural" }, { label: "?", text: "\\sharp" },
        ],
      },
    ],
  },
  {
    key: "greek",
    titleKey: "liveMarkdown.mathGreek",
    preview: "????",
    sections: [
      {
        titleKey: "liveMarkdown.mathSectionLowercase",
        entries: [
          { label: "?", text: "\\alpha" }, { label: "?", text: "\\beta" }, { label: "?", text: "\\gamma" }, { label: "?", text: "\\delta" },
          { label: "?", text: "\\epsilon" }, { label: "?", text: "\\varepsilon" }, { label: "?", text: "\\zeta" }, { label: "?", text: "\\eta" },
          { label: "?", text: "\\theta" }, { label: "?", text: "\\vartheta" }, { label: "?", text: "\\iota" }, { label: "?", text: "\\kappa" },
          { label: "?", text: "\\lambda" }, { label: "?", text: "\\mu" }, { label: "?", text: "\\nu" }, { label: "?", text: "\\xi" },
          { label: "?", text: "o" }, { label: "?", text: "\\pi" }, { label: "?", text: "\\varpi" }, { label: "?", text: "\\rho" },
          { label: "?", text: "\\varrho" }, { label: "?", text: "\\sigma" }, { label: "?", text: "\\varsigma" }, { label: "?", text: "\\tau" },
          { label: "?", text: "\\upsilon" }, { label: "?", text: "\\phi" }, { label: "?", text: "\\varphi" }, { label: "?", text: "\\chi" },
          { label: "?", text: "\\psi" }, { label: "?", text: "\\omega" },
        ],
      },
      {
        titleKey: "liveMarkdown.mathSectionUppercase",
        entries: [
          { label: "?", text: "\\Gamma" }, { label: "?", text: "\\Delta" }, { label: "?", text: "\\Theta" }, { label: "?", text: "\\Lambda" },
          { label: "?", text: "\\Xi" }, { label: "?", text: "\\Pi" }, { label: "?", text: "\\Sigma" }, { label: "?", text: "\\Upsilon" },
          { label: "?", text: "\\Phi" }, { label: "?", text: "\\Psi" }, { label: "?", text: "\\Omega" },
        ],
      },
      {
        titleKey: "liveMarkdown.mathSectionOthers",
        entries: [
          { label: "?", text: "\\hbar" }, { label: "?", text: "\\ell" }, { label: "?", text: "\\Re" }, { label: "?", text: "\\Im" },
          { label: "?", text: "\\aleph" }, { label: "?", text: "\\wp" }, { label: "?", text: "\\partial" }, { label: "ABC", text: "\\mathrm{ABC}", selectStart: 8, selectEnd: 11 },
          { label: "ABC", text: "\\mathcal{ABC}", selectStart: 9, selectEnd: 12 }, { label: "ABC", text: "\\mathfrak{ABC}", selectStart: 10, selectEnd: 13 },
          { label: "ABC", text: "\\mathit{ABC}", selectStart: 8, selectEnd: 11 }, { label: "ABC", text: "\\mathbf{ABC}", selectStart: 8, selectEnd: 11 },
          { label: "def", text: "\\mathrm{def}", selectStart: 8, selectEnd: 11 },
        ],
      },
    ],
  },
];

MATH_TOOL_GROUPS.push(
  {
    key: "fraction",
    titleKey: "liveMarkdown.mathFraction",
    preview: "x/y",
    sections: [
      { titleKey: "liveMarkdown.mathSectionFractions", entries: [
        { label: "a/b", text: "\\frac{a}{b}", selectStart: 6, selectEnd: 7 }, { label: "x a/b", text: "x\\frac{a}{b}", selectStart: 7, selectEnd: 8 },
        { label: "dt", text: "\\,dt" }, { label: "dy/dx", text: "\\frac{dy}{dx}", selectStart: 6, selectEnd: 8 },
        { label: "?t", text: "\\partial t" }, { label: "?y/?x", text: "\\frac{\\partial y}{\\partial x}", selectStart: 15, selectEnd: 16 },
        { label: "??", text: "\\nabla \\psi" }, { label: "??y", text: "\\frac{\\partial^2 y}{\\partial x_1 \\partial x_2}", selectStart: 17, selectEnd: 18 },
        { label: "1/(a+b)", text: "\\frac{1}{a + b}", selectStart: 8, selectEnd: 13 }, { label: "continued", text: "x = a_0 + \\frac{1}{a_1 + \\frac{1}{a_2 + \\frac{1}{a_3 + \\frac{1}{a_4}}}}" },
      ] },
      { titleKey: "liveMarkdown.mathSectionDerivative", entries: [
        { label: "?", text: "\\dot{x}", selectStart: 5, selectEnd: 6 }, { label: "?", text: "\\ddot{x}", selectStart: 6, selectEnd: 7 },
        { label: "f?", text: "f'" }, { label: "f?", text: "f''" }, { label: "f???", text: "f^{(n)}", selectStart: 0, selectEnd: 1 },
      ] },
      { titleKey: "liveMarkdown.mathSectionModularArithmetic", entries: [
        { label: "a mod b", text: "a \\bmod b" }, { label: "a?b", text: "a \\equiv b \\pmod{m}", selectStart: 0, selectEnd: 1 },
        { label: "gcd", text: "\\gcd(m,n)", selectStart: 5, selectEnd: 6 }, { label: "lcm", text: "\\operatorname{lcm}(m,n)", selectStart: 18, selectEnd: 19 },
      ] },
    ],
  },
  {
    key: "root",
    titleKey: "liveMarkdown.mathRoot",
    preview: "?e?",
    sections: [
      { titleKey: "liveMarkdown.mathSectionRadicals", entries: [
        { label: "?x", text: "\\sqrt{x}", selectStart: 6, selectEnd: 7 }, { label: "??x", text: "\\sqrt[n]{x}", selectStart: 6, selectEnd: 7 },
      ] },
      { titleKey: "liveMarkdown.mathSectionSubSuper", entries: [
        { label: "x?", text: "x^{a}", selectStart: 0, selectEnd: 1 }, { label: "x?", text: "x_{a}", selectStart: 0, selectEnd: 1 },
        { label: "x??", text: "x_{a}^{b}", selectStart: 0, selectEnd: 1 }, { label: "??x", text: "{}_{a}^{b}x", selectStart: 9, selectEnd: 10 },
        { label: "x??", text: "x_{1}^{2}", selectStart: 0, selectEnd: 1 },
      ] },
      { titleKey: "liveMarkdown.mathSectionAccents", entries: [
        { label: "?", text: "\\hat{a}", selectStart: 5, selectEnd: 6 }, { label: "?", text: "\\check{a}", selectStart: 7, selectEnd: 8 },
        { label: "?", text: "\\grave{a}", selectStart: 7, selectEnd: 8 }, { label: "?", text: "\\acute{a}", selectStart: 7, selectEnd: 8 },
        { label: "?", text: "\\bar{a}", selectStart: 5, selectEnd: 6 }, { label: "?", text: "\\breve{a}", selectStart: 7, selectEnd: 8 },
        { label: "a?", text: "\\overline{a}", selectStart: 10, selectEnd: 11 }, { label: "a?", text: "\\vec{a}", selectStart: 5, selectEnd: 6 },
        { label: "37?", text: "37^{\\circ}" }, { label: "abc?", text: "\\overleftrightarrow{abc}", selectStart: 20, selectEnd: 23 },
        { label: "abc?", text: "\\overleftarrow{abc}", selectStart: 15, selectEnd: 18 }, { label: "abc?", text: "\\overrightarrow{abc}", selectStart: 16, selectEnd: 19 },
        { label: "overline", text: "\\overline{abc}", selectStart: 10, selectEnd: 13 }, { label: "underline", text: "\\underline{abc}", selectStart: 11, selectEnd: 14 },
        { label: "overbrace", text: "\\overbrace{abc}", selectStart: 11, selectEnd: 14 }, { label: "underbrace", text: "\\underbrace{abc}", selectStart: 12, selectEnd: 15 },
        { label: "AB?", text: "\\overleftrightarrow{AB}", selectStart: 20, selectEnd: 22 },
      ] },
    ],
  },
  {
    key: "limit",
    titleKey: "liveMarkdown.mathLimit",
    preview: "lim",
    sections: [
      { titleKey: "liveMarkdown.mathSectionLimits", entries: [
        { label: "lim a", text: "\\lim a", selectStart: 5, selectEnd: 6 }, { label: "lim x?0", text: "\\lim_{x \\to 0} ", selectStart: 6, selectEnd: 7 },
        { label: "lim x??", text: "\\lim_{x \\to \\infty} ", selectStart: 6, selectEnd: 7 }, { label: "lim???", text: "\\lim_{x\\to 0}" },
        { label: "max", text: "\\max_{x} ", selectStart: 6, selectEnd: 7 }, { label: "min", text: "\\min_{x} ", selectStart: 6, selectEnd: 7 },
      ] },
      { titleKey: "liveMarkdown.mathSectionLogsExps", entries: [
        { label: "log?b", text: "\\log_{a} b", selectStart: 6, selectEnd: 7 }, { label: "lg?b", text: "\\lg_{a} b", selectStart: 5, selectEnd: 6 },
        { label: "ln?b", text: "\\ln_{a} b", selectStart: 5, selectEnd: 6 }, { label: "exp a", text: "\\exp a", selectStart: 5, selectEnd: 6 },
      ] },
      { titleKey: "liveMarkdown.mathSectionBounds", entries: [
        { label: "min x", text: "\\min x", selectStart: 5, selectEnd: 6 }, { label: "max y", text: "\\max y", selectStart: 5, selectEnd: 6 },
        { label: "sup t", text: "\\sup t", selectStart: 5, selectEnd: 6 }, { label: "inf s", text: "\\inf s", selectStart: 5, selectEnd: 6 },
        { label: "lim u", text: "\\lim u", selectStart: 5, selectEnd: 6 }, { label: "lim sup", text: "\\limsup w", selectStart: 8, selectEnd: 9 },
        { label: "lim inf", text: "\\liminf v", selectStart: 8, selectEnd: 9 }, { label: "dim p", text: "\\dim p", selectStart: 5, selectEnd: 6 },
        { label: "ker ?", text: "\\ker \\phi" },
      ] },
    ],
  },
  {
    key: "trig",
    titleKey: "liveMarkdown.mathTrig",
    preview: "sin ?",
    sections: [
      { titleKey: "liveMarkdown.mathSectionTrig", entries: [
        { label: "sin ?", text: "\\sin \\alpha" }, { label: "cos ?", text: "\\cos \\alpha" }, { label: "tan ?", text: "\\tan \\alpha" },
        { label: "cot ?", text: "\\cot \\alpha" }, { label: "sec ?", text: "\\sec \\alpha" }, { label: "csc ?", text: "\\csc \\alpha" },
      ] },
      { titleKey: "liveMarkdown.mathSectionInverseTrig", entries: [
        { label: "sin???", text: "\\sin^{-1} \\alpha" }, { label: "cos???", text: "\\cos^{-1} \\alpha" }, { label: "tan???", text: "\\tan^{-1} \\alpha" },
        { label: "cot???", text: "\\cot^{-1} \\alpha" }, { label: "sec???", text: "\\sec^{-1} \\alpha" }, { label: "csc???", text: "\\csc^{-1} \\alpha" },
        { label: "arcsin a", text: "\\arcsin a", selectStart: 8, selectEnd: 9 }, { label: "arccos a", text: "\\arccos a", selectStart: 8, selectEnd: 9 },
        { label: "arctan a", text: "\\arctan a", selectStart: 8, selectEnd: 9 }, { label: "arccot?", text: "\\operatorname{arccot}\\alpha" },
        { label: "arcsec?", text: "\\operatorname{arcsec}\\alpha" }, { label: "arccsc?", text: "\\operatorname{arccsc}\\alpha" },
      ] },
      { titleKey: "liveMarkdown.mathSectionHyperbolic", entries: [
        { label: "sinh ?", text: "\\sinh \\alpha" }, { label: "cosh ?", text: "\\cosh \\alpha" }, { label: "tanh ?", text: "\\tanh \\alpha" },
        { label: "coth ?", text: "\\coth \\alpha" }, { label: "sech?", text: "\\operatorname{sech}\\alpha" }, { label: "csch?", text: "\\operatorname{csch}\\alpha" },
      ] },
      { titleKey: "liveMarkdown.mathSectionInverseHyperbolic", entries: [
        { label: "sinh???", text: "\\sinh^{-1} \\alpha" }, { label: "cosh???", text: "\\cosh^{-1} \\alpha" }, { label: "tanh???", text: "\\tanh^{-1} \\alpha" },
        { label: "coth???", text: "\\coth^{-1} \\alpha" }, { label: "sech???", text: "\\operatorname{sech}^{-1} \\alpha" }, { label: "csch???", text: "\\operatorname{csch}^{-1} \\alpha" },
      ] },
    ],
  },
);


MATH_TOOL_GROUPS.push(
  {
    key: "integral",
    titleKey: "liveMarkdown.mathIntegral",
    preview: "???",
    sections: [
      { titleKey: "liveMarkdown.mathSectionIntegral", entries: [
        { label: "?", text: "\\int " }, { label: "?a?", text: "\\int_{a}^{b} ", selectStart: 6, selectEnd: 7 }, { label: "???", text: "\\int\\limits_{a}^{b} ", selectStart: 13, selectEnd: 14 },
      ] },
      { titleKey: "liveMarkdown.mathSectionDoubleIntegral", entries: [
        { label: "?", text: "\\iint " }, { label: "?a?", text: "\\iint_{a}^{b} ", selectStart: 7, selectEnd: 8 }, { label: "???", text: "\\iint\\limits_{a}^{b} ", selectStart: 14, selectEnd: 15 },
      ] },
      { titleKey: "liveMarkdown.mathSectionTripleIntegral", entries: [
        { label: "?", text: "\\iiint " }, { label: "?a?", text: "\\iiint_{a}^{b} ", selectStart: 8, selectEnd: 9 }, { label: "???", text: "\\iiint\\limits_{a}^{b} ", selectStart: 15, selectEnd: 16 },
      ] },
      { titleKey: "liveMarkdown.mathSectionClosedIntegral", entries: [
        { label: "?", text: "\\oint " }, { label: "?C", text: "\\oint_C " }, { label: "?", text: "\\oiint " }, { label: "?", text: "\\oiiint " },
        { label: "dx", text: "\\, dx" }, { label: "dy", text: "\\, dy" }, { label: "dz", text: "\\, dz" },
      ] },
    ],
  },
  {
    key: "large",
    titleKey: "liveMarkdown.mathLargeOperator",
    preview: "??",
    sections: [
      { titleKey: "liveMarkdown.mathSectionSummation", entries: [
        { label: "?", text: "\\sum " }, { label: "???", text: "\\sum_{a}^{b} ", selectStart: 6, selectEnd: 7 }, { label: "???", text: "\\sum\\limits_{a}^{b} ", selectStart: 13, selectEnd: 14 },
      ] },
      { titleKey: "liveMarkdown.mathSectionProduct", entries: [
        { label: "?", text: "\\prod " }, { label: "???", text: "\\prod_{a}^{b} ", selectStart: 7, selectEnd: 8 }, { label: "???", text: "\\prod\\limits_{a}^{b} ", selectStart: 14, selectEnd: 15 },
        { label: "?", text: "\\coprod " }, { label: "???", text: "\\coprod_{a}^{b} ", selectStart: 9, selectEnd: 10 }, { label: "???", text: "\\coprod\\limits_{a}^{b} ", selectStart: 16, selectEnd: 17 },
      ] },
      { titleKey: "liveMarkdown.mathSectionUnionIntersection", entries: [
        { label: "?", text: "\\cup" }, { label: "???", text: "\\cup_{a}^{b} ", selectStart: 6, selectEnd: 7 }, { label: "???", text: "\\cup\\limits_{a}^{b} ", selectStart: 13, selectEnd: 14 },
        { label: "?", text: "\\cap" }, { label: "???", text: "\\cap_{a}^{b} ", selectStart: 6, selectEnd: 7 }, { label: "???", text: "\\cap\\limits_{a}^{b} ", selectStart: 13, selectEnd: 14 },
        { label: "?", text: "\\bigcup" }, { label: "?", text: "\\bigcap" },
      ] },
      { titleKey: "liveMarkdown.mathSectionLogicalOperators", entries: [
        { label: "?", text: "\\bigvee" }, { label: "???", text: "\\bigvee_{a}^{b} ", selectStart: 9, selectEnd: 10 }, { label: "???", text: "\\bigvee\\limits_{a}^{b} ", selectStart: 16, selectEnd: 17 },
        { label: "?", text: "\\bigwedge" }, { label: "???", text: "\\bigwedge_{a}^{b} ", selectStart: 11, selectEnd: 12 }, { label: "???", text: "\\bigwedge\\limits_{a}^{b} ", selectStart: 18, selectEnd: 19 },
      ] },
    ],
  },
  {
    key: "brackets",
    titleKey: "liveMarkdown.mathBrackets",
    preview: "{[()]}",
    sections: [
      { titleKey: "liveMarkdown.mathSectionBrackets", entries: [
        { label: "( )", text: "\\left( x \\right)", selectStart: 7, selectEnd: 8 }, { label: "[ ]", text: "\\left[ x \\right]", selectStart: 7, selectEnd: 8 },
        { label: "? ?", text: "\\left\\langle x \\right\\rangle", selectStart: 14, selectEnd: 15 }, { label: "{ }", text: "\\left\\{ x \\right\\}", selectStart: 8, selectEnd: 9 },
        { label: "| |", text: "\\left| x \\right|", selectStart: 7, selectEnd: 8 }, { label: "? ?", text: "\\left\\| x \\right\\|", selectStart: 8, selectEnd: 9 },
        { label: "? ?", text: "\\left\\lfloor x \\right\\rfloor", selectStart: 13, selectEnd: 14 }, { label: "? ?", text: "\\left\\lceil x \\right\\rceil", selectStart: 12, selectEnd: 13 },
      ] },
      { titleKey: "liveMarkdown.mathSectionCommons", entries: [
        { label: "(n/r)", text: "\\binom{n}{r}", selectStart: 7, selectEnd: 8 }, { label: "[0,1)", text: "[0,1)" },
        { label: "??|", text: "\\langle \\psi |" }, { label: "|??", text: "| \\psi \\rangle" }, { label: "??|??", text: "\\langle \\psi | \\psi \\rangle" },
      ] },
    ],
  },
  {
    key: "matrix",
    titleKey: "liveMarkdown.mathMatrix",
    preview: "[0 1; 1 0]",
    sections: [
      { titleKey: "liveMarkdown.mathSectionMatrix", entries: [
        { label: "?", text: "\\cdots" }, { label: "[?]", text: "\\begin{bmatrix} \\cdots \\\\ \\cdots \\end{bmatrix}" },
        { label: "(?)", text: "\\begin{pmatrix} \\ddots \\end{pmatrix}" }, { label: "|?|", text: "\\begin{vmatrix} \\ddots \\end{vmatrix}" },
        { label: "???", text: "\\begin{Vmatrix} \\ddots \\end{Vmatrix}" },
        { label: "2?2", text: "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}", selectStart: 16, selectEnd: 17 },
        { label: "3?3", text: "\\begin{bmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{bmatrix}", selectStart: 16, selectEnd: 17 },
        { label: "(matrix)", text: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}", selectStart: 16, selectEnd: 17 },
        { label: "|matrix|", text: "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}", selectStart: 16, selectEnd: 17 },
        { label: "cases", text: "\\begin{cases} x, & x > 0 \\\\ -x, & x \\le 0 \\end{cases}", selectStart: 14, selectEnd: 15 },
        { label: "aligned", text: "\\begin{aligned} y &= mx + b \\\\ z &= ax + c \\end{aligned}", selectStart: 16, selectEnd: 17 },
      ] },
    ],
  },
);
const calloutOptions = computed(() => ([
  { value: "NOTE", label: t("liveMarkdown.calloutNote"), icon: BadgeInfo },
  { value: "TIP", label: t("liveMarkdown.calloutTip"), icon: Lightbulb },
  { value: "IMPORTANT", label: t("liveMarkdown.calloutImportant"), icon: OctagonAlert },
  { value: "WARNING", label: t("liveMarkdown.calloutWarning"), icon: TriangleAlert },
  { value: "CAUTION", label: t("liveMarkdown.calloutCaution"), icon: ShieldAlert },
] as const));
const blockStyleOptions = computed(() => ([
  { value: "paragraph", label: t("liveMarkdown.paragraph"), icon: Pilcrow },
  { value: "h1", label: t("liveMarkdown.heading1"), icon: Heading1 },
  { value: "h2", label: t("liveMarkdown.heading2"), icon: Heading2 },
  { value: "h3", label: t("liveMarkdown.heading3"), icon: Heading3 },
  { value: "h4", label: t("liveMarkdown.heading4"), icon: Heading4 },
  { value: "h5", label: t("liveMarkdown.heading5"), icon: Heading5 },
  { value: "h6", label: t("liveMarkdown.heading6"), icon: Heading6 },
] as const));
const activeBlockStyle = computed(() => {
  if (activeBlocks.value.h1) return "h1";
  if (activeBlocks.value.h2) return "h2";
  if (activeBlocks.value.h3) return "h3";
  if (activeBlocks.value.h4) return "h4";
  if (activeBlocks.value.h5) return "h5";
  if (activeBlocks.value.h6) return "h6";
  return "paragraph";
});
const activeTable = computed(() => tableInteractionState.value);
const tableAdvancedTitle = computed(() => activeTable.value.kind === "complex"
  ? ""
  : t("liveMarkdown.complexTableOnly"));
const activeMathGroup = computed(() => MATH_TOOL_GROUPS.find((group) => group.key === mathGroupOpen.value) || null);
const activeMathSections = computed<MathToolPanelSection[]>(() => {
  const group = activeMathGroup.value;
  return group?.sections.filter((section) => section.entries.length > 0) || [];
});
const contextToolbarClass = computed(() => {
  if (activeMathBlock.value) return "live-context-toolbar-math";
  if (activeTable.value.active) return "live-context-toolbar-table";
  if (activeImage.value) return "live-context-toolbar-image";
  return "live-context-toolbar-insert";
});
const MATH_GROUP_PREVIEW_LATEX: Record<string, string> = {
  symbols: "\\pm\\;\\infty\\;\\to",
  greek: "\\alpha\\beta\\Gamma\\Omega",
  fraction: "\\frac{x}{y}",
  root: "\\sqrt{x}",
  limit: "\\lim",
  trig: "\\sin\\theta",
  integral: "\\int_a^b",
  large: "\\sum",
  brackets: "\\{[()]\\}",
  matrix: "\\begin{bmatrix}0&1\\\\1&0\\end{bmatrix}",
};
const assetUrlCache = createLruStringCache(50);
let view: EditorView | null = null;
let mathToolbarResizeObserver: ResizeObserver | null = null;
let syncingFromEditor = false;
let isComposing = false;
let assetResolveTimer: number | null = null;
let modelUpdateTimer: number | null = null;
let renderedTextRevealTimer: number | null = null;
let renderedTextRevealUntil = 0;
let renderedTextHideTimer: number | null = null;
let renderedTextHideUntil = 0;
let renderedTextHideSelection: EditorSelection | null = null;

const placeholderText = computed(() => props.placeholder || t("liveMarkdown.placeholder"));
const markdownFontFamilyCss = computed(() => markdownBodyFontFamily(
  props.settings?.markdown_western_font_family || props.settings?.markdown_font_family || "current",
  props.settings?.markdown_chinese_font_family || "current",
));
const markdownCodeFontFamilyCss = computed(() => markdownCodeFontFamily(props.settings?.markdown_code_font_family || "Consolas"));
const markdownLineHeight = computed(() => scaledMarkdownLineHeight(props.settings?.markdown_line_height, props.settings?.markdown_default_font_size));
const markdownCodeFontScale = computed(() => props.settings?.markdown_code_font_scale || 0.86);
const markdownCodeLineHeight = computed(() => props.settings?.markdown_code_line_height || 1.22);

const assetUrlEffect = StateEffect.define<Map<string, string>>();
const renderedTextRevealRefreshEffect = StateEffect.define<void>();
const RENDERED_TEXT_REVEAL_DELAY_MS = 300;
const RENDERED_TEXT_HIDE_DELAY_MS = 300;
const VIEWPORT_STABILIZING_WIDGET_SELECTOR = [
  ".sd-live-block",
  ".sd-live-block-editor-widget",
  ".sd-live-block-content",
  ".sd-table-widget",
  ".sd-math",
  ".sd-image-frame",
  ".sd-image-widget",
  ".markdown-html-image",
  ".markdown-html-image-block",
].join(",");
let preserveViewportSelectionUntil = 0;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizedMathPreviewLatex(latex: string) {
  return latex
    .replace(/\\cup\\limits/g, "\\bigcup\\limits")
    .replace(/\\cap\\limits/g, "\\bigcap\\limits")
    .replace(/\\vee\\limits/g, "\\bigvee\\limits")
    .replace(/\\wedge\\limits/g, "\\bigwedge\\limits");
}

function renderMathToolHtml(latex: string) {
  const source = normalizedMathPreviewLatex(latex.trim() || " ");
  try {
    const html = katex.renderToString(source, {
      displayMode: false,
      throwOnError: false,
      strict: false,
      trust: false,
    });
    return html.includes("katex-error") ? escapeHtml(source) : html;
  } catch {
    return escapeHtml(source);
  }
}

function mathGroupPreviewHtml(group: MathToolGroup) {
  return renderMathToolHtml(MATH_GROUP_PREVIEW_LATEX[group.key] || group.preview);
}

function mathEntryPreviewHtml(entry: MathToolEntry) {
  const label = entry.label.trim();
  if (!label.includes("?") && /^[A-Za-z][A-Za-z\s-]{3,}$/.test(label)) return escapeHtml(label);
  return renderMathToolHtml(entry.text);
}

function mathEntryPreviewClass(entry: MathToolEntry) {
  const text = entry.text.trim();
  return {
    compact: text.length > 12 || /\\limits|\\operatorname|\\begin|\\frac|\\sqrt\[/.test(text),
    wide: text.length > 9 || /\\limits|\\operatorname|\\begin|\\frac|\\sqrt\[|\\left/.test(text),
  };
}

function editorSource() {
  return view?.state.doc.toString() || currentMarkdown.value;
}

function tableRangeAtPosition(source: string, position: number): SourceSelection | null {
  const lines = source.split("\n");
  let offset = 0;
  for (let index = 0; index < lines.length - 1; index += 1) {
    const separator = lines[index + 1].trim();
    if (!/^\s*\|.*\|\s*$/.test(lines[index]) || !/^\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)*\s*\|?\s*$/.test(separator)) {
      offset += lines[index].length + 1;
      continue;
    }
    let endIndex = index + 1;
    while (endIndex + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[endIndex + 1])) endIndex += 1;
    const start = offset;
    let end = offset;
    for (let lineIndex = index; lineIndex <= endIndex; lineIndex += 1) {
      end += lines[lineIndex].length;
      if (lineIndex < endIndex) end += 1;
    }
    if (position >= start && position <= end) return { start, end };
    for (let lineIndex = index; lineIndex <= endIndex; lineIndex += 1) offset += lines[lineIndex].length + 1;
    index = endIndex;
  }
  return null;
}

function redirectHiddenTableInput() {
  return EditorState.transactionFilter.of((transaction) => {
    if (isComposing || view?.composing) return transaction;
    if (!transaction.docChanged || !transaction.isUserEvent("input.type")) return transaction;
    const source = transaction.startState.doc.toString();
    const selection = transaction.startState.selection.main;
    if (!selection.empty) return transaction;
    const table = tableRangeAtPosition(source, selection.from);
    if (!table) return transaction;

    let inserted = "";
    let simpleInsert = false;
    transaction.changes.iterChanges((fromA, toA, _fromB, _toB, insert) => {
      if (fromA === toA && fromA === selection.from && !simpleInsert) {
        inserted = insert.toString();
        simpleInsert = true;
      } else {
        simpleInsert = false;
      }
    });
    if (!simpleInsert || !inserted) return transaction;

    const needsBreak = table.end >= source.length || source[table.end] === "\n" ? "" : "\n";
    const insert = `${needsBreak}${inserted}`;
    return {
      changes: { from: table.end, insert },
      selection: { anchor: table.end + insert.length },
      scrollIntoView: true,
    };
  });
}

function replaceCodeLigatureInput() {
  return EditorState.transactionFilter.of((transaction) => {
    if (isComposing || view?.composing) return transaction;
    if (props.settings?.markdown_code_ligatures === false) return transaction;
    if (!transaction.docChanged || !transaction.isUserEvent("input.type")) return transaction;
    const selection = transaction.startState.selection.main;
    if (!selection.empty) return transaction;

    let insertedText = "";
    let simpleInsert = false;
    transaction.changes.iterChanges((fromA, toA, _fromB, _toB, insert) => {
      if (fromA === toA && fromA === selection.from && !simpleInsert) {
        insertedText = insert.toString();
        simpleInsert = true;
      } else {
        simpleInsert = false;
      }
    });
    if (!simpleInsert) return transaction;

    const replacement = markdownCodeLigatureReplacement(transaction.startState.doc.toString(), selection.from, insertedText);
    if (!replacement) return transaction;
    return {
      changes: { from: replacement.start, to: replacement.end, insert: replacement.text },
      selection: { anchor: replacement.start + replacement.text.length },
      scrollIntoView: true,
    };
  });
}

function autoPairBracketInput() {
  return EditorState.transactionFilter.of((transaction) => {
    if (isComposing || view?.composing) return transaction;
    if (!transaction.docChanged || !transaction.isUserEvent("input.type")) return transaction;
    const selection = transaction.startState.selection.main;
    let insertedText = "";
    let simpleInput = false;
    transaction.changes.iterChanges((fromA, toA, _fromB, _toB, insert) => {
      if (fromA === selection.from && toA === selection.to && !simpleInput) {
        insertedText = insert.toString();
        simpleInput = true;
      } else {
        simpleInput = false;
      }
    });
    const close = AUTO_PAIR_BRACKETS[insertedText];
    if (!simpleInput || !close) return transaction;
    const selected = transaction.startState.doc.sliceString(selection.from, selection.to);
    return {
      changes: { from: selection.from, to: selection.to, insert: `${insertedText}${selected}${close}` },
      selection: selected
        ? { anchor: selection.from + insertedText.length, head: selection.to + insertedText.length }
        : { anchor: selection.from + insertedText.length },
      scrollIntoView: true,
    };
  });
}

function rangesIntersect(leftFrom: number, leftTo: number, rightFrom: number, rightTo: number) {
  return leftFrom < rightTo && leftTo > rightFrom;
}

function positionInsideRange(position: number, from: number, to: number) {
  return position > from && position < to;
}

function protectedBlockMarkerRanges(source: string) {
  return [
    ...findBlockMathRanges(source).flatMap((range) => [
      { from: range.openMarkStart, to: range.openMarkEnd },
      { from: range.closeMarkStart, to: range.closeMarkEnd },
    ]),
    ...findFencedCodeRanges(source).flatMap((range) => [
      { from: range.openMarkStart, to: range.openMarkEnd },
      { from: range.closeMarkStart, to: range.closeMarkEnd },
    ]),
  ];
}

function protectBlockBoundaryInput() {
  return EditorState.transactionFilter.of((transaction) => {
    if (isComposing || view?.composing) return transaction;
    if (!transaction.docChanged) return transaction;
    if (!transaction.isUserEvent("input") && !transaction.isUserEvent("delete")) return transaction;
    const protectedRanges = protectedBlockMarkerRanges(transaction.startState.doc.toString());
    if (!protectedRanges.length) return transaction;
    let touchesProtectedMarker = false;
    transaction.changes.iterChanges((fromA, toA) => {
      if (touchesProtectedMarker) return;
      touchesProtectedMarker = protectedRanges.some((range) =>
        fromA === toA
          ? positionInsideRange(fromA, range.from, range.to)
          : rangesIntersect(fromA, toA, range.from, range.to));
    });
    return touchesProtectedMarker ? [] : transaction;
  });
}

function hasUnclosedFenceBeforeLine(source: string, lineStart: number) {
  const before = source.slice(0, lineStart);
  const lines = before.split("\n");
  let openFence: string | null = null;
  for (const line of lines) {
    if (!openFence) {
      const openMatch = line.match(/^([ \t]{0,3})(`{3,})([^`]*)$/);
      if (openMatch) openFence = openMatch[2];
      continue;
    }
    const closeMatch = line.match(/^([ \t]{0,3})(`{3,})\s*$/);
    if (closeMatch && closeMatch[2].length >= openFence.length) openFence = null;
  }
  return Boolean(openFence);
}

function autoCloseFencedCodeInput() {
  return EditorState.transactionFilter.of((transaction) => {
    if (isComposing || view?.composing) return transaction;
    if (!transaction.docChanged || !transaction.isUserEvent("input.type")) return transaction;
    const selection = transaction.startState.selection.main;
    if (!selection.empty) return transaction;
    let insertedText = "";
    let simpleInput = false;
    transaction.changes.iterChanges((fromA, toA, _fromB, _toB, insert) => {
      if (fromA === selection.from && toA === selection.to && !simpleInput) {
        insertedText = insert.toString();
        simpleInput = true;
      } else {
        simpleInput = false;
      }
    });
    if (!simpleInput || insertedText !== "`") return transaction;
    const source = transaction.startState.doc.toString();
    const line = transaction.startState.doc.lineAt(selection.from);
    const beforeCursor = source.slice(line.from, selection.from);
    const afterCursor = source.slice(selection.from, line.to);
    const openMatch = beforeCursor.match(/^([ \t]{0,3})``$/);
    if (!openMatch || afterCursor.trim()) return transaction;
    if (hasUnclosedFenceBeforeLine(source, line.from)) return transaction;
    const indent = openMatch[1] || "";
    return {
      changes: { from: selection.from, to: selection.to, insert: `\`\n\n${indent}\`\`\`` },
      selection: { anchor: selection.from + 1 },
      scrollIntoView: true,
    };
  });
}

function selectionHasRevealableSource(doc: Text, selection: EditorSelection) {
  for (const range of selection.ranges) {
    const from = Math.max(0, Math.min(doc.length, range.from));
    const to = Math.max(0, Math.min(doc.length, range.empty ? range.from : range.to));
    const fromLine = doc.lineAt(from).number;
    const toLine = doc.lineAt(to > from ? Math.max(from, to - 1) : to).number;
    for (let lineNumber = fromLine; lineNumber <= toLine; lineNumber += 1) {
      if (lineHasRevealableSource(doc.line(lineNumber).text)) return true;
    }
  }
  return false;
}

function selectionsEqual(left: EditorSelection, right: EditorSelection) {
  if (left.ranges.length !== right.ranges.length) return false;
  return left.ranges.every((range, index) => {
    const other = right.ranges[index];
    return range.anchor === other.anchor && range.head === other.head;
  });
}

function deferRenderedTextRevealOnPointerSelection() {
  return EditorState.transactionExtender.of((transaction) => {
    if (!transaction.selection) return null;
    if (isComposing || view?.composing) return null;
    const selection = transaction.newSelection.main;
    if (transaction.docChanged) {
      clearRenderedTextHideTimer();
      renderedTextHideSelection = null;
    } else if (selectionHasRevealableSource(transaction.newDoc, transaction.newSelection)) {
      if (
        selectionHasRevealableSource(transaction.startState.doc, transaction.startState.selection)
        && !selectionsEqual(transaction.startState.selection, transaction.newSelection)
        && view
      ) {
        renderedTextHideSelection = transaction.startState.selection;
        deferRenderedTextHide(view);
      } else {
        clearRenderedTextHideTimer();
        renderedTextHideSelection = null;
      }
    } else if (renderedTextHideSelection && view) {
      deferRenderedTextHide(view);
    }
    if (transaction.isUserEvent("select.pointer") && selection.empty && selectionHasRevealableSource(transaction.newDoc, transaction.newSelection) && view) {
      deferRenderedTextReveal(view);
    }
    return null;
  });
}

function markViewportStableForSelection() {
  preserveViewportSelectionUntil = performance.now() + 350;
}

function preserveViewportOnSelectionChange(): Extension {
  return EditorState.transactionExtender.of((transaction) => {
    if (!view || transaction.docChanged || !transaction.selection) return null;
    if (performance.now() > preserveViewportSelectionUntil) return null;
    preserveViewportSelectionUntil = 0;
    return { effects: view.scrollSnapshot() };
  });
}

function documentTextBetween(from: number, to: number) {
  if (!view) return currentMarkdown.value.slice(from, to);
  return view.state.doc.sliceString(Math.max(0, from), Math.min(view.state.doc.length, to));
}

function selectionRange(state = view?.state): SourceSelection {
  if (!state) return { start: 0, end: 0 };
  const range = state.selection.main;
  return { start: range.from, end: range.to };
}

function publishSelection(state = view?.state) {
  if (!state) return;
  emit("selectionChange", selectionRange(state));
}

function dispatchEdit(edit: SourceEdit, focus = true) {
  if (!view) return false;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: edit.value },
    selection: { anchor: edit.selection.start, head: edit.selection.end },
    scrollIntoView: true,
  });
  if (focus) view.focus();
  return true;
}

function replaceSelection(text: string) {
  if (!view) return false;
  const range = view.state.selection.main;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: { anchor: range.from + text.length },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

function runSourceEdit(factory: (source: string, selection: SourceSelection) => SourceEdit | null) {
  if (!view) return false;
  const edit = factory(editorSource(), selectionRange());
  if (!edit) return false;
  return dispatchEdit(edit);
}

function markdownIndentWidth(indent: string) {
  return indent.replace(/\t/g, "    ").length;
}

function lineHasIndentedChild(lines: string[], index: number, indentWidth: number) {
  for (let i = index + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    const match = /^(\s*)/.exec(line);
    const width = markdownIndentWidth(match?.[1] || "");
    if (width <= indentWidth) return false;
    return true;
  }
  return false;
}

function setAllLiveListFolds(source: string, selection: SourceSelection, collapsed: boolean): SourceEdit | null {
  const lines = source.split("\n");
  let changed = false;
  const nextLines = lines.map((line, index) => {
    const match = /^(\s*)([-+*])(\s+)(?!\[[ xX]\](?:\s|$))/.exec(line);
    if (!match) return line;
    const [, indent, marker, gap] = match;
    if (collapsed ? marker === "*" : marker !== "*") return line;
    if (!lineHasIndentedChild(lines, index, markdownIndentWidth(indent))) return line;
    changed = true;
    return `${indent}${collapsed ? "*" : "+"}${gap}${line.slice(match[0].length)}`;
  });
  if (!changed) return null;
  const position = Math.min(selection.start, nextLines.join("\n").length);
  return { value: nextLines.join("\n"), selection: { start: position, end: position } };
}

function expandAllLiveLists() {
  return runSourceEdit((source, selection) => setAllLiveListFolds(source, selection, false));
}

function collapseAllLiveLists() {
  return runSourceEdit((source, selection) => setAllLiveListFolds(source, selection, true));
}

function closeAllLiveMoreTools() {
  closeLiveMoreTools();
  closeLiveInsertMoreTools();
  closeLiveTableMoreTools();
  closeLiveImageMoreTools();
}

function runLiveMoreTool(action: () => unknown) {
  closeAllLiveMoreTools();
  action();
}

function setBlockStyle(value: string) {
  const level = value === "paragraph" ? 0 : Number(value.replace("h", ""));
  if (!Number.isInteger(level) || level < 0 || level > 6) return false;
  return runSourceEdit((source, selection) => setHeading(source, selection, level));
}

function currentLineText(state = view?.state) {
  if (!state) return "";
  const line = state.doc.lineAt(state.selection.main.from);
  return line.text;
}

function activeFontColorAt(source: string, position: number) {
  const safePosition = Math.max(0, Math.min(position, source.length));
  const lineStart = source.lastIndexOf("\n", Math.max(0, safePosition - 1)) + 1;
  const nextBreak = source.indexOf("\n", safePosition);
  const lineEnd = nextBreak < 0 ? source.length : nextBreak;
  const line = source.slice(lineStart, lineEnd);
  const pattern = /<span\s+style=(["'])color:\s*(#[0-9a-f]{6}|black|red|green|blue|purple)\s*;?\1>([^\n]*?\S[^\n]*?)<\/span>/gi;
  for (const match of line.matchAll(pattern)) {
    const start = lineStart + (match.index || 0);
    const end = start + match[0].length;
    if (safePosition >= start && safePosition <= end) return (match[2] || "").toLowerCase();
  }
  return "";
}

function activeDelimitedMarkAt(source: string, position: number, marker: string) {
  const safePosition = Math.max(0, Math.min(position, source.length));
  const lineStart = source.lastIndexOf("\n", Math.max(0, safePosition - 1)) + 1;
  const nextBreak = source.indexOf("\n", safePosition);
  const lineEnd = nextBreak < 0 ? source.length : nextBreak;
  const line = source.slice(lineStart, lineEnd);
  let searchFrom = 0;
  while (searchFrom < line.length) {
    const open = line.indexOf(marker, searchFrom);
    if (open < 0) return false;
    const close = line.indexOf(marker, open + marker.length);
    if (close < 0) return false;
    const start = lineStart + open + marker.length;
    const end = lineStart + close;
    if (safePosition >= start && safePosition <= end) return true;
    searchFrom = close + marker.length;
  }
  return false;
}

function updateToolbarState() {
  if (!view || isComposing || view.composing) return;
  const selection = selectionRange();
  hasSelection.value = selection.start !== selection.end;
  const position = selection.start;
  const source = editorSource();
  const line = currentLineText();
  const before = documentTextBetween(Math.max(0, position - 80), position);
  const after = documentTextBetween(position, Math.min(view.state.doc.length, position + 160));
  const linkFrom = Math.max(0, position - 512);
  const linkSegment = documentTextBetween(linkFrom, Math.min(view.state.doc.length, position + 512));
  activeMarks.value = {
    strong: before.includes("**") || after.includes("**"),
    em: /\*(?!\*)/.test(before) || /(?:^|[^*])\*/.test(after),
    underline: before.lastIndexOf("<u>") > before.lastIndexOf("</u>"),
    highlight: activeDelimitedMarkAt(source, position, "=="),
    strike: activeDelimitedMarkAt(source, position, "~~"),
    code: before.includes("`") || after.includes("`"),
    link: Boolean(findLinkAt(linkSegment, position - linkFrom, 512)),
  };
  activeFontColor.value = activeFontColorAt(source, position);
  activeBlocks.value = {
    paragraph: !/^\s*(#{1,6}\s+|>|[-+*]\s+|\d+\.\s+)/.test(line),
    h1: /^\s*#\s+/.test(line),
    h2: /^\s*##\s+/.test(line),
    h3: /^\s*###\s+/.test(line),
    h4: /^\s*####\s+/.test(line),
    h5: /^\s*#####\s+/.test(line),
    h6: /^\s*######\s+/.test(line),
    blockquote: /^\s*>\s?/.test(line),
    bulletList: /^\s*[-+*]\s+/.test(line),
    orderedList: /^\s*\d+\.\s+/.test(line),
  };
  updateActiveImageFromSelection();
  updateTableToolbarState();
  updateActiveMathBlockFromSelection();
  updateMathPreview();
}

type MathSourceRange = {
  start: number;
  end: number;
  contentStart: number;
  contentEnd: number;
  openMarkStart: number;
  openMarkEnd: number;
  closeMarkStart: number;
  closeMarkEnd: number;
  latex: string;
  display: boolean;
};

type FencedCodeSourceRange = {
  start: number;
  end: number;
  contentStart: number;
  contentEnd: number;
  openMarkStart: number;
  openMarkEnd: number;
  closeMarkStart: number;
  closeMarkEnd: number;
};

function findMathAt(source: string, position: number): MathSourceRange | null {
  for (const range of findBlockMathRanges(source)) {
    if (position >= range.start && position <= range.end) return range;
  }
  const lineStart = source.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const nextLineBreak = source.indexOf("\n", position);
  const lineEnd = nextLineBreak === -1 ? source.length : nextLineBreak;
  const line = source.slice(lineStart, lineEnd);
  const inlinePattern = /(^|[^\\])\$([^$\n]+?)\$/g;
  for (const match of line.matchAll(inlinePattern)) {
    const prefixLength = match[1].length;
    const start = lineStart + (match.index || 0) + prefixLength;
    const end = start + match[0].length - prefixLength;
    if (position >= start && position <= end) {
      return {
        start,
        end,
        contentStart: start + 1,
        contentEnd: end - 1,
        openMarkStart: start,
        openMarkEnd: start + 1,
        closeMarkStart: end - 1,
        closeMarkEnd: end,
        latex: match[2],
        display: false,
      };
    }
  }
  return null;
}

function findBlockMathRanges(source: string): MathSourceRange[] {
  const ranges: MathSourceRange[] = [];
  const pattern = /(^|\n)([ \t]*\$\$[ \t]*)(?:\n|$)([\s\S]*?)(^|\n)([ \t]*\$\$[ \t]*)(?=\n|$)/gm;
  for (const match of source.matchAll(pattern)) {
    const prefixLength = match[1].length;
    const start = (match.index || 0) + prefixLength;
    const openLine = match[2] || "$$";
    const body = match[3] || "";
    const beforeClose = match[4] || "";
    const closeLine = match[5] || "$$";
    const openMarkStart = start + openLine.indexOf("$$");
    const contentStart = start + openLine.length + (source[start + openLine.length] === "\n" ? 1 : 0);
    const contentEnd = contentStart + body.length;
    const closeLineStart = contentEnd + beforeClose.length;
    const closeMarkStart = closeLineStart + closeLine.indexOf("$$");
    const end = closeLineStart + closeLine.length;
    ranges.push({
      start,
      end,
      contentStart,
      contentEnd,
      openMarkStart,
      openMarkEnd: openMarkStart + 2,
      closeMarkStart,
      closeMarkEnd: closeMarkStart + 2,
      latex: body.trim(),
      display: true,
    });
  }
  return ranges;
}

function findFencedCodeRanges(source: string): FencedCodeSourceRange[] {
  const ranges: FencedCodeSourceRange[] = [];
  const lines = source.split("\n");
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const openMatch = line.match(/^([ \t]{0,3})(`{3,})([^`]*)$/);
    if (!openMatch) {
      offset += line.length + 1;
      continue;
    }
    const fence = openMatch[2];
    const openLineStart = offset;
    const openMarkStart = openLineStart + openMatch[1].length;
    let closeLineIndex = -1;
    let closeLineStart = 0;
    let scanOffset = offset + line.length + 1;
    for (let scan = index + 1; scan < lines.length; scan += 1) {
      const closeMatch = lines[scan].match(/^([ \t]{0,3})(`{3,})\s*$/);
      if (closeMatch && closeMatch[2].length >= fence.length) {
        closeLineIndex = scan;
        closeLineStart = scanOffset;
        break;
      }
      scanOffset += lines[scan].length + 1;
    }
    if (closeLineIndex < 0) {
      offset += line.length + 1;
      continue;
    }
    const closeLine = lines[closeLineIndex];
    const closeMatch = closeLine.match(/^([ \t]{0,3})(`{3,})/);
    const closeMarkStart = closeLineStart + (closeMatch?.[1].length || 0);
    const contentStart = openLineStart + line.length + 1;
    const contentEnd = closeLineStart > contentStart ? closeLineStart - 1 : contentStart;
    ranges.push({
      start: openLineStart,
      end: closeLineStart + closeLine.length,
      contentStart,
      contentEnd,
      openMarkStart,
      openMarkEnd: openMarkStart + fence.length,
      closeMarkStart,
      closeMarkEnd: closeMarkStart + (closeMatch?.[2].length || fence.length),
    });
    while (index < closeLineIndex) {
      offset += lines[index].length + 1;
      index += 1;
    }
    offset += lines[index].length + 1;
  }
  return ranges;
}

function updateActiveMathBlockFromSelection() {
  if (!view) {
    activeMathBlock.value = null;
    mathGroupOpen.value = null;
    return;
  }
  const position = view.state.selection.main.from;
  const range = findMathAt(view.state.doc.toString(), position);
  const previous = activeMathBlock.value;
  activeMathBlock.value = range || null;
  if (!range || previous?.start !== range.start || previous?.end !== range.end) {
    mathGroupOpen.value = null;
  }
}

function closeMathPreview() {
  if (!mathPreview.value.open) return;
  mathPreview.value = { ...mathPreview.value, open: false, latex: "", start: 0, end: 0 };
}

function renderMathPreview() {
  const root = mathPreviewRoot.value;
  if (!root || !mathPreview.value.open) return;
  root.replaceChildren();
  try {
    katex.render(mathPreview.value.latex || " ", root, {
      displayMode: mathPreview.value.display,
      throwOnError: false,
      strict: false,
      trust: false,
    });
  } catch {
    root.textContent = mathPreview.value.latex;
  }
}

function updateMathPreview() {
  if (!view) return;
  const position = view.state.selection.main.from;
  const range = findMathAt(view.state.doc.toString(), position);
  if (!range || range.display) {
    closeMathPreview();
    return;
  }
  const coords = view.coordsAtPos(Math.min(Math.max(position, range.start), view.state.doc.length));
  if (!coords) {
    closeMathPreview();
    return;
  }
  mathPreview.value = {
    open: true,
    top: coords.bottom + 8,
    left: Math.min(Math.max(12, coords.left), Math.max(12, window.innerWidth - 360)),
    latex: view.state.doc.sliceString(range.contentStart, range.contentEnd).trim(),
    display: range.display,
    start: range.start,
    end: range.end,
  };
  void nextTick(renderMathPreview);
}

function setLink() {
  if (!view) return;
  const source = editorSource();
  const range = findLinkAt(source, view.state.selection.main.from);
  const href = window.prompt(t("liveMarkdown.linkUrlPrompt"), range?.href || "");
  if (href === null) return;
  dispatchEdit(setLinkHref(source, selectionRange(), href, range));
}

async function setLinkFromClipboard() {
  if (!view) return false;
  const selection = selectionRange();
  if (selection.start !== selection.end) {
    const href = (await navigator.clipboard?.readText().catch(() => "") || "").trim();
    if (href) {
      dispatchEdit(setLinkHref(editorSource(), selection, href));
      return true;
    }
  }
  setLink();
  return true;
}

function insertMathFormula() {
  runSourceEdit((source, selection) => toggleWrappedMarkdown(source, selection, "$"));
}

function insertMathBlockFormula() {
  runSourceEdit((source, selection) => insertMathBlockSource(source, selection));
}

function updateMathMenuPosition(target: EventTarget | null) {
  const rect = (target as HTMLElement | null)?.getBoundingClientRect();
  const compact = window.innerWidth <= 720;
  const margin = compact ? 12 : 24;
  const top = (rect?.bottom || 80) + 6;
  const width = Math.max(compact ? 240 : 320, Math.min(compact ? window.innerWidth * 0.9 : window.innerWidth * 0.72, compact ? 640 : 776, window.innerWidth - margin * 2));
  const maxHeight = Math.max(180, Math.min(compact ? window.innerHeight * 0.62 : window.innerHeight * 0.55, compact ? 420 : 560, window.innerHeight - top - margin));
  mathMenuPosition.value = {
    top,
    width,
    maxHeight,
    left: Math.min(Math.max(margin, rect ? rect.left : margin), Math.max(margin, window.innerWidth - width - margin)),
  };
}

function updateMathToolbarClearance() {
  const element = mathToolbarRoot.value;
  if (!element || !activeMathBlock.value) return;
  mathToolbarClearance.value = Math.ceil(element.getBoundingClientRect().height);
}

function observeMathToolbar(element: HTMLDivElement | null) {
  mathToolbarResizeObserver?.disconnect();
  mathToolbarResizeObserver = null;
  if (!element) return;
  mathToolbarResizeObserver = new ResizeObserver(updateMathToolbarClearance);
  mathToolbarResizeObserver.observe(element);
  void nextTick(updateMathToolbarClearance);
}

function toggleMathGroup(group: MathToolGroup, event: MouseEvent) {
  if (mathGroupOpen.value === group.key) {
    mathGroupOpen.value = null;
    return;
  }
  updateMathMenuPosition(event.currentTarget);
  mathGroupOpen.value = group.key;
}

function previewMathGroupOnHover(group: MathToolGroup, event: MouseEvent) {
  if (!mathGroupOpen.value || mathGroupOpen.value === group.key) return;
  updateMathMenuPosition(event.currentTarget);
  mathGroupOpen.value = group.key;
}

function insertMathBlockSnippet(text: string, selectStart = text.length, selectEnd = selectStart) {
  if (!view || !activeMathBlock.value) return false;
  const block = activeMathBlock.value;
  const selection = view.state.selection.main;
  const from = Math.min(Math.max(selection.from, block.contentStart), block.contentEnd);
  const to = Math.min(Math.max(selection.to, block.contentStart), block.contentEnd);
  view.dispatch({
    changes: { from, to, insert: text },
    selection: {
      anchor: from + Math.min(selectStart, text.length),
      head: from + Math.min(selectEnd, text.length),
    },
    scrollIntoView: true,
  });
  view.focus();
  updateActiveMathBlockFromSelection();
  return true;
}

function insertMathBlockTemplate(before: string, after = "", fallback = "x") {
  if (!view || !activeMathBlock.value) return false;
  const block = activeMathBlock.value;
  const selection = view.state.selection.main;
  const from = Math.min(Math.max(selection.from, block.contentStart), block.contentEnd);
  const to = Math.min(Math.max(selection.to, block.contentStart), block.contentEnd);
  const selected = view.state.doc.sliceString(from, to);
  const content = selected || fallback;
  const text = `${before}${content}${after}`;
  const start = before.length;
  return insertMathBlockSnippet(text, start, start + content.length);
}

function insertCallout(kind: "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION") {
  calloutKind.value = kind;
  runSourceEdit((source, selection) => insertCalloutBlock(source, selection, kind));
}

function insertCalloutFromMore(value: string) {
  closeAllLiveMoreTools();
  insertCallout(value as "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION");
}

function requestImageInsertion() {
  flushModelUpdate();
  emit("selectionChange", selectionRange());
  emit("imageInsert", { selection: selectionRange(), kind: "image" });
}

function requestFormulaOcrInsertion() {
  flushModelUpdate();
  emit("selectionChange", selectionRange());
  emit("imageInsert", { selection: selectionRange(), kind: "formula" });
}

function setTableHover(rows: number, cols: number) {
  tableHover.value = { rows, cols };
}

function positionTableMenuFromRect(rect: DOMRect | null | undefined) {
  if (!rect) {
    tableMenuPosition.value = { top: 44, left: 12 };
    return;
  }
  tableMenuPosition.value = {
    top: rect.bottom + 6,
    left: Math.min(Math.max(12, rect.right - 238), Math.max(12, window.innerWidth - 238)),
  };
}

function toggleTableMenu() {
  tableMenuOpen.value = !tableMenuOpen.value;
  if (!tableMenuOpen.value) return;
  positionTableMenuFromRect(tableButtonRef.value?.getBoundingClientRect());
}

function openTableMenuFromMore(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
  closeAllLiveMoreTools();
  tableMenuOpen.value = true;
  positionTableMenuFromRect(rect);
}

function insertTable(rows = tableHover.value.rows, cols = tableHover.value.cols) {
  tableMenuOpen.value = false;
  runSourceEdit((source, selection) => insertTableSource(source, selection, rows, cols));
}

function normalizedTableRange(row: number, col: number, anchor = tableSelectionAnchor): TableSelectionRange {
  const startRow = Math.min(anchor?.row ?? row, row);
  const endRow = Math.max(anchor?.row ?? row, row);
  const startCol = Math.min(anchor?.col ?? col, col);
  const endCol = Math.max(anchor?.col ?? col, col);
  return { startRow, endRow, startCol, endCol };
}

function tableColumnCount(rows: string[][], alignments: Array<"left" | "center" | "right" | null>) {
  return Math.max(1, ...rows.map((row) => row.length), alignments.length);
}

function complexTableColumnCount(table: ComplexTable) {
  return buildComplexTableGrid(table).colCount;
}

function complexTableRowCount(table: ComplexTable) {
  return buildComplexTableGrid(table).rowCount;
}

function complexCellId(sourceRow: number, sourceCol: number) {
  return `${sourceRow}:${sourceCol}`;
}

function complexCellAtPoint(table: ComplexTable, row: number, col: number) {
  const grid = buildComplexTableGrid(table);
  const cellId = grid.gridMap[row]?.[col];
  if (!cellId) return null;
  const [sourceRowValue, sourceColValue] = cellId.split(":").map(Number);
  if (!Number.isFinite(sourceRowValue) || !Number.isFinite(sourceColValue)) return null;
  const cell = table.rows[sourceRowValue]?.[sourceColValue];
  return cell ? { cell, sourceRow: sourceRowValue, sourceCol: sourceColValue, bounds: grid.cellBounds[cellId] } : null;
}

function complexCellBoundsIntersectRange(table: ComplexTable, sourceRow: number, sourceCol: number, range: TableSelectionRange) {
  const bounds = buildComplexTableGrid(table).cellBounds[complexCellId(sourceRow, sourceCol)];
  if (!bounds) return false;
  return bounds.maxRow >= range.startRow
    && bounds.minRow <= range.endRow
    && bounds.maxCol >= range.startCol
    && bounds.minCol <= range.endCol;
}

function complexCellIdsInRange(table: ComplexTable, range: TableSelectionRange) {
  const grid = buildComplexTableGrid(table);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const cellId = grid.gridMap[row]?.[col];
      if (!cellId || seen.has(cellId)) continue;
      seen.add(cellId);
      ids.push(cellId);
    }
  }
  return ids;
}

function complexInsertionIndexForVirtualColumn(table: ComplexTable, sourceRow: number, virtualCol: number) {
  const grid = buildComplexTableGrid(table);
  const row = table.rows[sourceRow] || [];
  for (let sourceCol = 0; sourceCol < row.length; sourceCol += 1) {
    const origin = grid.cellOrigins[complexCellId(sourceRow, sourceCol)];
    if (origin && origin.col >= virtualCol) return sourceCol;
  }
  return row.length;
}

function clampTableIndex(value: number, count: number) {
  return Math.max(0, Math.min(Math.max(0, count - 1), value));
}

function clampTableSelectionRange(range: TableSelectionRange | null, rowCount: number, colCount: number, rowIndex: number, colIndex: number): TableSelectionRange {
  if (!range) return { startRow: rowIndex, endRow: rowIndex, startCol: colIndex, endCol: colIndex };
  const startRow = clampTableIndex(Math.min(range.startRow, range.endRow), rowCount);
  const endRow = clampTableIndex(Math.max(range.startRow, range.endRow), rowCount);
  const startCol = clampTableIndex(Math.min(range.startCol, range.endCol), colCount);
  const endCol = clampTableIndex(Math.max(range.startCol, range.endCol), colCount);
  return { startRow, endRow, startCol, endCol };
}

function setTableInteractionState(next: Partial<TableInteractionState> & { active: true }) {
  tableInteractionState.value = {
    ...emptyTableInteractionState(),
    ...tableInteractionState.value,
    ...next,
    active: true,
  };
}

function clearRenderedTableSelection() {
  document.querySelectorAll(".sd-table-widget .sd-table-cell-selected, .sd-table-widget .sd-table-cell-active").forEach((entry) => {
    entry.classList.remove("sd-table-cell-selected", "sd-table-cell-active");
  });
}

function clearTableInteractionState() {
  tableSelectionAnchor = null;
  tableDragStart = null;
  tableDragSelecting = false;
  tableInteractionState.value = emptyTableInteractionState();
  tableHoverInsert.value = { ...tableHoverInsert.value, visible: false };
  clearRenderedTableSelection();
  editorRoot.value?.classList.remove("sd-table-selecting");
}

function activeTableRange() {
  if (!view) return null;
  const position = view.state.selection.main.from;
  const source = view.state.doc.toString();
  const complexTable = findComplexTableRanges(source).find((table) => position >= table.start && position <= table.end);
  if (complexTable) return null;
  const line = view.state.doc.lineAt(position);
  const from = view.state.doc.line(Math.max(1, line.number - 32)).from;
  const to = view.state.doc.line(Math.min(view.state.doc.lines, line.number + 32)).to;
  const segment = view.state.doc.sliceString(from, to);
  const table = findTableAt(segment, position - from);
  return table ? { ...table, start: table.start + from, end: table.end + from } : null;
}

function activeComplexTableRange() {
  if (!view) return null;
  const position = view.state.selection.main.from;
  return findComplexTableRanges(view.state.doc.toString()).find((table) => position >= table.start && position <= table.end) || null;
}

function complexTableAtCachedRange() {
  if (!view || !activeTable.value.active || activeTable.value.kind !== "complex") return null;
  const source = editorSource();
  const cached = parseComplexTableSource(source.slice(activeTable.value.start, activeTable.value.end), activeTable.value.start);
  if (cached) return cached;
  return findComplexTableRanges(source).find((table) => table.start === activeTable.value.start) || null;
}

function markdownTableAtCachedRange() {
  if (!view || !activeTable.value.active || activeTable.value.kind !== "markdown") return null;
  const source = editorSource();
  const cached = findTableAt(source.slice(activeTable.value.start, activeTable.value.end), 0);
  if (cached) return { ...cached, start: activeTable.value.start, end: activeTable.value.end };
  const table = findTableAt(source, activeTable.value.start);
  return table && table.start === activeTable.value.start ? table : null;
}

function updateTableToolbarState() {
  if (!view) return;
  if (suppressTableInteractionUntilTablePointer) {
    clearTableInteractionState();
    return;
  }
  const complexTable = activeComplexTableRange();
  if (complexTable) {
    const previous = tableInteractionState.value;
    const sameTable = previous.active && previous.start === complexTable.start;
    const rowCount = complexTableRowCount(complexTable);
    const colCount = complexTableColumnCount(complexTable);
    const rowIndex = clampTableIndex(sameTable ? previous.rowIndex : 0, rowCount);
    const colIndex = clampTableIndex(sameTable ? previous.colIndex : 0, colCount);
    const level = sameTable ? previous.level : "cell";
    const range = clampTableSelectionRange(sameTable ? previous.range : null, rowCount, colCount, rowIndex, colIndex);
    const activeCell = complexCellAtPoint(complexTable, rowIndex, colIndex);
    setTableInteractionState({
      active: true,
      kind: "complex",
      start: complexTable.start,
      end: complexTable.end,
      rowIndex,
      colIndex,
      rowCount,
      colCount,
      align: activeCell?.cell.align || null,
      level,
      range,
      width: complexTable.width,
      columnWidths: complexTable.columnWidths,
    });
    return;
  }
  const table = activeTableRange();
  if (!table) {
    clearTableInteractionState();
    return;
  }
  const position = view.state.selection.main.from;
  const sourceBefore = view.state.doc.sliceString(table.start, position);
  const rowIndex = Math.max(0, sourceBefore.split("\n").length - 1);
  const rowText = view.state.doc.sliceString(view.state.doc.lineAt(position).from, position);
  const colIndex = Math.max(0, rowText.split("|").length - 2);
  setTableInteractionState({
    active: true,
    kind: "markdown",
    start: table.start,
    end: table.end,
    rowIndex,
    colIndex,
    rowCount: table.rows.length,
    colCount: tableColumnCount(table.rows, table.alignments),
    align: table.alignments[colIndex] || null,
    level: "cell",
    range: { startRow: rowIndex, endRow: rowIndex, startCol: colIndex, endCol: colIndex },
    width: "100%",
    columnWidths: [],
  });
}

function updateTableToolbarFromCell(cell: HTMLTableCellElement) {
  if (!view) return false;
  const widget = cell.closest(".sd-table-widget") as HTMLElement | null;
  if (!widget) return false;
  if (widget.dataset.tableKind === "complex") return updateComplexTableToolbarFromCell(cell, widget);
  const start = Number(widget.dataset.tableFrom || "");
  const end = Number(widget.dataset.tableTo || "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const table = findTableAt(view.state.doc.sliceString(start, end), 0);
  if (!table) return false;
  const rowIndex = Number(cell.dataset.row || "0") || 0;
  const colIndex = Number(cell.dataset.col || "0") || 0;
  setTableInteractionState({
    active: true,
    kind: "markdown",
    start,
    end,
    rowIndex,
    colIndex,
    rowCount: table.rows.length,
    colCount: tableColumnCount(table.rows, table.alignments),
    align: table.alignments[colIndex] || null,
    level: "cell",
    range: { startRow: rowIndex, endRow: rowIndex, startCol: colIndex, endCol: colIndex },
    width: "100%",
    columnWidths: [],
  });
  return true;
}

function complexTableFromWidget(widget: HTMLElement): ComplexTable | null {
  if (!view) return null;
  const start = Number(widget.dataset.tableFrom || "");
  const end = Number(widget.dataset.tableTo || "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return parseComplexTableSource(view.state.doc.sliceString(start, end), start);
}

function updateComplexTableToolbarFromCell(cell: HTMLTableCellElement, widget: HTMLElement) {
  const table = complexTableFromWidget(widget);
  if (!table) return false;
  const rowIndex = Number(cell.dataset.row || "0") || 0;
  const colIndex = Number(cell.dataset.col || "0") || 0;
  const activeCell = complexCellAtPoint(table, rowIndex, colIndex);
  const range = calculateComplexTableSelectionRange(table, { row: rowIndex, col: colIndex }, { row: rowIndex, col: colIndex });
  setTableInteractionState({
    active: true,
    kind: "complex",
    start: table.start,
    end: table.end,
    rowIndex,
    colIndex,
    rowCount: complexTableRowCount(table),
    colCount: complexTableColumnCount(table),
    align: activeCell?.cell.align || null,
    level: "cell",
    range,
    width: table.width,
    columnWidths: table.columnWidths,
  });
  return true;
}

function commitActiveTableCell() {
  const cell = document.activeElement?.closest?.(".sd-table-widget th, .sd-table-widget td") as HTMLElement | null;
  if (cell) cell.blur();
}

function withActiveTable(update: (table: SourceTableRange) => SourceEdit | null) {
  const cell = document.activeElement?.closest?.(".sd-table-widget th, .sd-table-widget td") as HTMLTableCellElement | null;
  const tableFromCell = cell ? activeTableRangeFromCell(cell) : null;
  commitActiveTableCell();
  const table = markdownTableAtCachedRange() || activeTableRange() || tableFromCell;
  if (!table) return false;
  const edit = update(table);
  if (!edit) return false;
  return dispatchEdit(edit);
}

function selectedTableRange(): TableSelectionRange {
  const state = activeTable.value;
  if (!state.range) {
    return { startRow: state.rowIndex, endRow: state.rowIndex, startCol: state.colIndex, endCol: state.colIndex };
  }
  if (state.level === "row") {
    return { startRow: state.range.startRow, endRow: state.range.endRow, startCol: 0, endCol: Math.max(0, state.colCount - 1) };
  }
  if (state.level === "column") {
    return { startRow: 0, endRow: Math.max(0, state.rowCount - 1), startCol: state.range.startCol, endCol: state.range.endCol };
  }
  if (state.level === "table") {
    return { startRow: 0, endRow: Math.max(0, state.rowCount - 1), startCol: 0, endCol: Math.max(0, state.colCount - 1) };
  }
  return state.range;
}

function setActiveColumnAlign(align: "left" | "center" | "right") {
  if (activeTable.value.kind === "complex") {
    withActiveComplexTable((table) => {
      const targetRange = selectedTableRange();
      const rows = table.rows.map((row, rowIndex) => row.map((cell, colIndex) =>
        complexCellBoundsIntersectRange(table, rowIndex, colIndex, targetRange)
          ? { ...cell, align: cell.align === align ? null : align }
          : { ...cell, tag: cell.tag as "th" | "td" }));
      return replaceComplexTableSource(editorSource(), table, { ...table, rows });
    });
    return;
  }
  withActiveTable((table) => {
    const col = Math.min(activeTable.value.colIndex, Math.max(0, table.alignments.length - 1));
    const alignments = [...table.alignments];
    alignments[col] = alignments[col] === align ? null : align;
    return replaceTable(editorSource(), table, table.rows, alignments);
  });
}

function insertTableRow(direction: "above" | "below") {
  insertTableRowAt(direction === "below" ? selectedTableRange().endRow + 1 : selectedTableRange().startRow);
}

function insertTableRowAt(rawIndex: number) {
  if (activeTable.value.kind === "complex") {
    withActiveComplexTable((table) => {
      const width = complexTableColumnCount(table);
      const index = Math.max(0, Math.min(table.rows.length, rawIndex));
      const rows = table.rows.map((row) => row.map((cell) => ({ ...cell, tag: cell.tag as "th" | "td" })));
      rows.splice(index, 0, Array.from({ length: width }, () => ({ tag: index === 0 ? "th" as const : "td" as const, text: " ", rowspan: 1, colspan: 1, align: null })));
      return replaceComplexTableSource(editorSource(), table, { ...table, rows });
    });
    return;
  }
  withActiveTable((table) => {
    const index = Math.max(1, Math.min(table.rows.length, rawIndex));
    const cols = Math.max(1, ...table.rows.map((row) => row.length));
    const nextRows = [...table.rows];
    nextRows.splice(index, 0, Array.from({ length: cols }, () => " "));
    return replaceTable(editorSource(), table, nextRows);
  });
}

function insertTableColumn(direction: "left" | "right") {
  insertTableColumnAt(direction === "right" ? selectedTableRange().endCol + 1 : selectedTableRange().startCol);
}

function insertTableColumnAt(rawIndex: number) {
  if (activeTable.value.kind === "complex") {
    withActiveComplexTable((table) => {
      const index = Math.max(0, Math.min(rawIndex, complexTableColumnCount(table)));
      const rows = table.rows.map((row, rowIndex) => {
        const next = row.map((cell) => ({ ...cell, tag: cell.tag as "th" | "td" }));
        next.splice(complexInsertionIndexForVirtualColumn(table, rowIndex, index), 0, { tag: rowIndex === 0 ? "th" : "td", text: rowIndex === 0 ? `Column ${index + 1}` : " ", rowspan: 1, colspan: 1, align: null });
        return next;
      });
      const columnWidths = [...table.columnWidths];
      columnWidths.splice(index, 0, "");
      return replaceComplexTableSource(editorSource(), table, { ...table, rows, columnWidths });
    });
    return;
  }
  withActiveTable((table) => {
    const index = Math.max(0, Math.min(rawIndex, tableColumnCount(table.rows, table.alignments)));
    const nextRows = table.rows.map((row, rowIndex) => {
      const next = [...row];
      next.splice(index, 0, rowIndex === 0 ? `Column ${index + 1}` : " ");
      return next;
    });
    const alignments = [...table.alignments];
    alignments.splice(index, 0, null);
    return replaceTable(editorSource(), table, nextRows, alignments);
  });
}

async function copyActiveTable() {
  if (!activeTable.value.active) return;
  commitActiveTableCell();
  await navigator.clipboard?.writeText(editorSource().slice(activeTable.value.start, activeTable.value.end));
}

function formatActiveTableSource() {
  if (activeTable.value.kind === "complex") return;
  withActiveTable((table) => replaceTable(editorSource(), table, table.rows));
}

function withActiveComplexTable(update: (table: ComplexTable) => SourceEdit | null) {
  const cell = document.activeElement?.closest?.(".sd-complex-table-widget th, .sd-complex-table-widget td") as HTMLTableCellElement | null;
  const widget = cell?.closest(".sd-complex-table-widget") as HTMLElement | null;
  const tableFromWidget = widget ? complexTableFromWidget(widget) : null;
  commitActiveTableCell();
  const table = complexTableAtCachedRange() || activeComplexTableRange() || tableFromWidget;
  if (!table) return false;
  const edit = update(table);
  if (!edit) return false;
  return dispatchEdit(edit);
}

function upgradeActiveTableToComplex() {
  withActiveTable((table) => {
    const html = renderComplexTableHtml(table);
    const value = `${editorSource().slice(0, table.start)}${html}${editorSource().slice(table.end)}`;
    return { value, selection: { start: table.start, end: table.start + html.length } };
  });
}

function deleteActiveTable() {
  if (!activeTable.value.active || !view) return;
  commitActiveTableCell();
  view.dispatch({
    changes: { from: activeTable.value.start, to: activeTable.value.end, insert: "" },
    selection: { anchor: activeTable.value.start },
    scrollIntoView: true,
  });
  clearTableInteractionState();
}

function normalizeAssetPath(value: string) {
  return value.trim().replace(/^\.\/+/, "").split(/[?#]/)[0];
}

function readerHrefForImage(image: SourceImageRange | null | undefined) {
  const href = String(image?.outerHref || "");
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

function candidateDocumentIdsForImage(image: SourceImageRange) {
  const documentIds: string[] = [];
  if (props.documentId) documentIds.push(props.documentId);
  const linkedDocumentId = documentIdFromReaderHref(readerHrefForImage(image));
  if (linkedDocumentId && !documentIds.includes(linkedDocumentId)) documentIds.push(linkedDocumentId);
  return documentIds;
}

function visibleSourceSegments() {
  if (!view) return [{ source: currentMarkdown.value, offset: 0 }];
  return view.visibleRanges.map((range) => {
    const fromLine = view!.state.doc.lineAt(Math.max(0, range.from));
    const toLine = view!.state.doc.lineAt(Math.min(view!.state.doc.length, range.to));
    const from = view!.state.doc.line(Math.max(1, fromLine.number - 5)).from;
    const to = view!.state.doc.line(Math.min(view!.state.doc.lines, toLine.number + 5)).to;
    return { source: view!.state.doc.sliceString(from, to), offset: from };
  });
}

async function resolveEditorAssetImages() {
  if (!view || !props.documentId || !window.paperReaderPlus) return;
  const images = visibleSourceSegments().flatMap((segment) =>
    extractImages(segment.source).map((image) => ({ ...image, start: image.start + segment.offset, end: image.end + segment.offset })));
  let changed = false;
  for (const image of images) {
    const normalized = normalizeAssetPath(image.src);
    if (!/^assets\//i.test(normalized)) continue;
    for (const documentId of candidateDocumentIdsForImage(image)) {
      const cacheKey = `${documentId}:${normalized}`;
      try {
        const dataUrl = assetUrlCache.get(cacheKey) || await window.paperReaderPlus.getAssetDataUrl(documentId, normalized);
        assetUrlCache.set(cacheKey, dataUrl);
        changed = true;
        break;
      } catch {
        // ReaderM captures can belong either to the markdown document or source PDF.
      }
    }
  }
  if (changed && view && !isComposing && !view.composing) view.dispatch({ effects: assetUrlEffect.of(assetUrlCache.snapshot()) });
}

function scheduleResolveEditorAssetImages() {
  if (isComposing || view?.composing) return;
  if (assetResolveTimer !== null) window.clearTimeout(assetResolveTimer);
  assetResolveTimer = window.setTimeout(() => {
    assetResolveTimer = null;
    void resolveEditorAssetImages();
  }, 80);
}

function closeImageResizeMenu() {
  imageResizeMenu.value = { ...imageResizeMenu.value, open: false, image: null, assetPath: "", readerHref: "", submenuLeft: false };
}

function clearActiveImage() {
  activeImage.value = null;
  closeImageResizeMenu();
}

function emitReaderImageLink(href: string, event: MouseEvent) {
  if (!href) return false;
  emit("linkClick", { href, event });
  clearActiveImage();
  return true;
}

function imageSourceRangeFromElement(target: HTMLElement | null) {
  const imageFrame = target?.closest(".sd-image-frame") as HTMLElement | null;
  const htmlBlock = target?.closest(".sd-html-block-content[data-source-from][data-source-to]") as HTMLElement | null;
  const sourceFrom = Number(imageFrame?.dataset.sourceFrom || "");
  const sourceTo = Number(imageFrame?.dataset.sourceTo || "");
  if (imageFrame && Number.isFinite(sourceFrom) && Number.isFinite(sourceTo) && sourceFrom >= 0 && sourceTo > sourceFrom) {
    return { from: sourceFrom, to: sourceTo };
  }
  const htmlFrom = Number(htmlBlock?.dataset.sourceFrom || "");
  const htmlTo = Number(htmlBlock?.dataset.sourceTo || "");
  if (htmlBlock && target?.closest(".markdown-html-image") && Number.isFinite(htmlFrom) && Number.isFinite(htmlTo) && htmlFrom >= 0 && htmlTo > htmlFrom) {
    return { from: htmlFrom, to: htmlTo };
  }
  return null;
}

function activeImageFromRange(from: number, to: number, imageElement?: HTMLImageElement | null): ActiveImageState | null {
  if (!view) return null;
  const source = view.state.doc.sliceString(from, to);
  const image = extractImages(source)
    .map((item) => ({ ...item, start: item.start + from, end: item.end + from }))
    .find((item) => item.start >= from && item.end <= to);
  if (!image) return null;
  const assetPath = normalizeAssetPath(image.src);
  const naturalWidth = imageElement?.naturalWidth || imageElement?.width || imageElement?.getBoundingClientRect().width || Number(image.width) || 1;
  const naturalHeight = imageElement?.naturalHeight || imageElement?.height || imageElement?.getBoundingClientRect().height || Number(image.height) || 1;
  return {
    image,
    naturalWidth,
    naturalHeight,
    assetPath,
    readerHref: readerHrefForImage(image),
    renderedSrc: imageElement?.getAttribute("src") || image.src,
  };
}

function setActiveImageFromElement(target: HTMLElement | null, event?: MouseEvent) {
  if (!view) return false;
  const range = imageSourceRangeFromElement(target);
  if (!range) return false;
  const renderedMarkdownImage = target?.closest(".sd-image-frame")?.querySelector(".sd-image-widget") as HTMLImageElement | null;
  const renderedHtmlImage = target?.closest(".sd-html-block-content")?.querySelector(".markdown-html-image") as HTMLImageElement | null;
  const imageElement = renderedMarkdownImage || renderedHtmlImage;
  const next = activeImageFromRange(range.from, range.to, imageElement);
  if (!next) return false;
  activeImage.value = next;
  imageResizeMenu.value = {
    open: false,
    top: 0,
    left: 0,
    image: next.image,
    naturalWidth: next.naturalWidth,
    naturalHeight: next.naturalHeight,
    assetPath: next.assetPath,
    readerHref: next.readerHref,
    submenuLeft: false,
  };
  return true;
}

function imageAtPosition(source: string, position: number): SourceImageRange | null {
  return extractImages(source).find((image) => position >= image.start && position <= image.end) || null;
}

function updateActiveImageFromSelection() {
  if (!view) {
    activeImage.value = null;
    return;
  }
  const selection = view.state.selection.main;
  const source = view.state.doc.toString();
  const position = selection.from;
  const image = imageAtPosition(source, position);
  if (!image || selection.to > image.end || selection.from < image.start) {
    activeImage.value = null;
    return null;
  }
  const existing = activeImage.value;
  if (existing?.image.start === image.start && existing.image.end === image.end) {
    activeImage.value = { ...existing, image };
    return;
  }
  activeImage.value = {
    image,
    naturalWidth: Number(image.width) || existing?.naturalWidth || 1,
    naturalHeight: Number(image.height) || existing?.naturalHeight || 1,
    assetPath: normalizeAssetPath(image.src),
    readerHref: readerHrefForImage(image),
    renderedSrc: resolvedImageUrl(image.src, readerHrefForImage(image)),
  };
}

function revealImageSource(target: HTMLElement | null) {
  if (!view) return false;
  const range = imageSourceRangeFromElement(target);
  if (!range) return false;
  view.dispatch({
    selection: { anchor: range.from, head: range.to },
    scrollIntoView: true,
  });
  view.focus();
  clearActiveImage();
  return true;
}

function jumpToActiveImageSource(event: MouseEvent) {
  emitReaderImageLink(activeImage.value?.readerHref || imageResizeMenu.value.readerHref, event);
}

function resizeActiveImage(percent: number) {
  const state = activeImage.value;
  const image = state?.image || imageResizeMenu.value.image;
  if (!view || !image) return;
  const width = Math.max(1, Math.round((state?.naturalWidth || imageResizeMenu.value.naturalWidth) * percent / 100));
  const height = Math.max(1, Math.round((state?.naturalHeight || imageResizeMenu.value.naturalHeight) * percent / 100));
  dispatchEdit(resizeImageSource(editorSource(), image, width, height));
  clearActiveImage();
}

function setActiveImageAlignment(alignment: ImageAlignment) {
  const image = activeImage.value?.image || imageResizeMenu.value.image;
  if (!view || !image) return;
  dispatchEdit(setImageAlignmentSource(editorSource(), image, alignment));
  clearActiveImage();
}

function saveActiveImageAs() {
  const state = activeImage.value;
  const image = state?.image || imageResizeMenu.value.image;
  if (!image) return;
  const imageElement = editorRoot.value?.querySelector(`img[data-live-image-index="${image.start}"]`) as HTMLImageElement | null;
  const href = state?.renderedSrc || imageElement?.getAttribute("src") || image.src;
  const filename = image.src.split("/").pop()?.split(/[?#]/)[0] || "image";
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  clearActiveImage();
}

function deleteActiveImage() {
  const image = activeImage.value?.image || imageResizeMenu.value.image;
  if (!view || !image) return;
  const from = image.containerStart ?? image.start;
  const to = image.containerEnd ?? image.end;
  view.dispatch({
    changes: { from, to, insert: "" },
    selection: { anchor: from },
    scrollIntoView: true,
  });
  clearActiveImage();
}

function closeFloatingMenus() {
  tableMenuOpen.value = false;
  mathGroupOpen.value = null;
  closeAllLiveMoreTools();
  clearActiveImage();
}

function activeTableRangeFromCell(cell: HTMLTableCellElement): SourceTableRange | null {
  if (!view) return null;
  const widget = cell.closest(".sd-table-widget") as HTMLElement | null;
  const start = Number(widget?.dataset.tableFrom || "");
  const end = Number(widget?.dataset.tableTo || "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const table = findTableAt(view.state.doc.sliceString(start, end), 0);
  return table ? { ...table, start, end } : null;
}

function handleGlobalPointerDown(event: PointerEvent | MouseEvent) {
  const target = event.target as HTMLElement | null;
  const tableCell = target?.closest(".sd-table-widget th, .sd-table-widget td") as HTMLTableCellElement | null;
  if (tableCell && updateTableToolbarFromCell(tableCell)) {
    suppressTableInteractionUntilTablePointer = false;
    return;
  }
  if (target?.closest(".live-table-menu, .live-table-grid, .live-table-toolbar-row, .live-table-hover-insert, .live-image-toolbar, .live-image-resize-menu, .live-markdown-toolbar-row-math, .live-math-tool-popover, .live-more-tools, .live-more-tools-menu, .ui-dropdown-menu, .color-dropdown-menu")) return;
  const imageAnchor = target?.closest(".sd-image-anchor") as HTMLElement | null;
  if (imageAnchor?.dataset.href) {
    event.preventDefault();
    event.stopPropagation();
    emitReaderImageLink(imageAnchor.dataset.href, event as MouseEvent);
    return;
  }
  if (setActiveImageFromElement(target, event as MouseEvent)) {
    if (event.button === 0) event.preventDefault();
    event.stopPropagation();
    return;
  }
  closeFloatingMenus();
  suppressTableInteractionUntilTablePointer = true;
  clearTableInteractionState();
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") closeFloatingMenus();
}

function updateSelectedTableCells() {
  clearRenderedTableSelection();
  if (!activeTable.value.active) return;
  const wrapper = document.querySelector<HTMLElement>(`.sd-table-widget[data-table-from="${activeTable.value.start}"][data-table-to="${activeTable.value.end}"]`);
  if (!wrapper) return;
  const range = selectedTableRange();
  const complexTable = activeTable.value.kind === "complex" ? (complexTableAtCachedRange() || complexTableFromWidget(wrapper)) : null;
  wrapper.querySelectorAll<HTMLTableCellElement>("th, td").forEach((cell) => {
    const row = Number(cell.dataset.row || "0");
    const col = Number(cell.dataset.col || "0");
    if (complexTable) {
      const sourceRow = Number(cell.dataset.sourceRow || "");
      const sourceCol = Number(cell.dataset.sourceCol || "");
      if (!Number.isFinite(sourceRow) || !Number.isFinite(sourceCol) || !complexCellBoundsIntersectRange(complexTable, sourceRow, sourceCol, range)) return;
    } else if (row < range.startRow || row > range.endRow || col < range.startCol || col > range.endCol) {
      return;
    }
    cell.classList.add("sd-table-cell-selected");
    if (row === activeTable.value.rowIndex && col === activeTable.value.colIndex) cell.classList.add("sd-table-cell-active");
  });
}

function startTableCellSelection(cell: HTMLTableCellElement, extend = false) {
  updateTableToolbarFromCell(cell);
  const row = Number(cell.dataset.row || "0") || 0;
  const col = Number(cell.dataset.col || "0") || 0;
  if (!extend || !tableSelectionAnchor) tableSelectionAnchor = { row, col };
  const complexTable = activeTable.value.kind === "complex" ? complexTableAtCachedRange() : null;
  const range = complexTable
    ? calculateComplexTableSelectionRange(complexTable, tableSelectionAnchor, { row, col })
    : normalizedTableRange(row, col);
  const activeCell = complexTable ? complexCellAtPoint(complexTable, row, col) : null;
  tableInteractionState.value = {
    ...tableInteractionState.value,
    rowIndex: row,
    colIndex: col,
    align: complexTable ? activeCell?.cell.align || null : tableInteractionState.value.align,
    level: "cell",
    range,
  };
  updateSelectedTableCells();
}

function extendTableCellSelection(cell: HTMLTableCellElement) {
  if (!tableSelectionAnchor || !activeTable.value.active) return;
  const row = Number(cell.dataset.row || "0") || 0;
  const col = Number(cell.dataset.col || "0") || 0;
  const complexTable = activeTable.value.kind === "complex" ? complexTableAtCachedRange() : null;
  const range = complexTable
    ? calculateComplexTableSelectionRange(complexTable, tableSelectionAnchor, { row, col })
    : normalizedTableRange(row, col);
  const activeCell = complexTable ? complexCellAtPoint(complexTable, row, col) : null;
  tableInteractionState.value = {
    ...tableInteractionState.value,
    rowIndex: row,
    colIndex: col,
    align: complexTable ? activeCell?.cell.align || null : tableInteractionState.value.align,
    level: "range",
    range,
  };
  updateSelectedTableCells();
}

function selectTableLevel(level: TableSelectionLevel) {
  if (!activeTable.value.active) return;
  const range = selectedTableRange();
  const next = { ...activeTable.value, level, range };
  if (level === "row") {
    next.range = { startRow: range.startRow, endRow: range.endRow, startCol: 0, endCol: Math.max(0, activeTable.value.colCount - 1) };
  } else if (level === "column") {
    next.range = { startRow: 0, endRow: Math.max(0, activeTable.value.rowCount - 1), startCol: range.startCol, endCol: range.endCol };
  } else if (level === "table") {
    next.range = { startRow: 0, endRow: Math.max(0, activeTable.value.rowCount - 1), startCol: 0, endCol: Math.max(0, activeTable.value.colCount - 1) };
  }
  const complexTable = activeTable.value.kind === "complex" ? complexTableAtCachedRange() : null;
  if (complexTable && next.range) {
    next.range = calculateComplexTableSelectionRange(
      complexTable,
      { row: next.range.startRow, col: next.range.startCol },
      { row: next.range.endRow, col: next.range.endCol },
    );
  }
  tableInteractionState.value = next;
  updateSelectedTableCells();
}

function stopTableDragTracking() {
  window.removeEventListener("pointermove", handleWindowTablePointerMove, true);
  window.removeEventListener("pointerup", handleWindowTablePointerUp, true);
  window.removeEventListener("pointercancel", handleWindowTablePointerUp, true);
}

function tableCellFromPoint(x: number, y: number) {
  return document.elementFromPoint(x, y)?.closest(".sd-table-widget th, .sd-table-widget td") as HTMLTableCellElement | null;
}

function focusTableCellAtPoint(cell: HTMLTableCellElement, x: number, y: number) {
  cell.focus();
  const selection = window.getSelection();
  if (!selection) return;
  const documentWithCaret = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = documentWithCaret.caretPositionFromPoint?.(x, y);
  if (position && cell.contains(position.offsetNode)) {
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }
  const range = documentWithCaret.caretRangeFromPoint?.(x, y);
  if (range && cell.contains(range.startContainer)) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function handleWindowTablePointerMove(event: PointerEvent) {
  if (!tableDragStart || (event.buttons & 1) !== 1) {
    stopTableDragTracking();
    tableDragStart = null;
    tableDragSelecting = false;
    editorRoot.value?.classList.remove("sd-table-selecting");
    return;
  }
  const cell = tableCellFromPoint(event.clientX, event.clientY);
  if (!tableDragSelecting && (!cell || cell === tableDragStart.cell)) return;
  const distance = Math.hypot(event.clientX - tableDragStart.x, event.clientY - tableDragStart.y);
  if (!tableDragSelecting) {
    if (distance < 4) return;
    tableDragSelecting = true;
    startTableCellSelection(tableDragStart.cell, tableDragStart.extend);
  }
  editorRoot.value?.classList.add("sd-table-selecting");
  event.preventDefault();
  event.stopPropagation();
  window.getSelection()?.removeAllRanges();
  if (cell) extendTableCellSelection(cell);
}

function handleWindowTablePointerUp(event: PointerEvent) {
  const dragStart = tableDragStart;
  stopTableDragTracking();
  if (tableDragSelecting) {
    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();
  } else if (dragStart) {
    const selection = window.getSelection();
    const selectingCellText = selection && !selection.isCollapsed
      && selection.anchorNode && selection.focusNode
      && dragStart.cell.contains(selection.anchorNode)
      && dragStart.cell.contains(selection.focusNode);
    if (!selectingCellText) {
      clearRenderedTableSelection();
      focusTableCellAtPoint(dragStart.cell, event.clientX, event.clientY);
    }
  }
  tableSelectionAnchor = null;
  tableDragStart = null;
  tableDragSelecting = false;
  editorRoot.value?.classList.remove("sd-table-selecting");
}

function beginTableDragCandidate(event: PointerEvent, cell: HTMLTableCellElement) {
  suppressTableInteractionUntilTablePointer = false;
  stopTableDragTracking();
  updateTableToolbarFromCell(cell);
  tableDragStart = { x: event.clientX, y: event.clientY, cell, extend: event.shiftKey };
  tableDragSelecting = false;
  window.addEventListener("pointermove", handleWindowTablePointerMove, true);
  window.addEventListener("pointerup", handleWindowTablePointerUp, true);
  window.addEventListener("pointercancel", handleWindowTablePointerUp, true);
}

function handleEditorRootPointerDown(event: PointerEvent) {
  if (handleRenderedTextPointerDown(event)) return;
  if (suppressRenderedBlankPointerDown(event)) return;
  const target = event.target as HTMLElement | null;
  const cell = target?.closest(".sd-table-widget th, .sd-table-widget td") as HTMLTableCellElement | null;
  if (!cell || target?.closest(".sd-table-col-resizer")) return;
  beginTableDragCandidate(event, cell);
}

function handleEditorRootMouseDown(event: MouseEvent) {
  if (handleRenderedTextPointerDown(event)) return;
  suppressRenderedBlankPointerDown(event);
}

const RENDERED_INTERACTION_SELECTOR = [
  ".sd-table-widget",
  ".sd-table-col-resizer",
  ".sd-image-source",
  ".sd-image-widget",
  ".sd-image-frame",
  ".sd-image-anchor",
  ".markdown-html-image",
  ".sd-live-block-render-toolbar",
  ".sd-live-block-editor-widget",
  ".sd-live-block-content button",
  ".sd-math-block-content",
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
].join(",");

const RENDERED_TEXT_POINTER_BYPASS_SELECTOR = [
  ".sd-table-widget",
  ".sd-table-col-resizer",
  ".sd-image-source",
  ".sd-image-widget",
  ".sd-image-frame",
  ".sd-image-anchor",
  ".markdown-html-image",
  ".sd-live-block-render-toolbar",
  ".sd-live-block-editor-widget",
  ".sd-live-block-content button",
  ".sd-math-block-content",
  "button",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
].join(",");

function eventTargetElement(event: Event) {
  const target = event.target;
  if (target instanceof Element) return target;
  return target instanceof Node ? target.parentElement : null;
}

function caretRangeFromPoint(x: number, y: number) {
  const documentWithCaret = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = documentWithCaret.caretPositionFromPoint?.(x, y);
  if (position) {
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }
  return documentWithCaret.caretRangeFromPoint?.(x, y) || null;
}

function pointHitsTextGlyph(x: number, y: number) {
  const range = caretRangeFromPoint(x, y);
  const node = range?.startContainer;
  if (!range || !node || node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) return false;
  const offset = range.startOffset;
  const textLength = node.textContent.length;
  const candidates = [
    [Math.max(0, offset - 1), Math.min(textLength, offset)],
    [Math.max(0, offset), Math.min(textLength, offset + 1)],
  ] as const;
  for (const [start, end] of candidates) {
    if (end <= start) continue;
    const probe = document.createRange();
    probe.setStart(node, start);
    probe.setEnd(node, end);
    const rects = Array.from(probe.getClientRects());
    probe.detach();
    if (rects.some((rect) =>
      rect.width > 0
      && rect.height > 0
      && x >= rect.left - 2
      && x <= rect.right + 2
      && y >= rect.top - 2
      && y <= rect.bottom + 2)) {
      return true;
    }
  }
  return false;
}

function pointHitsEditorText(position: number, x: number, y: number) {
  if (!view) return false;
  if (pointHitsTextGlyph(x, y)) return true;
  const line = view.state.doc.lineAt(position);
  const probes = new Set<number>();
  probes.add(Math.max(line.from, Math.min(line.to, position)));
  probes.add(Math.max(line.from, Math.min(line.to, position - 1)));
  probes.add(Math.max(line.from, Math.min(line.to, position + 1)));
  for (const probe of probes) {
    const rect = view.coordsAtPos(probe);
    if (!rect) continue;
    const nearY = y >= rect.top - 4 && y <= rect.bottom + 4;
    const nearX = x >= Math.min(rect.left, rect.right) - 12 && x <= Math.max(rect.left, rect.right) + 12;
    if (nearX && nearY) return true;
  }
  return false;
}

function renderedLinePositionAtEvent(event: MouseEvent) {
  if (!view) return null;
  const target = eventTargetElement(event);
  if (!target) return null;
  const lineElement = target.closest(".cm-line");
  if (!lineElement || !editorRoot.value?.contains(lineElement)) return null;
  const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (position === null || position === undefined || Number.isNaN(position)) return null;
  const line = view.state.doc.lineAt(position);
  if (!lineHasRevealableSource(line.text)) return null;
  return { position, line };
}

function suppressRenderedBlankPointerDown(event: MouseEvent) {
  const target = eventTargetElement(event);
  if (!target || target.closest(RENDERED_INTERACTION_SELECTOR)) return false;
  const hit = renderedLinePositionAtEvent(event);
  if (!hit) return false;
  if (pointHitsEditorText(hit.position, event.clientX, event.clientY)) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function lineHasRevealableSource(lineText: string) {
  return /^#{1,6}\s+/.test(lineText)
    || /(?:\*\*|__|~~|`|\[.+?\]\(.+?\)|<u>|<\/u>|<span\s+style=|<\/span>|==|\$)/i.test(lineText)
    || /(^|[^\\])(?:\*|_)[^\s*_]/.test(lineText);
}

function clearRenderedTextRevealTimer() {
  if (renderedTextRevealTimer !== null) {
    window.clearTimeout(renderedTextRevealTimer);
    renderedTextRevealTimer = null;
  }
  renderedTextRevealUntil = 0;
}

function clearRenderedTextHideTimer() {
  if (renderedTextHideTimer !== null) {
    window.clearTimeout(renderedTextHideTimer);
    renderedTextHideTimer = null;
  }
  renderedTextHideUntil = 0;
}

function shouldSuppressRenderedTextReveal() {
  return performance.now() < renderedTextRevealUntil;
}

function currentRenderedTextRevealSelection() {
  return renderedTextHideSelection && performance.now() < renderedTextHideUntil
    ? renderedTextHideSelection
    : null;
}

function deferRenderedTextReveal(editorView: EditorView) {
  clearRenderedTextRevealTimer();
  renderedTextRevealUntil = performance.now() + RENDERED_TEXT_REVEAL_DELAY_MS;
  renderedTextRevealTimer = window.setTimeout(() => {
    renderedTextRevealTimer = null;
    renderedTextRevealUntil = 0;
    if (view === editorView) {
      editorView.dispatch({ effects: renderedTextRevealRefreshEffect.of(undefined) });
    }
  }, RENDERED_TEXT_REVEAL_DELAY_MS);
}

function deferRenderedTextHide(editorView: EditorView) {
  if (renderedTextHideTimer !== null) return;
  if (RENDERED_TEXT_HIDE_DELAY_MS <= 0) {
    renderedTextHideSelection = null;
    renderedTextHideUntil = 0;
    return;
  }
  renderedTextHideUntil = performance.now() + RENDERED_TEXT_HIDE_DELAY_MS;
  renderedTextHideTimer = window.setTimeout(() => {
    renderedTextHideTimer = null;
    renderedTextHideUntil = 0;
    renderedTextHideSelection = null;
    if (view === editorView) {
      editorView.dispatch({ effects: renderedTextRevealRefreshEffect.of(undefined) });
    }
  }, RENDERED_TEXT_HIDE_DELAY_MS);
}

function handleRenderedTextPointerDown(event: MouseEvent) {
  if (!view || event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = eventTargetElement(event);
  if (!target || target.closest(RENDERED_TEXT_POINTER_BYPASS_SELECTOR)) return false;
  const hit = renderedLinePositionAtEvent(event);
  if (!hit) return false;
  if (!pointHitsEditorText(hit.position, event.clientX, event.clientY)) return false;
  event.preventDefault();
  event.stopPropagation();
  const targetView = view;
  deferRenderedTextReveal(targetView);
  targetView.dispatch({ selection: { anchor: hit.position } });
  targetView.focus();
  publishSelection(targetView.state);
  updateToolbarState();
  return true;
}

function handleCompositionStart() {
  isComposing = true;
}

function handleCompositionEnd() {
  void nextTick(() => {
    isComposing = false;
    flushModelUpdate();
    publishSelection();
    updateToolbarState();
    scheduleResolveEditorAssetImages();
  });
}

function handleTablePointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement | null;
  const cell = target?.closest(".sd-table-widget th, .sd-table-widget td") as HTMLTableCellElement | null;
  if (!cell || target?.closest(".sd-table-col-resizer")) return false;
  if (tableDragStart?.cell !== cell) beginTableDragCandidate(event, cell);
  return false;
}

function handleTablePointerEnter(event: PointerEvent) {
  if (!tableDragSelecting) return false;
  const cell = (event.target as HTMLElement | null)?.closest(".sd-table-widget th, .sd-table-widget td") as HTMLTableCellElement | null;
  if (!cell || (event.buttons & 1) !== 1) return false;
  extendTableCellSelection(cell);
  return false;
}

function handleTableMouseMove(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const cell = target?.closest(".sd-table-widget th, .sd-table-widget td") as HTMLTableCellElement | null;
  if (!cell) {
    tableHoverInsert.value = { ...tableHoverInsert.value, visible: false };
    return false;
  }
  const rect = cell.getBoundingClientRect();
  const edge = 5;
  const row = Number(cell.dataset.row || "0") || 0;
  const col = Number(cell.dataset.col || "0") || 0;
  if (Math.abs(event.clientY - rect.top) <= edge) {
    tableHoverInsert.value = { visible: true, kind: "row", index: row, top: rect.top - 10, left: rect.left - 22 };
  } else if (Math.abs(event.clientY - rect.bottom) <= edge) {
    tableHoverInsert.value = { visible: true, kind: "row", index: row + 1, top: rect.bottom - 10, left: rect.left - 22 };
  } else if (Math.abs(event.clientX - rect.left) <= edge) {
    tableHoverInsert.value = { visible: true, kind: "column", index: col, top: rect.top - 22, left: rect.left - 10 };
  } else if (Math.abs(event.clientX - rect.right) <= edge) {
    tableHoverInsert.value = { visible: true, kind: "column", index: col + 1, top: rect.top - 22, left: rect.right - 10 };
  } else {
    tableHoverInsert.value = { ...tableHoverInsert.value, visible: false };
  }
  return false;
}

function applyHoverInsert() {
  if (!tableHoverInsert.value.visible) return;
  if (tableHoverInsert.value.kind === "row") {
    insertTableRowAt(tableHoverInsert.value.index);
  } else {
    insertTableColumnAt(tableHoverInsert.value.index);
  }
  tableHoverInsert.value = { ...tableHoverInsert.value, visible: false };
}

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

async function handlePaste(event: ClipboardEvent) {
  if (!view) return false;
  const pasteEvent = event as ClipboardEvent & { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };
  if ((pasteEvent.ctrlKey || pasteEvent.metaKey) && pasteEvent.shiftKey) {
    event.preventDefault();
    replaceSelection(stripMarkdownFormattingForPlainPaste(event.clipboardData?.getData("text/plain") || ""));
    return true;
  }
  const imageDataUrl = await readPastedImage(event);
  if (imageDataUrl) {
    event.preventDefault();
    flushModelUpdate();
    emit("imagePaste", { dataUrl: imageDataUrl, selection: selectionRange() });
    return true;
  }
  const urlText = event.clipboardData?.getData("text/plain")?.trim() || "";
  if (urlText && /^(https?:\/\/|www\.|\/reader\?|readerp:\/\/|readerm:\/\/|(?:\.\/)?assets\/)/i.test(urlText) && !view.state.selection.main.empty) {
    event.preventDefault();
    dispatchEdit(setLinkHref(editorSource(), selectionRange(), urlText));
    return true;
  }
  return false;
}

function flushModelUpdate() {
  if (!view) return;
  if (isComposing || view.composing) return;
  if (modelUpdateTimer !== null) {
    window.clearTimeout(modelUpdateTimer);
    modelUpdateTimer = null;
  }
  const markdownValue = view.state.doc.toString();
  if (markdownValue === currentMarkdown.value) return;
  currentMarkdown.value = markdownValue;
  emit("update:modelValue", markdownValue);
}

function scheduleModelUpdate() {
  syncingFromEditor = true;
  if (modelUpdateTimer !== null) window.clearTimeout(modelUpdateTimer);
  modelUpdateTimer = window.setTimeout(() => {
    modelUpdateTimer = null;
    flushModelUpdate();
    void nextTick(() => {
      syncingFromEditor = false;
    });
  }, 90);
}

function editorTheme(): Extension {
  return EditorView.theme({
    "&": {
      height: "100%",
      fontSize: "var(--markdown-editor-font-size, 15px)",
      background: "#fff",
    },
    ".cm-scroller": {
      fontFamily: "inherit",
      lineHeight: "var(--markdown-line-height, 1.6)",
      overflow: "auto",
    },
    ".cm-content": {
      minHeight: "100%",
      padding: "14px",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
    },
    ".cm-line": {
      padding: "0",
    },
    ".cm-focused": {
      outline: "none",
    },
    ".cm-placeholder": {
      color: "#94a3b8",
    },
  });
}

function handleMouseLink(event: MouseEvent) {
  if (!view) return false;
  const target = event.target as HTMLElement | null;
  const imageAnchor = target?.closest(".sd-image-anchor") as HTMLElement | null;
  if (imageAnchor?.dataset.href) {
    event.preventDefault();
    emit("linkClick", { href: imageAnchor.dataset.href, event, force: true });
    return true;
  }
  if (target?.closest(".sd-image-source")) {
    event.preventDefault();
    return revealImageSource(target);
  }
  if (target?.closest(".sd-image-widget")) {
    event.preventDefault();
    return setActiveImageFromElement(target, event);
  }
  if (target?.closest(".markdown-html-image")) {
    event.preventDefault();
    return setActiveImageFromElement(target, event);
  }
  if (!(event.ctrlKey || event.metaKey)) return false;
  const renderedLink = target?.closest(".sd-link") as HTMLElement | null;
  const href = renderedLink?.dataset.href || "";
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos === null || pos === undefined || Number.isNaN(pos)) return false;
  const from = Math.max(0, pos - 1024);
  const to = Math.min(view.state.doc.length, pos + 1024);
  const link = findLinkAt(view.state.doc.sliceString(from, to), pos - from, 1024);
  if (link) {
    link.start += from;
    link.end += from;
  }
  if (!link) return false;
  event.preventDefault();
  emit("linkClick", { href: href || link.href, event });
  return true;
}

function handleImageContextMenu(event: MouseEvent) {
  if (!view) return false;
  if (setActiveImageFromElement(event.target as HTMLElement | null, event)) {
    event.preventDefault();
    const assetPath = activeImage.value?.assetPath || imageResizeMenu.value.assetPath;
    if (/^assets\//i.test(assetPath)) emit("imageContext", { assetPath, event });
    return true;
  }
  const target = event.target as HTMLElement | null;
  const imageFrame = target?.closest(".sd-image-frame") as HTMLElement | null;
  const imageElement = imageFrame?.querySelector(".sd-image-widget") as HTMLImageElement | null;
  if (!imageElement) return false;
  const sourceFrom = Number(imageFrame?.dataset.sourceFrom || imageElement.dataset.sourceFrom || "");
  const sourceTo = Number(imageFrame?.dataset.sourceTo || imageElement.dataset.sourceTo || "");
  const image = Number.isFinite(sourceFrom) && Number.isFinite(sourceTo)
    ? extractImages(view.state.doc.sliceString(sourceFrom, sourceTo))
      .map((item) => ({ ...item, start: item.start + sourceFrom, end: item.end + sourceFrom }))
      .find((item) => item.start >= sourceFrom && item.end <= sourceTo)
    : null;
  if (!image) return false;
  if (imageFrame?.dataset.readerHref || imageElement.dataset.readerHref) image.outerHref = imageFrame?.dataset.readerHref || imageElement.dataset.readerHref;
  const assetPath = normalizeAssetPath(imageFrame?.dataset.sourceSrc || imageElement.dataset.sourceSrc || image.src);
  if (!/^assets\//i.test(assetPath)) return false;
  event.preventDefault();
  const naturalWidth = imageElement?.naturalWidth || imageElement?.width || imageElement?.getBoundingClientRect().width || Number(image.width) || 1;
  const naturalHeight = imageElement?.naturalHeight || imageElement?.height || imageElement?.getBoundingClientRect().height || Number(image.height) || 1;
  imageResizeMenu.value = {
    open: true,
    top: event.clientY + 4,
    left: event.clientX + 4,
    image,
    naturalWidth,
    naturalHeight,
    assetPath,
    readerHref: readerHrefForImage(image),
    submenuLeft: event.clientX + 4 + 212 + 92 + 16 > window.innerWidth,
  };
  emit("imageContext", { assetPath, event });
  return true;
}

function deleteHeadingMarkerStep(editorView: EditorView) {
  const selection = editorView.state.selection.main;
  if (!selection.empty) return false;
  const line = editorView.state.doc.lineAt(selection.from);
  const beforeCursor = editorView.state.doc.sliceString(line.from, selection.from);
  const emptyHeading = beforeCursor.match(/^(#{1,6})\s$/);
  if (emptyHeading) {
    editorView.dispatch({
      changes: { from: line.from + emptyHeading[1].length, to: selection.from },
      selection: { anchor: line.from + emptyHeading[1].length },
    });
    return true;
  }
  const bareHeading = beforeCursor.match(/^(#{1,6})$/);
  if (bareHeading) {
    editorView.dispatch({
      changes: { from: line.from, to: selection.from },
      selection: { anchor: line.from },
    });
    return true;
  }
  return false;
}

function deleteListMarkerStep(editorView: EditorView) {
  const selection = editorView.state.selection.main;
  if (!selection.empty) return false;
  const edit = deleteListMarkerOnBackspace(editorView.state.doc.toString(), selection.from);
  if (!edit) return false;
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: edit.value },
    selection: { anchor: edit.selection.start },
    scrollIntoView: true,
  });
  return true;
}

const AUTO_PAIR_BRACKETS: Record<string, string> = {
  "(": ")",
  "（": "）",
  "[": "]",
  "【": "】",
  "{": "}",
};

function insertPairedBracket(editorView: EditorView, open: string, close: string) {
  const { state } = editorView;
  if (state.readOnly || isComposing || editorView.composing) return false;
  const tr = state.changeByRange((range) => {
    const selected = state.sliceDoc(range.from, range.to);
    return {
      changes: { from: range.from, to: range.to, insert: `${open}${selected}${close}` },
      range: selected
        ? EditorSelection.range(range.from + open.length, range.to + open.length)
        : EditorSelection.cursor(range.from + open.length),
    };
  });
  editorView.dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input.type" }));
  return true;
}

function backspacePairedBracketsStep(editorView: EditorView) {
  const selection = editorView.state.selection.main;
  if (!selection.empty) return false;
  const position = selection.from;
  if (position <= 0 || position >= editorView.state.doc.length) return false;
  const before = editorView.state.doc.sliceString(position - 1, position);
  const after = editorView.state.doc.sliceString(position, position + 1);
  if (AUTO_PAIR_BRACKETS[before] !== after) return false;
  editorView.dispatch({
    changes: { from: position - 1, to: position + 1, insert: "" },
    selection: { anchor: position - 1 },
    scrollIntoView: true,
  });
  return true;
}

function deleteNextLineListMarkerStep(editorView: EditorView) {
  const selection = editorView.state.selection.main;
  if (!selection.empty) return false;
  const edit = deleteNextLineListMarkerOnDelete(editorView.state.doc.toString(), selection.from);
  if (!edit) return false;
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: edit.value },
    selection: { anchor: edit.selection.start },
    scrollIntoView: true,
  });
  return true;
}

function contentIsEmpty(source: string, range: { contentStart: number; contentEnd: number }) {
  return !source.slice(range.contentStart, range.contentEnd).trim();
}

function deleteEmptySourceBlockStep(editorView: EditorView) {
  const selection = editorView.state.selection.main;
  if (!selection.empty) return false;
  const source = editorView.state.doc.toString();
  const position = selection.from;
  const math = findBlockMathRanges(source).find((range) =>
    position >= range.contentStart && position <= range.contentEnd && contentIsEmpty(source, range));
  const fenced = math ? null : findFencedCodeRanges(source).find((range) =>
    position >= range.contentStart && position <= range.contentEnd && contentIsEmpty(source, range));
  const range = math || fenced;
  if (!range) return false;
  editorView.dispatch({
    changes: { from: range.start, to: range.end, insert: "" },
    selection: { anchor: range.start },
    scrollIntoView: true,
  });
  return true;
}

function preserveSourceBlockBoundaryStep(editorView: EditorView) {
  const selection = editorView.state.selection.main;
  if (!selection.empty) return false;
  const source = editorView.state.doc.toString();
  const position = selection.from;
  return [...findBlockMathRanges(source), ...findFencedCodeRanges(source)].some((range) =>
    position === range.contentStart);
}

function createState(markdownSource: string) {
  return EditorState.create({
    doc: markdownSource,
    extensions: [
      history(),
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
        extensions: GFM,
        addKeymap: false,
      }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      indentUnit.of("    "),
      placeholder(placeholderText.value),
      redirectHiddenTableInput(),
      autoCloseFencedCodeInput(),
      protectBlockBoundaryInput(),
      autoPairBracketInput(),
      replaceCodeLigatureInput(),
      deferRenderedTextRevealOnPointerSelection(),
      preserveViewportOnSelectionChange(),
      silkdownPlugin({
        codeLineNumbers: props.settings?.markdown_code_line_numbers !== false,
        highlightEnabled: props.settings?.markdown_highlight_enabled !== false,
        mathEnabled: props.settings?.markdown_math_enabled !== false,
        htmlBlockLiveEnabled: props.settings?.markdown_html_live_enabled !== false,
        listFoldingEnabled: props.settings?.markdown_live_list_folding_enabled !== false,
        suppressSelectionReveal: shouldSuppressRenderedTextReveal,
        selectionRevealOverride: currentRenderedTextRevealSelection,
        liveBlockLabels: {
          mathFormula: t("liveMarkdown.mathFormula"),
          emptyMathBlock: t("liveMarkdown.emptyMathBlock"),
          editMathBlock: t("liveMarkdown.editMathBlock"),
          finishEditingMathBlock: t("liveMarkdown.finishEditingMathBlock"),
          mermaidDiagram: t("liveMarkdown.mermaidDiagram"),
        },
        link: {
          resolveImageUrl: (src, context) => resolvedImageUrl(src, context.href),
        },
      }),
      silkdownBaseTheme,
      editorTheme(),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        const composing = isComposing || update.view.composing;
        if (update.docChanged) {
          if (!composing) {
            scheduleModelUpdate();
            scheduleResolveEditorAssetImages();
          }
        }
        if (!composing && (update.docChanged || update.selectionSet)) {
          publishSelection(update.state);
          updateToolbarState();
        }
      }),
      EditorView.domEventHandlers({
        click(event) {
          return handleMouseLink(event);
        },
        contextmenu(event) {
          return handleImageContextMenu(event);
        },
        paste(event) {
          void handlePaste(event);
          return false;
        },
        keyup() {
          publishSelection();
          updateToolbarState();
          return false;
        },
        mouseup() {
          publishSelection();
          updateToolbarState();
          tableSelectionAnchor = null;
          tableDragStart = null;
          tableDragSelecting = false;
          editorRoot.value?.classList.remove("sd-table-selecting");
          return false;
        },
        pointerdown(event) {
          if (handleRenderedTextPointerDown(event as PointerEvent)) return true;
          if (suppressRenderedBlankPointerDown(event as PointerEvent)) return true;
          const target = event.target as HTMLElement | null;
          if (target?.closest(VIEWPORT_STABILIZING_WIDGET_SELECTOR)) {
            markViewportStableForSelection();
          }
          return handleTablePointerDown(event as PointerEvent);
        },
        pointerover(event) {
          return handleTablePointerEnter(event as PointerEvent);
        },
        mousemove(event) {
          return handleTableMouseMove(event);
        },
        focusin(event) {
          const target = event.target as HTMLElement | null;
          const tableCell = target?.closest(".sd-table-widget th, .sd-table-widget td") as HTMLTableCellElement | null;
          if (tableCell) updateTableToolbarFromCell(tableCell);
          return false;
        },
        focus() {
          publishSelection();
          updateToolbarState();
          return false;
        },
        blur() {
          flushModelUpdate();
          closeMathPreview();
          return false;
        },
        compositionstart() {
          handleCompositionStart();
          return false;
        },
        compositionend() {
          handleCompositionEnd();
          return false;
        },
      }),
      Prec.highest(keymap.of([
        ...Object.entries(AUTO_PAIR_BRACKETS).map(([open, close]) => ({
          key: open,
          run: (editorView: EditorView) => insertPairedBracket(editorView, open, close),
        })),
        {
          key: "Backspace",
          run(editorView) {
            return deleteEmptySourceBlockStep(editorView) || preserveSourceBlockBoundaryStep(editorView) || backspacePairedBracketsStep(editorView) || deleteHeadingMarkerStep(editorView) || deleteListMarkerStep(editorView);
          },
        },
        {
          key: "Delete",
          run(editorView) {
            return deleteNextLineListMarkerStep(editorView);
          },
        },
        {
          key: "Enter",
          run(editorView) {
            const blockEdit = completeBlockOnEnter(editorView.state.doc.toString(), editorView.state.selection.main.from);
            if (blockEdit) {
              dispatchEdit(blockEdit);
              return true;
            }
            const quoteEdit = continueBlockquoteOnEnter(editorView.state.doc.toString(), editorView.state.selection.main.from);
            if (quoteEdit) {
              dispatchEdit(quoteEdit);
              return true;
            }
            const edit = continueListOnEnter(editorView.state.doc.toString(), editorView.state.selection.main.from);
            if (edit) {
              dispatchEdit(edit);
              return true;
            }
            return false;
          },
        },
        {
          key: "Tab",
          preventDefault: true,
          run() {
            runSourceEdit((source, selection) => indentSelectedLines(source, selection, "in"));
            return true;
          },
        },
        {
          key: "Shift-Tab",
          preventDefault: true,
          run() {
            runSourceEdit((source, selection) => indentSelectedLines(source, selection, "out"));
            return true;
          },
        },
        { key: "Mod-b", run: () => runSourceEdit((source, selection) => toggleWrappedMarkdown(source, selection, "**")) },
        { key: "Mod-i", run: () => runSourceEdit((source, selection) => toggleWrappedMarkdown(source, selection, "*")) },
        { key: "Mod-u", run: () => runSourceEdit((source, selection) => toggleWrappedMarkdown(source, selection, "<u>", "</u>")) },
        { key: "Mod-e", run: () => runSourceEdit((source, selection) => toggleWrappedMarkdown(source, selection, "`")) },
        { key: "Mod-k", run: () => { void setLinkFromClipboard(); return true; } },
        { key: "Ctrl-k", run: () => { void setLinkFromClipboard(); return true; } },
        { key: "Mod-f", run: openSearchPanel },
        { key: "Mod-s", run: () => { flushModelUpdate(); return false; } },
        { key: "Mod-m", run: () => { insertMathFormula(); return true; } },
        { key: "Ctrl-m", run: () => { insertMathFormula(); return true; } },
        { key: "Ctrl-0", run: () => runSourceEdit((source, selection) => setHeading(source, selection, 0)) },
        { key: "Ctrl-1", run: () => runSourceEdit((source, selection) => setHeading(source, selection, 1)) },
        { key: "Ctrl-2", run: () => runSourceEdit((source, selection) => setHeading(source, selection, 2)) },
        { key: "Ctrl-3", run: () => runSourceEdit((source, selection) => setHeading(source, selection, 3)) },
        { key: "Ctrl-4", run: () => runSourceEdit((source, selection) => setHeading(source, selection, 4)) },
        { key: "Ctrl-5", run: () => runSourceEdit((source, selection) => setHeading(source, selection, 5)) },
        { key: "Ctrl-6", run: () => runSourceEdit((source, selection) => setHeading(source, selection, 6)) },
        { key: "Shift-Ctrl-7", run: () => runSourceEdit((source, selection) => toggleListPrefix(source, selection, true)) },
        { key: "Shift-Ctrl-8", run: () => runSourceEdit((source, selection) => toggleListPrefix(source, selection, false)) },
        ...searchKeymap,
        ...historyKeymap,
        ...defaultKeymap.filter((binding) => binding.key !== "Tab" && binding.key !== "Shift-Tab"),
        { key: "Alt-ArrowLeft", run: () => runSourceEdit((source, selection) => indentSelectedLines(source, selection, "out")) },
        { key: "Alt-ArrowRight", run: () => runSourceEdit((source, selection) => indentSelectedLines(source, selection, "in")) },
      ])),
      search({
        top: true,
      }),
    ],
  });
}

function deleteTableRows() {
  if (!activeTable.value.active) return;
  const range = selectedTableRange();
  if (activeTable.value.kind === "complex") {
    withActiveComplexTable((table) => {
      const grid = buildComplexTableGrid(table);
      const rowRange = calculateComplexTableSelectionRange(
        table,
        { row: range.startRow, col: 0 },
        { row: range.endRow, col: grid.colCount - 1 },
      );
      const rows = table.rows
        .filter((_row, index) => index < rowRange.startRow || index > rowRange.endRow)
        .map((row) => row.map((cell) => ({ ...cell, tag: cell.tag as "th" | "td" })));
      if (!rows.length) return null;
      return replaceComplexTableSource(editorSource(), table, { ...table, rows });
    });
    return;
  }
  withActiveTable((table) => {
    const rows = table.rows.filter((_row, index) => index < range.startRow || index > range.endRow);
    if (!rows.length) return null;
    if (rows.length === 1) rows.push(Array.from({ length: tableColumnCount(table.rows, table.alignments) }, () => " "));
    return replaceTable(editorSource(), table, rows);
  });
}

function deleteTableColumns() {
  if (!activeTable.value.active) return;
  const range = selectedTableRange();
  if (activeTable.value.kind === "complex") {
    withActiveComplexTable((table) => {
      const grid = buildComplexTableGrid(table);
      const columnRange = calculateComplexTableSelectionRange(
        table,
        { row: 0, col: range.startCol },
        { row: grid.rowCount - 1, col: range.endCol },
      );
      const selectedIds = new Set(complexCellIdsInRange(table, columnRange));
      const rows = table.rows.map((row, rowIndex) =>
        row
          .filter((_cell, index) => !selectedIds.has(complexCellId(rowIndex, index)))
          .map((cell) => ({ ...cell, tag: cell.tag as "th" | "td" })));
      if (!rows.some((row) => row.length)) return null;
      const columnWidths = table.columnWidths.filter((_width, index) => index < columnRange.startCol || index > columnRange.endCol);
      return replaceComplexTableSource(editorSource(), table, { ...table, rows, columnWidths });
    });
    return;
  }
  withActiveTable((table) => {
    const rows = table.rows.map((row) => row.filter((_cell, index) => index < range.startCol || index > range.endCol));
    if (!rows.some((row) => row.length)) return null;
    const alignments = table.alignments.filter((_align, index) => index < range.startCol || index > range.endCol);
    return replaceTable(editorSource(), table, rows, alignments);
  });
}

function setComplexTableWidth(width: string) {
  withActiveComplexTable((table) => replaceComplexTableSource(editorSource(), table, { ...table, width }));
  tableInteractionState.value = { ...tableInteractionState.value, width };
}

function mergeComplexCells() {
  withActiveComplexTable((table) => {
    const range = selectedTableRange();
    if (range.startRow === range.endRow && range.startCol === range.endCol) return null;
    const grid = buildComplexTableGrid(table);
    const selectedIds = new Set(complexCellIdsInRange(table, range));
    const topLeftId = grid.gridMap[range.startRow]?.[range.startCol] || [...selectedIds][0];
    if (!topLeftId) return null;
    const [topLeftRow, topLeftCol] = topLeftId.split(":").map(Number);
    const sourceCell = table.rows[topLeftRow]?.[topLeftCol];
    if (!sourceCell) return null;
    const mergedText = [...selectedIds]
      .map((cellId) => {
        const [sourceRow, sourceCol] = cellId.split(":").map(Number);
        return table.rows[sourceRow]?.[sourceCol]?.text.trim() || "";
      })
      .filter(Boolean)
      .join(" ");
    const rows = table.rows.map((row, rowIndex) => {
      return row.flatMap((cell, colIndex) => {
        const cellId = complexCellId(rowIndex, colIndex);
        if (!selectedIds.has(cellId)) return [{ ...cell, tag: cell.tag as "th" | "td" }];
        if (cellId !== topLeftId) return [];
        return [{
          ...sourceCell,
          text: mergedText || sourceCell.text || " ",
          rowspan: range.endRow - range.startRow + 1,
          colspan: range.endCol - range.startCol + 1,
        }];
      });
    });
    return replaceComplexTableSource(editorSource(), table, { ...table, rows });
  });
}

function splitComplexCell() {
  withActiveComplexTable((table) => {
    const activeCell = complexCellAtPoint(table, activeTable.value.rowIndex, activeTable.value.colIndex);
    if (!activeCell) return null;
    const rowIndex = activeCell.sourceRow;
    const colIndex = activeCell.sourceCol;
    const cell = activeCell.cell;
    if (!cell || (cell.rowspan <= 1 && cell.colspan <= 1)) return null;
    const rows = table.rows.map((row, index) => {
      const next = row.map((entry) => ({ ...entry, tag: entry.tag as "th" | "td" }));
      if (index === rowIndex) {
        const replacements: ComplexTableCell[] = [
          { ...cell, rowspan: 1, colspan: 1 },
          ...Array.from({ length: cell.colspan - 1 }, () => ({ tag: cell.tag, text: " ", rowspan: 1, colspan: 1, align: cell.align })),
        ];
        next.splice(colIndex, 1, ...replacements);
      } else if (index > rowIndex && index < rowIndex + cell.rowspan) {
        next.splice(
          complexInsertionIndexForVirtualColumn(table, index, activeCell.bounds.minCol),
          0,
          ...Array.from({ length: cell.colspan }, () => ({ tag: cell.tag, text: " ", rowspan: 1, colspan: 1, align: cell.align })),
        );
      }
      return next;
    });
    return replaceComplexTableSource(editorSource(), table, { ...table, rows });
  });
}

function distributeComplexColumns() {
  withActiveComplexTable((table) => {
    const count = complexTableColumnCount(table);
    const width = `${(100 / count).toFixed(2)}%`;
    return replaceComplexTableSource(editorSource(), table, {
      ...table,
      columnWidths: Array.from({ length: count }, () => width),
    });
  });
}

function downgradeComplexTableToMarkdown() {
  withActiveComplexTable((table) => {
    const markdown = complexTableToMarkdown(table);
    const value = `${editorSource().slice(0, table.start)}${markdown}${editorSource().slice(table.end)}`;
    return { value, selection: { start: table.start, end: table.start + markdown.length } };
  });
}

function mountEditor() {
  if (!editorRoot.value) return;
  view = new EditorView({
    parent: editorRoot.value,
    state: createState(currentMarkdown.value),
  });
  publishSelection();
  scheduleResolveEditorAssetImages();
  void nextTick(() => {
    updateToolbarState();
    updateMathPreview();
  });
}

function updateMarkdownWesternFontFamily(value: string) {
  emit("updateSettings", { markdown_western_font_family: value });
}

function updateMarkdownChineseFontFamily(value: string) {
  emit("updateSettings", { markdown_chinese_font_family: value });
}

function resolvedImageUrl(src: string, readerHref = "") {
  const normalized = normalizeAssetPath(src);
  if (!/^assets\//i.test(normalized)) return src;
  const image: SourceImageRange = { start: 0, end: 0, alt: "", src, outerHref: readerHref };
  for (const documentId of candidateDocumentIdsForImage(image)) {
    const cached = assetUrlCache.get(`${documentId}:${normalized}`);
    if (cached) return cached;
  }
  return src;
}

function scrollToHeading(headingId: string) {
  if (!view) return false;
  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    if (markdownHeadingIdFromLine(lineNumber - 1) !== headingId) continue;
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: "start", yMargin: 12 }),
    });
    view.focus();
    return true;
  }
  return false;
}

function openEditorSearch() {
  if (!view) return false;
  return openSearchPanel(view);
}

function currentViewState() {
  const selection = selectionRange();
  return {
    scroll_top: view?.scrollDOM.scrollTop || 0,
    selection_start: selection.start,
    selection_end: selection.end,
  };
}

function restoreViewState(state?: { scroll_top?: number; selection_start?: number; selection_end?: number } | null) {
  if (!view || !state) return;
  const anchor = Math.min(view.state.doc.length, Math.max(0, Math.trunc(state.selection_start || 0)));
  const head = Math.min(view.state.doc.length, Math.max(0, Math.trunc(state.selection_end ?? anchor)));
  view.dispatch({ selection: { anchor, head } });
  const applyScroll = () => {
    if (view && typeof state.scroll_top === "number") view.scrollDOM.scrollTop = Math.max(0, state.scroll_top);
  };
  void nextTick(() => {
    requestAnimationFrame(applyScroll);
    window.setTimeout(applyScroll, 80);
  });
}

defineExpose({
  openSearch: openEditorSearch,
  scrollToHeading,
  currentViewState,
  restoreViewState,
});

onMounted(() => {
  mountEditor();
  editorRoot.value?.addEventListener("pointerdown", handleEditorRootPointerDown, true);
  editorRoot.value?.addEventListener("mousedown", handleEditorRootMouseDown, true);
  window.addEventListener("pointerdown", handleGlobalPointerDown, true);
  window.addEventListener("mousedown", handleGlobalPointerDown, true);
  window.addEventListener("keydown", handleGlobalKeydown, true);
});

onBeforeUnmount(() => {
  stopTableDragTracking();
  mathToolbarResizeObserver?.disconnect();
  mathToolbarResizeObserver = null;
  clearRenderedTextRevealTimer();
  clearRenderedTextHideTimer();
  renderedTextHideSelection = null;
  editorRoot.value?.removeEventListener("pointerdown", handleEditorRootPointerDown, true);
  editorRoot.value?.removeEventListener("mousedown", handleEditorRootMouseDown, true);
  window.removeEventListener("pointerdown", handleGlobalPointerDown, true);
  window.removeEventListener("mousedown", handleGlobalPointerDown, true);
  window.removeEventListener("keydown", handleGlobalKeydown, true);
  if (assetResolveTimer !== null) window.clearTimeout(assetResolveTimer);
  if (modelUpdateTimer !== null) {
    flushModelUpdate();
  }
  view?.destroy();
  view = null;
});

watch(() => props.modelValue, (value) => {
  const normalized = (value || "").replace(/\r\n/g, "\n");
  if (isComposing || view?.composing) return;
  if (syncingFromEditor || normalized === currentMarkdown.value) return;
  currentMarkdown.value = normalized;
  if (!view) return;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: normalized },
    selection: { anchor: Math.min(view.state.selection.main.from, normalized.length) },
  });
  scheduleResolveEditorAssetImages();
});

watch(
  () => [
    props.settings?.markdown_code_line_numbers,
    props.settings?.markdown_code_ligatures,
    props.settings?.markdown_highlight_enabled,
    props.settings?.markdown_math_enabled,
    props.settings?.markdown_html_live_enabled,
    props.settings?.markdown_live_list_folding_enabled,
    language.value,
  ],
  () => {
    if (!view) return;
    const selection = view.state.selection;
    const scrollTop = view.scrollDOM.scrollTop;
    view.setState(createState(currentMarkdown.value));
    view.dispatch({ selection });
    view.scrollDOM.scrollTop = scrollTop;
  },
);

watch(() => props.documentId, () => {
  assetUrlCache.clear();
  if (view) view.dispatch({ effects: assetUrlEffect.of(new Map()) });
  scheduleResolveEditorAssetImages();
});

watch(mathToolbarRoot, observeMathToolbar, { flush: "post" });

watch(activeMathBlock, async () => {
  await nextTick();
  updateMathToolbarClearance();
}, { flush: "post" });
</script>

<template>
  <div
    class="live-editor live-codemirror-editor"
    :class="contextToolbarClass"
    :style="{ '--markdown-editor-font-size': `${props.fontSize || 15}px`, '--markdown-editor-font-family': markdownFontFamilyCss, '--markdown-code-font-family': markdownCodeFontFamilyCss, '--markdown-highlight-color': highlightColor, '--markdown-line-height': markdownLineHeight, '--markdown-code-font-scale': markdownCodeFontScale, '--markdown-code-line-height': markdownCodeLineHeight, '--live-math-toolbar-clearance': `${mathToolbarClearance}px` }"
  >
    <div class="live-markdown-toolbar" :aria-label="t('liveMarkdown.toolbar')">
    <div class="live-markdown-toolbar-row live-markdown-toolbar-row-properties" role="toolbar" :aria-label="t('liveMarkdown.properties')">
      <span class="live-markdown-toolbar-row-label">{{ t("liveMarkdown.properties") }}</span>
      <UiDropdown
        class="live-markdown-font-dropdown"
        :model-value="settings?.markdown_western_font_family || settings?.markdown_font_family || 'current'"
        :title="t('settings.markdownWesternFontFamily')"
        :options="markdownWesternFontOptions"
        menu-class="live-markdown-font-dropdown-menu"
        @update:model-value="updateMarkdownWesternFontFamily"
      />
      <UiDropdown
        class="live-markdown-font-dropdown"
        :model-value="settings?.markdown_chinese_font_family || 'current'"
        :title="t('settings.markdownChineseFontFamily')"
        :options="markdownChineseFontOptions"
        menu-class="live-markdown-font-dropdown-menu"
        @update:model-value="updateMarkdownChineseFontFamily"
      />
      <button type="button" :class="{ active: activeMarks.strong }" :title="t('liveMarkdown.bold')" @click="runSourceEdit((source, selection) => toggleWrappedMarkdown(source, selection, '**'))"><Bold :size="15" /></button>
      <button type="button" :class="{ active: activeMarks.em }" :title="t('liveMarkdown.italic')" @click="runSourceEdit((source, selection) => toggleWrappedMarkdown(source, selection, '*'))"><Italic :size="15" /></button>
      <button type="button" :class="{ active: activeMarks.underline }" :title="t('liveMarkdown.underline')" @click="runSourceEdit((source, selection) => toggleWrappedMarkdown(source, selection, '<u>', '</u>'))"><Underline :size="15" /></button>
      <button type="button" class="live-toolbar-highlight" :class="{ active: activeMarks.highlight }" :title="t('liveMarkdown.highlight')" @click="runSourceEdit((source, selection) => toggleWrappedMarkdown(source, selection, '=='))"><Highlighter :size="15" /></button>
      <button type="button" class="live-toolbar-strike" :class="{ active: activeMarks.strike }" :title="t('liveMarkdown.strikethrough')" @click="runSourceEdit((source, selection) => toggleWrappedMarkdown(source, selection, '~~'))"><Strikethrough :size="15" /></button>
      <button
        v-for="option in FONT_COLOR_OPTIONS"
        :key="option.value"
        type="button"
        class="live-font-color-button"
        :class="{ active: activeFontColor === option.value }"
        :title="t('liveMarkdown.fontColor', { color: t(option.labelKey) })"
        :style="{ '--live-font-color': option.swatch }"
        @click="runSourceEdit((source, selection) => toggleFontColor(source, selection, option.value))"
      >
        <Type :size="15" />
      </button>
      <button type="button" class="live-toolbar-clear-format" :disabled="!hasSelection" :title="t('liveMarkdown.clearFormatting')" @click="runSourceEdit((source, selection) => clearMarkdownFormatting(source, selection))"><Wand2 :size="15" /></button>
      <button type="button" class="live-toolbar-inline-code" :class="{ active: activeMarks.code }" :title="t('liveMarkdown.inlineCode')" @click="runSourceEdit((source, selection) => toggleWrappedMarkdown(source, selection, '`'))"><Code :size="15" /></button>
      <span v-if="settings?.markdown_live_list_folding_enabled !== false" class="live-toolbar-divider live-toolbar-list-fold-divider" />
      <button v-if="settings?.markdown_live_list_folding_enabled !== false" type="button" class="live-toolbar-list-fold-all live-toolbar-expand-all" :title="t('liveMarkdown.expandAllLists')" @click="expandAllLiveLists"><ChevronsDown :size="15" /></button>
      <button v-if="settings?.markdown_live_list_folding_enabled !== false" type="button" class="live-toolbar-list-fold-all live-toolbar-collapse-all" :title="t('liveMarkdown.collapseAllLists')" @click="collapseAllLiveLists"><ChevronsUp :size="15" /></button>
      <span class="live-toolbar-divider" />
      <UiDropdown
        class="live-block-dropdown"
        :model-value="activeBlockStyle"
        :title="t('liveMarkdown.paragraph')"
        :options="blockStyleOptions"
        menu-class="live-block-dropdown-menu"
        @update:model-value="setBlockStyle"
      />
      <div ref="liveMoreToolsRoot" class="live-more-tools live-more-tools-properties">
        <button ref="liveMoreToolsTrigger" type="button" class="live-more-tools-trigger" :class="{ active: liveMoreToolsOpen }" :title="t('liveMarkdown.moreTools')" @click="toggleLiveMoreTools"><MoreHorizontal :size="16" /></button>
      </div>
    </div>
    <div v-if="activeMathBlock" ref="mathToolbarRoot" class="live-markdown-toolbar-row live-markdown-toolbar-row-math" role="toolbar" :aria-label="t('liveMarkdown.mathToolbar')" @mousedown.prevent>
      <div v-for="group in MATH_TOOL_GROUPS" :key="group.key" class="live-math-tool-group">
        <button
          type="button"
          class="live-math-tool-card"
          :class="[{ active: mathGroupOpen === group.key }, `live-math-tool-card-${group.key}`]"
          :title="t(group.titleKey)"
          @mouseenter="previewMathGroupOnHover(group, $event)"
          @click="toggleMathGroup(group, $event)"
        >
          <span class="live-math-tool-preview" v-html="mathGroupPreviewHtml(group)" />
          <span class="live-math-tool-title">{{ t(group.titleKey) }}</span>
          <span class="live-math-tool-caret" aria-hidden="true" />
        </button>
      </div>
    </div>
    <div
      v-if="!activeMathBlock && activeTable.active"
      class="live-markdown-toolbar-row live-markdown-toolbar-row-table live-table-toolbar-row"
      :class="activeTable.kind === 'complex' ? 'live-table-toolbar-complex' : 'live-table-toolbar-markdown'"
      role="toolbar"
      :aria-label="t('liveMarkdown.tableToolbar')"
      @mousedown.prevent
    >
      <span class="live-markdown-toolbar-row-label live-table-toolbar-label">{{ activeTable.kind === "complex" ? t("liveMarkdown.complexTable") : t("liveMarkdown.markdownTable") }}</span>
      <span class="live-table-toolbar-group live-table-toolbar-convert-group">
        <button
          v-if="activeTable.kind === 'markdown'"
          type="button"
          :title="t('liveMarkdown.upgradeComplexTable')"
          @click="upgradeActiveTableToComplex"
        >
          <ChevronsUp :size="15" />
        </button>
        <button
          v-if="activeTable.kind === 'complex'"
          type="button"
          :title="t('liveMarkdown.downgradeMarkdownTable')"
          @click="downgradeComplexTableToMarkdown"
        >
          <ChevronsDown :size="15" />
        </button>
      </span>
      <span class="live-toolbar-divider live-table-toolbar-insert-divider" />
      <span class="live-table-toolbar-group live-table-toolbar-insert-group">
        <button type="button" :title="t('liveMarkdown.insertRowAbove')" @click="insertTableRow('above')"><ArrowUpToLine :size="15" /></button>
        <button type="button" :title="t('liveMarkdown.insertRowBelow')" @click="insertTableRow('below')"><ArrowDownToLine :size="15" /></button>
        <button type="button" :title="t('liveMarkdown.insertColumnLeft')" @click="insertTableColumn('left')"><ArrowLeftToLine :size="15" /></button>
        <button type="button" :title="t('liveMarkdown.insertColumnRight')" @click="insertTableColumn('right')"><ArrowRightToLine :size="15" /></button>
      </span>
      <span class="live-table-toolbar-group live-table-toolbar-delete-structure-group">
        <button type="button" :title="t('liveMarkdown.deleteRows')" @click="deleteTableRows"><TableRowsSplit :size="15" /></button>
        <button type="button" :title="t('liveMarkdown.deleteColumns')" @click="deleteTableColumns"><TableColumnsSplit :size="15" /></button>
      </span>
      <span class="live-toolbar-divider live-table-toolbar-align-divider" />
      <span class="live-table-toolbar-group live-table-toolbar-align-group">
        <button type="button" :class="{ active: activeTable.align === 'left' }" :title="t('liveMarkdown.alignLeft')" @click="setActiveColumnAlign('left')"><AlignLeft :size="15" /></button>
        <button type="button" :class="{ active: activeTable.align === 'center' }" :title="t('liveMarkdown.alignCenter')" @click="setActiveColumnAlign('center')"><AlignCenter :size="15" /></button>
        <button type="button" :class="{ active: activeTable.align === 'right' }" :title="t('liveMarkdown.alignRight')" @click="setActiveColumnAlign('right')"><AlignRight :size="15" /></button>
      </span>
      <span class="live-table-toolbar-group live-table-toolbar-advanced-group">
        <button type="button" :disabled="activeTable.kind !== 'complex'" :title="activeTable.kind === 'complex' ? t('liveMarkdown.mergeCells') : tableAdvancedTitle" @click="mergeComplexCells"><TableCellsMerge :size="15" /></button>
        <button type="button" :disabled="activeTable.kind !== 'complex'" :title="activeTable.kind === 'complex' ? t('liveMarkdown.splitCell') : tableAdvancedTitle" @click="splitComplexCell"><TableCellsSplit :size="15" /></button>
        <button type="button" :disabled="activeTable.kind !== 'complex'" :title="activeTable.kind === 'complex' ? t('liveMarkdown.distributeColumns') : tableAdvancedTitle" @click="distributeComplexColumns"><AlignHorizontalSpaceBetween :size="15" /></button>
      </span>
      <span v-if="activeTable.kind === 'complex'" class="live-table-toolbar-group live-table-toolbar-width-group">
        <button type="button" :title="t('liveMarkdown.tableWidthNarrow')" @click="setComplexTableWidth('60%')">60</button>
        <button type="button" :title="t('liveMarkdown.tableWidthNormal')" @click="setComplexTableWidth('100%')">100</button>
      </span>
      <span class="live-toolbar-divider" />
      <span class="live-table-toolbar-group live-table-toolbar-action-group">
        <button type="button" :title="t('liveMarkdown.copyTable')" @click="copyActiveTable"><Copy :size="15" /></button>
        <button type="button" class="live-table-toolbar-format-button" :disabled="activeTable.kind === 'complex'" :title="activeTable.kind === 'complex' ? t('liveMarkdown.formatMarkdownOnly') : t('liveMarkdown.formatTable')" @click="formatActiveTableSource"><Scan :size="15" /></button>
        <button type="button" class="danger" :title="t('liveMarkdown.deleteTable')" @click="deleteActiveTable"><Trash2 :size="15" /></button>
      </span>
      <div ref="liveTableMoreToolsRoot" class="live-more-tools live-table-more-tools">
        <button ref="liveTableMoreToolsTrigger" type="button" class="live-more-tools-trigger" :class="{ active: liveTableMoreToolsOpen }" :title="t('liveMarkdown.moreTools')" @click="toggleLiveTableMoreTools"><MoreHorizontal :size="16" /></button>
      </div>
    </div>
      <div v-if="!activeMathBlock && !activeTable.active && activeImage" class="live-markdown-toolbar-row live-markdown-toolbar-row-image live-image-toolbar" role="toolbar" :aria-label="t('liveMarkdown.imageToolbar')">
        <span class="live-markdown-toolbar-row-label live-image-toolbar-label">{{ t("liveMarkdown.image") }}</span>
        <button
          v-for="percent in IMAGE_RESIZE_PERCENTAGES"
          :key="percent"
          type="button"
          class="live-image-percent-button"
          :class="percent === 25 || percent === 75 || percent === 150 ? 'live-image-percent-secondary' : 'live-image-percent-primary'"
          :title="t('liveMarkdown.resizeImagePercent', { percent })"
          @click="resizeActiveImage(percent)"
        >
          {{ percent }}
        </button>
        <span class="live-toolbar-divider" />
        <button type="button" class="live-image-align-button" :class="{ active: activeImage?.image.alignment === 'left' }" :title="t('liveMarkdown.alignLeft')" @click="setActiveImageAlignment('left')"><AlignLeft :size="15" /></button>
        <button type="button" class="live-image-align-button" :class="{ active: activeImage?.image.alignment === 'center' }" :title="t('liveMarkdown.alignCenter')" @click="setActiveImageAlignment('center')"><AlignCenter :size="15" /></button>
        <button type="button" class="live-image-align-button" :class="{ active: activeImage?.image.alignment === 'right' }" :title="t('liveMarkdown.alignRight')" @click="setActiveImageAlignment('right')"><AlignRight :size="15" /></button>
        <span class="live-toolbar-divider live-image-percent-divider" />
        <button v-if="activeImage?.readerHref" type="button" class="live-image-source-button" :title="t('liveMarkdown.jumpToSource')" @click="jumpToActiveImageSource"><ArrowRightToLine :size="15" /></button>
        <button type="button" class="live-image-save-button" :title="t('liveMarkdown.saveImageAs')" @click="saveActiveImageAs"><Copy :size="15" /></button>
        <button type="button" class="danger live-image-delete-button" :title="t('common.delete')" @click="deleteActiveImage"><Trash2 :size="15" /></button>
        <div ref="liveImageMoreToolsRoot" class="live-more-tools live-image-more-tools">
          <button ref="liveImageMoreToolsTrigger" type="button" class="live-more-tools-trigger" :class="{ active: liveImageMoreToolsOpen }" :title="t('liveMarkdown.moreTools')" @click="toggleLiveImageMoreTools"><MoreHorizontal :size="16" /></button>
        </div>
      </div>
    <div v-if="!activeMathBlock && !activeTable.active && !activeImage" class="live-markdown-toolbar-row live-markdown-toolbar-row-insert" role="toolbar" :aria-label="t('liveMarkdown.insert')">
      <span class="live-markdown-toolbar-row-label">{{ t("liveMarkdown.insert") }}</span>
      <div class="live-insert-list-group">
        <button type="button" class="live-toolbar-list" :class="{ active: activeBlocks.bulletList }" :title="t('liveMarkdown.bulletList')" @click="runSourceEdit((source, selection) => toggleListPrefix(source, selection, false))"><List :size="15" /></button>
        <button type="button" class="live-toolbar-list" :class="{ active: activeBlocks.orderedList }" :title="t('liveMarkdown.orderedList')" @click="runSourceEdit((source, selection) => toggleListPrefix(source, selection, true))"><ListOrdered :size="15" /></button>
      </div>
      <span class="live-toolbar-divider live-insert-list-divider" />
      <div class="live-insert-math-group">
        <button type="button" :title="t('liveMarkdown.mathFormula')" @click="insertMathFormula"><Sigma :size="15" /></button>
        <button type="button" :title="t('liveMarkdown.mathBlock')" @click="insertMathBlockFormula"><SquareCode :size="15" /></button>
      </div>
      <div class="live-table-menu">
        <button ref="tableButtonRef" type="button" :class="{ active: tableMenuOpen }" :title="t('liveMarkdown.table')" @click="toggleTableMenu"><Table2 :size="15" /></button>
      </div>
      <UiDropdown
        class="live-callout-dropdown"
        :model-value="calloutKind"
        :title="t('liveMarkdown.callout')"
        :options="calloutOptions"
        menu-class="live-callout-dropdown-menu"
        @update:model-value="insertCallout($event as 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION')"
      />
      <div class="live-insert-toolbar-right">
        <button type="button" class="live-insert-image-button" :title="t('liveMarkdown.image')" @click="requestImageInsertion"><ImagePlus :size="15" /></button>
        <button type="button" class="live-insert-formula-ocr-button" :title="t('liveMarkdown.formulaOcr')" @click="requestFormulaOcrInsertion"><Scan :size="15" /></button>
      </div>
      <div ref="liveInsertMoreToolsRoot" class="live-more-tools live-insert-more-tools">
        <button ref="liveInsertMoreToolsTrigger" type="button" class="live-more-tools-trigger" :class="{ active: liveInsertMoreToolsOpen }" :title="t('liveMarkdown.moreTools')" @click="toggleLiveInsertMoreTools"><MoreHorizontal :size="16" /></button>
      </div>
    </div>
    </div>
    <Teleport to="body">
      <div v-if="liveMoreToolsOpen" class="live-more-tools-menu live-more-tools-floating" :style="liveMoreToolsStyle">
        <UiDropdown
          class="live-more-tools-dropdown"
          :model-value="settings?.markdown_western_font_family || settings?.markdown_font_family || 'current'"
          :title="t('settings.markdownWesternFontFamily')"
          :options="markdownWesternFontOptions"
          menu-class="live-markdown-font-dropdown-menu"
          @update:model-value="updateMarkdownWesternFontFamily"
        />
        <UiDropdown
          class="live-more-tools-dropdown"
          :model-value="settings?.markdown_chinese_font_family || 'current'"
          :title="t('settings.markdownChineseFontFamily')"
          :options="markdownChineseFontOptions"
          menu-class="live-markdown-font-dropdown-menu"
          @update:model-value="updateMarkdownChineseFontFamily"
        />
        <UiDropdown
          class="live-more-tools-dropdown"
          :model-value="activeBlockStyle"
          :title="t('liveMarkdown.paragraph')"
          :options="blockStyleOptions"
          menu-class="live-block-dropdown-menu"
          @update:model-value="setBlockStyle"
        />
        <div class="live-more-tools-grid">
          <button type="button" :class="{ active: activeMarks.strong }" :title="t('liveMarkdown.bold')" @click="runLiveMoreTool(() => runSourceEdit((source, selection) => toggleWrappedMarkdown(source, selection, '**')))"><Bold :size="15" /></button>
          <button type="button" :class="{ active: activeMarks.em }" :title="t('liveMarkdown.italic')" @click="runLiveMoreTool(() => runSourceEdit((source, selection) => toggleWrappedMarkdown(source, selection, '*')))"><Italic :size="15" /></button>
          <button type="button" :class="{ active: activeMarks.underline }" :title="t('liveMarkdown.underline')" @click="runLiveMoreTool(() => runSourceEdit((source, selection) => toggleWrappedMarkdown(source, selection, '<u>', '</u>')))"><Underline :size="15" /></button>
          <button type="button" :class="{ active: activeMarks.highlight }" :title="t('liveMarkdown.highlight')" @click="runLiveMoreTool(() => runSourceEdit((source, selection) => toggleWrappedMarkdown(source, selection, '==')))"><Highlighter :size="15" /></button>
          <button type="button" :class="{ active: activeMarks.strike }" :title="t('liveMarkdown.strikethrough')" @click="runLiveMoreTool(() => runSourceEdit((source, selection) => toggleWrappedMarkdown(source, selection, '~~')))"><Strikethrough :size="15" /></button>
          <button type="button" :disabled="!hasSelection" :title="t('liveMarkdown.clearFormatting')" @click="runLiveMoreTool(() => runSourceEdit((source, selection) => clearMarkdownFormatting(source, selection)))"><Wand2 :size="15" /></button>
          <button type="button" :class="{ active: activeMarks.code }" :title="t('liveMarkdown.inlineCode')" @click="runLiveMoreTool(() => runSourceEdit((source, selection) => toggleWrappedMarkdown(source, selection, '`')))"><Code :size="15" /></button>
          <button v-if="settings?.markdown_live_list_folding_enabled !== false" type="button" :title="t('liveMarkdown.expandAllLists')" @click="runLiveMoreTool(expandAllLiveLists)"><ChevronsDown :size="15" /></button>
          <button v-if="settings?.markdown_live_list_folding_enabled !== false" type="button" :title="t('liveMarkdown.collapseAllLists')" @click="runLiveMoreTool(collapseAllLiveLists)"><ChevronsUp :size="15" /></button>
        </div>
        <div class="live-more-tools-grid live-more-tools-colors">
          <button
            v-for="option in FONT_COLOR_OPTIONS"
            :key="option.value"
            type="button"
            class="live-font-color-button"
            :class="{ active: activeFontColor === option.value }"
            :title="t('liveMarkdown.fontColor', { color: t(option.labelKey) })"
            :style="{ '--live-font-color': option.swatch }"
            @click="runLiveMoreTool(() => runSourceEdit((source, selection) => toggleFontColor(source, selection, option.value)))"
          >
            <Type :size="15" />
          </button>
        </div>
      </div>
    </Teleport>
    <Teleport to="body">
      <div v-if="liveInsertMoreToolsOpen" class="live-more-tools-menu live-more-tools-floating live-insert-more-tools-menu" :style="liveInsertMoreToolsStyle">
        <UiDropdown
          class="live-more-tools-dropdown"
          :model-value="calloutKind"
          :title="t('liveMarkdown.callout')"
          :options="calloutOptions"
          menu-class="live-callout-dropdown-menu"
          @update:model-value="insertCalloutFromMore"
        />
        <div class="live-more-tools-grid">
          <button type="button" :class="{ active: activeBlocks.bulletList }" :title="t('liveMarkdown.bulletList')" @click="runLiveMoreTool(() => runSourceEdit((source, selection) => toggleListPrefix(source, selection, false)))"><List :size="15" /></button>
          <button type="button" :class="{ active: activeBlocks.orderedList }" :title="t('liveMarkdown.orderedList')" @click="runLiveMoreTool(() => runSourceEdit((source, selection) => toggleListPrefix(source, selection, true)))"><ListOrdered :size="15" /></button>
          <button type="button" :title="t('liveMarkdown.mathFormula')" @click="runLiveMoreTool(insertMathFormula)"><Sigma :size="15" /></button>
          <button type="button" :title="t('liveMarkdown.mathBlock')" @click="runLiveMoreTool(insertMathBlockFormula)"><SquareCode :size="15" /></button>
          <button type="button" :title="t('liveMarkdown.table')" @click="openTableMenuFromMore"><Table2 :size="15" /></button>
        </div>
        <div class="live-more-tools-grid live-insert-media-tools">
          <button type="button" :title="t('liveMarkdown.image')" @click="runLiveMoreTool(requestImageInsertion)"><ImagePlus :size="15" /></button>
          <button type="button" :title="t('liveMarkdown.formulaOcr')" @click="runLiveMoreTool(requestFormulaOcrInsertion)"><Scan :size="15" /></button>
        </div>
      </div>
    </Teleport>
    <Teleport to="body">
      <div v-if="liveTableMoreToolsOpen" class="live-more-tools-menu live-more-tools-floating live-table-more-tools-menu" :style="liveTableMoreToolsStyle">
        <div class="live-more-tools-grid">
          <button v-if="activeTable.kind === 'markdown'" type="button" :title="t('liveMarkdown.upgradeComplexTable')" @click="runLiveMoreTool(upgradeActiveTableToComplex)"><ChevronsUp :size="15" /></button>
          <button v-if="activeTable.kind === 'complex'" type="button" :title="t('liveMarkdown.downgradeMarkdownTable')" @click="runLiveMoreTool(downgradeComplexTableToMarkdown)"><ChevronsDown :size="15" /></button>
          <div class="live-more-tools-separator" />
          <button type="button" :title="t('liveMarkdown.insertRowAbove')" @click="runLiveMoreTool(() => insertTableRow('above'))"><ArrowUpToLine :size="15" /></button>
          <button type="button" :title="t('liveMarkdown.insertRowBelow')" @click="runLiveMoreTool(() => insertTableRow('below'))"><ArrowDownToLine :size="15" /></button>
          <button type="button" :title="t('liveMarkdown.insertColumnLeft')" @click="runLiveMoreTool(() => insertTableColumn('left'))"><ArrowLeftToLine :size="15" /></button>
          <button type="button" :title="t('liveMarkdown.insertColumnRight')" @click="runLiveMoreTool(() => insertTableColumn('right'))"><ArrowRightToLine :size="15" /></button>
          <div class="live-more-tools-separator" />
          <button type="button" :title="t('liveMarkdown.deleteRows')" @click="runLiveMoreTool(deleteTableRows)"><TableRowsSplit :size="15" /></button>
          <button type="button" :title="t('liveMarkdown.deleteColumns')" @click="runLiveMoreTool(deleteTableColumns)"><TableColumnsSplit :size="15" /></button>
          <div class="live-more-tools-separator" />
          <button type="button" :class="{ active: activeTable.align === 'left' }" :title="t('liveMarkdown.alignLeft')" @click="runLiveMoreTool(() => setActiveColumnAlign('left'))"><AlignLeft :size="15" /></button>
          <button type="button" :class="{ active: activeTable.align === 'center' }" :title="t('liveMarkdown.alignCenter')" @click="runLiveMoreTool(() => setActiveColumnAlign('center'))"><AlignCenter :size="15" /></button>
          <button type="button" :class="{ active: activeTable.align === 'right' }" :title="t('liveMarkdown.alignRight')" @click="runLiveMoreTool(() => setActiveColumnAlign('right'))"><AlignRight :size="15" /></button>
          <div v-if="activeTable.kind === 'complex'" class="live-more-tools-separator" />
          <button v-if="activeTable.kind === 'complex'" type="button" :title="t('liveMarkdown.mergeCells')" @click="runLiveMoreTool(mergeComplexCells)"><TableCellsMerge :size="15" /></button>
          <button v-if="activeTable.kind === 'complex'" type="button" :title="t('liveMarkdown.splitCell')" @click="runLiveMoreTool(splitComplexCell)"><TableCellsSplit :size="15" /></button>
          <button v-if="activeTable.kind === 'complex'" type="button" :title="t('liveMarkdown.distributeColumns')" @click="runLiveMoreTool(distributeComplexColumns)"><AlignHorizontalSpaceBetween :size="15" /></button>
          <div class="live-more-tools-separator" />
          <button type="button" :title="t('liveMarkdown.copyTable')" @click="runLiveMoreTool(copyActiveTable)"><Copy :size="15" /></button>
          <button type="button" :disabled="activeTable.kind === 'complex'" :title="activeTable.kind === 'complex' ? t('liveMarkdown.formatMarkdownOnly') : t('liveMarkdown.formatTable')" @click="runLiveMoreTool(formatActiveTableSource)"><Scan :size="15" /></button>
          <button type="button" class="danger" :title="t('liveMarkdown.deleteTable')" @click="runLiveMoreTool(deleteActiveTable)"><Trash2 :size="15" /></button>
        </div>
      </div>
    </Teleport>
    <Teleport to="body">
      <div v-if="liveImageMoreToolsOpen" class="live-more-tools-menu live-more-tools-floating live-image-more-tools-menu" :style="liveImageMoreToolsStyle">
        <div class="live-more-tools-grid">
          <button v-for="percent in IMAGE_RESIZE_PERCENTAGES" :key="percent" type="button" class="live-image-percent-button" :title="t('liveMarkdown.resizeImagePercent', { percent })" @click="runLiveMoreTool(() => resizeActiveImage(percent))">{{ percent }}</button>
          <button type="button" :class="{ active: activeImage?.image.alignment === 'left' }" :title="t('liveMarkdown.alignLeft')" @click="runLiveMoreTool(() => setActiveImageAlignment('left'))"><AlignLeft :size="15" /></button>
          <button type="button" :class="{ active: activeImage?.image.alignment === 'center' }" :title="t('liveMarkdown.alignCenter')" @click="runLiveMoreTool(() => setActiveImageAlignment('center'))"><AlignCenter :size="15" /></button>
          <button type="button" :class="{ active: activeImage?.image.alignment === 'right' }" :title="t('liveMarkdown.alignRight')" @click="runLiveMoreTool(() => setActiveImageAlignment('right'))"><AlignRight :size="15" /></button>
          <button v-if="activeImage?.readerHref" type="button" :title="t('liveMarkdown.jumpToSource')" @click="runLiveMoreTool(() => jumpToActiveImageSource($event))"><ArrowRightToLine :size="15" /></button>
          <button type="button" :title="t('liveMarkdown.saveImageAs')" @click="runLiveMoreTool(saveActiveImageAs)"><Copy :size="15" /></button>
          <button type="button" class="danger" :title="t('common.delete')" @click="runLiveMoreTool(deleteActiveImage)"><Trash2 :size="15" /></button>
        </div>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="activeMathGroup"
        class="live-math-tool-popover live-math-tool-floating"
        :style="{ top: `${mathMenuPosition.top}px`, left: `${mathMenuPosition.left}px`, width: `${mathMenuPosition.width}px`, maxHeight: `${mathMenuPosition.maxHeight}px` }"
        @mousedown.prevent
      >
        <section v-for="section in activeMathSections" :key="section.titleKey" class="live-math-symbol-section">
          <h3>{{ t(section.titleKey) }}</h3>
          <div class="live-math-symbol-grid">
            <button
              v-for="entry in section.entries"
              :key="`${activeMathGroup.key}-${section.titleKey}-${entry.text}-${entry.label}`"
              type="button"
              class="live-math-symbol-button"
              :class="[mathEntryPreviewClass(entry), activeMathGroup.key === 'matrix' ? 'matrix' : '']"
              :title="entry.text"
              @click="insertMathBlockSnippet(entry.text, entry.selectStart ?? entry.text.length, entry.selectEnd ?? entry.selectStart ?? entry.text.length); mathGroupOpen = null"
            >
              <span class="live-math-symbol-preview" v-html="mathEntryPreviewHtml(entry)" />
            </button>
          </div>
        </section>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="tableMenuOpen"
        class="live-table-grid live-table-insert-grid live-table-floating"
        :style="{ top: `${tableMenuPosition.top}px`, left: `${tableMenuPosition.left}px` }"
        role="menu"
        @mouseleave="setTableHover(3, 3)"
        @mousedown.prevent
      >
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
    </Teleport>
    <button
      v-if="tableHoverInsert.visible"
      type="button"
      class="live-table-hover-insert"
      :class="tableHoverInsert.kind"
      :style="{ top: `${tableHoverInsert.top}px`, left: `${tableHoverInsert.left}px` }"
      :title="tableHoverInsert.kind === 'row' ? t('liveMarkdown.insertRowHere') : t('liveMarkdown.insertColumnHere')"
      @mousedown.prevent
      @click="applyHoverInsert"
    >
      <CirclePlus :size="18" />
    </button>
    <div
      v-if="mathPreview.open"
      class="live-math-preview-popover"
      :class="{ block: mathPreview.display }"
      :style="{ top: `${mathPreview.top}px`, left: `${mathPreview.left}px` }"
      @mousedown.prevent
    >
      <div ref="mathPreviewRoot" class="live-math-preview-render" />
    </div>
    <div ref="editorRoot" class="live-codemirror-host" :data-placeholder="placeholderText" />
  </div>
</template>
