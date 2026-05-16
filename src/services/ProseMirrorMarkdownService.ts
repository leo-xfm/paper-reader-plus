import MarkdownIt from "markdown-it";
import { Schema } from "prosemirror-model";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import {
  MarkdownParser,
  MarkdownSerializer,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  schema as markdownSchema,
} from "prosemirror-markdown";
import { isAllowedMarkdownUrl } from "@/services/MarkdownRenderService";

const IMAGE_SIZE_PATTERN = /\s+=([1-9]\d{0,3})?x([1-9]\d{0,3})?$/;
const IMAGE_SIZE_TITLE_PREFIX = "PRP_SIZE:";

export const proseMirrorMarkdownSchema = new Schema({
  nodes: markdownSchema.spec.nodes
    .addBefore("image", "table", {
      content: "table_row+",
      group: "block",
      isolating: true,
      parseDOM: [{ tag: "table" }],
      toDOM: () => ["table", ["tbody", 0]],
    })
    .addBefore("image", "table_row", {
      content: "table_cell+",
      parseDOM: [{ tag: "tr" }],
      toDOM: () => ["tr", 0],
    })
    .addBefore("image", "table_cell", {
      content: "inline*",
      attrs: { header: { default: false }, align: { default: null } },
      isolating: true,
      parseDOM: [
        { tag: "th", getAttrs: (dom) => ({ header: true, align: tableCellDomAlign(dom) }) },
        { tag: "td", getAttrs: (dom) => ({ header: false, align: tableCellDomAlign(dom) }) },
      ],
      toDOM: (node) => {
        const align = tableCellAlign(node.attrs.align);
        return [node.attrs.header ? "th" : "td", align ? { style: `text-align: ${align};` } : {}, 0];
      },
    })
    .addBefore("image", "math_inline", {
      inline: true,
      group: "inline",
      atom: true,
      attrs: { latex: { default: "" }, display: { default: false } },
      parseDOM: [{ tag: "span[data-live-math]", getAttrs: (dom) => ({ latex: (dom as HTMLElement).dataset.latex || "", display: false }) }],
      toDOM: (node) => ["span", { "data-live-math": "inline", "data-latex": node.attrs.latex, class: "live-math-inline" }, node.attrs.latex],
    })
    .addBefore("paragraph", "math_block", {
      group: "block",
      atom: true,
      attrs: { latex: { default: "" } },
      parseDOM: [{ tag: "div[data-live-math-block]", getAttrs: (dom) => ({ latex: (dom as HTMLElement).dataset.latex || "" }) }],
      toDOM: (node) => ["div", { "data-live-math-block": "true", "data-latex": node.attrs.latex, class: "live-math-block" }, node.attrs.latex],
    }),
  marks: markdownSchema.spec.marks.addToEnd("underline", {
    parseDOM: [
      { tag: "u" },
      {
        style: "text-decoration",
        getAttrs: (value) => (/\bunderline\b/i.test(String(value)) ? null : false),
      },
    ],
    toDOM: () => ["u", 0],
  }),
});

function normalizeImageSizeSyntax(source: string) {
  return source.replace(/!\[([^\]]*)\]\(([^)\s]+)\s+=([1-9]\d{0,3})?x([1-9]\d{0,3})?\)/g, (_match, alt: string, url: string, width = "", height = "") => {
    return `![${alt}](${url} "${IMAGE_SIZE_TITLE_PREFIX}${width}x${height}")`;
  });
}

function stripUnsafeMarkdownUrls(source: string) {
  return source
    .replace(/!\[([^\]]*)\]\(([^)\n]+)\)/g, (match, alt: string, target: string) => {
      const url = target.trim().split(/\s+/)[0] || "";
      if (isAllowedMarkdownUrl(url)) return match;
      return alt ? `[image blocked: ${alt}]` : "[image blocked]";
    })
    .replace(/\[([^\]]+)\]\(([^)\n]+)\)/g, (match, label: string, target: string) => {
      const url = target.trim().split(/\s+/)[0] || "";
      if (isAllowedMarkdownUrl(url)) return match;
      return label;
    });
}

