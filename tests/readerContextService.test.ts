import { describe, expect, it } from "vitest";
import { buildReaderContextPayload, buildReaderEvidence, collectReaderEvidences } from "@/services/ReaderContextService";
import type { Anchor, Annotation, LibraryDocument } from "@/types";

const document: LibraryDocument = {
  document_id: "doc-1",
  title: "Paper",
  file_name: "paper.pdf",
  file_path: "paper.pdf",
  file_size: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const anchor: Anchor = {
  anchor_id: "anc-1",
  document_id: "doc-1",
  page_index: 4,
  rects_pct: [{ left: 0.1, top: 0.2, width: 0.3, height: 0.04 }],
  text_quote: { exact: "anchor quote" },
  created_from: "selection",
  metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
};

const annotation: Annotation = {
  annotation_id: "ann-1",
  document_id: "doc-1",
  anchor_id: "anc-1",
  type: "highlight",
  color: "#FDE68A",
  page_index: 4,
  sort_index: "000004:a",
  target: { rects_pct: anchor.rects_pct, text_quote: { exact: "annotation quote" } },
  comment: "important",
  tags: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("ReaderContextService", () => {
  it("builds evidence links from anchors and annotations", () => {
    expect(buildReaderEvidence(anchor, annotation)).toMatchObject({
      evidence_id: "ann-1",
      href: "/reader?documentId=doc-1&anchor=anc-1&page=5",
      quote: "annotation quote",
      annotation_type: "highlight",
      comment: "important",
    });
  });

  it("collects context evidences with annotations first", () => {
    const evidences = collectReaderEvidences({ anchors: [anchor], annotations: [annotation] });
    expect(evidences).toHaveLength(1);
    expect(evidences[0].annotation_id).toBe("ann-1");
  });

  it("builds typed reader context payloads", () => {
    const externalAnchor: Anchor = {
      ...anchor,
      anchor_id: "external-anchor",
      document_id: "doc-2",
      text_quote: { exact: "external quote" },
    };
    const payload = buildReaderContextPayload({
      document,
      context: { anchors: [anchor, externalAnchor], annotations: [annotation] },
      note: "note",
      summary: "summary",
      activeAnchor: anchor,
      activeAnnotation: annotation,
    });
    expect(payload.document.title).toBe("Paper");
    expect(payload.evidences[0].href).toContain("/reader?documentId=doc-1&anchor=anc-1");
    expect(payload.evidences.some((evidence) => evidence.document_id === "doc-2")).toBe(false);
  });
});
