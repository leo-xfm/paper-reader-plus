import { describe, expect, it } from "vitest";
import { buildPackageHealthReport } from "../electron/services/HealthCheckService";

const now = "2026-05-16T00:00:00.000Z";

function store(overrides: Partial<Parameters<typeof buildPackageHealthReport>[0]> = {}) {
  return {
    documents: [{
      document_id: "doc-1",
      title: "Paper",
      file_name: "paper.pdf",
      file_path: "C:/missing/paper.pdf",
      file_size: 1,
      source_type: "readerp" as const,
      created_at: now,
      updated_at: now,
    }],
    notes: {},
    anchors: [],
    annotations: [],
    assets: [],
    ...overrides,
  };
}

describe("HealthCheckService", () => {
  it("reports missing main files as errors", () => {
    const report = buildPackageHealthReport(store(), "doc-1", now);
    expect(report.status).toBe("error");
    expect(report.issues.map((issue) => issue.kind)).toContain("missing-main-file");
  });

  it("reports ReaderM missing documents and anchors", () => {
    const report = buildPackageHealthReport(store({
      documents: [{
        document_id: "readerm-1",
        title: "ReaderM",
        file_name: "reader.readerm",
        file_path: "C:/missing/reader.md",
        file_size: 1,
        source_type: "readerm" as const,
        created_at: now,
        updated_at: now,
      }, {
        document_id: "doc-1",
        title: "Paper",
        file_name: "paper.pdf",
        file_path: "C:/missing/paper.pdf",
        file_size: 1,
        source_type: "readerp" as const,
        created_at: now,
        updated_at: now,
      }],
      notes: {
        "readerm-1": {
          content: "[missing anchor](/reader?documentId=doc-1&anchor=anc-x)\n[missing doc](/reader?documentId=doc-x&anchor=anc-y)",
          updated_at: now,
        },
      },
    }), "readerm-1", now);
    expect(report.issues.map((issue) => issue.kind)).toEqual(expect.arrayContaining(["missing-anchor", "missing-referenced-document"]));
  });

  it("reports orphan annotations and missing assets as warnings", () => {
    const report = buildPackageHealthReport(store({
      annotations: [{
        annotation_id: "ann-1",
        document_id: "doc-1",
        anchor_id: "anc-missing",
        type: "highlight",
        color: "#fff",
        page_index: 0,
        sort_index: "0",
        target: { rects_pct: [] },
        comment: "",
        tags: [],
        created_at: now,
        updated_at: now,
      }],
      assets: [{
        asset_id: "asset-1",
        document_id: "doc-1",
        file_name: "missing.png",
        mime_type: "image/png",
        path: "C:/missing/missing.png",
        created_at: now,
      }],
    }), "doc-1", now);
    expect(report.issues.map((issue) => issue.kind)).toEqual(expect.arrayContaining(["orphan-annotation", "missing-asset"]));
  });
});
