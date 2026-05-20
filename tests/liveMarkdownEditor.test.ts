import { describe, expect, it } from "vitest";
import {
  continueListOnEnter,
  continueBlockquoteOnEnter,
  extractImages,
  findLinkAt,
  indentSelectedLines,
  insertMathBlockSource,
  markdownCodeLigatureReplacement,
  markdownRenderRanges,
  markdownRenderRangesInWindow,
  normalizedMarkdownLinkHref,
  renderComplexTableHtml,
  renderTableMarkdown,
  resizeImageSource,
  setImageAlignmentSource,
  setHeading,
  setLinkHref,
  stripMarkdownFormattingForPlainPaste,
  clearMarkdownFormatting,
  insertCalloutBlock,
  toggleFontColor,
  toggleListPrefix,
} from "@/services/LiveMarkdownSourceService";
import {
  changedLiveMarkdownSections,
  findLiveMarkdownSectionAt,
  findLiveMarkdownTokenAt,
  parseLiveMarkdownSections,
} from "@/services/LiveMarkdownSectionService";
import { buildComplexTableGrid, calculateComplexTableSelectionRange, complexTableToMarkdown, parseComplexTableSource, serializeComplexTable } from "@/services/ComplexTableService";

describe("LiveMarkdownEditor", () => {
  it("builds a virtual grid for complex tables with merged cells", () => {
    const table = {
      columnWidths: [],
      rows: [
        [{ tag: "th" as const, text: "A", rowspan: 2, colspan: 2, align: null }, { tag: "th" as const, text: "B", rowspan: 1, colspan: 1, align: null }],
        [{ tag: "td" as const, text: "C", rowspan: 1, colspan: 1, align: null }],
        [{ tag: "td" as const, text: "D", rowspan: 1, colspan: 1, align: null }, { tag: "td" as const, text: "E", rowspan: 1, colspan: 1, align: null }, { tag: "td" as const, text: "F", rowspan: 1, colspan: 1, align: null }],
      ],
    };
    const grid = buildComplexTableGrid(table);

    expect(grid.gridMap).toEqual([
      ["0:0", "0:0", "0:1"],
      ["0:0", "0:0", "1:0"],
      ["2:0", "2:1", "2:2"],
    ]);
    expect(grid.cellBounds["0:0"]).toEqual({ minRow: 0, maxRow: 1, minCol: 0, maxCol: 1 });
    expect(grid.cellOrigins["1:0"]).toMatchObject({ row: 1, col: 2, sourceRow: 1, sourceCol: 0 });
  });

  it("expands complex table selections to include an entire merged cell", () => {
    const table = {
      columnWidths: [],
      rows: [
        [{ tag: "th" as const, text: "A", rowspan: 2, colspan: 2, align: null }, { tag: "th" as const, text: "B", rowspan: 1, colspan: 1, align: null }],
        [{ tag: "td" as const, text: "C", rowspan: 1, colspan: 1, align: null }],
        [{ tag: "td" as const, text: "D", rowspan: 1, colspan: 1, align: null }, { tag: "td" as const, text: "E", rowspan: 1, colspan: 1, align: null }, { tag: "td" as const, text: "F", rowspan: 1, colspan: 1, align: null }],
      ],
    };

    expect(calculateComplexTableSelectionRange(table, { row: 0, col: 2 }, { row: 2, col: 1 })).toEqual({
      startRow: 0,
      endRow: 2,
      startCol: 0,
      endCol: 2,
    });
  });

  it("keeps plain complex table selections rectangular", () => {
    const table = {
      columnWidths: [],
      rows: [
        [{ tag: "th" as const, text: "A", rowspan: 1, colspan: 1, align: null }, { tag: "th" as const, text: "B", rowspan: 1, colspan: 1, align: null }],
        [{ tag: "td" as const, text: "C", rowspan: 1, colspan: 1, align: null }, { tag: "td" as const, text: "D", rowspan: 1, colspan: 1, align: null }],
      ],
    };

    expect(calculateComplexTableSelectionRange(table, { row: 1, col: 1 }, { row: 0, col: 0 })).toEqual({
      startRow: 0,
      endRow: 1,
      startCol: 0,
      endCol: 1,
    });
  });

  it("expands complex table selections consistently for reverse drags", () => {
    const table = {
      columnWidths: [],
      rows: [
        [{ tag: "th" as const, text: "A", rowspan: 1, colspan: 1, align: null }, { tag: "th" as const, text: "B", rowspan: 3, colspan: 2, align: null }],
        [{ tag: "td" as const, text: "C", rowspan: 1, colspan: 1, align: null }],
        [{ tag: "td" as const, text: "D", rowspan: 1, colspan: 1, align: null }],
      ],
    };

    const forward = calculateComplexTableSelectionRange(table, { row: 2, col: 0 }, { row: 1, col: 1 });
    const reverse = calculateComplexTableSelectionRange(table, { row: 1, col: 1 }, { row: 2, col: 0 });
    expect(forward).toEqual({ startRow: 0, endRow: 2, startCol: 0, endCol: 2 });
    expect(reverse).toEqual(forward);
  });

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

  it("preserves plus bullet source and continues the same marker on enter", () => {
    const source = "+ item";
    const edit = continueListOnEnter(source, source.length);
    expect(edit?.value).toBe("+ item\n+ ");
    expect(toggleListPrefix("item", { start: 0, end: 4 }, false).value).toBe("+ item");
  });

  it("toggles list markers on empty and existing lines", () => {
    expect(toggleListPrefix("", { start: 0, end: 0 }, false).value).toBe("+ ");
    expect(toggleListPrefix("+ item", { start: 0, end: 6 }, false).value).toBe("item");
    expect(toggleListPrefix("1. item", { start: 0, end: 7 }, true).value).toBe("item");
  });

  it("sets selected block lines back to paragraph source", () => {
    const source = "## Heading\n> Quote\n+ Item\n1. Ordered";
    const edit = setHeading(source, { start: 0, end: source.length }, 0);
    expect(edit.value).toBe("Heading\nQuote\nItem\nOrdered");
  });

  it("inserts an empty display math block with the cursor on the middle line", () => {
    const edit = insertMathBlockSource("", { start: 0, end: 0 });
    expect(edit.value).toBe("$$\n\n$$");
    expect(edit.selection).toEqual({ start: "$$\n".length, end: "$$\n".length });
  });

  it("exits an empty plus bullet without rewriting surrounding lines", () => {
    const source = "+ first\n+ ";
    const edit = continueListOnEnter(source, source.length);
    expect(edit?.value).toBe("+ first\n");
  });

  it("continues blockquotes with a quoted blank line between paragraphs", () => {
    const source = "> 123324";
    const edit = continueBlockquoteOnEnter(source, source.length);
    expect(edit?.value).toBe("> 123324\n>\n> ");
    expect(edit?.selection.start).toBe("> 123324\n>\n> ".length);
  });

  it("continues blockquotes when splitting a paragraph", () => {
    const source = "> 123324";
    const edit = continueBlockquoteOnEnter(source, 5);
    expect(edit?.value).toBe("> 123\n> 324");
    expect(edit?.selection.start).toBe("> 123\n> ".length);
  });

  it("continues callout blockquotes when splitting a paragraph", () => {
    const source = "> [!WARNING]\n> d\n> 1234";
    const position = source.indexOf("34");
    const edit = continueBlockquoteOnEnter(source, position);
    expect(edit?.value).toBe("> [!WARNING]\n> d\n> 12\n> 34");
    expect(edit?.selection.start).toBe("> [!WARNING]\n> d\n> 12\n> ".length);
  });

  it("inserts callout blocks with the expected source template", () => {
    const edit = insertCalloutBlock("", { start: 0, end: 0 }, "WARNING");
    expect(edit.value).toBe("> [!WARNING]\n>\n");
  });

  it("exits an empty blockquote marker", () => {
    const source = "> 123324\n>\n> ";
    const edit = continueBlockquoteOnEnter(source, source.length);
    expect(edit?.value).toBe("> 123324\n>\n");
  });

  it("keeps blank lines, spaces, indentation, and trailing newline untouched when no edit is requested", () => {
    const source = "a\n\n\n  b  \n";
    expect(source).toBe("a\n\n\n  b  \n");
  });

  it("outdents only selected lines for shift tab behavior", () => {
    const source = "+ first\n    + second\n    + third";
    const start = source.indexOf("    + second");
    const end = start + "    + second".length;
    const edit = indentSelectedLines(source, { start, end }, "out");
    expect(edit.value).toBe("+ first\n+ second\n    + third");
  });

  it("detects markdown links, bare urls, and reader anchors", () => {
    expect(normalizedMarkdownLinkHref("www.example.com")).toBe("https://www.example.com");
    const markdown = "See [site](https://example.com), /reader?documentId=doc&anchor=anc and www.example.com";
    expect(findLinkAt(markdown, markdown.indexOf("site"))?.href).toBe("https://example.com");
    expect(findLinkAt(markdown, markdown.indexOf("/reader") + 4)?.href).toBe("/reader?documentId=doc&anchor=anc");
    expect(findLinkAt(markdown, markdown.indexOf("www.") + 2)?.href).toBe("https://www.example.com");
  });

  it("replaces typed code ligature tokens outside fenced code blocks", () => {
    const source = "flow --";
    expect(markdownCodeLigatureReplacement(source, source.length, ">")).toEqual({
      start: 5,
      end: 7,
      text: "→",
    });
    expect(markdownCodeLigatureReplacement("a < pass", 3, "=")).toEqual({
      start: 2,
      end: 3,
      text: "≤",
    });
  });

  it("does not replace typed code ligature tokens inside fenced code blocks", () => {
    const source = "```ts\nflow --";
    expect(markdownCodeLigatureReplacement(source, source.length, ">")).toBeNull();
  });

  it("edits links as markdown source instead of rich text marks", () => {
    const source = "See [site](https://example.com)";
    const range = findLinkAt(source, source.indexOf("site"));
    const edit = setLinkHref(source, { start: 0, end: 0 }, "https://openai.com", range);
    expect(edit.value).toBe("See [site](https://openai.com)");
  });

  it("extracts anchor-linked images as one stable markdown range", () => {
    const source = "[![page](assets/page.png)](/reader?documentId=doc&anchor=anc&page=1)";
    const images = extractImages(source);
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      start: 0,
      end: source.length,
      src: "assets/page.png",
      outerHref: "/reader?documentId=doc&anchor=anc&page=1",
    });
  });

  it("extracts html image sources and dimensions", () => {
    const source = '<img src="assets/example.jpg" alt="示例图片" width="300" height="200">';
    expect(extractImages(source)[0]).toMatchObject({
      start: 0,
      end: source.length,
      format: "html",
      src: "assets/example.jpg",
      alt: "示例图片",
      width: "300",
      height: "200",
    });
  });

  it("extracts responsive html image styles", () => {
    const source = '<img src="assets/example.jpg" alt="响应式图片" style="max-width: 100%; height: auto;">';
    expect(extractImages(source)[0]).toMatchObject({
      format: "html",
      src: "assets/example.jpg",
      style: "max-width: 100%; height: auto;",
    });
  });

  it("extracts centered html image containers", () => {
    const source = '<div align="center">\n  <img src="assets/example.jpg" alt="居中图片" width="400">\n</div>';
    expect(extractImages(source)[0]).toMatchObject({
      format: "html",
      alignment: "center",
      containerStart: 0,
      containerEnd: source.length,
      src: "assets/example.jpg",
      width: "400",
    });
  });

  it("wraps markdown and html images in aligned div containers", () => {
    const markdown = '![plot](assets/plot.png =320x180 "Training curve")';
    const markdownImage = extractImages(markdown)[0];
    expect(setImageAlignmentSource(markdown, markdownImage, "center").value).toBe([
      '<div align="center">',
      '  <img src="assets/plot.png" alt="plot" width="320" height="180" title="Training curve">',
      "</div>",
    ].join("\n"));

    const html = '<div align="left">\n  <img src="assets/plot.png" alt="plot" width="320">\n</div>';
    const htmlImage = extractImages(html)[0];
    expect(setImageAlignmentSource(html, htmlImage, "right").value).toBe([
      '<div align="right">',
      '  <img src="assets/plot.png" alt="plot" width="320">',
      "</div>",
    ].join("\n"));
  });

  it("resizes markdown and html image sources", () => {
    const markdown = "![plot](assets/plot.png)";
    const markdownImage = extractImages(markdown)[0];
    const markdownEdit = resizeImageSource(markdown, markdownImage, 320, 180);
    expect(markdownEdit.value).toBe("![plot](assets/plot.png =320x180)");
    expect(markdownEdit.selection).toEqual({ start: markdownEdit.value.length, end: markdownEdit.value.length });

    const html = '<img src="assets/plot.png" alt="plot" width="300">';
    const htmlImage = extractImages(html)[0];
    expect(resizeImageSource(html, htmlImage, 320, 180).value).toBe('<img src="assets/plot.png" alt="plot" width="320" height="180">');
  });

  it("finds render ranges for h1 through h6 headings", () => {
    const source = [
      "# H1",
      "## H2",
      "### H3",
      "#### H4",
      "##### H5",
      "###### H6",
    ].join("\n");
    const headings = markdownRenderRanges(source).filter((range) => range.kind === "heading");
    expect(headings.map((range) => [range.level, range.text])).toEqual([
      [1, "H1"],
      [2, "H2"],
      [3, "H3"],
      [4, "H4"],
      [5, "H5"],
      [6, "H6"],
    ]);
  });

  it("finds render ranges for strong, emphasis, underline, font color, and inline code", () => {
    const source = 'A **bold** *italic* <u>under</u> <span style="color: red;">red</span> `code`';
    const ranges = markdownRenderRanges(source);
    expect(ranges.map((range) => [range.kind, range.text])).toEqual([
      ["strong", "bold"],
      ["em", "italic"],
      ["underline", "under"],
      ["fontColor", "red"],
      ["inlineCode", "code"],
    ]);
    expect(ranges.find((range) => range.kind === "fontColor")?.color).toBe("red");
  });

  it("toggles font color with inline html span syntax", () => {
    const edit = toggleFontColor("plain", { start: 0, end: 5 }, "blue");
    expect(edit.value).toBe('<span style="color: blue;">plain</span>');
    expect(toggleFontColor(edit.value, edit.selection, "blue").value).toBe("plain");
    expect(toggleFontColor(edit.value, edit.selection, "purple").value).toBe('<span style="color: purple;">plain</span>');
    expect(toggleFontColor(edit.value, edit.selection, "black").value).toBe("plain");
    expect(toggleFontColor("plain", { start: 0, end: 5 }, "black").value).toBe("plain");
  });

  it("clears markdown and html inline formatting", () => {
    const source = 'A **bold** *italic* <u>under</u> ==mark== ~~strike~~ <span style="color: red;">red</span> `code` [link](https://example.com)';
    const edit = clearMarkdownFormatting(source, { start: 0, end: source.length });
    expect(edit.value).toBe("A bold italic under mark strike red code link");
  });

  it("does not clear the whole document when no text is selected", () => {
    const source = "A **bold** word";
    const edit = clearMarkdownFormatting(source, { start: 2, end: 2 });
    expect(edit.value).toBe(source);
    expect(edit.selection).toEqual({ start: 2, end: 2 });
  });

  it("handles nested color underline and bold on the same text", () => {
    const source = '<span style="color: red;"><u>**闪光灯**</u></span>';
    const ranges = markdownRenderRanges(source);
    expect(ranges.map((range) => range.kind)).toEqual(["fontColor", "underline", "strong"]);
    expect(ranges.find((range) => range.kind === "fontColor")).toMatchObject({
      color: "red",
      text: "<u>**闪光灯**</u>",
    });
    expect(clearMarkdownFormatting(source, { start: 0, end: source.length }).value).toBe("闪光灯");
    expect(toggleFontColor(source, { start: source.indexOf("闪光灯"), end: source.indexOf("闪光灯") + "闪光灯".length }, "black").value).toBe("<u>**闪光灯**</u>");
  });

  it("finds and renders markdown table ranges", () => {
    const source = "| A | B |\n| :--- | ---: |\n| 1 | 2 |";
    const table = markdownRenderRanges(source).find((range) => range.kind === "table")?.table;
    expect(table).toBeTruthy();
    expect(table?.rows).toEqual([
      ["A", "B"],
      ["1", "2"],
    ]);
    expect(table?.alignments).toEqual(["left", "right"]);
    expect(renderTableMarkdown(table!)).toBe(source);
  });

  it("finds inserted markdown tables with empty body cells", () => {
    const source = [
      "| Column 1 | Column 2 | Column 3 | Column 4 | Column 5 | Column 6 |",
      "| --- | --- | --- | --- | --- | --- |",
      "|   |   |   |   |   |   |",
      "|   |   |   |   |   |   |",
      "|   |   |   |   |   |   |",
    ].join("\n");
    const table = markdownRenderRanges(source).find((range) => range.kind === "table")?.table;
    expect(table).toBeTruthy();
    expect(table?.rows).toHaveLength(4);
    expect(table?.rows[0]).toHaveLength(6);
    expect(table?.rows[1]).toEqual(["", "", "", "", "", ""]);
  });

  it("upgrades markdown tables to complex html table source", () => {
    const source = "| Product | Q1 | Q2 |\n| :--- | ---: | ---: |\n| A | 100 | 120 |";
    const table = markdownRenderRanges(source).find((range) => range.kind === "table")?.table;
    expect(table).toBeTruthy();
    const html = renderComplexTableHtml(table!);
    expect(html).toContain('<table class="markdown-complex-table" style="width: 100%;">');
    expect(html).toContain("<colgroup>");
    expect(html).toContain('<col style="width: 33.33%;">');
    expect(html).toContain("<thead>");
    expect(html).toContain('<th style="text-align: left">Product</th>');
    expect(html).toContain('<td style="text-align: right">120</td>');
  });

  it("parses, serializes, and downgrades complex html tables", () => {
    const html = [
      '<table style="width: 100%; border-collapse: collapse;">',
      "  <colgroup>",
      '    <col style="width: 30%;">',
      '    <col style="width: 20%;">',
      '    <col style="width: 20%;">',
      '    <col style="width: 30%;">',
      "  </colgroup>",
      "  <thead>",
      "    <tr>",
      '      <th rowspan="2">产品</th>',
      '      <th colspan="2" style="text-align: center;">销售数据</th>',
      '      <th rowspan="2" style="text-align: right;">总收入</th>',
      "    </tr>",
      "    <tr>",
      "      <th>Q1</th>",
      "      <th>Q2</th>",
      "    </tr>",
      "  </thead>",
      "  <tbody>",
      "    <tr>",
      "      <td>产品A</td>",
      '      <td style="text-align: right;">¥100,000</td>',
      '      <td style="text-align: right;">¥120,000</td>',
      '      <td style="text-align: right; font-weight: bold;">¥220,000</td>',
      "    </tr>",
      "  </tbody>",
      "</table>",
    ].join("\n");
    const table = parseComplexTableSource(html);
    expect(table?.columnWidths).toEqual(["30%", "20%", "20%", "30%"]);
    expect(table?.rows[0][0]).toMatchObject({ text: "产品", rowspan: 2 });
    expect(table?.rows[0][1]).toMatchObject({ text: "销售数据", colspan: 2, align: "center" });
    expect(serializeComplexTable(table!)).toContain("<colgroup>");
    expect(serializeComplexTable(table!)).toContain('colspan="2"');
    expect(complexTableToMarkdown(table!)).toBe([
      "| 产品 | 销售数据 |   | 总收入 |",
      "| --- | :---: | :---: | ---: |",
      "| 产品 | Q1 | Q2 | 总收入 |",
      "| 产品A | ¥100,000 | ¥120,000 | ¥220,000 |",
    ].join("\n"));
  });

  it("scans large markdown documents without quadratic table lookup", () => {
    const source = Array.from({ length: 2500 }, (_value, index) => {
      if (index === 1200) return "| A | B |";
      if (index === 1201) return "| --- | --- |";
      if (index === 1202) return "| 1 | 2 |";
      return `Paragraph ${index} with **bold** text`;
    }).join("\n");
    const started = performance.now();
    const ranges = markdownRenderRanges(source);
    expect(ranges.some((range) => range.kind === "table")).toBe(true);
    expect(performance.now() - started).toBeLessThan(250);
  });

  it("renders only a requested source window for large live documents", () => {
    const lines = Array.from({ length: 10000 }, (_value, index) => `Paragraph ${index} with **bold** text`);
    lines[7000] = "## Visible";
    lines[7001] = "| A | B |";
    lines[7002] = "| --- | --- |";
    lines[7003] = "| 1 | 2 |";
    const source = lines.join("\n");
    const from = source.indexOf("## Visible");
    const started = performance.now();
    const ranges = markdownRenderRangesInWindow(source, from, from + 120);
    expect(ranges.map((range) => range.kind)).toContain("heading");
    expect(ranges.map((range) => range.kind)).toContain("table");
    expect(ranges.every((range) => range.start >= from - 1 && range.end <= from + 160)).toBe(true);
    expect(performance.now() - started).toBeLessThan(120);
  });

  it("parses live markdown into line and block sections", () => {
    const source = [
      "# Title",
      "",
      "+ one",
      "+ two",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "```ts",
      "const x = 1;",
      "```",
      "",
      "[![page](assets/page.png)](/reader?documentId=doc&anchor=anc&page=1)",
    ].join("\n");
    const sections = parseLiveMarkdownSections(source);
    expect(sections.map((section) => section.kind)).toEqual([
      "line",
      "line",
      "list",
      "line",
      "table",
      "line",
      "codeBlock",
      "line",
      "imageBlock",
    ]);
    expect(sections[0].tokenRanges[0]).toMatchObject({ kind: "heading", text: "Title" });
  });

  it("finds precise active inline tokens inside a line section", () => {
    const source = "A **bold** [site](https://example.com)";
    const sections = parseLiveMarkdownSections(source);
    const section = findLiveMarkdownSectionAt(sections, source.indexOf("bold"));
    const token = findLiveMarkdownTokenAt(section, source.indexOf("bold"));
    expect(token).toMatchObject({ kind: "strong", text: "bold" });
    const link = findLiveMarkdownTokenAt(section, source.indexOf("site"));
    expect(link).toMatchObject({ kind: "link", text: "site", href: "https://example.com" });
  });

  it("reports only changed sections by source hash and range", () => {
    const previous = parseLiveMarkdownSections("one\n\n| A | B |\n| --- | --- |\n| 1 | 2 |");
    const next = parseLiveMarkdownSections("one\n\n| A | B |\n| --- | --- |\n| 1 | 3 |");
    const changed = changedLiveMarkdownSections(previous, next);
    expect(changed).toHaveLength(1);
    expect(changed[0].kind).toBe("table");
  });
});
