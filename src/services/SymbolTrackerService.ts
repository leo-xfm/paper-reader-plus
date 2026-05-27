import type { PdfTextItem } from "@/pdf/pdfTypes";
import type { SymbolDefinition } from "@/types";

export type SymbolExtractionProgress = {
  status: string;
  percent?: number;
};

const STOPWORDS = new Set([
  "The",
  "This",
  "That",
  "For",
  "Then",
  "Where",
  "Let",
  "And",
  "With",
  "From",
  "Figure",
  "Table",
]);

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function collapseNonIndentSpaces(value: string) {
  return value.split("\n").map((line) => {
    const indent = line.match(/^[ \t]*/)?.[0] || "";
    return `${indent}${line.slice(indent.length).replace(/[ \t]+/g, " ")}`;
  }).join("\n");
}

function isEscaped(source: string, index: number) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) slashCount += 1;
  return slashCount % 2 === 1;
}

function replaceOutsideMath(source: string, pattern: RegExp, replacement: string | ((substring: string, ...args: string[]) => string)) {
  let output = "";
  let prose = "";
  let index = 0;
  const flushProse = () => {
    output += prose.replace(pattern, replacement as string);
    prose = "";
  };

  while (index < source.length) {
    const startsDisplayMath = source.startsWith("$$", index) && !isEscaped(source, index);
    const startsInlineMath = source[index] === "$" && !startsDisplayMath && !isEscaped(source, index);
    const startsParenMath = source.startsWith("\\(", index);
    const startsBracketMath = source.startsWith("\\[", index);
    if (!startsDisplayMath && !startsInlineMath && !startsParenMath && !startsBracketMath) {
      prose += source[index];
      index += 1;
      continue;
    }

    flushProse();
    const open = startsDisplayMath ? "$$" : startsInlineMath ? "$" : startsParenMath ? "\\(" : "\\[";
    const close = startsDisplayMath ? "$$" : startsInlineMath ? "$" : startsParenMath ? "\\)" : "\\]";
    const closeIndex = source.indexOf(close, index + open.length);
    if (closeIndex < 0) {
      output += source.slice(index);
      return output;
    }
    output += source.slice(index, closeIndex + close.length);
    index = closeIndex + close.length;
  }

  flushProse();
  return output;
}

function stripLatexComments(source: string) {
  return source.replace(/(^|[ \t])%.*$/gm, (match, prefix: string) => {
    return prefix.trim() ? prefix : "";
  });
}

export function renderSimpleLatexToMarkdown(source: string) {
  return collapseNonIndentSpaces(stripLatexComments(replaceOutsideMath(source, /\\mathcal\{([^{}]+)\}/g, "$\\mathcal{$1}$"))
    .replace(/\\begin\{(?:equation|equation\*|displaymath)\}([\s\S]*?)\\end\{(?:equation|equation\*|displaymath)\}/g, (_match, body: string) => `\n\n$$\n${body.trim()}\n$$\n\n`)
    .replace(/\\begin\{(?:align|align\*|gather|gather\*)\}([\s\S]*?)\\end\{(?:align|align\*|gather|gather\*)\}/g, (_match, body: string) => `\n\n$$\n${body.trim().replace(/\\\\/g, "\\\\\n")}\n$$\n\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, body: string) => `$${body.trim()}$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, body: string) => `\n\n$$\n${body.trim()}\n$$\n\n`)
    .replace(/\$\$([\s\S]*?)\$\$/g, (_match, body: string) => `\n\n$$\n${body.trim()}\n$$\n\n`)
    .replace(/\\section\*?\{([^{}]*)\}/g, "\n\n# $1\n\n")
    .replace(/\\subsection\*?\{([^{}]*)\}/g, "\n\n## $1\n\n")
    .replace(/\\subsubsection\*?\{([^{}]*)\}/g, "\n\n### $1\n\n")
    .replace(/\\paragraph\*?\{([^{}]*)\}/g, "\n\n**$1** ")
    .replace(/\\textit\{([^{}]*)\}/g, "*$1*")
    .replace(/\\emph\{([^{}]*)\}/g, "*$1*")
    .replace(/\\texttt\{([^{}]*)\}/g, "`$1`")
    .replace(/\\text\{([^{}]*)\}/g, "$1")
    .replace(/\\label\{[^{}]*\}/g, "")
    .replace(/\\cite[tp]?\{([^{}]*)\}/g, "[$1]")
    .replace(/\\ref\{([^{}]*)\}/g, "$1"))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeSymbol(value: string) {
  return symbolDisplay(value)
    .replace(/^\\/, "")
    .replace(/[{}$]/g, "")
    .trim()
    .toLowerCase();
}

