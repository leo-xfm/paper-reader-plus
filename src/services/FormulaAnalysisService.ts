import type { PdfTextItem } from "@/pdf/pdfTypes";
import { buildPdfTextBlocks, type PdfTextBlock } from "@/services/PdfParagraphActionService";
import { renderSimpleLatexToMarkdown } from "@/services/SymbolTrackerService";
import type { FormulaAnalysis, RectPct } from "@/types";

export type FormulaExtractionProgress = {
  status: string;
  percent?: number;
};

export type FormulaCandidate = {
  candidate_id: string;
  document_id: string;
  source: "pdf" | "latex";
  raw_text: string;
  latex: string;
  context: string;
  page_index?: number;
  rects_pct?: RectPct[];
  latex_line?: number;
  source_label: string;
};

const DISPLAY_MATH_ENVIRONMENTS = [
  "equation",
  "align",
  "gather",
  "multline",
  "displaymath",
  "eqnarray",
  "flalign",
  "alignat",
];

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function rectKey(rects: RectPct[] = []) {
  return rects
    .map((rect) => [rect.left, rect.top, rect.width, rect.height].map((value) => Math.round(value * 10000)).join(","))
    .join(";");
}

export function formulaIdForCandidate(documentId: string, candidate: Pick<FormulaCandidate, "candidate_id">) {
  return `${documentId}:formula:${candidate.candidate_id}`;
}

function contextAroundBlocks(blocks: PdfTextBlock[], index: number) {
  const previous = blocks.slice(Math.max(0, index - 2), index).map((block) => block.text);
  const next = blocks.slice(index + 1, index + 3).map((block) => block.text);
  return cleanText([...previous, blocks[index]?.text || "", ...next].join("\n"));
}

export function pdfBlockToFormulaCandidate(documentId: string, block: PdfTextBlock, blocks: PdfTextBlock[] = [block], index = 0): FormulaCandidate {
  const rawText = cleanText(block.text);
  const idBase = `pdf:${block.page_index + 1}:${hashString(`${rawText}:${rectKey(block.rects_pct)}`)}`;
  return {
    candidate_id: idBase,
    document_id: documentId,
    source: "pdf",
    raw_text: rawText,
    latex: "",
    context: contextAroundBlocks(blocks, index).slice(0, 1800),
    page_index: block.page_index,
    rects_pct: block.rects_pct,
    source_label: `PDF page ${block.page_index + 1}`,
  };
}

export function extractFormulaCandidatesFromPdfPages(documentId: string, pages: Record<number, PdfTextItem[]>): FormulaCandidate[] {
  const candidates: FormulaCandidate[] = [];
  for (const [page, items] of Object.entries(pages).sort(([left], [right]) => Number(left) - Number(right))) {
    const pageIndex = Number(page);
    if (!Number.isFinite(pageIndex) || !items.length) continue;
    const blocks = buildPdfTextBlocks(pageIndex, items, {
      minTextLength: 1,
      paragraphGapMultiplier: 1.65,
    });
    blocks.forEach((block, index) => {
      if (block.kind !== "formula") return;
      candidates.push(pdfBlockToFormulaCandidate(documentId, block, blocks, index));
    });
  }
  return dedupeCandidates(candidates).slice(0, 160);
}

export function extractPdfFullTextFormulaCandidates(documentId: string, pages: Record<number, PdfTextItem[]>): FormulaCandidate[] {
  const candidates: FormulaCandidate[] = [];
  for (const [page, items] of Object.entries(pages).sort(([left], [right]) => Number(left) - Number(right))) {
    const pageIndex = Number(page);
    if (!Number.isFinite(pageIndex) || !items.length) continue;
    const blocks = buildPdfTextBlocks(pageIndex, items, {
      minTextLength: 1,
      paragraphGapMultiplier: 1.65,
    });
    blocks.forEach((block, index) => {
      const rawText = cleanText(block.text);
      if (!rawText) return;
      candidates.push({
        candidate_id: `pdf-text:${pageIndex + 1}:${index + 1}:${hashString(`${block.kind}:${rawText}:${rectKey(block.rects_pct)}`)}`,
        document_id: documentId,
        source: "pdf",
        raw_text: rawText,
        latex: "",
        context: contextAroundBlocks(blocks, index).slice(0, 2400),
        page_index: pageIndex,
        rects_pct: block.rects_pct,
        source_label: `PDF page ${pageIndex + 1}, block ${index + 1} (${block.kind})`,
      });
    });
  }
  return candidates;
}

