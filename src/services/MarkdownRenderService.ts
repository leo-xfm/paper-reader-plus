import MarkdownIt from "markdown-it";
import katex from "katex";
import { cpp } from "@codemirror/lang-cpp";
import { css } from "@codemirror/lang-css";
import { go } from "@codemirror/lang-go";
import { html } from "@codemirror/lang-html";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { php } from "@codemirror/lang-php";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import type { LanguageSupport } from "@codemirror/language";
import { highlightCode, tagHighlighter, tags } from "@lezer/highlight";
import { findMarkdownHtmlBlockRanges, renderMarkdownHtmlBlock } from "@/services/MarkdownHtmlBlockService";
import { findMarkdownCalloutBlocks, getMarkdownCalloutMeta } from "@/services/MarkdownCalloutService";
import { isMermaidFenceInfo, renderMermaidPlaceholder } from "@/services/MermaidRenderService";
import { markdownHeadingIdFromLine } from "@/services/MarkdownOutlineService";
import { renderSimpleLatexToMarkdown } from "@/services/SymbolTrackerService";

const MATH_PLACEHOLDER_PREFIX = "PRP_MATH_";
const DETAILS_PLACEHOLDER_PREFIX = "PRP_DETAILS_";
const CALLOUT_PLACEHOLDER_PREFIX = "PRP_CALLOUT_";
const IMAGE_SIZE_PATTERN = /\s+=([1-9]\d{0,3})?x([1-9]\d{0,3})?$/;
const IMAGE_SIZE_TITLE_PREFIX = "PRP_SIZE:";

type MathPlaceholder = {
  key: string;
  html: string;
};

type HtmlPlaceholder = MathPlaceholder;

export type MarkdownRenderOptions = {
  codeLineNumbers?: boolean;
  highlightEnabled?: boolean;
  mathEnabled?: boolean;
};

export const defaultMarkdownRenderOptions: Required<MarkdownRenderOptions> = {
  codeLineNumbers: true,
  highlightEnabled: true,
  mathEnabled: true,
};

const previewCodeHighlighter = tagHighlighter([
  { tag: tags.keyword, class: "tok-keyword" },
  { tag: [tags.atom, tags.bool, tags.url, tags.contentSeparator, tags.labelName], class: "tok-atom" },
  { tag: [tags.literal, tags.inserted], class: "tok-literal" },
  { tag: [tags.string, tags.deleted], class: "tok-string" },
  { tag: [tags.regexp, tags.escape, tags.special(tags.string)], class: "tok-string2" },
  { tag: tags.definition(tags.variableName), class: "tok-variableName tok-definition" },
  { tag: tags.local(tags.variableName), class: "tok-variableName tok-local" },
  { tag: [tags.typeName, tags.namespace], class: "tok-typeName" },
  { tag: tags.className, class: "tok-className" },
  { tag: [tags.special(tags.variableName), tags.macroName], class: "tok-variableName2" },
  { tag: tags.definition(tags.propertyName), class: "tok-propertyName tok-definition" },
  { tag: tags.propertyName, class: "tok-propertyName" },
  { tag: tags.number, class: "tok-number" },
  { tag: tags.operator, class: "tok-operator" },
  { tag: tags.comment, class: "tok-comment" },
  { tag: tags.meta, class: "tok-meta" },
  { tag: tags.invalid, class: "tok-invalid" },
]);

const previewCodeLanguages = new Map<string, LanguageSupport>([
  ["c", cpp()],
  ["cc", cpp()],
  ["cpp", cpp()],
  ["c++", cpp()],
  ["h", cpp()],
  ["hpp", cpp()],
  ["css", css()],
  ["go", go()],
  ["golang", go()],
  ["html", html()],
  ["htm", html()],
  ["java", java()],
  ["js", javascript()],
  ["javascript", javascript()],
  ["jsx", javascript({ jsx: true })],
  ["ts", javascript({ typescript: true })],
  ["typescript", javascript({ typescript: true })],
  ["tsx", javascript({ jsx: true, typescript: true })],
  ["json", json()],
  ["json5", json()],
  ["php", php()],
  ["py", python()],
  ["python", python()],
  ["rs", rust()],
  ["rust", rust()],
  ["sql", sql()],
  ["xml", xml()],
  ["svg", xml()],
  ["yaml", yaml()],
  ["yml", yaml()],
]);

