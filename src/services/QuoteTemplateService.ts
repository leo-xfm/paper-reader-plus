import type { Anchor, LibraryDocument } from "@/types";

export const DEFAULT_COPY_QUOTE_TEMPLATE = "> {{ paragraph_content }}\n\nSource: {{ page_marker }}";
export const DEFAULT_QUOTE_TO_NOTE_TEMPLATE = "{{ page_marker }}";
export const DEFAULT_QUOTE_TO_READERM_TEMPLATE = "[{{ passage_name }}, p.{{ page_number }}]({{ href }})";

type QuoteTemplateValues = Record<string, unknown>;

export type QuoteTemplateInput = {
  anchor: Anchor;
  document?: Pick<LibraryDocument, "title"> | null;
  text?: string;
  template?: string;
};

function valueForPath(values: QuoteTemplateValues, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, values);
}

function stringify(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function stripQuotes(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith("\"") && trimmed.endsWith("\""))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function evalExpression(expression: string, values: QuoteTemplateValues): unknown {
  const defaultMatch = expression.match(/^(.+?)\s*\|\s*default\((.+)\)$/);
  if (defaultMatch) {
    const value = evalExpression(defaultMatch[1], values);
    return stringify(value) || stripQuotes(defaultMatch[2]);
  }
  return valueForPath(values, expression.trim());
}

function evalCondition(condition: string, values: QuoteTemplateValues): boolean {
  const andParts = condition.split(/\s+and\s+/);
  if (andParts.length > 1) return andParts.every((part) => evalCondition(part, values));
  const notEquals = condition.match(/^(.+?)\s*!=\s*(.+)$/);
  if (notEquals) return stringify(evalExpression(notEquals[1], values)) !== stripQuotes(notEquals[2]);
  const equals = condition.match(/^(.+?)\s*==\s*(.+)$/);
  if (equals) return stringify(evalExpression(equals[1], values)) === stripQuotes(equals[2]);
  return Boolean(stringify(evalExpression(condition, values)));
}

function renderConditionals(template: string, values: QuoteTemplateValues): string {
  const pattern = /\{%-?\s*if\s+(.+?)\s*-?%\}([\s\S]*?)\{%-?\s*endif\s*-?%\}/g;
  let previous = "";
  let current = template;
  while (current !== previous) {
    previous = current;
    current = current.replace(pattern, (_match, condition: string, content: string) => (
      evalCondition(condition, values) ? content : ""
    ));
  }
  return current;
}

function renderTemplate(template: string, values: QuoteTemplateValues) {
  return renderConditionals(template, values)
    .replace(/\{\{\s*(.+?)\s*\}\}/g, (_match, expression: string) => stringify(evalExpression(expression, values)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function quoteTemplateValues(input: Omit<QuoteTemplateInput, "template">) {
  const pageNumber = input.anchor.page_index + 1;
  const pageLabel = input.anchor.page_label || String(pageNumber);
  const params = new URLSearchParams({
    documentId: input.anchor.document_id,
    anchor: input.anchor.anchor_id,
    page: String(pageNumber),
  });
  const href = `/reader?${params.toString()}`;
  const pageMarker = `[p. ${pageNumber}](${href})`;
  const paragraphContent = input.text || input.anchor.text_quote.exact;
  return {
    passage_name: input.document?.title || "",
    page_marker: pageMarker,
    paragraph_content: paragraphContent,
    content: paragraphContent,
    page_number: pageNumber,
    page_label: pageLabel,
    href,
  };
}

export function buildTemplatedMarkdownQuote(input: QuoteTemplateInput) {
  const template = input.template?.trim() || DEFAULT_COPY_QUOTE_TEMPLATE;
  return renderTemplate(template, quoteTemplateValues(input));
}
