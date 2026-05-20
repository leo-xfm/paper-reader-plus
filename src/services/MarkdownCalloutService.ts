export type MarkdownCalloutKind = "note" | "tip" | "important" | "warning" | "caution";

export type MarkdownCalloutBlock = {
  kind: MarkdownCalloutKind;
  title: string;
  body: string;
  source: string;
  start?: number;
  end?: number;
};

export type MarkdownCalloutRange = Omit<MarkdownCalloutBlock, "start" | "end"> & {
  start: number;
  end: number;
};

export type MarkdownCalloutMeta = {
  label: string;
  icon: string;
};

const CALLOUT_START_PATTERN = /^\s{0,3}>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](.*)$/i;
const CALLOUT_LINE_PATTERN = /^\s{0,3}>\s?(.*)$/;
const CALLOUT_BLANK_LINE_PATTERN = /^\s{0,3}>\s*$/;

const CALLOUT_META: Record<MarkdownCalloutKind, MarkdownCalloutMeta> = {
  note: { label: "Note", icon: "info" },
  tip: { label: "Tip", icon: "lightbulb" },
  important: { label: "Important", icon: "octagon-alert" },
  warning: { label: "Warning", icon: "triangle-alert" },
  caution: { label: "Caution", icon: "shield-alert" },
};

function normalizeSource(source: string) {
  return source.replace(/\r\n/g, "\n");
}

function stripQuotePrefix(line: string) {
  const match = line.match(CALLOUT_LINE_PATTERN);
  return match ? match[1] || "" : line;
}

function calloutBodyLine(line: string) {
  if (CALLOUT_BLANK_LINE_PATTERN.test(line)) return null;
  return stripQuotePrefix(line);
}

export function capitalizeCalloutKind(kind: MarkdownCalloutKind) {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function parseMarkdownCalloutBlock(source: string): MarkdownCalloutBlock | null {
  const normalized = normalizeSource(source);
  const lines = normalized.split("\n");
  if (!lines.length) return null;
  const match = lines[0].match(CALLOUT_START_PATTERN);
  if (!match) return null;
  const kind = match[1].toLowerCase() as MarkdownCalloutKind;
  const title = (match[2] || "").trim();
  const body = lines.slice(1).map(calloutBodyLine).filter((line): line is string => line !== null).join("\n");
  return {
    kind,
    title,
    body,
    source: normalized,
  };
}

export function renderCalloutLabel(kind: MarkdownCalloutKind, customLabels?: Partial<Record<MarkdownCalloutKind, string>>) {
  return customLabels?.[kind] || capitalizeCalloutKind(kind);
}

export function getMarkdownCalloutMeta(kind: MarkdownCalloutKind, customLabels?: Partial<Record<MarkdownCalloutKind, string>>): MarkdownCalloutMeta {
  const meta = CALLOUT_META[kind];
  return {
    ...meta,
    label: customLabels?.[kind] || meta.label,
  };
}

export function findMarkdownCalloutBlocks(source: string) {
  const normalized = normalizeSource(source);
  const lines = normalized.split("\n");
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }

  const blocks = [] as MarkdownCalloutRange[];
  for (let index = 0; index < lines.length; index += 1) {
    if (!CALLOUT_START_PATTERN.test(lines[index])) continue;
    let endIndex = index;
    while (endIndex + 1 < lines.length && CALLOUT_LINE_PATTERN.test(lines[endIndex + 1])) {
      endIndex += 1;
    }
    const blockSource = lines.slice(index, endIndex + 1).join("\n");
    const parsed = parseMarkdownCalloutBlock(blockSource);
    if (!parsed) continue;
    const start = offsets[index] || 0;
    const end = (offsets[endIndex] || 0) + lines[endIndex].length;
    blocks.push({
      ...parsed,
      start,
      end,
    });
    index = endIndex;
  }
  return blocks;
}

export function renderMarkdownCalloutTitle(kind: MarkdownCalloutKind, title: string) {
  return title || getMarkdownCalloutMeta(kind).label;
}