const markdownIt = MarkdownIt("commonmark", { html: false });
markdownIt.validateLink = isAllowedMarkdownUrl;
markdownIt.enable("table");

markdownIt.inline.ruler.before("escape", "paper_reader_math_inline", (state, silent) => {
  if (state.src.startsWith("$$", state.pos) || state.src[state.pos] !== "$") return false;
  const start = state.pos + 1;
  const end = state.src.indexOf("$", start);
  if (end < 0 || end === start || state.src.slice(start, end).includes("\n")) return false;
  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.content = state.src.slice(start, end).trim();
    token.markup = "$";
  }
  state.pos = end + 1;
  return true;
});

markdownIt.inline.ruler.before("text", "paper_reader_underline", (state, silent) => {
  if (!state.src.startsWith("<u>", state.pos)) return false;
  const start = state.pos + 3;
  const end = state.src.indexOf("</u>", start);
  if (end < 0 || end === start || state.src.slice(start, end).includes("\n")) return false;
  if (!silent) {
    const open = state.push("underline_open", "u", 1);
    open.markup = "<u>";
    const text = state.push("text", "", 0);
    text.content = state.src.slice(start, end);
    const close = state.push("underline_close", "u", -1);
    close.markup = "</u>";
  }
  state.pos = end + 4;
  return true;
});

markdownIt.block.ruler.before("fence", "paper_reader_math_block", (state, startLine, endLine, silent) => {
  const startPos = state.bMarks[startLine] + state.tShift[startLine];
  const startMax = state.eMarks[startLine];
  const firstLine = state.src.slice(startPos, startMax).trim();
  const singleLineMatch = firstLine.match(/^\$\$([^$].*?)\$\$$/);
  if (singleLineMatch) {
    if (!silent) {
      const token = state.push("math_block", "math", 0);
      token.block = true;
      token.content = singleLineMatch[1].trim();
      token.map = [startLine, startLine + 1];
      token.markup = "$$";
    }
    state.line = startLine + 1;
    return true;
  }
  if (firstLine !== "$$") return false;
  let nextLine = startLine + 1;
  const content: string[] = [];
  for (; nextLine < endLine; nextLine += 1) {
    const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
    const lineEnd = state.eMarks[nextLine];
    const line = state.src.slice(lineStart, lineEnd);
    if (line.trim() === "$$") break;
    content.push(line);
  }
  if (nextLine >= endLine) return false;
  if (!silent) {
    const token = state.push("math_block", "math", 0);
    token.block = true;
    token.content = content.join("\n").trim();
    token.map = [startLine, nextLine + 1];
    token.markup = "$$";
  }
  state.line = nextLine + 1;
  return true;
});

function tableCellAlign(value: unknown) {
  return value === "left" || value === "center" || value === "right" ? value : null;
}

function tableCellDomAlign(dom: string | HTMLElement) {
  if (typeof dom === "string") return null;
  const styleAlign = tableCellAlign(dom.style.textAlign);
  const attrAlign = tableCellAlign(dom.getAttribute("align"));
  return styleAlign || attrAlign;
}

function tableCellTokenAlign(token: { attrs?: [string, string][] | null; attrGet?: (name: string) => string | null } | undefined) {
  const style = token?.attrGet?.("style") || token?.attrs?.find(([name]) => name === "style")?.[1] || "";
  const attrAlign = token?.attrGet?.("align") || token?.attrs?.find(([name]) => name === "align")?.[1] || "";
  const styleMatch = style.match(/text-align\s*:\s*(left|center|right)/i);
  return tableCellAlign(styleMatch?.[1]?.toLowerCase()) || tableCellAlign(attrAlign.toLowerCase());
}

function tableCellAttrs(tokens: unknown[], index: number) {
  const token = tokens[index] as { type?: string; attrs?: [string, string][] | null; attrGet?: (name: string) => string | null } | undefined;
  return { header: token?.type === "th_open", align: tableCellTokenAlign(token) };
}

