export type SourceSelection = { start: number; end: number };
export type ImageAlignment = "left" | "center" | "right";

export type SourceEdit = {
  value: string;
  selection: SourceSelection;
};

export type MarkdownCodeLigatureReplacement = {
  start: number;
  end: number;
  text: string;
};

export type SourceLinkRange = SourceSelection & {
  href: string;
  label: string;
  markdown: boolean;
};

export type SourceImageRange = SourceSelection & {
  alt: string;
  src: string;
  width?: string;
  height?: string;
  title?: string;
  outerHref?: string;
  format?: "markdown" | "html";
  alignment?: ImageAlignment;
  containerStart?: number;
  containerEnd?: number;
  style?: string;
};

export type SourceTableRange = SourceSelection & {
  rows: string[][];
  alignments: Array<"left" | "center" | "right" | null>;
};

export type SourceRenderRange = SourceSelection & {
  kind:
    | "heading"
    | "strong"
    | "em"
    | "underline"
    | "fontColor"
    | "inlineCode"
    | "table"
    | "callout";
  level?: number;
  text?: string;
  color?: string;
  table?: SourceTableRange;
};

const MARKDOWN_LINK_PATTERN = /!?\[[^\]\n]*(?:\]\([^) \n]+(?:\s+[^)\n]*)?\)|\]\([^)\n]*\))|\[[^\]\n]+\]\([^) \n]+(?:\s+[^)\n]*)?\)/g;
const BARE_LINK_PATTERN = /(?:https?:\/\/|www\.|\/reader\?|readerp:\/\/|readerm:\/\/)[^\s<>"')]+/g;
const IMAGE_PATTERN = /!\[([^\]\n]*)\]\(([^)\s\n]+)(?:\s+=([1-9]\d{0,3})?x([1-9]\d{0,3})?)?(?:\s+"([^"]*)")?\)/g;
const LINKED_IMAGE_PATTERN = /\[(!\[[^\]\n]*\]\([^)]+\))\]\(((?:\/reader\?|https?:\/\/|www\.|readerp:\/\/|readerm:\/\/)[^)\s\n]+)\)/g;
const HTML_IMAGE_PATTERN = /<img\b[^>]*>/gi;
const HTML_ALIGNED_IMAGE_CONTAINER_PATTERN = /<div\b[^>]*\balign\s*=\s*(?:"(left|center|right)"|'(left|center|right)'|(left|center|right))[^>]*>\s*(<img\b[^>]*>)\s*<\/div>/gi;
const LIST_INDENT = "    ";
const MARKDOWN_CODE_LIGATURES = [
  ["-->", "→"],
  ["<--", "←"],
  ["^--", "↑"],
  ["--^", "↓"],
  ["!=", "≠"],
  [">=", "≥"],
  ["<=", "≤"],
] as const;
const CALLOUT_PATTERN = /^\s{0,3}>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*(.*))?$/i;
const INLINE_COLOR_PATTERN = /<span\s+style=(["'])color:\s*(#[0-9a-f]{6}|black|red|green|blue|purple)\s*;?\1>([^\n]*?\S[^\n]*?)<\/span>/gi;
const EXPLICIT_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

export function normalizedMarkdownLinkHref(value: string) {
  const trimmed = value.trim();
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function orderedRange(selection: SourceSelection): SourceSelection {
  return {
    start: Math.min(selection.start, selection.end),
    end: Math.max(selection.start, selection.end),
  };
}

function selectedText(source: string, selection: SourceSelection) {
  const range = orderedRange(selection);
  return source.slice(range.start, range.end);
}

function isSafeImageSource(value: string) {
  const trimmed = value.trim();
  return /^(?:\.\/)?assets\/[^?#\s]+(?:[?#][^\s]*)?$/i.test(trimmed) ||
    /^https?:\/\//i.test(trimmed) ||
    /^data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,/i.test(trimmed) ||
    (/^[^\s<>"']+$/.test(trimmed) && !trimmed.startsWith("//") && !EXPLICIT_SCHEME_PATTERN.test(trimmed));
}

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function htmlAttributes(tag: string) {
  const attrs = new Map<string, string>();
  const pattern = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attrs.set(match[1].toLowerCase(), decodeHtmlAttribute(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return attrs;
}

function htmlImageFromTag(tag: string, start: number, end: number, container?: { start: number; end: number; alignment?: ImageAlignment }): SourceImageRange | null {
  const attrs = htmlAttributes(tag);
  const src = attrs.get("src") || "";
  if (!isSafeImageSource(src)) return null;
  return {
    start,
    end,
    alt: attrs.get("alt") || "",
    src,
    width: attrs.get("width"),
    height: attrs.get("height"),
    title: attrs.get("title"),
    style: attrs.get("style"),
    format: "html",
    alignment: container?.alignment,
    containerStart: container?.start,
    containerEnd: container?.end,
  };
}

function replaceOrAppendHtmlAttribute(tag: string, name: string, value: string) {
  const escaped = escapeHtmlAttribute(value);
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'=<>` + "`" + `]+)`, "i");
  if (pattern.test(tag)) return tag.replace(pattern, ` ${name}="${escaped}"`);
  return tag.replace(/\s*\/?>$/, (end) => ` ${name}="${escaped}"${end.trimStart()}`);
}

export function stripMarkdownFormattingForPlainPaste(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/```[^\n`]*\n([\s\S]*?)\n```/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(INLINE_COLOR_PATTERN, "$3")
    .replace(/<u>([\s\S]*?)<\/u>/gi, "$1")
    .replace(/==([^=\n]+)==/g, "$1")
    .replace(/~~([^~\n]+)~~/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, "$1$2")
    .replace(/(^|[^\w_])_([^_\n]+)_(?!\w)/g, "$1$2")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/^[ \t]{0,3}[-+*][ \t]+\[[ xX]\][ \t]+/gm, "")
    .replace(/^[ \t]{0,3}[-+*][ \t]+/gm, "")
    .replace(/^[ \t]{0,3}\d+\.[ \t]+/gm, "");
}

export function toggleWrappedMarkdown(source: string, selection: SourceSelection, open: string, close = open): SourceEdit {
  const range = orderedRange(selection);
  const before = source.slice(Math.max(0, range.start - open.length), range.start);
  const after = source.slice(range.end, range.end + close.length);
  if (before === open && after === close) {
    const value = `${source.slice(0, range.start - open.length)}${source.slice(range.start, range.end)}${source.slice(range.end + close.length)}`;
    return {
      value,
      selection: { start: range.start - open.length, end: range.end - open.length },
    };
  }
  const fallback = open === "$" ? "x" : open === "`" ? "code" : "text";
  const content = source.slice(range.start, range.end) || fallback;
  const value = `${source.slice(0, range.start)}${open}${content}${close}${source.slice(range.end)}`;
  const start = range.start + open.length;
  return {
    value,
    selection: { start, end: start + content.length },
  };
}

export function insertMathBlockSource(source: string, selection: SourceSelection): SourceEdit {
  const range = orderedRange(selection);
  const content = source.slice(range.start, range.end);
  const text = `$$\n${content}\n$$`;
  const value = `${source.slice(0, range.start)}${text}${source.slice(range.end)}`;
  const start = range.start + "$$\n".length;
  return {
    value,
    selection: { start, end: start + content.length },
  };
}

export function toggleFontColor(source: string, selection: SourceSelection, color: string): SourceEdit {
  const safeColor = color.trim().toLowerCase();
  const range = orderedRange(selection);
  const line = lineBoundsAt(source, range.start);
  const lineText = source.slice(line.start, line.end);
  INLINE_COLOR_PATTERN.lastIndex = 0;
  for (const match of lineText.matchAll(INLINE_COLOR_PATTERN)) {
    const start = line.start + (match.index || 0);
    const end = start + match[0].length;
    const content = match[3] || "";
    const contentStart = start + match[0].indexOf(content);
    const contentEnd = contentStart + content.length;
    if (range.start < contentStart || range.end > contentEnd) continue;
    if ((match[2] || "").toLowerCase() === safeColor || safeColor === "black") {
      const value = `${source.slice(0, start)}${content}${source.slice(end)}`;
      return { value, selection: { start, end: start + content.length } };
    }
    const next = `<span style="color: ${safeColor};">${content}</span>`;
    const nextContentStart = start + next.indexOf(content);
    const value = `${source.slice(0, start)}${next}${source.slice(end)}`;
    return { value, selection: { start: nextContentStart, end: nextContentStart + content.length } };
  }

  const content = source.slice(range.start, range.end) || "text";
  if (safeColor === "black") {
    return { value: source, selection: { start: range.start, end: range.start + content.length } };
  }
  const next = `<span style="color: ${safeColor};">${content}</span>`;
  const start = range.start + next.indexOf(content);
  const value = `${source.slice(0, range.start)}${next}${source.slice(range.end)}`;
  return { value, selection: { start, end: start + content.length } };
}

export function clearMarkdownFormatting(source: string, selection: SourceSelection): SourceEdit {
  const range = orderedRange(selection);
  const selected = source.slice(range.start, range.end);
  if (!selected) return { value: source, selection: range };
  const plain = stripMarkdownFormattingForPlainPaste(selected);
  const start = range.start;
  const end = range.end;
  return {
    value: `${source.slice(0, start)}${plain}${source.slice(end)}`,
    selection: { start, end: start + plain.length },
  };
}

function parseMarkdownLinkToken(token: string): { label: string; href: string } | null {
  const imageOuter = token.match(/^\[(!\[[^\]\n]*\]\([^)]+\))\]\(([^)\s\n]+)(?:\s+[^)\n]*)?\)$/);
  if (imageOuter) return { label: imageOuter[1], href: normalizedMarkdownLinkHref(imageOuter[2]) };
  const link = token.match(/^\[([^\]\n]+)\]\(([^)\s\n]+)(?:\s+[^)\n]*)?\)$/);
  if (link) return { label: link[1], href: normalizedMarkdownLinkHref(link[2]) };
  return null;
}