function symbolDisplay(value: string) {
  const trimmed = value.replace(/\$/g, "").trim();
  const textCommand = trimmed.match(/^\\(?:text|textrm|textnormal|mathrm|operatorname)\{([^{}]+)\}$/);
  if (textCommand) return textCommand[1].trim();
  const flattenedTextCommand = trimmed.match(/^\\text([A-Z][A-Za-z0-9_]*)$/);
  if (flattenedTextCommand) return flattenedTextCommand[1].trim();
  return trimmed.replace(/[{}]/g, "").trim();
}

export function displaySymbolText(value: string) {
  return symbolDisplay(value);
}

function pushUnique(definitions: SymbolDefinition[], definition: SymbolDefinition) {
  if (!definition.symbol || !definition.definition) return;
  if (STOPWORDS.has(definition.symbol)) return;
  const exists = definitions.some((item) => item.normalized_symbol === definition.normalized_symbol && item.definition === definition.definition);
  if (!exists) definitions.push(definition);
}

function lineStarts(source: string) {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function lineNumberFromStarts(starts: number[], index: number) {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle] <= index) low = middle + 1;
    else high = middle - 1;
  }
  return Math.max(1, high + 1);
}

function sentenceCandidates(source: string) {
  const candidates: Array<{ sentence: string; index: number }> = [];
  const keywordPattern = /\b(?:denotes|denote|is defined as|is the|are the|represents|where|let)\b/gi;
  const seen = new Set<string>();
  for (const match of source.matchAll(keywordPattern)) {
    const keywordIndex = match.index || 0;
    let start = Math.max(0, keywordIndex - 320);
    let end = Math.min(source.length, keywordIndex + 360);
    for (let cursor = keywordIndex - 1; cursor >= start; cursor -= 1) {
      if (/[.!?\n]/.test(source[cursor])) {
        start = cursor + 1;
        break;
      }
    }
    for (let cursor = keywordIndex; cursor < end; cursor += 1) {
      if (/[.!?\n]/.test(source[cursor])) {
        end = cursor + 1;
        break;
      }
    }
    const sentence = cleanText(source.slice(start, end));
    if (!sentence) continue;
    const key = `${start}:${sentence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ sentence, index: start });
  }
  return candidates;
}

function extractSymbolsFromLatexCandidate(
  definitions: SymbolDefinition[],
  withoutComments: string,
  starts: number[],
  candidate: { sentence: string; index: number },
) {
    const sentence = candidate.sentence;
    const mathSymbols = [...sentence.matchAll(/(?:\\\(([^)]+)\\\)|\$([^$]+)\$)/g)]
      .flatMap((item) => (item[1] || item[2] || "").split(/[,\s=+\-*/()]+/))
      .map(symbolDisplay)
      .filter((item) => /^[\\A-Za-z][\\A-Za-z0-9_{}^]*$/.test(item));
    const abbreviation = sentence.match(/\b([A-Z][A-Z0-9]{1,8})\s*\(([^)]{3,120})\)|\b([^()]{3,120})\s*\(([A-Z][A-Z0-9]{1,8})\)/);
    for (const raw of mathSymbols.slice(0, 5)) {
      const renderedSentence = renderSimpleLatexToMarkdown(sentence);
      pushUnique(definitions, {
        symbol: raw,
        normalized_symbol: normalizeSymbol(raw),
        kind: raw.length > 1 && raw === raw.toUpperCase() ? "abbreviation" : "symbol",
        definition: renderedSentence,
        source: "latex",
        paragraph: renderedSentence,
        latex_line: lineNumberFromStarts(starts, candidate.index),
        confidence: sentence.toLowerCase().includes("where") ? 0.72 : 0.82,
      });
    }
    if (abbreviation) {
      const symbol = abbreviation[1] || abbreviation[4];
      const expansion = abbreviation[2] || abbreviation[3] || sentence;
      pushUnique(definitions, {
        symbol,
        normalized_symbol: normalizeSymbol(symbol),
        kind: "abbreviation",
        definition: renderSimpleLatexToMarkdown(cleanText(expansion)),
        source: "latex",
        paragraph: renderSimpleLatexToMarkdown(sentence),
        latex_line: lineNumberFromStarts(starts, candidate.index),
        confidence: 0.9,
      });
    }
}

export function extractSymbolsFromLatex(source: string): SymbolDefinition[] {
  const definitions: SymbolDefinition[] = [];
  const withoutComments = stripLatexComments(source);
  const starts = lineStarts(withoutComments);
  for (const candidate of sentenceCandidates(withoutComments)) {
    extractSymbolsFromLatexCandidate(definitions, withoutComments, starts, candidate);
  }
  return definitions;
}

function yieldToUi() {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

export async function extractSymbolsFromLatexWithProgress(
  source: string,
  onProgress?: (progress: SymbolExtractionProgress) => void,
): Promise<SymbolDefinition[]> {
  onProgress?.({ status: "Preparing LaTeX source", percent: 8 });
  await yieldToUi();
  const definitions: SymbolDefinition[] = [];
  const withoutComments = stripLatexComments(source);
  const starts = lineStarts(withoutComments);
  const candidates = sentenceCandidates(withoutComments);
  onProgress?.({ status: "Scanning symbol definitions", percent: candidates.length ? 12 : 90 });
  await yieldToUi();
  for (let index = 0; index < candidates.length; index += 1) {
    extractSymbolsFromLatexCandidate(definitions, withoutComments, starts, candidates[index]);
    if (index % 8 === 0 || index === candidates.length - 1) {
      const percent = 12 + Math.round(((index + 1) / Math.max(1, candidates.length)) * 78);
      onProgress?.({ status: `Scanning symbol definitions (${index + 1}/${candidates.length})`, percent });
      await yieldToUi();
    }
  }
  onProgress?.({ status: "Finalizing symbols", percent: 96 });
  await yieldToUi();
  return definitions;
}

function pageText(items: PdfTextItem[]) {
  return cleanText(items.slice().sort((left, right) => left.top - right.top || left.left - right.left).map((item) => item.text).join(" "));
}

function rectsForSymbol(items: PdfTextItem[], symbol: string) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`);
  return items
    .filter((item) => pattern.test(item.text))
    .slice(0, 6)
    .map((item) => item.rectPct);
}