export function isAllowedMarkdownUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("#") || trimmed.startsWith("/reader?")) return true;
  if (/^(?:\.\/)?assets\/[^?#\s]+(?:[?#][^\s]*)?$/i.test(trimmed)) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,/i.test(trimmed)) return true;
  if (/^readerp:\/\//i.test(trimmed)) return true;
  if (/^readerm:\/\//i.test(trimmed)) return true;
  if (/^[^\s<>"']+$/.test(trimmed) && !trimmed.startsWith("//") && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return true;
  return false;
}

function renderMath(value: string, displayMode: boolean) {
  try {
    return katex.renderToString(value, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
    });
  } catch {
    return `<code>${escapeHtml(value)}</code>`;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isEscaped(value: string, index: number) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function findClosingMathDelimiter(line: string, delimiter: "$" | "$$", from: number) {
  let index = from;
  while (index < line.length) {
    const next = line.indexOf(delimiter, index);
    if (next < 0) return -1;
    if (!isEscaped(line, next) && (delimiter === "$$" || line[next + 1] !== "$")) return next;
    index = next + delimiter.length;
  }
  return -1;
}

function replaceInlineMath(line: string, placeholders: MathPlaceholder[]) {
  let output = "";
  let index = 0;
  while (index < line.length) {
    if (line[index] !== "$" || isEscaped(line, index)) {
      output += line[index] || "";
      index += 1;
      continue;
    }
    const display = line[index + 1] === "$";
    const delimiter = display ? "$$" : "$";
    const contentStart = index + delimiter.length;
    const end = findClosingMathDelimiter(line, delimiter, contentStart);
    if (end < 0) {
      output += line.slice(index);
      break;
    }
    if (end === contentStart) {
      output += line.slice(index, end + delimiter.length);
      index = end + delimiter.length;
      continue;
    }
    const key = `${MATH_PLACEHOLDER_PREFIX}${placeholders.length}`;
    placeholders.push({ key, html: renderMath(line.slice(contentStart, end).trim(), display) });
    output += key;
    index = end + delimiter.length;
  }
  return output;
}

function replaceInlineHighlights(line: string, placeholders: MathPlaceholder[]) {
  return line.replace(/(^|[^\\=])==([^=\n].*?[^=\n])==/g, (_match, prefix: string, content: string) => {
    const key = `${MATH_PLACEHOLDER_PREFIX}${placeholders.length}`;
    placeholders.push({ key, html: `<mark class="markdown-highlight">${escapeHtml(content)}</mark>` });
    return `${prefix}${key}`;
  });
}

function extractHtmlBlockPlaceholders(source: string) {
  const placeholders: HtmlPlaceholder[] = [];
  let output = "";
  let lastIndex = 0;
  for (const range of findMarkdownHtmlBlockRanges(source)) {
    output += source.slice(lastIndex, range.start);
    const html = renderMarkdownHtmlBlock(range);
    if (html) {
      const key = `${DETAILS_PLACEHOLDER_PREFIX}${placeholders.length}`;
      placeholders.push({ key, html });
      output += `\n\n${key}\n\n`;
    } else {
      output += range.source;
    }
    lastIndex = range.end;
  }
  output += source.slice(lastIndex);
  return { source: output, placeholders };
}

function extractCalloutPlaceholders(source: string, options: Required<MarkdownRenderOptions>) {
  const placeholders: HtmlPlaceholder[] = [];
  const blocks = findMarkdownCalloutBlocks(source);
  if (!blocks.length) return { source, placeholders };
  let output = "";
  let lastIndex = 0;
  for (const block of blocks) {
    output += source.slice(lastIndex, block.start);
    const body = block.body.replace(/^\s+$/, "");
    const meta = getMarkdownCalloutMeta(block.kind);
    const titleHtml = [
      `<span class="markdown-callout-icon markdown-callout-icon-${meta.icon}" aria-hidden="true"></span>`,
      `<span class="markdown-callout-label">${escapeHtml(meta.label)}</span>`,
    ].join("");
    const key = `${CALLOUT_PLACEHOLDER_PREFIX}${placeholders.length}`;
    const innerHtml = body ? renderMarkdownContent(body, options) : "";
    placeholders.push({
      key,
      html: `<aside class="markdown-callout markdown-callout-${block.kind}"><div class="markdown-callout-title">${titleHtml}</div>${innerHtml ? `<div class="markdown-callout-body">${innerHtml}</div>` : ""}</aside>`,
    });
    output += `\n\n${key}\n\n`;
    lastIndex = block.end;
  }
  output += source.slice(lastIndex);
  return { source: output, placeholders };
}

function markCodeBlockHtml(html: string) {
  return html.replace(/<pre><code(?: class="([^"]*)")?/, (_match, className = "") => {
    const codeClass = ["markdown-code", className].filter(Boolean).join(" ");
    return `<pre class="markdown-code-block"><code class="${codeClass}"`;
  });
}

function languageFromFenceInfo(info: string) {
  const languageName = (info.trim().split(/\s+/)[0] || "").toLowerCase().replace(/^language-/, "");
  return languageName ? previewCodeLanguages.get(languageName) : undefined;
}

function renderCodeBlock(content: string, languageName: string, highlightedContent: string, options: Required<MarkdownRenderOptions>) {
  const codeClass = ["markdown-code", languageName ? `language-${languageName}` : ""].filter(Boolean).join(" ");
  const languageBadge = languageName ? `<span class="markdown-code-language">${escapeHtml(languageName)}</span>` : "";
  if (!options.codeLineNumbers) {
    return `<pre class="markdown-code-block"><code class="${codeClass}">${highlightedContent}</code>${languageBadge}</pre>\n`;
  }
  const normalizedContent = content.endsWith("\n") ? content.slice(0, -1) : content;
  const normalizedHighlighted = content.endsWith("\n") ? highlightedContent.replace(/\n$/, "") : highlightedContent;
  const sourceLines = normalizedContent.split("\n");
  const highlightedLines = normalizedHighlighted.split("\n");
  const lineCount = Math.max(sourceLines.length, highlightedLines.length, 1);
  const renderedLines = Array.from({ length: lineCount }, (_, index) => {
    const line = highlightedLines[index] ?? "";
    return `<span class="markdown-code-line"><span class="markdown-code-line-number">${index + 1}</span><span class="markdown-code-line-content">${line}</span></span>`;
  }).join("");
  return `<pre class="markdown-code-block"><code class="${codeClass}">${renderedLines}</code>${languageBadge}</pre>\n`;
}

function renderCodeFence(content: string, info: string, options: Required<MarkdownRenderOptions>) {
  if (isMermaidFenceInfo(info)) return renderMermaidPlaceholder(content);

  const languageName = (info.trim().split(/\s+/)[0] || "").replace(/[^A-Za-z0-9_+#.-]/g, "");
  const language = languageFromFenceInfo(info);
  if (!language) {
    return renderCodeBlock(content, languageName, escapeHtml(content), options);
  }

  let highlighted = "";
  highlightCode(
    content,
    language.language.parser.parse(content),
    previewCodeHighlighter,
    (text, classes) => {
      highlighted += classes ? `<span class="${classes}">${escapeHtml(text)}</span>` : escapeHtml(text);
    },
    () => {
      highlighted += "\n";
    },
  );
  return renderCodeBlock(content, languageName, highlighted, options);
}

export function extractMathPlaceholders(source: string, options: Required<MarkdownRenderOptions> = defaultMarkdownRenderOptions) {
  const placeholders: MathPlaceholder[] = [];
  const output: string[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let codeFenceOpen = false;
  let blockMath: string[] | null = null;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      codeFenceOpen = !codeFenceOpen;
      output.push(line);
      continue;
    }
    if (codeFenceOpen) {
      output.push(line);
      continue;
    }
    if (options.mathEnabled && line.trim() === "$$") {
      if (blockMath) {
        const key = `${MATH_PLACEHOLDER_PREFIX}${placeholders.length}`;
        placeholders.push({ key, html: renderMath(blockMath.join("\n").trim(), true) });
        output.push("");
        output.push(key);
        output.push("");
        blockMath = null;
      } else {
        blockMath = [];
      }
      continue;
    }
    if (blockMath) {
      blockMath.push(line);
      continue;
    }
    let nextLine = options.mathEnabled ? replaceInlineMath(line, placeholders) : line;
    if (options.highlightEnabled) nextLine = replaceInlineHighlights(nextLine, placeholders);
    output.push(nextLine);
  }

  if (blockMath) {
    output.push("$$");
    output.push(...blockMath);
  }

  return {
    source: output.join("\n"),
    placeholders,
  };
}

function createMarkdownIt(renderOptions: Required<MarkdownRenderOptions>) {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
    breaks: false,
  });
  md.validateLink = isAllowedMarkdownUrl;
  md.enable(["table", "strikethrough"]);

  const defaultFence = md.renderer.rules.fence || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const highlighted = renderCodeFence(token.content, token.info || "", renderOptions);
    if (highlighted) return highlighted;
    return markCodeBlockHtml(defaultFence(tokens, idx, options, env, self));
  };

  const defaultCodeBlock = md.renderer.rules.code_block || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.code_block = (tokens, idx, options, env, self) => {
    return markCodeBlockHtml(defaultCodeBlock(tokens, idx, options, env, self));
  };

  const defaultHeadingOpen = md.renderer.rules.heading_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const lineIndex = tokens[idx].map?.[0];
    if (typeof lineIndex === "number") tokens[idx].attrSet("data-readerm-heading-id", markdownHeadingIdFromLine(lineIndex));
    return defaultHeadingOpen(tokens, idx, options, env, self);
  };

  const defaultLinkOpen = md.renderer.rules.link_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const href = token.attrGet("href") || "";
    if (/^https?:\/\//i.test(href)) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  const defaultImage = md.renderer.rules.image || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const src = token.attrGet("src") || "";
    const title = token.attrGet("title") || "";
    const sizeMatch = src.match(IMAGE_SIZE_PATTERN);
    if (sizeMatch) {
      token.attrSet("src", src.replace(IMAGE_SIZE_PATTERN, ""));
      const width = sizeMatch[1] ? Number(sizeMatch[1]) : 0;
      const height = sizeMatch[2] ? Number(sizeMatch[2]) : 0;
      if (width) token.attrSet("width", String(width));
      if (height) token.attrSet("height", String(height));
    }
    if (title.startsWith(IMAGE_SIZE_TITLE_PREFIX)) {
      const [, widthValue, heightValue] = title.match(/^PRP_SIZE:([1-9]\d{0,3})?x([1-9]\d{0,3})?$/) || [];
      if (widthValue) token.attrSet("width", widthValue);
      if (heightValue) token.attrSet("height", heightValue);
      const titleIndex = token.attrIndex("title");
      if (titleIndex >= 0) token.attrs?.splice(titleIndex, 1);
    }
    token.attrJoin("loading", "lazy");
    const imageHtml = defaultImage(tokens, idx, options, env, self);
    const caption = token.attrGet("title");
    return caption ? `<figure class="markdown-figure">${imageHtml}<figcaption>${escapeHtml(caption)}</figcaption></figure>` : imageHtml;
  };

  md.core.ruler.after("inline", "paper_reader_task_lists", (state) => {
    for (const token of state.tokens) {
      if (token.type !== "inline" || !token.children?.length) continue;
      const first = token.children[0];
      if (first.type !== "text") continue;
      const match = first.content.match(/^\[([ xX])\]\s+/);
      if (!match) continue;
      first.content = first.content.slice(match[0].length);
      token.children.unshift(new state.Token("html_inline", "", 0));
      token.children[0].content = `<input class="markdown-task-checkbox" type="checkbox" disabled${match[1].toLowerCase() === "x" ? " checked" : ""}> `;
      const parent = state.tokens[state.tokens.indexOf(token) - 2];
      if (parent?.type === "list_item_open") parent.attrJoin("class", "markdown-task-item");
    }
  });
  return md;
}

function stripUnsafeImageUrls(source: string) {
  return source.replace(/!\[([^\]]*)\]\(([^)\n]+)\)/g, (match, alt: string, target: string) => {
    const url = target.trim().split(/\s+/)[0] || "";
    if (isAllowedMarkdownUrl(url)) return match;
    return alt ? `[image blocked: ${alt}]` : "[image blocked]";
  });
}