export function findLinkAt(source: string, position: number, scanWindow = source.length): SourceLinkRange | null {
  const safePos = Math.max(0, Math.min(position, source.length));
  const windowStart = Math.max(0, safePos - scanWindow);
  const windowEnd = Math.min(source.length, safePos + scanWindow);
  const scanStart = source.lastIndexOf("\n", Math.max(0, windowStart - 1)) + 1;
  const nextBreak = source.indexOf("\n", windowEnd);
  const scanEnd = nextBreak < 0 ? source.length : nextBreak;
  const segment = source.slice(scanStart, scanEnd);
  for (const match of segment.matchAll(MARKDOWN_LINK_PATTERN)) {
    const start = scanStart + (match.index || 0);
    const end = start + match[0].length;
    if (safePos < start || safePos > end) continue;
    const parsed = parseMarkdownLinkToken(match[0]);
    if (!parsed) continue;
    return { start, end, href: parsed.href, label: parsed.label, markdown: true };
  }
  for (const match of segment.matchAll(BARE_LINK_PATTERN)) {
    const start = scanStart + (match.index || 0);
    const end = start + match[0].length;
    if (safePos >= start && safePos <= end) {
      return { start, end, href: normalizedMarkdownLinkHref(match[0]), label: match[0], markdown: false };
    }
  }
  return null;
}

