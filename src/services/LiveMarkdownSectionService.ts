export type LiveMarkdownSectionKind = "line" | "table" | "codeBlock" | "mathBlock" | "list" | "imageBlock";

export type LiveMarkdownTokenKind =
  | "heading"
  | "strong"
  | "em"
  | "underline"
  | "inlineCode"
  | "link"
  | "bareLink"
  | "math"
  | "image";

export type LiveMarkdownRange = {
  start: number;
  end: number;
};

export type LiveMarkdownToken = LiveMarkdownRange & {
  kind: LiveMarkdownTokenKind;
  text: string;
  href?: string;
  level?: number;
};

export type LiveMarkdownSection = LiveMarkdownRange & {
  id: string;
  kind: LiveMarkdownSectionKind;
  source: string;
  sourceHash: string;
  tokenRanges: LiveMarkdownToken[];
};

const TABLE_SEPARATOR_PATTERN = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const GENERATED_TABLE_ROW_PATTERN = /^\s*\|.*\|\s*$/;
const LIST_ITEM_PATTERN = /^\s*(?:[-+*]|\d+\.)\s+/;
const IMAGE_LINE_PATTERN = /^\s*(?:\[)?!\[[^\]\n]*\]\([^)]+\)(?:\]\([^)]+\))?\s*$/;

export function liveMarkdownSourceHash(source: string) {
  let hash = 5381;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) + hash) ^ source.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
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

function sectionId(kind: LiveMarkdownSectionKind, start: number, source: string) {
  return `${kind}:${start}:${liveMarkdownSourceHash(source)}`;
}

function makeSection(kind: LiveMarkdownSectionKind, start: number, end: number, source: string): LiveMarkdownSection {
  const sectionSource = source.slice(start, end);
  return {
    id: sectionId(kind, start, sectionSource),
    kind,
    start,
    end,
    source: sectionSource,
    sourceHash: liveMarkdownSourceHash(sectionSource),
    tokenRanges: kind === "line" || kind === "list" ? parseLiveMarkdownInlineTokens(sectionSource, start) : [],
  };
}

function tableEndLine(lines: string[], startLine: number) {
  if (!lines[startLine]?.includes("|") || !TABLE_SEPARATOR_PATTERN.test(lines[startLine + 1] || "")) return -1;
  let endLine = startLine + 1;
  while (endLine + 1 < lines.length && GENERATED_TABLE_ROW_PATTERN.test(lines[endLine + 1] || "")) endLine += 1;
  return endLine;
}

