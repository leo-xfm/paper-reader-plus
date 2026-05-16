import { describe, expect, it } from "vitest";
import { stripMarkdownFormattingForPlainPaste } from "@/services/ProseMirrorMarkdownUiService";

describe("LiveMarkdownEditor", () => {
  it("strips markdown formatting markers for plain paste", () => {
    const input = [
      "# Title",
      "",
      "A **strong** and *em* text with `code` and $x^2$.",
      "[label](/reader?documentId=doc&anchor=a&page=1)",
      "![plot](assets/plot.png)",
      "- [x] Done",
      "> Quote",
      "```ts",
      "const x = 1;",
      "```",
    ].join("\n");

    expect(stripMarkdownFormattingForPlainPaste(input)).toBe([
      "Title",
      "",
      "A strong and em text with code and x^2.",
      "label",
      "plot",
      "Done",
      "Quote",
      "const x = 1;",
    ].join("\n"));
  });
});
