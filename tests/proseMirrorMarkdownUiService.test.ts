import { describe, expect, it } from "vitest";
import type { Mark } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { markdownForImageNode, activeMarkRanges, markRangeForDeletedSourceMarker } from "@/services/ProseMirrorMarkdownUiService";
import { parseMarkdownToDoc, proseMirrorMarkdownSchema } from "@/services/ProseMirrorMarkdownService";

function firstImage(markdown: string) {
  const doc = parseMarkdownToDoc(markdown);
  let imageNode = null as ReturnType<typeof doc.nodeAt> | null;
  let linkMark: Mark | null = null;
  doc.descendants((node) => {
    if (node.type.name !== "image" || imageNode) return true;
    imageNode = node;
    linkMark = node.marks.find((mark) => mark.type.name === "link") || null;
    return false;
  });
  if (!imageNode) throw new Error("No image in fixture.");
  return { imageNode, linkMark };
}

function stateAt(markdown: string, query: string) {
  const doc = parseMarkdownToDoc(markdown);
  let position = 1;
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text?.includes(query)) return true;
    position = pos + node.text.indexOf(query) + Math.floor(query.length / 2);
    return false;
  });
  return EditorState.create({
    schema: proseMirrorMarkdownSchema,
    doc,
    selection: TextSelection.create(doc, position),
  });
}

describe("ProseMirrorMarkdownUiService", () => {
  it("generates markdown for plain and sized images", () => {
    expect(markdownForImageNode(firstImage("![plot](assets/plot.png)").imageNode!)).toBe("![plot](assets/plot.png)");
    expect(markdownForImageNode(firstImage("![plot](assets/plot.png =320x200)").imageNode!)).toBe("![plot](assets/plot.png =320x200)");
  });

  it("generates markdown for linked Reader images", () => {
    const { imageNode, linkMark } = firstImage("[![page](assets/page.png)](/reader?documentId=doc&anchor=anc&page=1)");
    expect(markdownForImageNode(imageNode!, linkMark)).toBe("[![page](assets/page.png)](/reader?documentId=doc&anchor=anc&page=1)");
  });

  it("detects active strong, em, code, and link mark ranges", () => {
    expect(activeMarkRanges(stateAt("A **strong** word", "strong")).map((range) => range.mark.type.name)).toContain("strong");
    expect(activeMarkRanges(stateAt("An *em* word", "em")).map((range) => range.mark.type.name)).toContain("em");
    expect(activeMarkRanges(stateAt("A `code` word", "code")).map((range) => range.mark.type.name)).toContain("code");
    expect(activeMarkRanges(stateAt("A [link](https://example.com) word", "link")).map((range) => range.mark.type.name)).toContain("link");
  });

  it("maps deletion at visible source markers to the active mark range", () => {
    const state = stateAt("A **strong** word", "strong");
    const range = activeMarkRanges(state).find((item) => item.mark.type.name === "strong");
    expect(range).toBeTruthy();
    const atEnd = state.apply(state.tr.setSelection(TextSelection.create(state.doc, range!.to)));
    expect(markRangeForDeletedSourceMarker(atEnd, "Backspace")?.mark.type.name).toBe("strong");
  });
});
