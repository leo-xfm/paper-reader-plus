import { describe, expect, it } from "vitest";
import { extractMarkdownOutline } from "@/services/MarkdownOutlineService";

describe("MarkdownOutlineService", () => {
  it("extracts h1 through h3 headings and ignores deeper headings", () => {
    expect(extractMarkdownOutline("# One\n\n## Two\n\n### Three\n\n#### Four")).toEqual([
      { id: "markdown-heading-0", title: "One", page_index: 0, level: 0 },
      { id: "markdown-heading-2", title: "Two", page_index: 0, level: 1 },
      { id: "markdown-heading-4", title: "Three", page_index: 0, level: 2 },
    ]);
  });

  it("ignores headings inside fenced code blocks", () => {
    expect(extractMarkdownOutline("```\n# Code\n```\n\n# Real")).toEqual([
      { id: "markdown-heading-4", title: "Real", page_index: 0, level: 0 },
    ]);
  });
});
