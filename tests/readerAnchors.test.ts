import { describe, expect, it } from "vitest";
import { buildImageRegionAnchorCreateRequest, buildReaderAnchorHref, parseReaderAnchorHref } from "@/services/ReaderAnchorService";

describe("ReaderAnchorService", () => {
  it("round trips reader anchor hrefs", () => {
    const href = buildReaderAnchorHref({ document_id: "doc 1", anchor_id: "anc/1" }, 7);
    expect(href).toBe("/reader?documentId=doc+1&anchor=anc%2F1&page=7");
    expect(parseReaderAnchorHref(href)).toEqual({ documentId: "doc 1", anchorId: "anc/1" });
  });

  it("parses reader links when the app is loaded from file URLs", () => {
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { origin: "file://" },
    });
    try {
      expect(parseReaderAnchorHref("/reader?documentId=doc-1&anchor=anc-1")).toEqual({
        documentId: "doc-1",
        anchorId: "anc-1",
      });
    } finally {
      Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it("parses legacy custom protocol links", () => {
    expect(parseReaderAnchorHref("paper-reader-plus://document/doc-1?anchor=anc-1")).toEqual({
      documentId: "doc-1",
      anchorId: "anc-1",
    });
  });

  it("builds anchors for PDF image regions", () => {
    expect(buildImageRegionAnchorCreateRequest(2, {
      left: 0.1,
      top: 0.2,
      width: 0.3,
      height: 0.4,
    })).toEqual({
      page_index: 2,
      page_label: "3",
      rects_pct: [{ left: 0.1, top: 0.2, width: 0.3, height: 0.4 }],
      text_quote: { exact: "PDF image region, page 3" },
      created_from: "markdown",
      metadata: { kind: "pdf-image-region" },
    });
  });
});