export function setLinkHref(source: string, selection: SourceSelection, href: string, existing?: SourceLinkRange | null): SourceEdit {
  const trimmed = normalizedMarkdownLinkHref(href);
  const range = existing || findLinkAt(source, selection.start);
  if (range?.markdown) {
    if (!trimmed) {
      const value = `${source.slice(0, range.start)}${range.label}${source.slice(range.end)}`;
      return { value, selection: { start: range.start, end: range.start + range.label.length } };
    }
    const next = `[${range.label}](${trimmed})`;
    const value = `${source.slice(0, range.start)}${next}${source.slice(range.end)}`;
    return { value, selection: { start: range.start, end: range.start + next.length } };
  }
  const selected = selectedText(source, selection);
  if (!trimmed) return { value: source, selection: orderedRange(selection) };
  const label = selected || trimmed;
  const rangeToReplace = range && !range.markdown ? range : orderedRange(selection);
  const next = `[${label}](${trimmed})`;
  const value = `${source.slice(0, rangeToReplace.start)}${next}${source.slice(rangeToReplace.end)}`;
  return { value, selection: { start: rangeToReplace.start + 1, end: rangeToReplace.start + 1 + label.length } };
}

function lineBoundsAt(source: string, position: number) {
  const safePos = Math.max(0, Math.min(position, source.length));
  const start = source.lastIndexOf("\n", Math.max(0, safePos - 1)) + 1;
  const nextBreak = source.indexOf("\n", safePos);
  return { start, end: nextBreak < 0 ? source.length : nextBreak };
}

function isInFencedCodeBlock(source: string, position: number) {
  const safePos = Math.max(0, Math.min(position, source.length));
  const lines = source.slice(0, safePos).split("\n");
  let fence: "`" | "~" | null = null;
  for (const line of lines) {
    const match = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
    if (!match) continue;
    const marker = match[1][0] as "`" | "~";
    if (!fence) {
      fence = marker;
    } else if (fence === marker) {
      fence = null;
    }
  }
  return fence !== null;
}

