import type { DbDocument, DictionaryEntry, StoredData, StoredSymbolDefinition } from "../ipc/storeContext.js";
import type { StoredAnnotation } from "../storeMigration.js";

export type LibrarySearchResultKind =
  | "document"
  | "note"
  | "summary"
  | "annotation"
  | "dictionary"
  | "symbol";

export type LibrarySearchResult = {
  result_id: string;
  document_id: string;
  source_type?: DbDocument["source_type"];
  kind: LibrarySearchResultKind;
  title: string;
  snippet: string;
  page_index?: number;
  anchor_id?: string;
  score: number;
};

type SearchStore = Pick<StoredData, "documents" | "notes" | "summaries" | "annotations" | "dictionary" | "symbols">;

const KIND_SCORE: Record<LibrarySearchResultKind, number> = {
  document: 100,
  annotation: 70,
  note: 60,
  summary: 55,
  dictionary: 35,
  symbol: 30,
};

function normalize(value: string) {
  return value.toLowerCase();
}

function includes(text: string, query: string) {
  return normalize(text).includes(query);
}

function snippet(text: string, rawQuery: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 180) return clean;
  const index = normalize(clean).indexOf(normalize(rawQuery));
  const start = Math.max(0, index === -1 ? 0 : index - 60);
  return `${start > 0 ? "..." : ""}${clean.slice(start, start + 180)}...`;
}

function result(
  document: DbDocument,
  kind: LibrarySearchResultKind,
  id: string,
  text: string,
  query: string,
  extra: Partial<Pick<LibrarySearchResult, "page_index" | "anchor_id" | "score">> = {},
): LibrarySearchResult {
  const exactTitle = includes(document.title, normalize(query)) ? 20 : 0;
  return {
    result_id: `${kind}:${id}`,
    document_id: document.document_id,
    source_type: document.source_type,
    kind,
    title: document.title || document.file_name,
    snippet: snippet(text, query),
    score: (extra.score || KIND_SCORE[kind]) + exactTitle,
    page_index: extra.page_index,
    anchor_id: extra.anchor_id,
  };
}

function documentMap(documents: DbDocument[]) {
  return new Map(documents.map((document) => [document.document_id, document]));
}

export function searchLibrary(store: SearchStore, rawQuery: string): LibrarySearchResult[] {
  const query = normalize(String(rawQuery || "").trim());
  if (!query) return [];
  const byId = documentMap(store.documents);
  const results: LibrarySearchResult[] = [];

  for (const document of store.documents) {
    const text = `${document.title}\n${document.file_name}`;
    if (includes(text, query)) {
      results.push(result(document, "document", document.document_id, text, rawQuery, { score: KIND_SCORE.document }));
    }
  }

  for (const [documentId, note] of Object.entries(store.notes)) {
    const document = byId.get(documentId);
    if (document && includes(note.content || "", query)) {
      results.push(result(document, "note", documentId, note.content, rawQuery));
    }
  }

  for (const [documentId, summary] of Object.entries(store.summaries)) {
    const document = byId.get(documentId);
    if (document && includes(summary.content || "", query)) {
      results.push(result(document, "summary", documentId, summary.content, rawQuery));
    }
  }

  for (const annotation of store.annotations as StoredAnnotation[]) {
    const document = byId.get(annotation.document_id);
    const text = [
      annotation.target.text_quote?.exact || "",
      annotation.comment,
      annotation.tags.join(", "),
    ].join("\n");
    if (document && includes(text, query)) {
      results.push(result(document, "annotation", annotation.annotation_id, text, rawQuery, {
        page_index: annotation.page_index,
        anchor_id: annotation.anchor_id,
      }));
    }
  }

  for (const entry of store.dictionary as DictionaryEntry[]) {
    if (!entry.source_document_id) continue;
    const document = byId.get(entry.source_document_id);
    const text = `${entry.term}\n${entry.definition}`;
    if (document && includes(text, query)) {
      results.push(result(document, "dictionary", entry.entry_id, text, rawQuery, {
        anchor_id: entry.source_anchor_id,
      }));
    }
  }

  for (const [documentId, symbols] of Object.entries(store.symbols)) {
    const document = byId.get(documentId);
    if (!document) continue;
    for (const symbol of symbols as StoredSymbolDefinition[]) {
      const text = [symbol.symbol, symbol.definition, symbol.paragraph || ""].join("\n");
      if (symbol.deleted || !includes(text, query)) continue;
      results.push(result(document, "symbol", `${documentId}:${symbol.normalized_symbol}`, text, rawQuery, {
        page_index: symbol.page_index,
      }));
    }
  }

  return results
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, 80);
}
