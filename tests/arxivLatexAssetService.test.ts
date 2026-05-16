import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { extractArxivLatexSource, normalizeArxivId } from "../electron/services/ArxivService";
import { normalizeMarkdownAssetPath } from "../electron/services/AssetService";

describe("ArxivService", () => {
  it("normalizes arXiv ids and URLs", () => {
    expect(normalizeArxivId("https://arxiv.org/abs/2401.12345v2")).toBe("2401.12345v2");
    expect(normalizeArxivId("https://arxiv.org/pdf/cs/9901001.pdf")).toBe("cs/9901001");
    expect(() => normalizeArxivId("not an id")).toThrow(/Invalid arXiv ID/);
  });

  it("extracts direct and gzipped LaTeX sources", () => {
    const source = "\\documentclass{article}\\begin{document}Hello\\end{document}";
    expect(extractArxivLatexSource(Buffer.from(source), "paper").latexFileName).toBe("paper.tex");
    expect(extractArxivLatexSource(gzipSync(Buffer.from(source)), "paper").latexData?.toString("utf8")).toContain("\\documentclass");
  });
});

describe("AssetService", () => {
  it("normalizes markdown asset paths and rejects traversal", () => {
    expect(normalizeMarkdownAssetPath("./assets/image.png?x=1")).toBe("assets/image.png");
    expect(normalizeMarkdownAssetPath("assets/../secret.png")).toBe("");
    expect(normalizeMarkdownAssetPath("file:///tmp/image.png")).toBe("");
  });
});
