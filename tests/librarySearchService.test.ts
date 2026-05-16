import { describe, expect, it } from "vitest";
import { searchLibrary } from "../electron/services/LibrarySearchService";

const now = "2026-05-16T00:00:00.000Z";
const doc = {
  document_id: "doc-1",
  title: "Verifier Paper",
  file_name: "verifier.pdf",
  file_path: "paper.pdf",
  file_size: 1,
  source_type: "readerp" as const,
  created_at: now,
  updated_at: now,
};

function store() {
  return {
    documents: [doc],
    notes: { "doc-1": { content: "A note about planning.", updated_at: now } },
    summaries: { "doc-1": { content: "Summary mentions calibration.", updated_at: now } },
    annotations: [{
      annotation_id: "ann-1",
      document_id: "doc-1",
      anchor_id: "anc-1",
      type: "highlight" as const,
      color: "#fff",
      page_index: 3,
      sort_index: "0",
      target: { rects_pct: [], text_quote: { exact: "Important verifier quote" } },
      comment: "tagged insight",
      tags: ["proof"],
      created_at: now,
      updated_at: now,
    }],
    dictionary: [{
      entry_id: "dict-1",
      term: "calibration",
      normalized_term: "calibration",
      definition: "Model reliability.",
      source_document_id: "doc-1",
      source_anchor_id: "anc-1",
      created_at: now,
      updated_at: now,
    }],
    symbols: {
      "doc-1": [{
        symbol: "V",
        normalized_symbol: "v",
        kind: "symbol" as const,
        definition: "Verifier score",
        source: "latex" as const,
        page_index: 2,
        confidence: 0.9,
      }],
    },
  };
}

describe("LibrarySearchService", () => {
  it("returns empty results for empty query", () => {
    expect(searchLibrary(store(), " ")).toEqual([]);
  });

  it("searches documents, notes, summaries, annotations, dictionary, and symbols", () => {
    expect(searchLibrary(store(), "verifier").map((item) => item.kind)).toEqual(expect.arrayContaining(["document", "annotation", "symbol"]));
    expect(searchLibrary(store(), "planning").map((item) => item.kind)).toContain("note");
    expect(searchLibrary(store(), "calibration").map((item) => item.kind)).toEqual(expect.arrayContaining(["summary", "dictionary"]));
    expect(searchLibrary(store(), "proof")[0]).toMatchObject({ kind: "annotation", anchor_id: "anc-1" });
  });

  it("ranks document matches before lower priority matches", () => {
    expect(searchLibrary(store(), "verifier")[0].kind).toBe("document");
  });
});
