import { describe, expect, it } from "vitest";
import { buildAskSelectionMessages, buildChatMessages, buildMetaphorSelectionMessages, buildSummaryMessages, buildTranslateSelectionMessages } from "@/services/ReaderAiService";
import type { ReaderContextPayload } from "@/types";

const basePayload: ReaderContextPayload = {
  document: {
    document_id: "doc-1",
    title: "Paper",
    file_name: "paper.pdf",
    file_path: "paper.pdf",
    file_size: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  selection: null,
  active_anchor: null,
  active_annotation: null,
  note: "",
  summary: "",
  evidences: [],
};

describe("ReaderAiService", () => {
  it("requires Needs verification when no evidence is available", () => {
    const content = buildSummaryMessages(basePayload)[0].content;
    expect(content).toContain("Needs verification");
    expect(content).toContain("No reader evidence is available");
  });

  it("renders configurable summary templates", () => {
    const payload: ReaderContextPayload = {
      ...basePayload,
      note: "reader note",
      summary_source: {
        mode: "latex",
        label: "LaTeX source: paper.tex",
        content: "\\section{Method} quoted evidence",
      },
      evidences: [{
        evidence_id: "ann-1",
        document_id: "doc-1",
        anchor_id: "anc-1",
        page_index: 0,
        href: "/reader?documentId=doc-1&anchor=anc-1&page=1",
        quote: "quoted evidence",
      }],
    };
    const content = buildSummaryMessages(payload, "Title={{document_title}}\nSource={{summary_source_label}}/{{summary_source_mode}}\nNotes={{notes}}\nEvidence={{evidence_list}}\nText={{loaded_text_context}}")[0].content;
    expect(content).toContain("Title=Paper");
    expect(content).toContain("Source=LaTeX source: paper.tex/latex");
    expect(content).toContain("Notes=reader note");
    expect(content).toContain("/reader?documentId=doc-1&anchor=anc-1&page=1");
    expect(content).toContain("\\section{Method} quoted evidence");
  });

  it("includes reader evidence links in chat prompts", () => {
    const payload: ReaderContextPayload = {
      ...basePayload,
      evidences: [{
        evidence_id: "ann-1",
        document_id: "doc-1",
        anchor_id: "anc-1",
        page_index: 2,
        href: "/reader?documentId=doc-1&anchor=anc-1&page=3",
        quote: "evidence quote",
      }],
    };
    const content = buildChatMessages(payload, "What is the method?")[0].content;
    expect(content).toContain("/reader?documentId=doc-1&anchor=anc-1&page=3");
    expect(content).toContain("Evidence: [p. 3]");
  });

  it("includes selection source links when asking about selected text", () => {
    const payload: ReaderContextPayload = {
      ...basePayload,
      selection: {
        text: "selected claim",
        page_index: 1,
        anchor: {
          anchor_id: "anc-2",
          document_id: "doc-1",
          page_index: 1,
          rects_pct: [],
          text_quote: { exact: "selected claim" },
          created_from: "ai",
          metadata: {},
          created_at: "2026-01-01T00:00:00.000Z",
        },
      },
    };
    const content = buildAskSelectionMessages(payload)[0].content;
    expect(content).toContain("selected claim");
    expect(content).toContain("/reader?documentId=doc-1&anchor=anc-2&page=2");
  });

  it("builds translation prompts with target language and source evidence", () => {
    const payload: ReaderContextPayload = {
      ...basePayload,
      selection: {
        text: "The model minimizes $L_2$ error.",
        page_index: 3,
        anchor: {
          anchor_id: "anc-translate",
          document_id: "doc-1",
          page_index: 3,
          rects_pct: [],
          text_quote: { exact: "The model minimizes $L_2$ error." },
          created_from: "ai",
          metadata: {},
          created_at: "2026-01-01T00:00:00.000Z",
        },
      },
    };
    const content = buildTranslateSelectionMessages(payload, "Chinese")[0].content;
    expect(content).toContain("Translate the selected text into Chinese");
    expect(content).toContain("Preserve formulas");
    expect(content).toContain("/reader?documentId=doc-1&anchor=anc-translate&page=4");
    expect(content).toContain("The model minimizes $L_2$ error.");
  });

  it("builds beginner-friendly metaphor prompts for selected mechanisms", () => {
    const payload: ReaderContextPayload = {
      ...basePayload,
      selection: {
        text: "Attention computes a weighted sum over value vectors based on query-key similarity.",
        page_index: 0,
        anchor: {
          anchor_id: "anc-metaphor",
          document_id: "doc-1",
          page_index: 0,
          rects_pct: [],
          text_quote: { exact: "Attention computes a weighted sum over value vectors based on query-key similarity." },
          created_from: "ai",
          metadata: {},
          created_at: "2026-01-01T00:00:00.000Z",
        },
      },
    };
    const content = buildMetaphorSelectionMessages(payload)[0].content;
    expect(content).toContain("science communicator");
    expect(content).toContain("real-life metaphors");
    expect(content).toContain("Mapping");
    expect(content).toContain("/reader?documentId=doc-1&anchor=anc-metaphor&page=1");
  });
});
