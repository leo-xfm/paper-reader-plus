export type MarkdownHtmlBlockKind = "details" | "image" | "raw";

export type MarkdownHtmlBlockRange = {
  kind: MarkdownHtmlBlockKind;
  start: number;
  end: number;
  source: string;
};

type MarkdownHtmlBlockRenderer = {
  kind: MarkdownHtmlBlockKind;
  pattern: RegExp;
  render: (source: string) => string;
};

const IMG_TAG_PATTERN = /<img\b[^>]*>/i;
const ALIGNED_IMG_PATTERN = /^<div\b[^>]*\balign\s*=\s*(?:"(left|center|right)"|'(left|center|right)'|(left|center|right))[^>]*>\s*(<img\b[^>]*>)\s*<\/div>$/i;
const UNSAFE_HTML_BLOCK_PATTERN = /<(script|style|object|embed|link|meta)\b[\s\S]*?<\/\1>|<(script|style|object|embed|link|meta)\b[^>]*\/?>/gi;
const HTML_TAG_PATTERN = /<\/?([A-Za-z][A-Za-z0-9:-]*)([^>]*)>/g;
const SAFE_HTML_TAGS = new Set([
  "a", "article", "aside", "audio", "b", "blockquote", "br", "button", "caption", "cite", "code", "col", "colgroup",
  "dd", "del", "details", "div", "dl", "dt", "em", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2",
  "h3", "h4", "h5", "h6", "header", "hr", "i", "iframe", "img", "input", "ins", "kbd", "label", "legend", "li", "main",
  "mark", "nav", "ol", "option", "p", "pre", "progress", "q", "s", "section", "select", "small", "source", "span",
  "strong", "sub", "summary", "sup", "table", "tbody", "td", "textarea", "tfoot", "th", "thead", "tr", "u", "ul", "video",
]);
const VOID_HTML_TAGS = new Set(["br", "col", "hr", "img", "input", "source"]);
const URI_ATTRS = new Set(["action", "href", "src"]);
const BOOLEAN_ATTRS = new Set([
  "allowfullscreen", "allowpaymentrequest", "allowtransparency", "autoplay", "checked", "controls", "disabled", "loop",
  "multiple", "muted", "open", "readonly", "required", "selected",
]);
const SAFE_HTML_ATTRS = new Set([
  "align", "allow", "allowfullscreen", "allowpaymentrequest", "allowtransparency", "alt", "autocomplete", "border",
  "checked", "class", "colspan", "controls", "dir", "disabled", "for", "frameborder", "framespacing", "height", "href", "id",
  "lang", "loading", "loop", "marginheight", "marginwidth", "max", "min", "muted", "name", "open", "placeholder",
  "readonly", "rel", "required", "role", "rows", "rowspan", "scrolling", "selected", "src", "style", "target", "title",
  "type", "value", "width",
]);
const EXPLICIT_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const RAW_HTML_LINE_START_PATTERN = /^\s*(?:<!--[\s\S]*?-->|<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s|>|\/>))/;