function isClosingFenceLine(text: string, fence: string) {
  const match = text.match(/^[ \t]{0,3}(`{3,})[ \t]*$/);
  return Boolean(match && match[1].length >= fence.length);
}

function existingFenceCloseAfterLine(source: string, lineEnd: number, fence: string) {
  if (source[lineEnd] !== "\n") return null;
  const nextLine = lineBoundsAt(source, lineEnd + 1);
  const nextText = source.slice(nextLine.start, nextLine.end);
  if (isClosingFenceLine(nextText, fence)) return { cursor: null };
  if (nextText.trim()) return null;
  if (source[nextLine.end] !== "\n") return null;
  const closeLine = lineBoundsAt(source, nextLine.end + 1);
  const closeText = source.slice(closeLine.start, closeLine.end);
  if (!isClosingFenceLine(closeText, fence)) return null;
  return { cursor: nextLine.start };
}

export function markdownCodeLigatureReplacement(source: string, cursor: number, insertedText: string): MarkdownCodeLigatureReplacement | null {
  if (insertedText.length !== 1) return null;
  const safeCursor = Math.max(0, Math.min(cursor, source.length));
  for (const [token, replacement] of MARKDOWN_CODE_LIGATURES) {
    if (!token.endsWith(insertedText)) continue;
    const start = safeCursor - token.length + 1;
    if (start < 0) continue;
    if (`${source.slice(start, safeCursor)}${insertedText}` !== token) continue;
    if (isInFencedCodeBlock(source, start)) return null;
    return { start, end: safeCursor, text: replacement };
  }
  return null;
}

export function continueListOnEnter(source: string, position: number): SourceEdit | null {
  const line = lineBoundsAt(source, position);
  if (position < line.start || position > line.end) return null;
  const beforeCursor = source.slice(line.start, position);
  const fullLine = source.slice(line.start, line.end);
  const match = beforeCursor.match(/^(\s*)((?:[-+*])|(?:\d+\.))(\s+)(.*)$/);
  if (!match) return null;
  const indent = match[1];
  const marker = match[2];
  const spacing = match[3] || " ";
  const contentBefore = match[4] || "";
  const contentAfter = source.slice(position, line.end);
  if (!contentBefore.trim() && !contentAfter.trim()) {
    const value = `${source.slice(0, line.start)}${source.slice(line.end)}`;
    return { value, selection: { start: line.start, end: line.start } };
  }
  let nextMarker = marker;
  if (/^\d+\.$/.test(marker)) nextMarker = `${Number.parseInt(marker, 10) + 1}.`;
  const insertion = `\n${indent}${nextMarker}${spacing}`;
  const value = `${source.slice(0, position)}${insertion}${source.slice(position)}`;
  const next = position + insertion.length;
  if (fullLine.trim() === `${marker}`) return null;
  return { value, selection: { start: next, end: next } };
}

export function continueBlockquoteOnEnter(source: string, position: number): SourceEdit | null {
  const line = lineBoundsAt(source, position);
  if (position < line.start || position > line.end) return null;
  const beforeCursor = source.slice(line.start, position);
  const afterCursor = source.slice(position, line.end);
  const match = beforeCursor.match(/^(\s{0,3}>)(\s?)(.*)$/);
  if (!match) return null;

  const marker = match[1];
  const spacing = match[2] || " ";
  const contentBefore = match[3] || "";
  if (!contentBefore.trim()) {
    const value = `${source.slice(0, line.start)}${source.slice(line.end)}`;
    return { value, selection: { start: line.start, end: line.start } };
  }

  const insertion = afterCursor.trim() ? `\n${marker}${spacing}` : `\n${marker}\n${marker}${spacing}`;
  const value = `${source.slice(0, position)}${insertion}${source.slice(position)}`;
  const next = position + insertion.length;
  return { value, selection: { start: next, end: next } };
}

export function insertCalloutBlock(source: string, selection: SourceSelection, kind: "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION"): SourceEdit {
  const bounds = orderedRange(selection);
  const marker = kind.toUpperCase();
  const template = [`> [!${marker}]`, ">", ""].join("\n");
  const value = `${source.slice(0, bounds.start)}${template}${source.slice(bounds.end)}`;
  const cursor = bounds.start + template.length;
  return {
    value,
    selection: { start: cursor, end: cursor },
  };
}

export function toggleCalloutPrefix(source: string, selection: SourceSelection, kind: "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION"): SourceEdit {
  return insertCalloutBlock(source, selection, kind);
}

export function completeBlockOnEnter(source: string, position: number): SourceEdit | null {
  const line = lineBoundsAt(source, position);
  if (position < line.start || position > line.end) return null;
  const beforeCursor = source.slice(line.start, position);
  const afterCursor = source.slice(position, line.end);
  if (afterCursor.trim()) return null;

  const mathMatch = beforeCursor.match(/^(\s*)\$\$\s*$/);
  if (mathMatch && !isInFencedCodeBlock(source, line.start)) {
    const indent = mathMatch[1] || "";
    const insertion = `${indent}$$\n${indent}\n${indent}$$`;
    const cursor = line.start + `${indent}$$\n${indent}`.length;
    return {
      value: `${source.slice(0, line.start)}${insertion}${source.slice(line.end)}`,
      selection: { start: cursor, end: cursor },
    };
  }

  const fenceMatch = beforeCursor.match(/^(\s*)(`{3,})([^`]*)$/);
  if (!fenceMatch || isInFencedCodeBlock(source, line.start)) return null;
  const indent = fenceMatch[1] || "";
  const fence = fenceMatch[2];
  const info = (fenceMatch[3] || "").trimEnd();
  const existingClose = existingFenceCloseAfterLine(source, line.end, fence);
  if (existingClose) {
    if (typeof existingClose.cursor === "number") {
      return { value: source, selection: { start: existingClose.cursor, end: existingClose.cursor } };
    }
    return null;
  }
  const insertion = `${indent}${fence}${info}\n${indent}\n${indent}${fence}`;
  const cursor = line.start + `${indent}${fence}${info}\n${indent}`.length;
  return {
    value: `${source.slice(0, line.start)}${insertion}${source.slice(line.end)}`,
    selection: { start: cursor, end: cursor },
  };
}

function lineSelectionBounds(source: string, selection: SourceSelection) {
  const range = orderedRange(selection);
  const start = lineBoundsAt(source, range.start).start;
  const endPosition = range.end > range.start && source[range.end - 1] === "\n" ? range.end - 1 : range.end;
  const end = lineBoundsAt(source, endPosition).end;
  return { start, end };
}

export function indentSelectedLines(source: string, selection: SourceSelection, direction: "in" | "out"): SourceEdit {
  const bounds = lineSelectionBounds(source, selection);
  const block = source.slice(bounds.start, bounds.end);
  let deltaStart = 0;
  let deltaEnd = 0;
  const lines = block.split("\n").map((line, index) => {
    if (direction === "in") {
      if (index === 0 && selection.start > bounds.start) deltaStart += LIST_INDENT.length;
      deltaEnd += LIST_INDENT.length;
      return `${LIST_INDENT}${line}`;
    }
    if (line.startsWith(LIST_INDENT)) {
      if (index === 0 && selection.start > bounds.start) deltaStart -= LIST_INDENT.length;
      deltaEnd -= LIST_INDENT.length;
      return line.slice(LIST_INDENT.length);
    }
    if (line.startsWith("\t")) {
      if (index === 0 && selection.start > bounds.start) deltaStart -= 1;
      deltaEnd -= 1;
      return line.slice(1);
    }
    const twoSpaceIndent = line.match(/^ {1,3}/)?.[0] || "";
    if (twoSpaceIndent) {
      if (index === 0 && selection.start > bounds.start) deltaStart -= twoSpaceIndent.length;
      deltaEnd -= twoSpaceIndent.length;
      return line.slice(twoSpaceIndent.length);
    }
    return line;
  });
  const value = `${source.slice(0, bounds.start)}${lines.join("\n")}${source.slice(bounds.end)}`;
  return {
    value,
    selection: {
      start: Math.max(bounds.start, selection.start + deltaStart),
      end: Math.max(bounds.start, selection.end + deltaEnd),
    },
  };
}

export function toggleLinePrefix(source: string, selection: SourceSelection, prefix: string): SourceEdit {
  const bounds = lineSelectionBounds(source, selection);
  const block = source.slice(bounds.start, bounds.end);
  const lines = block.split("\n");
  const allPrefixed = lines.every((line) => !line.trim() || line.startsWith(prefix));
  const nextLines = lines.map((line) => {
    if (!line.trim()) return line;
    return allPrefixed ? line.slice(prefix.length) : `${prefix}${line}`;
  });
  const value = `${source.slice(0, bounds.start)}${nextLines.join("\n")}${source.slice(bounds.end)}`;
  const delta = nextLines.join("\n").length - block.length;
  return { value, selection: { start: selection.start, end: Math.max(selection.start, selection.end + delta) } };
}

function stripBlockStylePrefix(line: string) {
  return line
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/, "")
    .replace(/^[ \t]{0,3}>[ \t]?/, "")
    .replace(/^[ \t]{0,3}(?:[-+*]|\d+\.)[ \t]+(?:\[[ xX]\][ \t]+)?/, "");
}

export function setHeading(source: string, selection: SourceSelection, level: number): SourceEdit {
  const range = orderedRange(selection);
  const bounds = lineSelectionBounds(source, range);
  const block = source.slice(bounds.start, bounds.end);
  const prefix = level > 0 ? `${"#".repeat(level)} ` : "";
  const lines = block.split("\n");
  const nextLines = lines.map((line) => {
    const clean = stripBlockStylePrefix(line);
    if (!clean.trim()) return level > 0 && lines.length === 1 ? prefix : clean;
    return `${prefix}${clean.trimStart()}`;
  });
  const nextBlock = nextLines.join("\n");
  const value = `${source.slice(0, bounds.start)}${nextBlock}${source.slice(bounds.end)}`;
  const delta = nextBlock.length - block.length;
  const cursor = bounds.start + Math.min(nextBlock.length, Math.max(prefix.length, range.start - bounds.start + delta));
  return { value, selection: { start: cursor, end: cursor } };
}

export function toggleListPrefix(source: string, selection: SourceSelection, ordered = false): SourceEdit {
  const bounds = lineSelectionBounds(source, selection);
  const block = source.slice(bounds.start, bounds.end);
  const markerPattern = ordered ? /^(\s*)\d+\.\s+/ : /^(\s*)[-+*]\s+/;
  const nonEmptyLines = block.split("\n").filter((line) => line.trim());
  const allMatching = nonEmptyLines.length > 0 && nonEmptyLines.every((line) => markerPattern.test(line));
  let index = 1;
  const lines = block.split("\n").map((line) => {
    if (!line.trim()) {
      if (allMatching) return line;
      const indent = line.match(/^\s*/)?.[0] || "";
      const marker = ordered ? `${index++}. ` : "+ ";
      return `${indent}${marker}`;
    }
    if (allMatching) return line.replace(markerPattern, "$1");
    const content = line.replace(/^(\s*)(?:[-+*]|\d+\.)\s+/, "$1");
    const indent = content.match(/^\s*/)?.[0] || "";
    const bare = content.slice(indent.length);
    const marker = ordered ? `${index++}. ` : "+ ";
    return `${indent}${marker}${bare}`;
  });
  const value = `${source.slice(0, bounds.start)}${lines.join("\n")}${source.slice(bounds.end)}`;
  const delta = lines.join("\n").length - block.length;
  return { value, selection: { start: selection.start, end: Math.max(selection.start, selection.end + delta) } };
}

function splitTableRow(line: string) {
  const trimmed = line.trim();
  const content = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return content.split("|").map((cell) => cell.trim());
}

function alignmentFromCell(cell: string): "left" | "center" | "right" | null {
  const trimmed = cell.trim();
  if (/^:-+:$/.test(trimmed)) return "center";
  if (/^:-+$/.test(trimmed)) return "left";
  if (/^-+:$/.test(trimmed)) return "right";
  if (/^-+$/.test(trimmed)) return null;
  return null;
}

function alignmentCell(align: "left" | "center" | "right" | null) {
  if (align === "left") return ":---";
  if (align === "center") return ":---:";
  if (align === "right") return "---:";
  return "---";
}

function escapeTableHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function lineOffsets(source: string) {
  const lines = source.split("\n");
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  return { lines, offsets };
}

function tableMarkdown(rows: string[][], alignments: Array<"left" | "center" | "right" | null>) {
  const columnCount = Math.max(1, ...rows.map((row) => row.length), alignments.length);
  const normalizedRows = rows.map((row) => Array.from({ length: columnCount }, (_value, index) => row[index] || " "));
  const normalizedAlignments = Array.from({ length: columnCount }, (_value, index) => alignments[index] || null);
  const header = normalizedRows[0] || Array.from({ length: columnCount }, (_value, index) => `Column ${index + 1}`);
  const body = normalizedRows.slice(1);
  return [
    `| ${header.join(" | ")} |`,
    `| ${normalizedAlignments.map(alignmentCell).join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

export function insertTableSource(source: string, selection: SourceSelection, rows = 3, cols = 3): SourceEdit {
  const safeRows = Math.min(Math.max(2, rows), 10);
  const safeCols = Math.min(Math.max(1, cols), 10);
  const tableRows = Array.from({ length: safeRows }, (_row, rowIndex) =>
    Array.from({ length: safeCols }, (_col, colIndex) => rowIndex === 0 ? `Column ${colIndex + 1}` : " "));
  const insertion = tableMarkdown(tableRows, Array.from({ length: safeCols }, () => null));
  const range = orderedRange(selection);
  const before = range.start > 0 && source[range.start - 1] !== "\n" ? "\n\n" : "";
  const after = range.end < source.length && source[range.end] !== "\n" ? "\n\n" : "";
  const text = `${before}${insertion}${after}`;
  const value = `${source.slice(0, range.start)}${text}${source.slice(range.end)}`;
  return { value, selection: { start: range.start + before.length, end: range.start + before.length + insertion.length } };
}

export function findTableAt(source: string, position: number): SourceTableRange | null {
  const line = lineBoundsAt(source, position);
  const currentLine = source.slice(line.start, line.end);
  if (!currentLine.includes("|")) return null;

  const lines = [{ start: line.start, end: line.end, text: currentLine }];
  let firstStart = line.start;
  while (firstStart > 0) {
    const previousEnd = firstStart - 1;
    const previousStart = source.lastIndexOf("\n", Math.max(0, previousEnd - 1)) + 1;
    const text = source.slice(previousStart, previousEnd);
    if (!text.includes("|")) break;
    lines.unshift({ start: previousStart, end: previousEnd, text });
    firstStart = previousStart;
  }

  let lastEnd = line.end;
  while (lastEnd < source.length) {
    const nextStart = lastEnd + 1;
    const nextBreak = source.indexOf("\n", nextStart);
    const nextEnd = nextBreak < 0 ? source.length : nextBreak;
    const text = source.slice(nextStart, nextEnd);
    if (!text.includes("|")) break;
    lines.push({ start: nextStart, end: nextEnd, text });
    lastEnd = nextEnd;
  }

  if (lines.length < 2) return null;
  const separatorCells = splitTableRow(lines[1].text);
  if (!separatorCells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))) return null;
  const start = lines[0].start;
  const end = lines[lines.length - 1].end;
  const rows = [splitTableRow(lines[0].text), ...lines.slice(2).map((entry) => splitTableRow(entry.text))];
  return {
    start,
    end,
    rows,
    alignments: separatorCells.map(alignmentFromCell),
  };
}

export function replaceTable(source: string, table: SourceTableRange, rows: string[][], alignments = table.alignments): SourceEdit {
  const next = tableMarkdown(rows, alignments);
  const value = `${source.slice(0, table.start)}${next}${source.slice(table.end)}`;
  return { value, selection: { start: table.start, end: table.start + next.length } };
}

export function renderTableMarkdown(table: SourceTableRange) {
  return tableMarkdown(table.rows, table.alignments);
}

export function renderComplexTableHtml(table: SourceTableRange) {
  const columnCount = Math.max(1, ...table.rows.map((row) => row.length), table.alignments.length);
  const normalizedRows = table.rows.map((row) => Array.from({ length: columnCount }, (_value, index) => row[index] || " "));
  const attrForColumn = (index: number) => table.alignments[index] ? ` style="text-align: ${table.alignments[index]}"` : "";
  const renderRow = (row: string[], tag: "th" | "td") =>
    `    <tr>\n${row.map((cell, index) => `      <${tag}${attrForColumn(index)}>${escapeTableHtml(cell.trim())}</${tag}>`).join("\n")}\n    </tr>`;
  const header = normalizedRows[0] || Array.from({ length: columnCount }, (_value, index) => `Column ${index + 1}`);
  const bodyRows = normalizedRows.slice(1);
  const parts = [
    '<table class="markdown-complex-table" style="width: 100%;">',
    "  <colgroup>",
    ...Array.from({ length: columnCount }, () => `    <col style="width: ${(100 / columnCount).toFixed(2)}%;">`),
    "  </colgroup>",
    "  <thead>",
    renderRow(header, "th"),
    "  </thead>",
  ];
  if (bodyRows.length) {
    parts.push("  <tbody>", ...bodyRows.map((row) => renderRow(row, "td")), "  </tbody>");
  }
  parts.push("</table>");
  return parts.join("\n");
}

function findTables(source: string): SourceTableRange[] {
  const { lines, offsets } = lineOffsets(source);
  const tables: SourceTableRange[] = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].includes("|") || !lines[index + 1].includes("|")) continue;
    const separatorCells = splitTableRow(lines[index + 1]);
    if (!separatorCells.length || !separatorCells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))) continue;
    let last = index + 1;
    while (last + 1 < lines.length && lines[last + 1].includes("|")) last += 1;
    const start = offsets[index] || 0;
    const end = start + lines.slice(index, last + 1).join("\n").length;
    tables.push({
      start,
      end,
      rows: [splitTableRow(lines[index]), ...lines.slice(index + 2, last + 1).map(splitTableRow)],
      alignments: separatorCells.map(alignmentFromCell),
    });
    index = last;
  }
  return tables;
}