export function extractSymbolsFromPdfPages(pages: Record<number, PdfTextItem[]>): SymbolDefinition[] {
  const definitions: SymbolDefinition[] = [];
  for (const [page, items] of Object.entries(pages)) {
    const pageIndex = Number(page);
    const text = pageText(items);
    const abbreviationMatches = text.match(/[^.!?]*(?:\b[A-Z][A-Z0-9]{1,8}\s*\([^)]{3,120}\)|\([^)]{3,120}\)\s*[A-Z][A-Z0-9]{1,8}\b)[^.!?]*[.!?]?/g) || [];
    for (const sentence of abbreviationMatches.slice(0, 24)) {
      const cleaned = cleanText(sentence);
      const abbreviation = cleaned.match(/\b([A-Z][A-Z0-9]{1,8})\s*\(([^)]{3,120})\)|\b([^()]{3,120})\s*\(([A-Z][A-Z0-9]{1,8})\)/);
      if (!abbreviation) continue;
      const symbol = abbreviation[1] || abbreviation[4];
      const expansion = abbreviation[2] || abbreviation[3] || cleaned;
      pushUnique(definitions, {
        symbol,
        normalized_symbol: normalizeSymbol(symbol),
        kind: "abbreviation",
        definition: cleanText(expansion),
        source: "pdf",
        page_index: pageIndex,
        rects_pct: rectsForSymbol(items, symbol),
        paragraph: cleaned,
        confidence: 0.78,
      });
    }
    const sentenceMatches = text.match(/[^.!?]*(?:denotes|denote|is defined as|is the|are the|represents|where|let)[^.!?]*[.!?]?/gi) || [];
    for (const sentence of sentenceMatches.slice(0, 18)) {
      const cleaned = cleanText(sentence);
      const abbreviation = cleaned.match(/\b([A-Z][A-Z0-9]{1,8})\s*\(([^)]{3,120})\)|\b([^()]{3,120})\s*\(([A-Z][A-Z0-9]{1,8})\)/);
      const symbols = [...cleaned.matchAll(/\b([A-Za-z][A-Za-z0-9_]{0,3})\b/g)]
        .map((match) => match[1])
        .filter((symbol) => !STOPWORDS.has(symbol) && (symbol.length === 1 || symbol === symbol.toUpperCase()));
      for (const symbol of symbols.slice(0, 4)) {
        pushUnique(definitions, {
          symbol,
          normalized_symbol: normalizeSymbol(symbol),
          kind: symbol.length > 1 && symbol === symbol.toUpperCase() ? "abbreviation" : "symbol",
          definition: cleaned,
          source: "pdf",
          page_index: pageIndex,
          rects_pct: rectsForSymbol(items, symbol),
          paragraph: cleaned,
          confidence: cleaned.toLowerCase().includes("where") ? 0.52 : 0.62,
        });
      }
      if (abbreviation) {
        const symbol = abbreviation[1] || abbreviation[4];
        const expansion = abbreviation[2] || abbreviation[3] || cleaned;
        pushUnique(definitions, {
          symbol,
          normalized_symbol: normalizeSymbol(symbol),
          kind: "abbreviation",
          definition: cleanText(expansion),
          source: "pdf",
          page_index: pageIndex,
          rects_pct: rectsForSymbol(items, symbol),
          paragraph: cleaned,
          confidence: 0.78,
        });
      }
    }
  }
  return definitions;
}

