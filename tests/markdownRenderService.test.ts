import { describe, expect, it } from "vitest";
import { isAllowedMarkdownUrl, renderMarkdown } from "@/services/MarkdownRenderService";

describe("MarkdownRenderService", () => {
  it("renders block and inline math with KaTeX", () => {
    const html = renderMarkdown("Inline $x^2$.\n\n$$\ny = mx + b\n$$");
    expect(html).toContain("katex");
    expect(html).toContain("x");
    expect(html).toContain("y");
  });

  it("renders simple LaTeX equation environments before markdown", () => {
    const html = renderMarkdown("\\begin{equation}x^2\\end{equation}");
    expect(html).toContain("katex-display");
    expect(html).toContain("x");
  });

  it("renders simple LaTeX mathcal commands in prose", () => {
    const html = renderMarkdown("Let \\mathcal{S} denote states.");
    expect(html).toContain("katex");
    expect(html).toContain("mathcal");
  });

  it("renders safe images and strips unsafe image URLs", () => {
    const html = renderMarkdown("![ok](https://example.com/a.png)\n\n![asset](assets/a.png)\n\n![bad](file:///c:/secret.png)");
    expect(html).toContain("<img");
    expect(html).toContain("https://example.com/a.png");
    expect(html).toContain("assets/a.png");
    expect(html).not.toContain("file:///c:/secret.png");
  });

  it("allows reader anchors but rejects file URLs", () => {
    expect(isAllowedMarkdownUrl("/reader?documentId=doc&anchor=a")).toBe(true);
    expect(isAllowedMarkdownUrl("data:image/png;base64,AAAA")).toBe(true);
    expect(isAllowedMarkdownUrl("./assets/figure.png")).toBe(true);
    expect(isAllowedMarkdownUrl("file:///tmp/a.png")).toBe(false);
  });

  it("renders task lists, image dimensions, and external link safety attributes", () => {
    const html = renderMarkdown("- [x] Done\n- [ ] Todo\n\n![plot](assets/plot.png =300x200)\n\n[site](https://example.com)");
    expect(html).toContain("markdown-task-checkbox");
    expect(html).toContain("checked");
    expect(html).toContain('width="300"');
    expect(html).toContain('height="200"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("renders linked asset images with reader anchors", () => {
    const html = renderMarkdown("[![plot](assets/plot.png)](/reader?documentId=doc&anchor=anc&page=3)");
    expect(html).toContain('<a href="/reader?documentId=doc&amp;anchor=anc&amp;page=3">');
    expect(html).toContain('<img');
    expect(html).toContain('src="assets/plot.png"');
  });

  it("marks headings for ReaderM outline navigation", () => {
    const html = renderMarkdown("# Title\n\nText\n\n### Details");
    expect(html).toContain('data-readerm-heading-id="markdown-heading-0"');
    expect(html).toContain('data-readerm-heading-id="markdown-heading-4"');
  });

  it("preserves percentages in prose after LaTeX preprocessing", () => {
    const html = renderMarkdown("能带来高达55%的相对性能提升，使用Claude-4-Sonnet达到80.0%。");
    expect(html).toContain("55%");
    expect(html).toContain("相对性能提升");
    expect(html).toContain("80.0%");
  });
});