function normalizeImageSizeSyntax(source: string) {
  return source.replace(/!\[([^\]]*)\]\(([^)\s]+)\s+=([1-9]\d{0,3})?x([1-9]\d{0,3})?\)/g, (_match, alt: string, url: string, width = "", height = "") => {
    return `![${alt}](${url} "${IMAGE_SIZE_TITLE_PREFIX}${width}x${height}")`;
  });
}

function replaceHtmlPlaceholder(rendered: string, key: string, html: string) {
  return rendered
    .replaceAll(`<p>${key}</p>`, html)
    .replaceAll(key, html);
}

export function renderMarkdownContent(source: string, options: MarkdownRenderOptions = defaultMarkdownRenderOptions) {
  const resolvedOptions = { ...defaultMarkdownRenderOptions, ...options };
  const markdownIt = createMarkdownIt(resolvedOptions);
  const normalizedSource = normalizeImageSizeSyntax(stripUnsafeImageUrls(renderSimpleLatexToMarkdown(source || "")));
  const calloutBlocks = extractCalloutPlaceholders(normalizedSource, resolvedOptions);
  const htmlBlocks = extractHtmlBlockPlaceholders(calloutBlocks.source);
  const extracted = extractMathPlaceholders(
    htmlBlocks.source,
    resolvedOptions,
  );
  let rendered = markdownIt.render(extracted.source);
  for (const placeholder of [...extracted.placeholders, ...htmlBlocks.placeholders, ...calloutBlocks.placeholders]) {
    rendered = replaceHtmlPlaceholder(rendered, placeholder.key, placeholder.html);
  }
  return rendered;
}

export function renderMarkdown(source: string, options: MarkdownRenderOptions = defaultMarkdownRenderOptions) {
  return renderMarkdownContent(source, options);
}
