import { describe, expect, it, vi } from "vitest";
import { cleanupUnusedDocumentResources } from "../electron/services/MaintenanceService";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
  rmSync: vi.fn(),
}));

const now = "2026-05-16T00:00:00.000Z";

describe("MaintenanceService", () => {
  it("removes unused anchors and unreferenced assets while preserving referenced resources", () => {
    const store = {
      notes: { "doc-1": { content: "![keep](assets/keep.png)\n[ref](/reader?documentId=doc-1&anchor=linked)", updated_at: now } },
      summaries: {},
      ai_history: {},
      anchors: [
        { anchor_id: "linked", document_id: "doc-1", page_index: 0, rects_pct: [], text_quote: { exact: "" }, created_from: "selection" as const, metadata: {}, created_at: now },
        { anchor_id: "annotated", document_id: "doc-1", page_index: 0, rects_pct: [], text_quote: { exact: "" }, created_from: "selection" as const, metadata: {}, created_at: now },
        { anchor_id: "unused", document_id: "doc-1", page_index: 0, rects_pct: [], text_quote: { exact: "" }, created_from: "selection" as const, metadata: {}, created_at: now },
      ],
      annotations: [{
        annotation_id: "ann-1",
        document_id: "doc-1",
        anchor_id: "annotated",
        type: "highlight" as const,
        color: "#fff",
        page_index: 0,
        sort_index: "0",
        target: { rects_pct: [] },
        comment: "",
        tags: [],
        created_at: now,
        updated_at: now,
      }],
      assets: [
        { asset_id: "asset-1", document_id: "doc-1", file_name: "keep.png", mime_type: "image/png", path: "keep.png", created_at: now },
        { asset_id: "asset-2", document_id: "doc-1", file_name: "drop.png", mime_type: "image/png", path: "drop.png", created_at: now },
      ],
      dictionary: [],
    };

    const result = cleanupUnusedDocumentResources(store, "doc-1");
    expect(result).toMatchObject({ removed_anchors: 1, removed_assets: 1, removed_asset_files: 1 });
    expect(store.anchors.map((anchor) => anchor.anchor_id)).toEqual(["linked", "annotated"]);
    expect(store.assets.map((asset) => asset.file_name)).toEqual(["keep.png"]);
  });
});
