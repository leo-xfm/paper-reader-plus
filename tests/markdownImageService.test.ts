import { describe, expect, it } from "vitest";
import { linkedImageMarkdown, resizeMarkdownImage } from "@/services/MarkdownImageService";
import type { Anchor } from "@/types";

const anchor: Anchor = {
  anchor_id: "anc-1",
  document_id: "doc-1",
  page_index: 4,
  page_label: "5",
  rects_pct: [{ left: 0.1, top: 0.1, width: 0.2, height: 0.2 }],
  text_quote: { exact: "PDF image region, page 5" },
  created_from: "markdown",
  metadata: { kind: "pdf-image-region" },
  created_at: "2026-01-01T00:00:00.000Z",
};

describe("MarkdownImageService", () => {
  it("wraps image markdown with a reader anchor link", () => {
    expect(linkedImageMarkdown("![page-5](assets/page-5.png)", anchor)).toBe(
      "[![page-5](assets/page-5.png)](/reader?documentId=doc-1&anchor=anc-1&page=5)",
    );
  });

  it("resizes linked markdown images without removing the link", () => {
    const source = "[![page-5](assets/page-5.png)](/reader?documentId=doc-1&anchor=anc-1&page=5)";
    expect(resizeMarkdownImage(source, "assets/page-5.png", 320, 0)).toBe(
      "[![page-5](assets/page-5.png =320x)](/reader?documentId=doc-1&anchor=anc-1&page=5)",
    );
  });
});