function fenceEndLine(lines: string[], startLine: number) {
  const match = lines[startLine]?.match(/^\s{0,3}(`{3,}|~{3,})/);
  if (!match) return -1;
  const marker = match[1][0];
  for (let line = startLine + 1; line < lines.length; line += 1) {
    if (new RegExp(`^\\s{0,3}${marker}{3,}`).test(lines[line] || "")) return line;
  }
  return lines.length - 1;
}

function mathBlockEndLine(lines: string[], startLine: number) {
  if (!/^\s*\$\$\s*$/.test(lines[startLine] || "")) return -1;
  for (let line = startLine + 1; line < lines.length; line += 1) {
    if (/^\s*\$\$\s*$/.test(lines[line] || "")) return line;
  }
  return lines.length - 1;
}

function listEndLine(lines: string[], startLine: number) {
  if (!LIST_ITEM_PATTERN.test(lines[startLine] || "")) return -1;
  let endLine = startLine;
  while (endLine + 1 < lines.length) {
    const next = lines[endLine + 1] || "";
    if (LIST_ITEM_PATTERN.test(next) || /^\s{2,}\S/.test(next)) {
      endLine += 1;
      continue;
    }
    break;
  }
  return endLine;
}

export function parseLiveMarkdownSections(source: string): LiveMarkdownSection[] {
  const normalized = source.replace(/\r\n/g, "\n");
  const { lines, offsets } = lineOffsets(normalized);
  const sections: LiveMarkdownSection[] = [];

  for (let line = 0; line < lines.length; line += 1) {
    const lineStart = offsets[line] || 0;
    let lineEnd = lineStart + (lines[line]?.length || 0);
    let kind: LiveMarkdownSectionKind = "line";
    let endLine = line;

    const fenceEnd = fenceEndLine(lines, line);
    const mathEnd = fenceEnd < 0 ? mathBlockEndLine(lines, line) : -1;
    const tableEnd = fenceEnd < 0 && mathEnd < 0 ? tableEndLine(lines, line) : -1;
    const listEnd = fenceEnd < 0 && mathEnd < 0 && tableEnd < 0 ? listEndLine(lines, line) : -1;

    if (fenceEnd >= 0) {
      kind = "codeBlock";
      endLine = fenceEnd;
    } else if (mathEnd >= 0) {
      kind = "mathBlock";
      endLine = mathEnd;
    } else if (tableEnd >= 0) {
      kind = "table";
      endLine = tableEnd;
    } else if (listEnd >= 0 && listEnd > line) {
      kind = "list";
      endLine = listEnd;
    } else if (IMAGE_LINE_PATTERN.test(lines[line] || "")) {
      kind = "imageBlock";
    }

    lineEnd = (offsets[endLine] || 0) + (lines[endLine]?.length || 0);
    sections.push(makeSection(kind, lineStart, lineEnd, normalized));
    line = endLine;
  }

  return sections;
}

function pushToken(tokens: LiveMarkdownToken[], token: LiveMarkdownToken) {
  if (token.end <= token.start) return;
  if (token.kind !== "heading" && tokens.some((existing) => existing.kind !== "heading" && token.start < existing.end && token.end > existing.start)) return;
  tokens.push(token);
}

export function parseLiveMarkdownInlineTokens(source: string, offset = 0): LiveMarkdownToken[] {
  const tokens: LiveMarkdownToken[] = [];
  const heading = source.match(/^(#{1,6})\s+(.+)$/);
  if (heading) {
    tokens.push({
      kind: "heading",
      start: offset,
      end: offset + source.length,
      text: heading[2],
      level: heading[1].length,
    });
  }

  const patterns: Array<{ kind: LiveMarkdownTokenKind; pattern: RegExp; textIndex: number; hrefIndex?: number; leadingIndex?: number }> = [
    { kind: "image", pattern: /\[?!\[([^\]\n]*)\]\([^)]+\)(?:\]\(([^)\s\n]+)(?:\s+[^)\n]*)?\))?/g, textIndex: 1, hrefIndex: 2 },
    { kind: "link", pattern: /\[([^\]\n]+)\]\(((?:https?:\/\/|www\.|\/reader\?|readerp:\/\/|(?:\.\/)?assets\/)[^)\s\n]+)(?:\s+[^)\n]*)?\)/g, textIndex: 1, hrefIndex: 2 },
    { kind: "strong", pattern: /(\*\*|__)([^*_][\s\S]*?[^*_])\1/g, textIndex: 2 },
    { kind: "underline", pattern: /<u>([^<\n][\s\S]*?[^<\n])<\/u>/gi, textIndex: 1 },
    { kind: "inlineCode", pattern: /`([^`\n]+)`/g, textIndex: 1 },
    { kind: "math", pattern: /\$([^$\n]+)\$/g, textIndex: 1 },
    { kind: "em", pattern: /(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, textIndex: 2, leadingIndex: 1 },
    { kind: "em", pattern: /(^|[^\w_])_([^_\n]+)_(?!\w)/g, textIndex: 2, leadingIndex: 1 },
    { kind: "bareLink", pattern: /(?:https?:\/\/|www\.|\/reader\?|readerp:\/\/)[^\s<>"')]+/g, textIndex: 0 },
  ];

  for (const { kind, pattern, textIndex, hrefIndex, leadingIndex } of patterns) {
    for (const match of source.matchAll(pattern)) {
      const leading = leadingIndex ? match[leadingIndex]?.length || 0 : 0;
      const start = offset + (match.index || 0) + leading;
      const end = offset + (match.index || 0) + match[0].length;
      pushToken(tokens, {
        kind,
        start,
        end,
        text: match[textIndex] || match[0],
        href: hrefIndex ? match[hrefIndex] : undefined,
      });
    }
  }

  return tokens.sort((left, right) => left.start - right.start || right.end - left.end);
}

export function findLiveMarkdownSectionAt(sections: LiveMarkdownSection[], position: number) {
  return sections.find((section) => position >= section.start && position <= section.end) || null;
}

export function findLiveMarkdownTokenAt(section: LiveMarkdownSection | null, position: number) {
  if (!section) return null;
  return section.tokenRanges.find((token) => token.kind !== "heading" && position >= token.start && position <= token.end)
    || section.tokenRanges.find((token) => position >= token.start && position <= token.end)
    || null;
}

export function changedLiveMarkdownSections(previous: LiveMarkdownSection[], next: LiveMarkdownSection[]) {
  const previousByStart = new Map(previous.map((section) => [section.start, section]));
  return next.filter((section) => {
    const previousSection = previousByStart.get(section.start);
    return !previousSection || previousSection.end !== section.end || previousSection.sourceHash !== section.sourceHash || previousSection.kind !== section.kind;
  });
}