export const proseMirrorMarkdownParser = new MarkdownParser(
  proseMirrorMarkdownSchema,
  markdownIt,
  {
    ...defaultMarkdownParser.tokens,
    table: { block: "table" },
    math_inline: { node: "math_inline", getAttrs: (token) => ({ latex: token.content, display: false }) },
    math_block: { node: "math_block", getAttrs: (token) => ({ latex: token.content }) },
    underline: { mark: "underline" },
    tr: { block: "table_row" },
    th: { block: "table_cell", getAttrs: (_token, tokens, index) => tableCellAttrs(tokens, index) },
    td: { block: "table_cell", getAttrs: (_token, tokens, index) => tableCellAttrs(tokens, index) },
    thead: { ignore: true },
    tbody: { ignore: true },
  },
);

export const proseMirrorMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    image(state, node) {
      const src = String(node.attrs.src || "").replace(IMAGE_SIZE_PATTERN, "");
      const title = String(node.attrs.title || "");
      const sizeMatch = title.match(/^PRP_SIZE:([1-9]\d{0,3})?x([1-9]\d{0,3})?$/);
      const size = sizeMatch ? ` =${sizeMatch[1] || ""}x${sizeMatch[2] || ""}` : "";
      const titlePart = title && !sizeMatch ? ` "${title.replace(/"/g, '\\"')}"` : "";
      state.write(`![${state.esc(node.attrs.alt || "")}](${src.replace(/[\(\)]/g, "\\$&")}${size}${titlePart})`);
    },
    math_inline(state, node) {
      state.write(`$${String(node.attrs.latex || "").trim()}$`);
    },
    math_block(state, node) {
      state.write(`$$\n${String(node.attrs.latex || "").trim()}\n$$`);
      state.closeBlock(node);
    },
    table(state, node) {
      const rows: string[][] = [];
      node.forEach((row) => {
        const cells: string[] = [];
        row.forEach((cell) => {
          const content: string[] = [];
          cell.forEach((child) => {
            content.push(child.textContent);
          });
          cells.push(content.join("").replace(/\|/g, "\\|").trim() || " ");
        });
        rows.push(cells);
      });
      if (!rows.length) return;
      const columnCount = Math.max(...rows.map((row) => row.length));
      const normalized = rows.map((row) => [...row, ...Array(Math.max(0, columnCount - row.length)).fill(" ")]);
      const header = normalized[0];
      const firstRow = node.firstChild;
      const alignments = Array.from({ length: columnCount }, (_value, index) => {
        const align = tableCellAlign(firstRow?.child(index)?.attrs.align);
        if (align === "left") return ":---";
        if (align === "center") return ":---:";
        if (align === "right") return "---:";
        return "---";
      });
      state.write(`| ${header.join(" | ")} |\n`);
      state.write(`| ${alignments.join(" | ")} |\n`);
      normalized.slice(1).forEach((row) => {
        state.write(`| ${row.join(" | ")} |\n`);
      });
      state.closeBlock(node);
    },
    table_row() {},
    table_cell() {},
  },
  {
    ...defaultMarkdownSerializer.marks,
    underline: {
      open: "<u>",
      close: "</u>",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
  },
  { strict: false },
);

export function normalizeMarkdownForProseMirror(source: string) {
  return normalizeImageSizeSyntax(stripUnsafeMarkdownUrls((source || "").replace(/\r\n/g, "\n")));
}

export function parseMarkdownToDoc(markdown: string) {
  return proseMirrorMarkdownParser.parse(normalizeMarkdownForProseMirror(markdown));
}

export function serializeDocToMarkdown(doc: ProseMirrorNode) {
  return proseMirrorMarkdownSerializer
    .serialize(doc, { tightLists: true })
    .replace(/^(\s*(?:[*+-]|\d+\.)\s+)\\\[([ xX])\\\]\s/gm, "$1[$2] ")
    .replace(/\\([*`])/g, "$1")
    .trimEnd();
}

export function markdownOffsetFromDocPosition(doc: ProseMirrorNode, position: number) {
  const safePosition = Math.max(0, Math.min(position, doc.content.size));
  const before = doc.cut(0, safePosition);
  return serializeDocToMarkdown(before).length;
}