export function mergeSymbolDefinitions(...groups: SymbolDefinition[][]) {
  const favorites = new Map<string, boolean>();
  for (const definition of groups.flat()) {
    if (definition.favorite) favorites.set(definition.normalized_symbol, true);
  }
  const ranked = groups.flat().sort((left, right) => {
    if (left.user_modified !== right.user_modified) return left.user_modified ? -1 : 1;
    if (left.deleted !== right.deleted) return left.deleted ? -1 : 1;
    const sourceRank = { latex: 4, ai: 3, grobid: 2, pdf: 1 };
    return sourceRank[right.source] - sourceRank[left.source] || right.confidence - left.confidence;
  });
  const seen = new Set<string>();
  const merged: SymbolDefinition[] = [];
  for (const definition of ranked) {
    if (seen.has(definition.normalized_symbol)) continue;
    seen.add(definition.normalized_symbol);
    if (definition.deleted) continue;
    merged.push({ ...definition, favorite: favorites.get(definition.normalized_symbol) || definition.favorite });
  }
  return merged.sort((left, right) => left.symbol.localeCompare(right.symbol));
}

export function applySymbolRefresh(
  currentSaved: SymbolDefinition[],
  generated: SymbolDefinition[],
  mode: "preserve-user-state" | "reset",
) {
  if (mode === "reset") {
    return generated.map((symbol) => ({
      ...symbol,
      favorite: false,
      deleted: false,
      user_modified: false,
      updated_at: undefined,
    }));
  }

  const deleted = new Map(currentSaved.filter((symbol) => symbol.deleted).map((symbol) => [symbol.normalized_symbol, symbol]));
  const modified = new Map(currentSaved.filter((symbol) => symbol.user_modified && !symbol.deleted).map((symbol) => [symbol.normalized_symbol, symbol]));
  const favorites = new Map(currentSaved.filter((symbol) => symbol.favorite && !symbol.deleted).map((symbol) => [symbol.normalized_symbol, symbol]));
  const refreshed: SymbolDefinition[] = [];
  const seen = new Set<string>();

  for (const symbol of generated) {
    if (deleted.has(symbol.normalized_symbol) || modified.has(symbol.normalized_symbol)) continue;
    refreshed.push({
      ...symbol,
      favorite: favorites.has(symbol.normalized_symbol) || symbol.favorite,
    });
    seen.add(symbol.normalized_symbol);
  }

  for (const symbol of modified.values()) {
    refreshed.push(symbol);
    seen.add(symbol.normalized_symbol);
  }

  for (const symbol of favorites.values()) {
    if (!seen.has(symbol.normalized_symbol)) refreshed.push(symbol);
  }

  refreshed.push(...deleted.values());
  return refreshed;
}

