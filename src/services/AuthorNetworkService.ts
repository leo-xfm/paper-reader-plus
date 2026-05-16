import type { PdfTextItem } from "@/pdf/pdfTypes";
import type { AuthorPaperRef, AuthorProfile } from "@/types";

export type AuthorDocumentInput = {
  document_id: string;
  title: string;
  pageTextItems: Record<number, PdfTextItem[]>;
};

const EMAIL_PATTERN = /@|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const AFFILIATION_PATTERN = /\b(university|institute|department|school|college|laboratory|lab|inc\.?|corp\.?|google|microsoft|meta|openai|deepmind|stanford|mit|berkeley|tsinghua|peking)\b/i;
const TITLE_NOISE_PATTERN = /\b(abstract|introduction|keywords|references|appendix|figure|table|proceedings|conference|workshop)\b/i;
const FOOTNOTE_MARKER_PATTERN = /(?:\d+|[*∗†‡,，\s])+/g;
const AUTHOR_NAME_PATTERN = /\b[\p{Lu}][\p{L}.'-]+\s+[\p{Lu}][\p{L}.'-]+(?:\s+[\p{Lu}][\p{L}.'-]+)?\b/gu;
const TITLE_SEPARATOR_PATTERN = /[:：]/;

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").replace(/[†*‡§¶]/g, "").trim();
}

export function normalizeAuthorName(value: string) {
  return cleanText(value)
    .replace(/\d+/g, "")
    .replace(/[^\p{L}\s.'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function looksLikeAuthorName(value: string) {
  const cleaned = cleanText(value);
  if (!cleaned || cleaned.length < 5 || cleaned.length > 64) return false;
  if (EMAIL_PATTERN.test(cleaned) || AFFILIATION_PATTERN.test(cleaned) || TITLE_NOISE_PATTERN.test(cleaned)) return false;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  return words.every((word) => /^[\p{Lu}][\p{L}.'-]*$/u.test(word) || /^[A-Z]\.$/.test(word));
}

function firstPageLines(items: PdfTextItem[]) {
  const sorted = items.slice().sort((left, right) => left.top - right.top || left.left - right.left);
  const lines: PdfTextItem[][] = [];
  for (const item of sorted) {
    if (!item.text.trim()) continue;
    const current = lines.at(-1);
    if (!current || Math.abs(current[0].top - item.top) > Math.max(5, item.height * 0.7)) {
      lines.push([item]);
    } else {
      current.push(item);
    }
  }
  return lines.map((line) => cleanText(line.sort((left, right) => left.left - right.left).map((item) => item.text).join(" ")));
}

function splitAuthorLine(line: string) {
  const normalized = line
    .replace(/([a-z])(\d|[*∗†‡])/gu, "$1 ")
    .replace(/(\d|[*∗†‡])+\s*(?=[\p{Lu}])/gu, ", ");
  const delimited = normalized
    .replace(/\band\b/g, ",")
    .split(/\s*,\s*|\s{2,}|;\s*/)
    .map((item) => cleanText(item.replace(FOOTNOTE_MARKER_PATTERN, " ").replace(/\([^)]*\)/g, "")))
    .filter(looksLikeAuthorName);
  if (delimited.length) return delimited;
  return [...normalized.matchAll(AUTHOR_NAME_PATTERN)].map((match) => cleanText(match[0])).filter(looksLikeAuthorName);
}

export function extractAuthorsFromFirstPage(items: PdfTextItem[]) {
  const lines = firstPageLines(items).slice(0, 14);
  const candidates: string[] = [];
  for (const line of lines) {
    if (line.length > 220 || TITLE_SEPARATOR_PATTERN.test(line) || AFFILIATION_PATTERN.test(line) || EMAIL_PATTERN.test(line)) continue;
    candidates.push(...splitAuthorLine(line));
  }
  const seen = new Set<string>();
  return candidates.filter((name) => {
    const normalized = normalizeAuthorName(name);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, 32);
}

export function buildAuthorNetwork(documents: AuthorDocumentInput[]): AuthorProfile[] {
  const authorsByDocument = documents.map((document) => ({
    document,
    authors: extractAuthorsFromFirstPage(document.pageTextItems[0] || []),
  })).filter((item) => item.authors.length);

  const papersByAuthor = new Map<string, { name: string; papers: AuthorPaperRef[] }>();
  const coauthorsByAuthor = new Map<string, Map<string, { name: string; papers: AuthorPaperRef[] }>>();

  for (const { document, authors } of authorsByDocument) {
    const paper = { document_id: document.document_id, title: document.title };
    for (const author of authors) {
      const normalized = normalizeAuthorName(author);
      const current = papersByAuthor.get(normalized) || { name: author, papers: [] };
      if (!current.papers.some((item) => item.document_id === paper.document_id)) current.papers.push(paper);
      papersByAuthor.set(normalized, current);
      const edges = coauthorsByAuthor.get(normalized) || new Map<string, { name: string; papers: AuthorPaperRef[] }>();
      for (const coauthor of authors) {
        const coNormalized = normalizeAuthorName(coauthor);
        if (coNormalized === normalized) continue;
        const edge = edges.get(coNormalized) || { name: coauthor, papers: [] };
        if (!edge.papers.some((item) => item.document_id === paper.document_id)) edge.papers.push(paper);
        edges.set(coNormalized, edge);
      }
      coauthorsByAuthor.set(normalized, edges);
    }
  }

  return [...papersByAuthor.entries()].map(([normalized, item]) => ({
    name: item.name,
    normalized_name: normalized,
    papers: item.papers,
    local_paper_count: item.papers.length,
    coauthors: [...(coauthorsByAuthor.get(normalized)?.entries() || [])]
      .map(([coNormalized, edge]) => ({
        name: edge.name,
        normalized_name: coNormalized,
        count: edge.papers.length,
        papers: edge.papers,
      }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
  })).sort((left, right) => right.local_paper_count - left.local_paper_count || left.name.localeCompare(right.name));
}

export function findAuthorProfile(profiles: AuthorProfile[], text: string) {
  const normalized = normalizeAuthorName(text);
  return profiles.find((profile) => profile.normalized_name === normalized) || null;
}
