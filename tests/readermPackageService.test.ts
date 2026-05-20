import { describe, expect, it } from "vitest";
import {
  createReadermPackageBuffer,
  extractReadermReferenceLinks,
  readReadermPackageBuffer,
  resolveReadermReferences,
} from "../electron/services/ReadermPackageService";

describe("ReadermPackageService", () => {
  it("extracts and deduplicates reader links with markdown ranges", () => {
    const markdown = [
      "See [p. 2](/reader?documentId=doc-1&anchor=anc-1&page=2).",
      "Again [same](/reader?documentId=doc-1&anchor=anc-1&page=2).",
      "And /reader?documentId=doc-2&anchor=anc-2",
    ].join("\n");
    const references = extractReadermReferenceLinks(markdown);
    expect(references.map((reference) => `${reference.document_id}:${reference.anchor_id}`)).toEqual([
      "doc-1:anc-1",
      "doc-2:anc-2",
    ]);
    expect(markdown.slice(references[0].markdown_start, references[0].markdown_end)).toContain("anc-1");
  });

  it("extracts reader links around image markdown", () => {
    const markdown = "[![page-5](assets/page-5.png)](/reader?documentId=doc-1&anchor=anc-1&page=5)";
    const references = extractReadermReferenceLinks(markdown);
    expect(references).toHaveLength(1);
    expect(references[0]).toMatchObject({
      document_id: "doc-1",
      anchor_id: "anc-1",
      label: "page-5",
    });
    expect(markdown.slice(references[0].markdown_start, references[0].markdown_end)).toBe(markdown);
  });

  it("keeps markdown ranges stable for ordinary, bare, and image reader anchors", () => {
    const markdown = [
      "Evidence: [p. 1](/reader?documentId=doc-1&anchor=anc-1&page=1)",
      "Bare /reader?documentId=doc-2&anchor=anc-2",
      "[![page](assets/page.png)](/reader?documentId=doc-3&anchor=anc-3&page=3)",
    ].join("\n");
    const references = extractReadermReferenceLinks(markdown);
    expect(references.map((reference) => `${reference.document_id}:${reference.anchor_id}`)).toEqual([
      "doc-1:anc-1",
      "doc-2:anc-2",
      "doc-3:anc-3",
    ]);
    expect(markdown.slice(references[2].markdown_start, references[2].markdown_end)).toBe("[![page](assets/page.png)](/reader?documentId=doc-3&anchor=anc-3&page=3)");
  });

  it("resolves missing documents and anchors explicitly", () => {
    const references = resolveReadermReferences(
      [
        "[ok](/reader?documentId=doc-1&anchor=anc-1)",
        "[missing anchor](/reader?documentId=doc-1&anchor=anc-x)",
        "[missing doc](/reader?documentId=doc-x&anchor=anc-y)",
      ].join("\n"),
      [{ document_id: "doc-1" }],
      [{
        document_id: "doc-1",
        anchor_id: "anc-1",
        page_index: 4,
        page_label: "5",
        rects_pct: [{ left: 1, top: 2, width: 3, height: 4 }],
        text_quote: { exact: "quote" },
      }],
    );
    expect(references.map((reference) => reference.status)).toEqual(["resolved", "missing-anchor", "missing-document"]);
    expect(references[0]).toMatchObject({ page_index: 4, text_quote: { exact: "quote" } });
  });

  it("round-trips markdown, references, referenced PDFs, anchors, and assets", async () => {
    const markdown = "# Survey\n\nEvidence: [p. 3](/reader?documentId=doc-2&anchor=anc-2&page=3)\n\n![plot](assets/plot.png)";
    const references = resolveReadermReferences(
      markdown,
      [{ document_id: "readerm-1" }, { document_id: "doc-2" }],
      [{ document_id: "doc-2", anchor_id: "anc-2", page_index: 2, rects_pct: [{ left: 10, top: 20, width: 30, height: 4 }], text_quote: { exact: "important" } }],
    );
    const buffer = await createReadermPackageBuffer({
      document: {
        document_id: "readerm-1",
        title: "Survey",
        file_name: "survey.readerm",
        file_size: markdown.length,
        source_type: "readerm",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      markdown,
      references,
      documents: [
        {
          document_id: "readerm-1",
          title: "Survey",
          file_name: "survey.readerm",
          file_size: markdown.length,
          source_type: "readerm",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        {
          document_id: "doc-2",
          title: "Paper 2",
          file_name: "paper2.pdf",
          file_size: 4,
          source_type: "pdf",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        {
          document_id: "doc-3",
          title: "Unreferenced",
          file_name: "paper3.pdf",
          file_size: 4,
          source_type: "pdf",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      anchors: [
        { document_id: "doc-2", anchor_id: "anc-2" },
        { document_id: "doc-3", anchor_id: "anc-3" },
      ],
      annotations: [{ document_id: "doc-2", annotation_id: "ann-2" }],
      pdfDataByDocumentId: {
        "doc-2": Buffer.from("%PDF-2"),
        "doc-3": Buffer.from("%PDF-3"),
      },
      assets: [{
        asset_id: "asset-1",
        document_id: "readerm-1",
        file_name: "plot.png",
        mime_type: "image/png",
        data: Buffer.from("PNG"),
      }],
    });

    const parsed = await readReadermPackageBuffer(buffer);
    expect(parsed.manifest.format).toBe("paper-reader-plus.readerm");
    expect(parsed.markdown).toBe(markdown);
    expect(parsed.references).toHaveLength(1);
    expect(parsed.documents.map((document) => document.document_id)).toEqual(["readerm-1", "doc-2"]);
    expect(parsed.anchors).toEqual([{ document_id: "doc-2", anchor_id: "anc-2" }]);
    expect(parsed.annotations).toEqual([{ document_id: "doc-2", annotation_id: "ann-2" }]);
    expect(parsed.pdfDataByDocumentId["doc-2"].toString()).toBe("%PDF-2");
    expect(parsed.pdfDataByDocumentId["doc-3"]).toBeUndefined();
    expect(parsed.assets[0].data.toString()).toBe("PNG");
  });
});
