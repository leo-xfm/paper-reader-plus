import { describe, expect, it } from "vitest";
import { filterReaderContextForAi } from "../src/services/AiContextFilterService";
import type { ReaderContextPayload } from "../src/types";

const context: ReaderContextPayload = {
  document: {
    document_id: "doc-1",
    title: "Paper",
    file_name: "paper.pdf",
    file_path: "paper.pdf",
    file_size: 1,
    source_type: "readerp",
    created_at: "",
    updated_at: "",
  },
  selection: { text: "selected", page_index: 0 },
  active_anchor: null,
  active_annotation: null,
  note: "private notes",
  summary: "private summary",
  evidences: [{
    evidence_id: "ann-1",
    document_id: "doc-1",
    anchor_id: "anc-1",
    page_index: 0,
    href: "/reader?documentId=doc-1&anchor=anc-1",
    quote: "quote",
  }],
  figure_attachments: [{
    figure_id: "fig-1",
    label: "Figure 1",
    caption: "caption",
    page_index: 0,
    rect_pct: { left: 0, top: 0, width: 1, height: 1 },
    data_url: "data:image/png;base64,AA==",
  }],
  summary_source: {
    mode: "pdf-extractor",
    label: "Loaded text",
    content: "loaded pdf text",
  },
};

describe("AiContextFilterService", () => {
  it("keeps current behavior by default", () => {
    expect(filterReaderContextForAi(context)).toEqual(context);
  });

  it("removes disabled context fields", () => {
    const filtered = filterReaderContextForAi(context, {
      ai_send_notes_context: false,
      ai_send_summary_context: false,
      ai_send_annotations_context: false,
      ai_send_loaded_pdf_text: false,
      ai_send_figure_attachments: false,
    });
    expect(filtered.note).toBe("");
    expect(filtered.summary).toBe("");
    expect(filtered.evidences).toEqual([]);
    expect(filtered.figure_attachments).toBeUndefined();
    expect(filtered.summary_source?.content).toContain("disabled");
  });
});
