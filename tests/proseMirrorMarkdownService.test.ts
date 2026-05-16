import { describe, expect, it } from "vitest";
import { parseMarkdownToDoc, serializeDocToMarkdown } from "@/services/ProseMirrorMarkdownService";

function roundTrip(markdown: string) {
  return serializeDocToMarkdown(parseMarkdownToDoc(markdown));
}

describe("ProseMirrorMarkdownService", () => {
  it("round-trips common markdown blocks and marks", () => {
    const markdown = [
      "# Title",
      "",
      "A **strong** and *em* paragraph with `code` and [link](https://example.com).",
      "",
      "> Quote",
      "",
      "- One",
      "- Two",
      "",
      "1. First",
      "2. Second",
      "",
      "```ts",
      "const x = 1;",
      "```",
    ].join("\n");

    const output = roundTrip(markdown);
    expect(output).toContain("# Title");
    expect(output).toContain("**strong**");
    expect(output).toContain("*em*");
    expect(output).toContain("`code`");
    expect(output).toContain("[link](https://example.com)");
    expect(output).toContain("> Quote");
    expect(output).toContain("* One");
    expect(output).toContain("1. First");
    expect(output).toContain("```ts");
  });

  it("keeps literal star and backtick characters readable in text", () => {
    expect(roundTrip("Use * and ` as literal characters")).toBe("Use * and ` as literal characters");
  });

  it("round-trips fenced code block language params", () => {
    const output = roundTrip("```python\nprint('ok')\n```");
    expect(output).toContain("```python");
    expect(output).toContain("print('ok')");
  });

  it("round-trips live math nodes", () => {
    const inline = roundTrip("Before $x^2$ after");
    expect(inline).toContain("Before $x^2$ after");

    const block = roundTrip("$$\ny = mx + b\n$$");
    expect(block).toBe("$$\ny = mx + b\n$$");

    const singleLineBlock = roundTrip("$$x^2$$");
    expect(singleLineBlock).toBe("$$\nx^2\n$$");
  });

  it("preserves linked Reader images", () => {
    const output = roundTrip("[![page-5](assets/page-5.png)](/reader?documentId=doc-1&anchor=anc-1&page=5)");
    expect(output).toContain("[![page-5](assets/page-5.png)](/reader?documentId=doc-1&anchor=anc-1&page=5)");
  });

  it("parses multiple Reader linked images with and without dimensions", () => {
    const markdown = [
      "[![page-1](assets/page-1-258de33e.png =481x188)](/reader?documentId=d84fa65d-94c1-4918-94fa-51fc0066e18b&anchor=1f468f4d-d2ac-483f-98e4-4b87b3d065cf&page=1)",
      "",
      "用法",
      "",
      "[![page-2](assets/page-2-6296f382.png)](/reader?documentId=11062a17-50ba-4550-81b6-eed7f0475d02&anchor=ec82e7b8-1fc3-4391-b98e-09d3926c8842&page=2)",
      "",
      "cite123",
      "",
      "[![page-18](assets/page-18-cfef3f1a.png)](/reader?documentId=d84fa65d-94c1-4918-94fa-51fc0066e18b&anchor=596d8fd2-e367-4375-9421-84cfd95a90d6&page=18)",
    ].join("\n");
    const doc = parseMarkdownToDoc(markdown);
    const images: Array<{ src: string; href: string }> = [];
    doc.descendants((node) => {
      if (node.type.name === "image") {
        images.push({
          src: String(node.attrs.src || ""),
          href: String(node.marks.find((mark) => mark.type.name === "link")?.attrs.href || ""),
        });
      }
    });

    expect(images).toEqual([
      {
        src: "assets/page-1-258de33e.png",
        href: "/reader?documentId=d84fa65d-94c1-4918-94fa-51fc0066e18b&anchor=1f468f4d-d2ac-483f-98e4-4b87b3d065cf&page=1",
      },
      {
        src: "assets/page-2-6296f382.png",
        href: "/reader?documentId=11062a17-50ba-4550-81b6-eed7f0475d02&anchor=ec82e7b8-1fc3-4391-b98e-09d3926c8842&page=2",
      },
      {
        src: "assets/page-18-cfef3f1a.png",
        href: "/reader?documentId=d84fa65d-94c1-4918-94fa-51fc0066e18b&anchor=596d8fd2-e367-4375-9421-84cfd95a90d6&page=18",
      },
    ]);
    expect(serializeDocToMarkdown(doc)).toContain("![page-1](assets/page-1-258de33e.png =481x188)");
    expect(serializeDocToMarkdown(doc)).toContain("[![page-2](assets/page-2-6296f382.png)](/reader?documentId=11062a17-50ba-4550-81b6-eed7f0475d02&anchor=ec82e7b8-1fc3-4391-b98e-09d3926c8842&page=2)");
  });

  it("preserves project image dimension syntax", () => {
    expect(roundTrip("![plot](assets/plot.png =320x200)")).toBe("![plot](assets/plot.png =320x200)");
    expect(roundTrip("![plot](assets/plot.png =320x)")).toBe("![plot](assets/plot.png =320x)");
  });

  it("keeps task list text in markdown output", () => {
    const output = roundTrip("- [x] Done\n- [ ] Todo");
    expect(output).toContain("* [x] Done");
    expect(output).toContain("* [ ] Todo");
  });

  it("round-trips markdown tables", () => {
    const output = roundTrip("| A | B |\n| --- | --- |\n| 1 | 2 |");
    expect(output).toContain("| A | B |");
    expect(output).toContain("| --- | --- |");
    expect(output).toContain("| 1 | 2 |");
  });

  it("round-trips table alignment markers", () => {
    const output = roundTrip("| Left | Center | Right |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |");
    expect(output).toContain("| Left | Center | Right |");
    expect(output).toContain("| :--- | :---: | ---: |");
    expect(output).toContain("| 1 | 2 | 3 |");
  });

  it("strips unsafe image and link urls before parsing", () => {
    const output = roundTrip("![bad](file:///secret.png)\n\n[bad](file:///secret.txt)");
    expect(output).not.toContain("file://");
    expect(output).toContain("\\[image blocked: bad\\]");
    expect(output).toContain("bad");
  });
});