export function applyAiSymbolCompletion(currentSaved: SymbolDefinition[], generated: SymbolDefinition[]) {
  const next = currentSaved.map((symbol) => ({ ...symbol }));
  const byKey = new Map(next.map((symbol) => [symbol.normalized_symbol, symbol]));
  for (const symbol of generated) {
    const existing = byKey.get(symbol.normalized_symbol);
    if (!existing) {
      next.push({
        ...symbol,
        source: "ai",
        favorite: false,
        deleted: false,
        user_modified: false,
        updated_at: undefined,
      });
      continue;
    }
    if (existing.deleted || existing.definition.trim()) continue;
    Object.assign(existing, {
      definition: symbol.definition,
      paragraph: symbol.paragraph || existing.paragraph,
      page_index: existing.page_index ?? symbol.page_index,
      rects_pct: existing.rects_pct?.length ? existing.rects_pct : symbol.rects_pct,
      confidence: Math.max(existing.confidence, symbol.confidence),
      updated_at: undefined,
    });
  }
  return next;
}

function parseJsonCandidate(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) return [];
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1].trim());
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("AI symbol response is not valid JSON.");
  }
}

function cleanAiConfidence(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.72;
  return Math.min(1, Math.max(0, number));
}

export function parseAiSymbolDefinitions(content: string): SymbolDefinition[] {
  const parsed = parseJsonCandidate(content);
  const rows: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).symbols)
      ? (parsed as Record<string, unknown>).symbols as unknown[]
      : [];
  const definitions: SymbolDefinition[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const symbol = String(record.symbol || "").trim();
    const definition = String(record.definition || "").trim();
    if (!symbol || !definition) continue;
    const pageNumber = Number(record.page_number);
    pushUnique(definitions, {
      symbol,
      normalized_symbol: normalizeSymbol(symbol),
      kind: record.kind === "abbreviation" ? "abbreviation" : "symbol",
      definition,
      source: "ai",
      page_index: Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber - 1 : undefined,
      paragraph: typeof record.paragraph === "string" ? cleanText(record.paragraph) : undefined,
      confidence: cleanAiConfidence(record.confidence),
    });
  }
  return definitions;
}

export function findSymbolDefinition(definitions: SymbolDefinition[], symbol: string) {
  const normalized = normalizeSymbol(symbol);
  return definitions.find((definition) => definition.normalized_symbol === normalized) || null;
}

export function isSymbolToken(value: string) {
  const token = value.trim();
  return /^[A-Za-z]$/.test(token) || /^[A-Z][A-Z0-9]{1,8}$/.test(token) || /^\\?[A-Za-z]+$/.test(token);
}