function inlineRenderRanges(source: string, offset: number, text: string): SourceRenderRange[] {
  const ranges: SourceRenderRange[] = [];
  const patterns: Array<{ kind: SourceRenderRange["kind"]; pattern: RegExp }> = [
    { kind: "strong", pattern: /(\*\*|__)([^*_][\s\S]*?[^*_])\1/g },
    { kind: "underline", pattern: /<u>([^<\n][\s\S]*?[^<\n])<\/u>/gi },
    { kind: "fontColor", pattern: INLINE_COLOR_PATTERN },
    { kind: "inlineCode", pattern: /`([^`\n]+)`/g },
    { kind: "em", pattern: /(^|[^\w*])\*([^*\n]+)\*(?!\w)/g },
    { kind: "em", pattern: /(^|[^\w_])_([^_\n]+)_(?!\w)/g },
  ];
  for (const { kind, pattern } of patterns) {
    for (const match of text.matchAll(pattern)) {
      const matchStart = offset + (match.index || 0);
      if (kind === "fontColor") {
        ranges.push({
          kind,
          start: matchStart,
          end: matchStart + match[0].length,
          text: match[3],
          color: match[2],
        });
        continue;
      }
      const leading = kind === "em" ? match[1]?.length || 0 : 0;
      const marker = kind === "strong" ? 2 : kind === "underline" ? 3 : kind === "inlineCode" ? 1 : 1;
      const closeMarker = kind === "underline" ? 4 : marker;
      ranges.push({
        kind,
        start: matchStart + leading,
        end: matchStart + match[0].length,
        text: source.slice(matchStart + leading + marker, matchStart + match[0].length - closeMarker),
      });
    }
  }
  return ranges.sort((left, right) => left.start - right.start || right.end - left.end);
}

function calloutRenderRange(line: string, start: number, end: number): SourceRenderRange | null {
  if (!CALLOUT_PATTERN.test(line)) return null;
  return { kind: "callout", start, end };
}

export function markdownRenderRanges(source: string): SourceRenderRange[] {
  const ranges: SourceRenderRange[] = [];
  const tableRanges = findTables(source);
  ranges.push(...tableRanges.map((table) => ({ kind: "table" as const, start: table.start, end: table.end, table })));
  const inTable = (start: number, end: number) => tableRanges.some((table) => start < table.end && end > table.start);
  let offset = 0;
  const lines = source.split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const lineStart = offset;
    const lineEnd = lineStart + line.length;
    if (!inTable(lineStart, lineEnd)) {
      const callout = calloutRenderRange(line, lineStart, lineEnd);
      if (callout) {
        ranges.push(callout);
      }
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        ranges.push({
          kind: "heading",
          level: heading[1].length,
          start: lineStart,
          end: lineEnd,
          text: heading[2],
        });
      }
      ranges.push(...inlineRenderRanges(source, lineStart, line));
    }
    offset = lineEnd + 1;
  }
  return ranges.sort((left, right) => left.start - right.start || right.end - left.end);
}

export function markdownRenderRangesInWindow(source: string, from: number, to: number): SourceRenderRange[] {
  const safeFrom = Math.max(0, Math.min(from, source.length));
  const safeTo = Math.max(safeFrom, Math.min(to, source.length));
  const start = source.lastIndexOf("\n", Math.max(0, safeFrom - 1)) + 1;
  const nextBreak = source.indexOf("\n", safeTo);
  const end = nextBreak < 0 ? source.length : nextBreak;
  return markdownRenderRanges(source.slice(start, end))
    .map((range) => ({
      ...range,
      start: range.start + start,
      end: range.end + start,
      table: range.table
        ? {
            ...range.table,
            start: range.table.start + start,
            end: range.table.end + start,
          }
        : undefined,
    }))
    .filter((range) => range.end >= safeFrom && range.start <= safeTo);
}

export function extractImages(source: string): SourceImageRange[] {
  const images: SourceImageRange[] = [];
  for (const match of source.matchAll(LINKED_IMAGE_PATTERN)) {
    const imageMarkdown = match[1] || "";
    const imageMatch = imageMarkdown.match(/^!\[([^\]\n]*)\]\(([^)\s\n]+)(?:\s+=([1-9]\d{0,3})?x([1-9]\d{0,3})?)?(?:\s+"([^"]*)")?\)$/);
    if (!imageMatch) continue;
    images.push({
      start: match.index || 0,
      end: (match.index || 0) + match[0].length,
      alt: imageMatch[1] || "",
      src: imageMatch[2] || "",
      width: imageMatch[3],
      height: imageMatch[4],
      title: imageMatch[5],
      outerHref: match[2],
      format: "markdown",
    });
  }
  const covered = images.map((image) => [image.start, image.end]);
  for (const match of source.matchAll(IMAGE_PATTERN)) {
    const start = match.index || 0;
    const end = start + match[0].length;
    if (covered.some(([from, to]) => start >= from && end <= to)) continue;
    images.push({
      start,
      end,
      alt: match[1] || "",
      src: match[2] || "",
      width: match[3],
      height: match[4],
      title: match[5],
      format: "markdown",
    });
  }
  const coveredHtml = [...covered, ...images.map((image) => [image.start, image.end])];
  for (const match of source.matchAll(HTML_ALIGNED_IMAGE_CONTAINER_PATTERN)) {
    const start = match.index || 0;
    const end = start + match[0].length;
    const imgTag = match[4] || "";
    const tagOffset = match[0].indexOf(imgTag);
    const image = htmlImageFromTag(imgTag, start + tagOffset, start + tagOffset + imgTag.length, {
      start,
      end,
      alignment: (match[1] || match[2] || match[3]) as ImageAlignment,
    });
    if (image) images.push(image);
  }
  for (const match of source.matchAll(HTML_IMAGE_PATTERN)) {
    const start = match.index || 0;
    const end = start + match[0].length;
    if (coveredHtml.some(([from, to]) => start >= from && end <= to)) continue;
    if (images.some((image) => start >= image.start && end <= image.end)) continue;
    const image = htmlImageFromTag(match[0], start, end);
    if (image) images.push(image);
  }
  return images.sort((left, right) => left.start - right.start);
}

function markdownImageToHtml(image: SourceImageRange) {
  const attrs = [
    `src="${escapeHtmlAttribute(image.src)}"`,
    `alt="${escapeHtmlAttribute(image.alt)}"`,
  ];
  if (image.width) attrs.push(`width="${escapeHtmlAttribute(image.width)}"`);
  if (image.height) attrs.push(`height="${escapeHtmlAttribute(image.height)}"`);
  if (image.title) attrs.push(`title="${escapeHtmlAttribute(image.title)}"`);
  return `<img ${attrs.join(" ")}>`;
}

export function setImageAlignmentSource(source: string, image: SourceImageRange, alignment: ImageAlignment): SourceEdit {
  const align = alignment === "left" || alignment === "right" ? alignment : "center";
  const from = image.containerStart ?? image.start;
  const to = image.containerEnd ?? image.end;
  const imageSource = image.format === "html"
    ? source.slice(image.start, image.end)
    : markdownImageToHtml(image);
  const next = `<div align="${align}">\n  ${imageSource}\n</div>`;
  const value = `${source.slice(0, from)}${next}${source.slice(to)}`;
  return {
    value,
    selection: { start: from, end: from + next.length },
  };
}

export function resizeImageSource(source: string, image: SourceImageRange, width: number, height: number): SourceEdit {
  if (image.format === "html") {
    const original = source.slice(image.start, image.end);
    let next = replaceOrAppendHtmlAttribute(original, "width", String(width || ""));
    next = replaceOrAppendHtmlAttribute(next, "height", String(height || ""));
    const value = `${source.slice(0, image.start)}${next}${source.slice(image.end)}`;
    return { value, selection: { start: image.start, end: image.start + next.length } };
  }
  const size = width || height ? ` =${width || ""}x${height || ""}` : "";
  const title = image.title ? ` "${image.title}"` : "";
  const imageMarkdown = `![${image.alt}](${image.src}${size}${title})`;
  const next = image.outerHref ? `[${imageMarkdown}](${image.outerHref})` : imageMarkdown;
  const value = `${source.slice(0, image.start)}${next}${source.slice(image.end)}`;
  const cursor = image.start + next.length;
  return { value, selection: { start: cursor, end: cursor } };
}
