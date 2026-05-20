import { describe, expect, it } from "vitest";
import {
  DEFAULT_COPY_QUOTE_TEMPLATE,
  DEFAULT_QUOTE_TO_NOTE_TEMPLATE,
  DEFAULT_QUOTE_TO_READERM_TEMPLATE,
  buildTemplatedMarkdownQuote,
} from "@/services/QuoteTemplateService";
import type { Anchor } from "@/types";

const anchor: Anchor = {
  anchor_id: "anc-1",
  document_id: "doc-1",
  page_index: 2,
  page_label: "iii",
  rects_pct: [],
  text_quote: { exact: "Paragraph text" },
  created_from: "selection",
  metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
};

describe("QuoteTemplateService", () => {
  it("keeps the default quote format compatible with existing markdown quotes", () => {
    expect(buildTemplatedMarkdownQuote({ anchor, template: DEFAULT_COPY_QUOTE_TEMPLATE })).toBe(
      "> Paragraph text\n\nSource: [p. 3](/reader?documentId=doc-1&anchor=anc-1&page=3)",
    );
  });

  it("renders the default quote-to-note format as a page anchor only", () => {
    expect(buildTemplatedMarkdownQuote({ anchor, template: DEFAULT_QUOTE_TO_NOTE_TEMPLATE })).toBe(
      "[p. 3](/reader?documentId=doc-1&anchor=anc-1&page=3)",
    );
  });

  it("renders the default quote-to-readerm format as a title and page anchor", () => {
    expect(buildTemplatedMarkdownQuote({
      anchor,
      document: { title: "Paper Title" },
      template: DEFAULT_QUOTE_TO_READERM_TEMPLATE,
    })).toBe("[Paper Title, p.3](/reader?documentId=doc-1&anchor=anc-1&page=3)");
  });

  it("renders passage, page marker, and paragraph content in custom templates", () => {
    const quote = buildTemplatedMarkdownQuote({
      anchor,
      document: { title: "Paper Title" },
      text: "Selected paragraph",
      template: "{{ passage_name }} {{ page_marker }}\n{{ paragraph_content }}",
    });

    expect(quote).toBe("Paper Title [p. 3](/reader?documentId=doc-1&anchor=anc-1&page=3)\nSelected paragraph");
  });
});