function stripLatexComments(source: string) {
  return source.replace(/(^|[^\\])%.*$/gm, "$1");
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

function contextAroundIndex(source: string, start: number, end: number) {
  const beforeStart = Math.max(0, start - 900);
  const afterEnd = Math.min(source.length, end + 900);
  return renderSimpleLatexToMarkdown(source.slice(beforeStart, afterEnd)).slice(0, 2400);
}

function pushLatexCandidate(
  candidates: FormulaCandidate[],
  documentId: string,
  source: string,
  starts: number[],
  start: number,
  end: number,
  body: string,
  label: string,
) {
  const latex = body.trim();
  if (!latex || latex.length < 3) return;
  const latexLine = lineNumberFromStarts(starts, start);
  const candidateId = `latex:${latexLine}:${hashString(`${label}:${latex}`)}`;
  candidates.push({
    candidate_id: candidateId,
    document_id: documentId,
    source: "latex",
    raw_text: latex,
    latex,
    context: contextAroundIndex(source, start, end),
    latex_line: latexLine,
    source_label: `LaTeX line ${latexLine}`,
  });
}

export function extractFormulaCandidatesFromLatex(documentId: string, latexSource: string): FormulaCandidate[] {
  const source = stripLatexComments(latexSource);
  const starts = lineStarts(source);
  const candidates: FormulaCandidate[] = [];
  const envPattern = new RegExp(`\\\\begin\\{(${DISPLAY_MATH_ENVIRONMENTS.join("|")})\\*?\\}([\\s\\S]*?)\\\\end\\{\\1\\*?\\}`, "g");
  for (const match of source.matchAll(envPattern)) {
    pushLatexCandidate(candidates, documentId, source, starts, match.index || 0, (match.index || 0) + match[0].length, match[2] || "", match[1] || "display");
  }
  for (const match of source.matchAll(/\\\[([\s\S]*?)\\\]/g)) {
    pushLatexCandidate(candidates, documentId, source, starts, match.index || 0, (match.index || 0) + match[0].length, match[1] || "", "bracket");
  }
  for (const match of source.matchAll(/\$\$([\s\S]*?)\$\$/g)) {
    pushLatexCandidate(candidates, documentId, source, starts, match.index || 0, (match.index || 0) + match[0].length, match[1] || "", "dollar");
  }
  return dedupeCandidates(candidates).slice(0, 160);
}

function dedupeCandidates(candidates: FormulaCandidate[]) {
  const seen = new Set<string>();
  const result: FormulaCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.source}:${candidate.page_index ?? candidate.latex_line ?? ""}:${cleanText(candidate.latex || candidate.raw_text).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function truncateField(value: string, limit: number) {
  if (limit <= 0 || value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 32))}\n[truncated]`;
}

export function formatFormulaCandidatesForAi(candidates: FormulaCandidate[], options: {
  maxChars?: number;
  maxCandidates?: number;
  maxRawTextChars?: number;
  maxContextChars?: number;
} = {}) {
  const maxChars = Math.max(10000, Math.trunc(options.maxChars ?? 90000));
  const maxCandidates = Math.max(20, Math.trunc(options.maxCandidates ?? 180));
  const maxRawTextChars = Math.max(300, Math.trunc(options.maxRawTextChars ?? 1800));
  const maxContextChars = Math.max(0, Math.trunc(options.maxContextChars ?? 900));
  const rows: Array<Record<string, unknown>> = [];
  for (const candidate of candidates.slice(0, maxCandidates)) {
    const row = {
      index: rows.length + 1,
      candidate_id: candidate.candidate_id,
      source: candidate.source,
      source_label: candidate.source_label,
      latex: truncateField(candidate.latex, maxRawTextChars),
      raw_text: truncateField(candidate.raw_text, maxRawTextChars),
      context: truncateField(candidate.context, maxContextChars),
    };
    const next = JSON.stringify([...rows, row], null, 2);
    if (next.length > maxChars && rows.length) break;
    rows.push(row);
    if (next.length > maxChars) break;
  }
  const omitted = Math.max(0, candidates.length - rows.length);
  const payload = omitted
    ? { omitted_candidate_count: omitted, candidates: rows }
    : { candidates: rows };
  return JSON.stringify(payload, null, 2).slice(0, maxChars);
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
    throw new Error("AI formula response is not valid JSON.");
  }
}

function cleanScore(value: unknown, fallback: number) {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.min(1, Math.max(0, score));
}

function formulaIdForAiRow(documentId: string, candidate: FormulaCandidate, record: Record<string, unknown>, duplicateCandidate: boolean) {
  const explicit = String(record.formula_id || "").trim();
  if (explicit) return explicit.startsWith(`${documentId}:formula:`) ? explicit : `${documentId}:formula:${explicit}`;
  if (!duplicateCandidate) return formulaIdForCandidate(documentId, candidate);
  const latex = String(record.latex || record.raw_text || record.formula_text || candidate.latex || candidate.raw_text || "").trim();
  return `${formulaIdForCandidate(documentId, candidate)}:${hashString(latex || String(record.analysis || ""))}`;
}

export function parseAiFormulaAnalyses(
  content: string,
  documentId: string,
  candidates: FormulaCandidate[],
  existing: FormulaAnalysis[] = [],
): FormulaAnalysis[] {
  const parsed = parseJsonCandidate(content);
  const rows: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).formulas)
      ? (parsed as Record<string, unknown>).formulas as unknown[]
      : [];
  const candidateById = new Map(candidates.map((candidate) => [candidate.candidate_id, candidate]));
  const rowCandidateCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const candidateId = String((row as Record<string, unknown>).candidate_id || "").trim();
    if (candidateId) rowCandidateCounts.set(candidateId, (rowCandidateCounts.get(candidateId) || 0) + 1);
  }
  const existingById = new Map(existing.map((formula) => [formula.formula_id, formula]));
  const now = new Date().toISOString();
  const analyses: FormulaAnalysis[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const candidateId = String(record.candidate_id || "").trim();
    const candidate = candidateById.get(candidateId);
    if (!candidate) continue;
    const analysis = String(record.analysis || "").trim();
    const latex = String(record.latex || candidate.latex || candidate.raw_text || "").trim();
    const rawText = String(record.raw_text || record.formula_text || candidate.raw_text || latex).trim();
    if (!analysis || !latex) continue;
    const formulaId = formulaIdForAiRow(documentId, candidate, record, (rowCandidateCounts.get(candidateId) || 0) > 1);
    const previous = existingById.get(formulaId);
    analyses.push({
      formula_id: formulaId,
      document_id: documentId,
      latex,
      raw_text: rawText,
      analysis,
      source: candidate.source,
      page_index: candidate.page_index,
      rects_pct: candidate.rects_pct,
      context: candidate.context,
      importance_score: cleanScore(record.importance_score, previous?.importance_score ?? 0.8),
      status: "parsed",
      confidence: cleanScore(record.confidence, previous?.confidence ?? 0.72),
      request_id: typeof record.request_id === "string" ? record.request_id : previous?.request_id,
      latex_line: candidate.latex_line,
      created_at: previous?.created_at || now,
      updated_at: now,
    });
  }
  return analyses.sort((left, right) =>
    right.importance_score - left.importance_score
    || (left.page_index ?? left.latex_line ?? 0) - (right.page_index ?? right.latex_line ?? 0)
  ).slice(0, 40);
}

export function mergeFormulaAnalyses(existing: FormulaAnalysis[], generated: FormulaAnalysis[]) {
  const generatedIds = new Set(generated.map((formula) => formula.formula_id));
  const stale = existing.filter((formula) => formula.status === "parsed" && !generatedIds.has(formula.formula_id));
  return [...generated, ...stale].sort((left, right) =>
    right.importance_score - left.importance_score
    || (left.page_index ?? left.latex_line ?? 0) - (right.page_index ?? right.latex_line ?? 0)
  );
}

export function buildPendingFormulaFromCandidate(documentId: string, candidate: FormulaCandidate, patch: Partial<FormulaAnalysis> = {}): FormulaAnalysis {
  const now = new Date().toISOString();
  return {
    formula_id: formulaIdForCandidate(documentId, candidate),
    document_id: documentId,
    latex: candidate.latex,
    raw_text: candidate.raw_text,
    analysis: "",
    source: candidate.source,
    page_index: candidate.page_index,
    rects_pct: candidate.rects_pct,
    context: candidate.context,
    importance_score: 0,
    status: "pending",
    latex_line: candidate.latex_line,
    confidence: 0,
    created_at: now,
    updated_at: now,
    ...patch,
  };
}
