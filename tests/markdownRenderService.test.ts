import { describe, expect, it } from "vitest";
import { isAllowedMarkdownUrl, renderMarkdown } from "@/services/MarkdownRenderService";
import { isMermaidFenceInfo } from "@/services/MermaidRenderService";

describe("MarkdownRenderService", () => {
  it("renders block and inline math with KaTeX", () => {
    const html = renderMarkdown("Inline $x^2$.\n\n$$\ny = mx + b\n$$");
    expect(html).toContain("katex");
    expect(html).toContain("x");
    expect(html).toContain("y");
  });

  it("renders same-line double dollar math in display mode", () => {
    const html = renderMarkdown("Inline $$x^2$$ text");
    expect(html).toContain("katex-display");
    expect(html).toContain("x");
  });

  it("keeps single dollar math in inline mode", () => {
    const html = renderMarkdown("Inline $x^2$ text");
    expect(html).toContain("katex");
    expect(html).not.toContain("katex-display");
  });

  it("does not treat escaped dollars as inline math delimiters", () => {
    const html = renderMarkdown("Cost is \\$5 and $$x$$");
    expect(html).toContain("$5");
    expect(html).toContain("katex-display");
    expect(html).toContain("x");
  });

  it("keeps standalone double dollar blocks in display mode", () => {
    const html = renderMarkdown("$$\ny\n$$");
    expect(html).toContain("katex-display");
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
    expect(isAllowedMarkdownUrl("image.jpg")).toBe(true);
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

  it("preserves nested list structure for preview indentation", () => {
    const html = renderMarkdown("- parent\n  - child\n    - grandchild");
    expect(html).toMatch(/<li>parent\s*<ul>\s*<li>child\s*<ul>\s*<li>grandchild<\/li>/);
  });

  it("preserves four-space nested plus lists in preview", () => {
    const html = renderMarkdown([
      "## Implicit Geometry Perception",
      "",
      "+ 转化普通2D图像信息为3D数据 2D → 3D Perception with Spatial Encoder",
      "+ 数据类型：点云图、深度、相机姿态或 3D 追踪点",
      "+ 方法概述",
      "    + 将所有成对预测的点图 pointmap 对齐到一个共同的3D参考系中",
      "    + 思路1：2D → ViT Encoder → Decode with Info Sharing ([DUSt3R](https://arxiv.org/abs/2312.14132)) → Dense Head ([MASt3R](https://arxiv.org/abs/2406.09756)) → PointMap → Alignment",
      "    + 思路2：Patched Images → Camera Token Addition (编码相机参数) → MHA ([VGGT](https://openaccess.thecvf.com/content/CVPR2025/papers/Wang_VGGT_Visual_Geometry_Grounded_Transformer_CVPR_2025_paper.pdf), similar to ViT)",
      "    + [DA3](https://arxiv.org/pdf/2511.10647): Dual DPT (Dense Prediction Transformer)  ",
      "        + Depth Map: 预测每个像素离相机的距离",
      "        + Ray Map: yucc",
    ].join("\n"));
    expect(html).toMatch(/<li>方法概述\s*<ul>\s*<li>将所有成对预测/);
    expect(html).toMatch(/Dual DPT \(Dense Prediction Transformer\)\s*<ul>\s*<li>Depth Map/);
    expect(html).not.toContain("方法概述\n+ 将所有成对预测");
  });

  it("linkifies bare http and www urls", () => {
    const html = renderMarkdown("Visit https://example.com and www.example.org.");
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain('<a href="http://www.example.org"');
  });

  it("renders linked asset images with reader anchors", () => {
    const html = renderMarkdown("[![plot](assets/plot.png)](/reader?documentId=doc&anchor=anc&page=3)");
    expect(html).toContain('<a href="/reader?documentId=doc&amp;anchor=anc&amp;page=3">');
    expect(html).toContain('<img');
    expect(html).toContain('src="assets/plot.png"');
  });

  it("keeps image titles for hover text", () => {
    const markdownHtml = renderMarkdown('![plot](assets/plot.png "Training curve")');
    expect(markdownHtml).toContain('title="Training curve"');

    const htmlImage = renderMarkdown('<img src="assets/example.jpg" alt="plot" title="Training curve">');
    expect(htmlImage).toContain('title="Training curve"');
  });

  it("marks headings for ReaderM outline navigation", () => {
    const html = renderMarkdown("# Title\n\nText\n\n### Details");
    expect(html).toContain('data-readerm-heading-id="markdown-heading-0"');
    expect(html).toContain('data-readerm-heading-id="markdown-heading-4"');
  });

  it("renders inline emphasis inside headings", () => {
    const html = renderMarkdown("### **0. 摘要翻译**");
    expect(html).toContain("<h3");
    expect(html).toContain("<strong>0. 摘要翻译</strong>");
    expect(html).not.toContain("**0. 摘要翻译**");
  });

  it("renders sanitized raw details and block html", () => {
    const html = renderMarkdown([
      "<details>",
      "  <summary>折叠文本</summary>",
      "  此处可书写文本",
      "  <script>alert(1)</script>",
      "</details>",
      "",
      "<div>raw</div>",
    ].join("\n"));
    expect(html).toContain('<details class="markdown-details"');
    expect(html).toContain("<summary>折叠文本</summary>");
    expect(html).toContain("<div>raw</div>");
    expect(html).not.toContain("<script>");
  });

  it("renders safe html image blocks without enabling arbitrary html", () => {
    const html = renderMarkdown([
      '<img src="assets/example.jpg" alt="示例图片" width="300" height="200" onclick="alert(1)">',
      "",
      '<img src="assets/responsive.jpg" alt="响应式图片" style="max-width: 100%; height: auto; position: fixed;">',
      "",
      '<div align="center">',
      '  <img src="assets/center.jpg" alt="居中图片" width="400">',
      "</div>",
      "",
      '<div align="right">',
      '  <img src="https://www.markdownlang.com/static/images/logo.png" alt="right image" width="200">',
      "</div>",
      "",
      '<div align="left">',
      '  <img src="image.jpg" alt="left image" width="200">',
      "</div>",
      "",
      '<img src="file:///tmp/private.png" alt="bad">',
    ].join("\n"));
    expect(html).toContain('class="markdown-html-image"');
    expect(html).toContain('src="assets/example.jpg"');
    expect(html).toContain('width="300"');
    expect(html).toContain('height="200"');
    expect(html).toContain('style="max-width: 100%; height: auto"');
    expect(html).toContain("align-center");
    expect(html).toContain("align-right");
    expect(html).toContain("align-left");
    expect(html).toContain('src="https://www.markdownlang.com/static/images/logo.png"');
    expect(html).toContain('src="image.jpg"');
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("position: fixed");
    expect(html).not.toContain("file:///tmp/private.png");
  });

  it.skip("renders safe complex table html blocks with spans and sanitized attributes", () => {
    const html = renderMarkdown([
      '<table style="width: 100%; border-collapse: collapse;" onclick="alert(1)">',
      "  <thead>",
      "    <tr>",
      '      <th rowspan="2" style="border: 1px solid #ddd; padding: 8px;">产品</th>',
      '      <th colspan="2" style="border: 1px solid #ddd; padding: 8px;">销售数据</th>',
      "    </tr>",
      "  </thead>",
      "  <tbody>",
      "    <tr>",
      '      <td style="text-align: right; font-weight: bold;">¥220,000<script>alert(1)</script></td>',
      "    </tr>",
      "  </tbody>",
      "</table>",
    ].join("\n"));
    expect(html).toContain("<table");
    expect(html).toContain('style="width: 100%; border-collapse: collapse"');
    expect(html).toContain('rowspan="2"');
    expect(html).toContain('colspan="2"');
    expect(html).toContain("text-align: right");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("renders callouts with semantic classes", () => {
    const html = renderMarkdown([
      "> [!NOTE]",
      "> ",
      "> body",
      "",
      "> [!WARNING] Be careful",
      "> ",
      "> more",
    ].join("\n"));
    expect(html).toContain("markdown-callout markdown-callout-note");
    expect(html).toContain("markdown-callout markdown-callout-warning");
    expect(html).toContain("markdown-callout-title");
    expect(html).toContain("markdown-callout-icon");
    expect(html).toContain("markdown-callout-label");
  });

  it("renders callouts with labels and hides quoted blank separators", () => {
    const html = renderMarkdown([
      "> [!TIP]",
      "> 123",
      ">",
      "> 234",
      ">",
      "> 213",
    ].join("\n"));
    expect(html).toContain("markdown-callout markdown-callout-tip");
    expect(html).toContain("markdown-callout-icon");
    expect(html).toContain("markdown-callout-label");
    expect(html).toContain(">Tip</span>");
    expect(html).not.toContain("[!TIP]");
    expect(html).not.toContain("!TIP");
    expect(html).toContain("<p>123\n234\n213</p>");
    expect(html).not.toContain("<p>123</p>");
    expect(html).not.toContain("<p>234</p>");
  });

  it("renders details preformatted code safely", () => {
    const html = renderMarkdown([
      "<details>",
      "  <summary>折叠代码块</summary>",
      "  <pre><blockcode>",
      "     System.out.println(\"ok\");",
      "  </blockcode></pre>",
      "</details>",
    ].join("\n"));
    expect(html).toContain("<pre>");
    expect(html).toContain("&lt;blockcode&gt;");
    expect(html).toContain("System.out.println(&quot;ok&quot;);");
  });

  it("renders raw html blocks in preview with sanitized markup", () => {
    const html = renderMarkdown([
      '<div class="demo" onclick="alert(1)" style="text-align: center; position: fixed;">',
      "  <h4>信息提示</h4>",
      "  <p>这是一个使用 HTML 创建的信息提示框。</p>",
      '  <a href="javascript:alert(1)">bad</a>',
      '  <img src="assets/example.png" alt="ok" width="120" onerror="alert(1)">',
      "  <script>alert(1)</script>",
      "</div>",
    ].join("\n"));
    expect(html).toContain("markdown-html-render");
    expect(html).toContain('<div class="demo" style="text-align: center">');
    expect(html).toContain("<h4>信息提示</h4>");
    expect(html).toContain("<p>这是一个使用 HTML 创建的信息提示框。</p>");
    expect(html).toContain('<a>bad</a>');
    expect(html).toContain('src="assets/example.png"');
    expect(html).toContain('width="120"');
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("position: fixed");
  });

  it("renders raw media and form html blocks with safe attributes", () => {
    const html = renderMarkdown([
      '<iframe width="560" height="315" src="https://www.youtube.com/embed/VIDEO_ID" allowfullscreen></iframe>',
      "",
      '<video controls width="100%" height="400">',
      '  <source src="video.mp4" type="video/mp4">',
      "</video>",
      "",
      "<form>",
      '  <label for="name">姓名：</label>',
      '  <input type="text" id="name" name="name" style="width: 100%; padding: 0.5rem;">',
      '  <button type="submit" style="background-color: #007bff; color: white;">提交</button>',
      "</form>",
    ].join("\n"));
    expect(html).toContain("markdown-html-render");
    expect(html).toContain("<iframe");
    expect(html).toContain('src="https://www.youtube.com/embed/VIDEO_ID"');
    expect(html).toContain("allowfullscreen");
    expect(html).toContain("<video controls");
    expect(html).toContain('src="video.mp4"');
    expect(html).toContain("<form>");
    expect(html).toContain('<input type="text" id="name" name="name" style="width: 100%; padding: 0.5rem">');
    expect(html).toContain('<button type="submit" style="background-color: #007bff; color: white">提交</button>');
  });

  it("keeps fenced html as a code block", () => {
    const html = renderMarkdown(["```html", "<div>raw</div>", "```"].join("\n"));
    expect(html).toContain("markdown-code-block");
    expect(html).toContain("&lt;");
    expect(html).toContain("raw");
    expect(html).not.toContain("markdown-html-render");
  });

  it("renders mermaid fences as diagram placeholders instead of code blocks", () => {
    const html = renderMarkdown([
      "```mermaid",
      "flowchart TD",
      "  A[Start] --> B{Done?}",
      "```",
    ].join("\n"));
    expect(html).toContain("markdown-mermaid");
    expect(html).toContain("markdown-mermaid-source");
    expect(html).toContain("flowchart TD");
    expect(html).not.toContain("markdown-code-block");
    expect(html).not.toContain("markdown-code-language");
  });

  it("escapes mermaid source in placeholders", () => {
    const html = renderMarkdown(["```mermaid", "flowchart TD", "  A[<script>alert(1)</script>] --> B", "```"].join("\n"));
    expect(html).toContain("markdown-mermaid");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("recognizes mermaid fence info case-insensitively with extra options", () => {
    expect(isMermaidFenceInfo("mermaid")).toBe(true);
    expect(isMermaidFenceInfo("Mermaid theme=default")).toBe(true);
    expect(isMermaidFenceInfo(" mermaid   title ")).toBe(true);
    expect(isMermaidFenceInfo("mermaid-js")).toBe(false);
    expect(isMermaidFenceInfo("typescript")).toBe(false);
  });

  it("preserves percentages in prose after LaTeX preprocessing", () => {
    const html = renderMarkdown("能带来高达55%的相对性能提升，使用Claude-4-Sonnet达到80.0%。");
    expect(html).toContain("55%");
    expect(html).toContain("相对性能提升");
    expect(html).toContain("80.0%");
  });
});
