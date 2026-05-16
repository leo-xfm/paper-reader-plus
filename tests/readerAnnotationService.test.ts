import { describe, expect, it } from "vitest";
import {
  annotationMatchesFilters,
  buildAnnotationCreateRequest,
  buildAnnotationSortIndex,
  parseTagsInput,
  sortAnnotations,
} from "@/services/ReaderAnnotationService";
import type { Anchor, Annotation } from "@/types";

const anchor: Anchor = {
  anchor_id: "anc-1",
  document_id: "doc-1",
  page_index: 2,
  rects_pct: [{ left: 0.1, top: 0.2, width: 0.3, height: 0.04 }],
  text_quote: { exact: "quoted text", prefix: "before", suffix: "after" },
  created_from: "annotation",
  metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
};

describe("ReaderAnnotationService", () => {
  it("builds stable sort indexes and v2 create payloads", () => {
    expect(buildAnnotationSortIndex(anchor)).toBe("000002:2026-01-01T00:00:00.000Z:anc-1");
    expect(buildAnnotationCreateRequest(anchor, "underline", "#FDE68A")).toMatchObject({
      anchor_id: "anc-1",
      type: "underline",
      color: "#FDE68A",
      target: {
        rects_pct: anchor.rects_pct,
        text_quote: anchor.text_quote,
      },
    });
  });

  it("filters and sorts annotations", () => {
    const annotations = [
      annotation("b", "000003:z", "highlight", "#FDE68A", 3),
      annotation("a", "000001:z", "note", "#BBD4F6", 1, "A comment", ["method"]),
    ];
    expect(sortAnnotations(annotations).map((item) => item.annotation_id)).toEqual(["a", "b"]);
    expect(annotationMatchesFilters(annotations[0], { type: "highlight", color: "#FDE68A", page: 3, content: "all" })).toBe(true);
    expect(annotationMatchesFilters(annotations[0], { type: "note", color: "all", page: "all", content: "all" })).toBe(false);
    expect(annotationMatchesFilters(annotations[0], { type: "all", color: "all", page: "all", content: "commented" })).toBe(false);
    expect(annotationMatchesFilters(annotations[1], { type: "all", color: "all", page: "all", content: "commented" })).toBe(true);
    expect(annotationMatchesFilters(annotations[1], { type: "all", color: "all", page: "all", content: "tagged" })).toBe(true);
  });

  it("parses comma separated tags", () => {
    expect(parseTagsInput("method,  important,,todo ")).toEqual(["method", "important", "todo"]);
  });
});

function annotation(id: string, sortIndex: string, type: Annotation["type"], color: string, pageIndex: number, comment = "", tags: string[] = []): Annotation {
  return {
    annotation_id: id,
    document_id: "doc-1",
    anchor_id: "anc-1",
    type,
    color,
    page_index: pageIndex,
    sort_index: sortIndex,
    target: { rects_pct: anchor.rects_pct, text_quote: anchor.text_quote },
    comment,
    tags,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}
