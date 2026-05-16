export type TemplateValues = Record<string, unknown>;

function valueForPath(values: TemplateValues, path: string): unknown {
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

function evalExpression(expression: string, values: TemplateValues): unknown {
  const defaultMatch = expression.match(/^(.+?)\s*\|\s*default\((.+)\)$/);
  if (defaultMatch) {
    const value = evalExpression(defaultMatch[1], values);
    return stringify(value) || stripQuotes(defaultMatch[2]);
  }
  return valueForPath(values, expression.trim());
}

function evalCondition(condition: string, values: TemplateValues): boolean {
  const andParts = condition.split(/\s+and\s+/);
  if (andParts.length > 1) return andParts.every((part) => evalCondition(part, values));
  const notEquals = condition.match(/^(.+?)\s*!=\s*(.+)$/);
  if (notEquals) return stringify(evalExpression(notEquals[1], values)) !== stripQuotes(notEquals[2]);
  const equals = condition.match(/^(.+?)\s*==\s*(.+)$/);
  if (equals) return stringify(evalExpression(equals[1], values)) === stripQuotes(equals[2]);
  return Boolean(stringify(evalExpression(condition, values)));
}

function renderConditionals(template: string, values: TemplateValues): string {
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

export function renderTemplate(template: string, values: TemplateValues = {}) {
  return renderConditionals(template, values)
    .replace(/\{\{\s*(.+?)\s*\}\}/g, (_match, expression: string) => stringify(evalExpression(expression, values)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
