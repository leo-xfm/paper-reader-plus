import MarkdownIt from "markdown-it";
import katex from "katex";
import { markdownHeadingIdFromLine } from "@/services/MarkdownOutlineService";
import { renderSimpleLatexToMarkdown } from "@/services/SymbolTrackerService";

const MATH_PLACEHOLDER_PREFIX = "PRP_MATH_";
const IMAGE_SIZE_PATTERN = /\s+=([1-9]\d{0,3})?x([1-9]\d{0,3})?$/;
const IMAGE_SIZE_TITLE_PREFIX = "PRP_SIZE:";

type MathPlaceholder = {
  key: string;
  html: string;
};

export function isAllowedMarkdownUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("#") || trimmed.startsWith("/reader?")) return true;
  if (/^(?:\.\/)?assets\/[^?#\s]+(?:[?#][^\s]*)?$/i.test(trimmed)) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,/i.test(trimmed)) return true;
  if (/^readerp:\/\//i.test(trimmed)) return true;
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

function replaceInlineMath(line: string, placeholders: MathPlaceholder[]) {
  return line.replace(/(^|[^\\])\$([^$\n]+?)\$/g, (match, prefix: string, expression: string) => {
    const key = `${MATH_PLACEHOLDER_PREFIX}${placeholders.length}`;
    placeholders.push({ key, html: renderMath(expression.trim(), false) });
    return `${prefix}${key}`;
  });
}

function markCodeBlockHtml(html: string) {
  return html.replace(/<pre><code(?: class="([^"]*)")?/, (_match, className = "") => {
    const codeClass = ["markdown-code", className].filter(Boolean).join(" ");
    return `<pre class="markdown-code-block"><code class="${codeClass}"`;
  });
}

export function extractMathPlaceholders(source: string) {
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
    if (line.trim() === "$$") {
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
    output.push(replaceInlineMath(line, placeholders));
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

function createMarkdownIt() {
  const md = new MarkdownIt({
    html: false,
    linkify: false,
    typographer: false,
    breaks: false,
  });
  md.validateLink = isAllowedMarkdownUrl;
  md.enable(["table", "strikethrough"]);

  const defaultFence = md.renderer.rules.fence || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
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

const markdownIt = createMarkdownIt();

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

export function renderMarkdown(source: string) {
  const extracted = extractMathPlaceholders(normalizeImageSizeSyntax(stripUnsafeImageUrls(renderSimpleLatexToMarkdown(source || ""))));
  let rendered = markdownIt.render(extracted.source);
  for (const placeholder of extracted.placeholders) {
    rendered = rendered.replaceAll(placeholder.key, placeholder.html);
  }
  return rendered;
}