export function escapeMarkdownHtmlBlock(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderDetailsBlock(source: string) {
  return renderMarkdownRawHtml(source);
}

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function htmlAttributes(tag: string) {
  const attrs = new Map<string, string>();
  const pattern = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attrs.set(match[1].toLowerCase(), decodeHtmlAttribute(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return attrs;
}

function isAllowedImageSrc(value: string) {
  const trimmed = value.trim();
  return /^(?:\.\/)?assets\/[^?#\s]+(?:[?#][^\s]*)?$/i.test(trimmed) ||
    /^https?:\/\//i.test(trimmed) ||
    /^data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,/i.test(trimmed) ||
    (/^[^\s<>"']+$/.test(trimmed) && !trimmed.startsWith("//") && !EXPLICIT_SCHEME_PATTERN.test(trimmed));
}

function isAllowedHtmlHref(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("#") ||
    /^https?:\/\//i.test(trimmed) ||
    /^readerp:\/\//i.test(trimmed) ||
    /^readerm:\/\//i.test(trimmed) ||
    trimmed.startsWith("/reader?");
}

function isAllowedMediaSrc(value: string) {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ||
    /^\/\//.test(trimmed) ||
    /^(?:\.{0,2}\/)?[^?#\s<>"']+\.(?:mp4|webm|ogg|ogv|mp3|wav|m4a)(?:[?#][^\s<>"']*)?$/i.test(trimmed) ||
    /^assets\/[^?#\s<>"']+(?:[?#][^\s<>"']*)?$/i.test(trimmed);
}

function isAllowedFrameSrc(value: string) {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) || /^\/\//.test(trimmed);
}

function cleanDimension(value: string | undefined) {
  if (!value) return "";
  return /^(?:[1-9]\d{0,3}|100%|[1-9]\d{0,2}%|[1-9]\d{0,3}px)$/i.test(value.trim()) ? value.trim() : "";
}

function cleanImageStyle(value: string | undefined) {
  if (!value) return "";
  const allowed = new Set(["max-width", "width", "height", "object-fit"]);
  return cleanStyleDeclarations(value, allowed);
}

function cleanHtmlCodeStyle(value: string | undefined) {
  if (!value) return "";
  const allowed = new Set([
    "align-items", "background", "background-color", "border", "border-bottom", "border-collapse", "border-color",
    "border-left", "border-radius", "border-right", "border-top", "bottom", "box-shadow", "color", "cursor", "display",
    "flex", "font-size", "font-style", "font-weight", "gap", "grid-template-columns", "height", "justify-content",
    "left", "line-height", "margin", "margin-bottom", "margin-left", "margin-right", "margin-top", "max-width",
    "min-width", "object-fit", "padding", "padding-bottom", "padding-left", "padding-right", "padding-top", "position",
    "right", "text-align", "text-decoration", "top", "vertical-align", "white-space", "width",
  ]);
  return cleanStyleDeclarations(value, allowed);
}

function cleanStyleDeclarations(value: string, allowed: Set<string>) {
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf(":");
      if (index < 0) return "";
      const name = part.slice(0, index).trim().toLowerCase();
      const rawValue = part.slice(index + 1).trim();
      if (!allowed.has(name)) return "";
      if (/url\s*\(|expression\s*\(|javascript:|@import|behavior\s*:/i.test(rawValue)) return "";
      if (/[\u0000-\u001f<>]/.test(rawValue)) return "";
      if (name === "position" && !/^(?:static|relative|absolute|sticky)$/i.test(rawValue)) return "";
      return `${name}: ${rawValue}`;
    })
    .filter(Boolean)
    .join("; ");
}

function renderImageTag(tag: string) {
  const attrs = htmlAttributes(tag);
  const src = attrs.get("src") || "";
  if (!isAllowedImageSrc(src)) return "";
  const alt = attrs.get("alt") || "";
  const title = attrs.get("title") || "";
  const width = cleanDimension(attrs.get("width"));
  const height = cleanDimension(attrs.get("height"));
  const style = cleanImageStyle(attrs.get("style"));
  const parts = [
    `src="${escapeMarkdownHtmlBlock(src)}"`,
    `alt="${escapeMarkdownHtmlBlock(alt)}"`,
    `class="markdown-html-image"`,
    `loading="lazy"`,
  ];
  if (width) parts.push(`width="${width}"`);
  if (height) parts.push(`height="${height}"`);
  if (title) parts.push(`title="${escapeMarkdownHtmlBlock(title)}"`);
  if (style) parts.push(`style="${escapeMarkdownHtmlBlock(style)}"`);
  return `<img ${parts.join(" ")}>`;
}

function renderImageBlock(source: string) {
  const trimmed = source.trim();
  const aligned = trimmed.match(ALIGNED_IMG_PATTERN);
  if (aligned) {
    const alignment = aligned[1] || aligned[2] || aligned[3] || "center";
    const image = renderImageTag(aligned[4] || "");
    return image ? `<div class="markdown-html-image-block align-${alignment}">${image}</div>` : `<div class="markdown-html-image-block markdown-html-image-blocked">[image blocked]</div>`;
  }
  const image = renderImageTag(trimmed.match(IMG_TAG_PATTERN)?.[0] || "");
  return image ? `<div class="markdown-html-image-block">${image}</div>` : `<div class="markdown-html-image-block markdown-html-image-blocked">[image blocked]</div>`;
}

const HTML_BLOCK_RENDERERS: MarkdownHtmlBlockRenderer[] = [
  {
    kind: "details",
    pattern: /<details\b[^>]*>[\s\S]*?<\/details>/gi,
    render: renderDetailsBlock,
  },
  {
    kind: "image",
    pattern: /<div\b[^>]*\balign\s*=\s*(?:"(?:left|center|right)"|'(?:left|center|right)'|(?:left|center|right))[^>]*>\s*<img\b[^>]*>\s*<\/div>|<img\b[^>]*>/gi,
    render: renderImageBlock,
  },
];

export function renderMarkdownHtmlBlock(block: Pick<MarkdownHtmlBlockRange, "kind" | "source">) {
  if (block.kind === "raw") return renderMarkdownRawHtml(block.source);
  return HTML_BLOCK_RENDERERS.find((renderer) => renderer.kind === block.kind)?.render(block.source) || "";
}

function cleanHtmlAttr(tagName: string, rawName: string, rawValue: string | undefined) {
  const name = rawName.toLowerCase();
  if (name.startsWith("on") || !SAFE_HTML_ATTRS.has(name)) return "";
  if (BOOLEAN_ATTRS.has(name)) return rawValue === undefined || rawValue === "" || /^(?:true|1|yes|allowfullscreen)$/i.test(rawValue) ? name : "";
  const value = rawValue || "";
  if (URI_ATTRS.has(name)) {
    if (name === "src" && tagName === "img" && isAllowedImageSrc(value)) return `src="${escapeMarkdownHtmlBlock(value)}"`;
    if (name === "src" && tagName === "iframe" && isAllowedFrameSrc(value)) return `src="${escapeMarkdownHtmlBlock(value)}"`;
    if (name === "src" && (tagName === "video" || tagName === "audio" || tagName === "source") && isAllowedMediaSrc(value)) return `src="${escapeMarkdownHtmlBlock(value)}"`;
    if (name === "href" && tagName === "a" && isAllowedHtmlHref(value)) return `href="${escapeMarkdownHtmlBlock(value)}"`;
    return "";
  }
  if ((name === "width" || name === "height") && !cleanDimension(value)) return "";
  if (name === "type" && !/^[A-Za-z0-9_+./-]{1,80}$/.test(value.trim())) return "";
  if ((name === "frameborder" || name === "border" || name === "framespacing" || name === "marginwidth" || name === "marginheight") && !/^(?:no|yes|[0-9]{1,4})$/i.test(value.trim())) return "";
  if ((name === "rowspan" || name === "colspan") && !/^[1-9]\d?$/.test(value.trim())) return "";
  if (name === "align" && !/^(?:left|center|right)$/i.test(value.trim())) return "";
  if (name === "target" && !/^(?:_blank|_self|_parent|_top)$/i.test(value.trim())) return "";
  if (name === "scrolling" && !/^(?:no|yes|auto)$/i.test(value.trim())) return "";
  if (name === "loading" && !/^(?:lazy|eager)$/i.test(value.trim())) return "";
  if (name === "allow" && /[<>]/.test(value)) return "";
  if (name === "style") {
    const style = tagName === "img" ? cleanImageStyle(value) : cleanHtmlCodeStyle(value);
    return style ? `style="${escapeMarkdownHtmlBlock(style)}"` : "";
  }
  if ((name === "class" || name === "id" || name === "for" || name === "name") && !/^[A-Za-z0-9_ -]{1,120}$/.test(value.trim())) return "";
  if (/[\u0000-\u001f<>]/.test(value)) return "";
  return `${name}="${escapeMarkdownHtmlBlock(value)}"`;
}

function sanitizeHtmlTag(rawTag: string, tagName: string, attrsSource: string) {
  const name = tagName.toLowerCase();
  if (!SAFE_HTML_TAGS.has(name)) return escapeMarkdownHtmlBlock(rawTag);
  const closing = /^<\//.test(rawTag);
  if (closing) return VOID_HTML_TAGS.has(name) ? "" : `</${name}>`;
  const attrs: string[] = [];
  const attrPattern = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of attrsSource.matchAll(attrPattern)) {
    const attr = cleanHtmlAttr(name, match[1], match[2] === undefined && match[3] === undefined && match[4] === undefined ? undefined : decodeHtmlAttribute(match[2] ?? match[3] ?? match[4] ?? ""));
    if (attr) attrs.push(attr);
  }
  if (name === "img" && !attrs.some((attr) => attr.startsWith("src="))) return "";
  if (name === "iframe" && !attrs.some((attr) => attr.startsWith("src="))) return "";
  if (name === "details" && !attrs.some((attr) => attr.startsWith("class="))) attrs.push('class="markdown-details"');
  return `<${name}${attrs.length ? ` ${attrs.join(" ")}` : ""}>`;
}

export function renderMarkdownRawHtml(source: string) {
  const cleanedSource = source.replace(/<!--[\s\S]*?-->/g, "").replace(UNSAFE_HTML_BLOCK_PATTERN, "").trim();
  if (!cleanedSource || !/<[A-Za-z][\s\S]*?>/.test(cleanedSource)) return "";
  let html = "";
  let lastIndex = 0;
  let renderedTag = false;
  for (const match of cleanedSource.matchAll(HTML_TAG_PATTERN)) {
    const index = match.index || 0;
    html += escapeMarkdownHtmlBlock(cleanedSource.slice(lastIndex, index));
    const tag = sanitizeHtmlTag(match[0], match[1], match[2] || "");
    if (tag && tag !== escapeMarkdownHtmlBlock(match[0])) renderedTag = true;
    html += tag;
    lastIndex = index + match[0].length;
  }
  html += escapeMarkdownHtmlBlock(cleanedSource.slice(lastIndex));
  if (!renderedTag) return "";
  return `<div class="markdown-html-render">${html}</div>\n`;
}

function overlapsExisting(ranges: MarkdownHtmlBlockRange[], start: number, end: number) {
  return ranges.some((range) => start < range.end && end > range.start);
}

function findFencedCodeRanges(source: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  const lines = source.split(/(\n)/);
  let offset = 0;
  let open: { marker: "`" | "~"; start: number } | null = null;
  for (let index = 0; index < lines.length; index += 2) {
    const text = lines[index] || "";
    const newline = lines[index + 1] || "";
    const fence = text.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1][0] as "`" | "~";
      if (!open) {
        open = { marker, start: offset };
      } else if (open.marker === marker) {
        ranges.push({ start: open.start, end: offset + text.length + newline.length });
        open = null;
      }
    }
    offset += text.length + newline.length;
  }
  if (open) ranges.push({ start: open.start, end: source.length });
  return ranges;
}

function insideAnyRange(ranges: Array<{ start: number; end: number }>, start: number, end: number) {
  return ranges.some((range) => start >= range.start && end <= range.end);
}

function htmlTagBalance(line: string) {
  let delta = 0;
  for (const match of line.matchAll(HTML_TAG_PATTERN)) {
    const raw = match[0];
    const name = match[1].toLowerCase();
    if (!SAFE_HTML_TAGS.has(name) || VOID_HTML_TAGS.has(name)) continue;
    if (/^<\//.test(raw)) {
      delta -= 1;
    } else if (!/\/>$/.test(raw)) {
      delta += 1;
    }
  }
  return delta;
}

function findRawHtmlBlockRanges(source: string, existing: MarkdownHtmlBlockRange[], fencedRanges: Array<{ start: number; end: number }>) {
  const ranges: MarkdownHtmlBlockRange[] = [];
  const lines = source.split(/(\n)/);
  const logicalLines: Array<{ text: string; start: number; end: number }> = [];
  let offset = 0;
  for (let index = 0; index < lines.length; index += 2) {
    const text = lines[index] || "";
    const newline = lines[index + 1] || "";
    logicalLines.push({ text, start: offset, end: offset + text.length + newline.length });
    offset += text.length + newline.length;
  }

  let index = 0;
  while (index < logicalLines.length) {
    const line = logicalLines[index];
    if (!RAW_HTML_LINE_START_PATTERN.test(line.text) || overlapsExisting(existing, line.start, line.end) || insideAnyRange(fencedRanges, line.start, line.end)) {
      index += 1;
      continue;
    }
    const start = line.start;
    let end = line.end;
    let balance = Math.max(0, htmlTagBalance(line.text));
    let cursor = index + 1;
    while (cursor < logicalLines.length) {
      const next = logicalLines[cursor];
      const trimmed = next.text.trim();
      const htmlish = RAW_HTML_LINE_START_PATTERN.test(next.text);
      if (!trimmed && balance <= 0) {
        break;
      }
      if (balance <= 0 && !htmlish) {
        break;
      }
      if (overlapsExisting(existing, next.start, next.end) || insideAnyRange(fencedRanges, next.start, next.end)) {
        break;
      }
      balance = Math.max(0, balance + htmlTagBalance(next.text));
      end = next.end;
      cursor += 1;
      if (balance <= 0 && cursor < logicalLines.length && !RAW_HTML_LINE_START_PATTERN.test(logicalLines[cursor].text)) break;
    }
    const rawSource = source.slice(start, end).trim();
    if (renderMarkdownRawHtml(rawSource)) {
      ranges.push({ kind: "raw", start, end, source: rawSource });
    }
    index = Math.max(cursor, index + 1);
  }
  return ranges;
}

export function findMarkdownHtmlBlockRanges(source: string): MarkdownHtmlBlockRange[] {
  const ranges: MarkdownHtmlBlockRange[] = [];
  const fencedRanges = findFencedCodeRanges(source);
  for (const renderer of HTML_BLOCK_RENDERERS) {
    renderer.pattern.lastIndex = 0;
    for (const match of source.matchAll(renderer.pattern)) {
      const start = match.index || 0;
      const end = start + match[0].length;
      if (insideAnyRange(fencedRanges, start, end)) continue;
      ranges.push({
        kind: renderer.kind,
        start,
        end,
        source: match[0],
      });
    }
  }
  ranges.push(...findRawHtmlBlockRanges(source, ranges, fencedRanges));
  return ranges.sort((left, right) => left.start - right.start || right.end - left.end);
}
