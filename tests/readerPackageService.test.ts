import { describe, expect, it } from "vitest";
import { createReaderPackageBuffer, extractAssetPathsFromMarkdown, readReaderPackageBuffer } from "../electron/ReaderPackageService";

describe("ReaderPackageService", () => {
  it("round-trips a pdf markdown reader package", async () => {
    const buffer = await createReaderPackageBuffer({
      document: {
        document_id: "doc-1",
        title: "Paper",
        file_name: "paper.pdf",
        file_size: 4,
        source_type: "pdf",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      note: "# Notes",
      summary: "Summary",
      aiHistory: [{ role: "assistant", content: "Evidence: Needs verification" }],
      anchors: [{ anchor_id: "a1" }],
      annotations: [{ annotation_id: "n1" }],
      symbols: [{ symbol: "x", normalized_symbol: "x", kind: "symbol", definition: "$x$ is state.", source: "latex", confidence: 0.9, favorite: true }],
      formulas: [{ formula_id: "f1", document_id: "doc-1", latex: "x+y", raw_text: "x+y", analysis: "Adds values.", source: "latex", importance_score: 0.9, status: "parsed", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" }],
      pdfData: Buffer.from("%PDF"),
    });

    const parsed = await readReaderPackageBuffer(buffer);
    expect(parsed.manifest.document_kind).toBe("pdf-markdown");
    expect(parsed.note).toBe("# Notes");
    expect(parsed.summary).toBe("Summary");
    expect(parsed.aiHistory).toHaveLength(1);
    expect(parsed.symbols?.[0]).toMatchObject({ symbol: "x", normalized_symbol: "x", favorite: true });
    expect(parsed.formulas?.[0]).toMatchObject({ formula_id: "f1", latex: "x+y", analysis: "Adds values." });
    expect(parsed.pdfData?.toString()).toBe("%PDF");
  });

  it("exports only anchors and annotations belonging to the package document", async () => {
    const buffer = await createReaderPackageBuffer({
      document: {
        document_id: "doc-1",
        title: "Paper",
        file_name: "paper.pdf",
        file_size: 4,
        source_type: "pdf",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      note: "[external](/reader?documentId=doc-2&anchor=a2)",
      summary: "",
      aiHistory: [],
      anchors: [
        { anchor_id: "a1", document_id: "doc-1" },
        { anchor_id: "a2", document_id: "doc-2" },
      ],
      annotations: [
        { annotation_id: "n1", document_id: "doc-1" },
        { annotation_id: "n2", document_id: "doc-2" },
      ],
      pdfData: Buffer.from("%PDF"),
    });

    const parsed = await readReaderPackageBuffer(buffer);
    expect(parsed.note).toContain("documentId=doc-2");
    expect(parsed.anchors).toEqual([{ anchor_id: "a1", document_id: "doc-1" }]);
    expect(parsed.annotations).toEqual([{ annotation_id: "n1", document_id: "doc-1" }]);
  });

  it("markdown-centered packages include referenced documents, pdfs, and anchors", async () => {
    const buffer = await createReaderPackageBuffer({
      document: {
        document_id: "md-1",
        title: "Markdown",
        file_name: "notes.md",
        file_size: 1,
        source_type: "markdown",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      documents: [
        {
          document_id: "md-1",
          title: "Markdown",
          file_name: "notes.md",
          file_size: 1,
          source_type: "markdown",
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
      ],
      packageMode: "markdown-centered",
      note: "[source](/reader?documentId=doc-2&anchor=a2)",
      summary: "",
      aiHistory: [],
      anchors: [
        { anchor_id: "a2", document_id: "doc-2" },
        { anchor_id: "a3", document_id: "doc-3" },
      ],
      annotations: [{ annotation_id: "n2", document_id: "doc-2" }],
      formulas: [
        { formula_id: "f2", document_id: "doc-2", latex: "a=b", raw_text: "a=b", analysis: "Key equality.", source: "latex", importance_score: 0.8, status: "parsed", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
        { formula_id: "f3", document_id: "doc-3", latex: "c=d", raw_text: "c=d", analysis: "Other.", source: "latex", importance_score: 0.8, status: "parsed", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
      ],
      pdfDataByDocumentId: {
        "doc-2": Buffer.from("%PDF-2"),
      },
    });

    const parsed = await readReaderPackageBuffer(buffer);
    expect(parsed.packageMode).toBe("markdown-centered");
    expect(parsed.documents?.map((document) => document.document_id)).toEqual(["md-1", "doc-2"]);
    expect(parsed.pdfDataByDocumentId["doc-2"].toString()).toBe("%PDF-2");
    expect(parsed.anchors).toEqual([{ anchor_id: "a2", document_id: "doc-2" }]);
    expect(parsed.annotations).toEqual([{ annotation_id: "n2", document_id: "doc-2" }]);
    expect(parsed.formulas?.map((formula) => (formula as { formula_id: string }).formula_id)).toEqual(["f2"]);
  });

  it("round-trips a markdown-only reader package", async () => {
    const buffer = await createReaderPackageBuffer({
      document: {
        document_id: "doc-2",
        title: "Markdown",
        file_name: "paper.md",
        file_size: 8,
        source_type: "markdown",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      note: "Only markdown",
      summary: "",
      aiHistory: [],
      anchors: [],
      annotations: [],
    });

    const parsed = await readReaderPackageBuffer(buffer);
    expect(parsed.manifest.document_kind).toBe("markdown");
    expect(parsed.pdfData).toBeUndefined();
    expect(parsed.document.source_type).toBe("markdown");
  });

  it("round-trips referenced assets and skips unreferenced assets", async () => {
    const buffer = await createReaderPackageBuffer({
      document: {
        document_id: "doc-3",
        title: "Assets",
        file_name: "assets.md",
        file_size: 8,
        source_type: "markdown",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      note: "![plot](assets/plot.png)",
      summary: "",
      aiHistory: [],
      anchors: [],
      annotations: [],
      assets: [
        {
          asset_id: "asset-1",
          document_id: "doc-3",
          file_name: "plot.png",
          mime_type: "image/png",
          data: Buffer.from("PNG"),
          original_name: "plot.png",
          created_at: "2026-01-01T00:00:00.000Z",
        },
        {
          asset_id: "asset-2",
          document_id: "doc-3",
          file_name: "unused.png",
          mime_type: "image/png",
          data: Buffer.from("UNUSED"),
        },
      ],
    });

    const parsed = await readReaderPackageBuffer(buffer);
    expect(parsed.manifest.files.assets_manifest).toBe("assets/assets.json");
    expect(parsed.assets).toHaveLength(1);
    expect(parsed.assets[0].path).toBe("assets/plot.png");
    expect(parsed.assets[0].data.toString()).toBe("PNG");
  });

  it("extracts stable markdown asset paths", () => {
    expect([...extractAssetPathsFromMarkdown("![a](./assets/a.png =300x)", "![b](assets/b.webp)")]).toEqual([
      "assets/a.png",
      "assets/b.webp",
    ]);
  });
});
