# Paper Reader Plus Help / Paper Reader Plus 帮助

Version / 版本: `0.2.0`

Package manifest version / 包清单版本: ReaderP `1`, ReaderM `1`

Runtime / 运行形态: Electron desktop application with Vue, PDF.js, CodeMirror 6, Markdown-it, KaTeX, Mermaid, JSZip, and local JSON storage. / 基于 Electron、Vue、PDF.js、CodeMirror 6、Markdown-it、KaTeX、Mermaid、JSZip 与本地 JSON 存储的桌面应用。

Paper Reader Plus is a standalone academic reading and writing workspace for PDF papers, arXiv papers, LaTeX source, Markdown notes, evidence-linked annotations, AI-assisted reading, translation, formula OCR, and portable ReaderP/ReaderM packages.

Paper Reader Plus 是面向论文阅读、批注、引用整理、AI 辅助理解、翻译、公式 OCR 和 Markdown 写作的本地桌面工作台。它把 PDF、arXiv、LaTeX 源码、笔记、摘要、锚点、批注、AI 历史和写作引用整合在同一个工作流里。

## What's New / 本次更新

- Markdown editor rebuilt on CodeMirror 6. / Markdown 编辑器已切换到 CodeMirror 6。
- New Markdown toolbar for headings 1-6, paragraph text, bold, italic, underline, inline code, links, lists, quotes, tables, images, math, undo, and redo. / 新增更完整的 Markdown 工具栏。
- Live Markdown editing keeps source text as the source of truth while rendering common structures in place. / 实时 Markdown 编辑以源码为准，同时在编辑区内就地渲染常见结构。
- Markdown preview supports syntax highlighting, optional line numbers, KaTeX math, Mermaid diagrams, callouts, task lists, safe links, `==highlight==`, `readerp://`, and `readerm://` links. / Markdown 预览支持代码高亮、可选行号、KaTeX、Mermaid、提示块、任务列表、安全链接、高亮语法和 Reader 链接。
- Markdown image workflows support paste, insert, local assets, captions, save-as, and size hints. / Markdown 图片支持粘贴、插入、本地资产、图注、另存和尺寸标记。
- ReaderM adds edit + preview split mode, configurable preview position, synchronized Markdown zoom, source panes, and reference navigation. / ReaderM 新增编辑 + 预览分屏、预览位置配置、同步 Markdown 缩放、来源窗格和引用导航。
- Settings now include General, Markdown, Agent API, OCR API, Translation API, File Associations, and prompt panels. / 设置包含通用、Markdown、Agent API、OCR API、翻译 API、文件关联和提示词面板。
- General settings include interface language, PDF region capture scale, ReaderP history link target view, and network proxy. / 通用设置包含界面语言、PDF 区域截图倍数、ReaderP 历史链接目标视图和网络代理。
- Markdown settings include default editor mode, font family, font size, line height, code font, code line height, code ligatures, code line numbers, highlight color, math rendering, live HTML rendering, ReaderM split default, and preview placement. / Markdown 设置包含默认编辑模式、字体、字号、行高、代码字体、代码行高、连字、代码行号、高亮颜色、数学渲染、实时 HTML 渲染、ReaderM 分屏默认值和预览位置。
- Help includes a dedicated `Help > API Guide` page for Agent API, Translation API, and SimpleTex OCR setup. / 帮助菜单新增 `Help > API Guide`，用于配置 Agent API、翻译 API 和 SimpleTex OCR。
- Simplified Chinese localization coverage was expanded across renderer controls, Electron menus, and common dialogs. / 简体中文本地化已覆盖更多渲染器控件、Electron 菜单和常见对话框。

## Quick Start / 快速开始

1. Import a paper with `File > Create ReaderP from PDF`, drag a `.pdf` file into the start screen, or use `File > Create ReaderP from arXiv`.
2. Read in the central PDF workspace. Use the left sidebar for ReaderP/ReaderM history, thumbnails, and outline. Use the right panel for annotations, notes, summary, symbols, dictionary, and AI.
3. Select PDF text to copy text, copy a Markdown quote, highlight, underline, add a note, ask AI, translate, or explain with a metaphor.
4. Write notes or ReaderM documents in Edit, Live, Preview, or ReaderM edit + preview mode.
5. Open `Settings > General`, `Settings > Markdown`, `Settings > Agent API`, `Settings > OCR API`, and `Settings > Translation API` before deeper use.
6. Open `Help > API Guide` for API key creation, configuration, testing, and troubleshooting.

1. 通过 `File > Create ReaderP from PDF` 导入论文，也可以把 `.pdf` 拖到启动页，或使用 `File > Create ReaderP from arXiv`。
2. 在中央 PDF 工作区阅读；左侧栏用于 ReaderP/ReaderM 历史、缩略图和大纲；右侧面板用于批注、笔记、摘要、符号、词典和 AI。
3. 选中 PDF 文本后，可以复制原文、复制 Markdown 引用、高亮、下划线、添加笔记、询问 AI、翻译或用隐喻解释。
4. 在 Edit、Live、Preview 或 ReaderM edit + preview 模式中编写笔记和 ReaderM 文档。
5. 深入使用前，建议先配置 `Settings > General`、`Settings > Markdown`、`Settings > Agent API`、`Settings > OCR API` 和 `Settings > Translation API`。
6. 如需创建和配置 API，打开 `Help > API Guide`。

## Supported Files / 支持的文件

- `.pdf`: local PDF papers. / 本地 PDF 论文。
- arXiv ID or URL: downloads PDF and can optionally attach arXiv LaTeX source. / arXiv 编号或链接，可下载 PDF，并可选绑定 arXiv LaTeX 源码。
- `.md`: Markdown notes or Markdown-centered ReaderM source. / Markdown 笔记或 ReaderM 写作源文档。
- `.readerp`: PDF-centered portable reading package. / 以 PDF 阅读为中心的可迁移阅读包。
- `.readerm`: Markdown-centered portable writing package. / 以 Markdown 写作为中心的可迁移写作包。

## Workspace / 工作区

The app is designed for a desktop canvas of at least `1320 x 760`. It is not a mobile layout.

应用面向至少 `1320 x 760` 的桌面画布，不是移动端布局。

Main areas / 主要区域:

- Start screen: import PDF, import arXiv, create blank ReaderM, create ReaderM from Markdown, or drag supported files. / 启动页用于导入 PDF、导入 arXiv、创建空 ReaderM、从 Markdown 创建 ReaderM 或拖入支持的文件。
- Left sidebar: ReaderP/ReaderM history, library actions, PDF thumbnails, and PDF outline. / 左侧栏包含 ReaderP/ReaderM 历史、文库操作、PDF 缩略图和 PDF 大纲。
- Center workspace: PDF reader, Markdown/ReaderM editor, live preview, and referenced PDF/source panes. / 中央工作区包含 PDF 阅读器、Markdown/ReaderM 编辑器、实时预览和引用来源窗格。
- Right reader panel: annotations, notes, summary, symbols, dictionary, and AI chat. / 右侧阅读面板包含批注、笔记、摘要、符号、词典和 AI 对话。
- Floating tools: selection toolbar, translation result modal, table sheet modal, figure/table preview, author preview, dictionary preview, table controls, image controls, and math preview. / 浮动工具包含选区工具栏、翻译结果弹窗、表格视图、图表预览、作者预览、词典预览、表格控件、图片控件和公式预览。

## PDF Reading / PDF 阅读

The PDF reader includes / PDF 阅读器包含:

- Current-page and nearby-page lazy rendering. / 当前页和附近页面懒加载渲染。
- Zoom in, zoom out, reset zoom, page jump, and scroll reading. / 放大、缩小、重置缩放、页码跳转和滚动阅读。
- Loaded-page search with `Ctrl+F`. / 使用 `Ctrl+F` 搜索已加载页面。
- PDF thumbnails and outline navigation. / PDF 缩略图和大纲导航。
- Internal PDF links and return navigation from preview/reference jumps. / PDF 内部链接跳转，以及从预览或引用跳转后的返回。
- Text selection for quoting, annotations, AI, and translation. / 文本选区可用于引用、批注、AI 和翻译。
- Paragraph actions for detected text blocks. / 对检测到的文本块执行段落级操作。
- Figure/table hover preview and larger inspection. / 图和表的悬停预览与放大查看。
- Table extraction into a spreadsheet-like view with filtering, sorting, row/column deletion, and CSV export. / 表格可打开为类电子表格视图，支持过滤、排序、删除行列和导出 CSV。
- Configurable PDF region capture scale for clearer inserted or copied images. / 可配置 PDF 区域截图倍数，用于更清晰地插入或复制图片。

PDF extraction quality depends on the PDF text layer. Scanned PDFs or unusual layouts may produce incomplete selection, search, paragraph grouping, or table results.

PDF 抽取质量取决于 PDF 自身文本层。扫描版或复杂排版可能导致选区、搜索、段落聚合或表格结果不完整。

## Annotations and Anchors / 批注与锚点

Annotations are evidence-linked. Each annotation points to an anchor containing page index, percentage-based rectangles, selected quote, optional surrounding text, and optional extracted text position.

批注是证据链接式批注。每条批注指向一个 anchor，anchor 保存页码、百分比坐标矩形、选中文本、可选上下文和可选文本位置。

Supported annotation types / 支持的批注类型:

- Highlight / 高亮
- Underline / 下划线
- Note / 笔记

Annotation features / 批注功能:

- Choose color, add comments, and add comma-separated tags. / 选择颜色、添加评论、添加逗号分隔标签。
- Filter by type, page, color, comment status, and tag status. / 按类型、页码、颜色、是否有评论、是否有标签过滤。
- Jump from an annotation back to the PDF location. / 从批注跳回 PDF 原位置。
- Undo the last annotation. / 撤销最近一次批注。
- Copy selected text or copy a Markdown quote with a `/reader?documentId=...&anchor=...` link. / 复制选中文本，或复制带 `/reader?documentId=...&anchor=...` 链接的 Markdown 引用。
- Quote selected text directly into notes. / 将选中文本直接引用到笔记。

## Markdown Editing / Markdown 编辑

Markdown editing is source-first and powered by CodeMirror 6. The app supports Edit, Live, Preview, and ReaderM edit + preview workflows.

Markdown 编辑以源码为准，由 CodeMirror 6 提供能力。应用支持 Edit、Live、Preview 和 ReaderM edit + preview 工作流。

Markdown features / Markdown 功能:

- Toolbar actions for headings 1-6, paragraph, bold, italic, underline, inline code, links, quote, bullet list, ordered list, table, image, math, undo, and redo. / 工具栏支持标题、段落、加粗、斜体、下划线、行内代码、链接、引用、列表、表格、图片、数学公式、撤销和重做。
- Search in the editor with CodeMirror search behavior. / 使用 CodeMirror 搜索能力在编辑器内搜索。
- Continue list items on Enter and indent/outdent selected lines. / 回车延续列表项，并支持选中行缩进或反缩进。
- Insert tables through a grid picker. / 通过网格选择器插入表格。
- Edit Markdown tables with floating controls for resize, alignment, row/column movement, copy, format, and delete. / 使用浮动控件调整表格尺寸、对齐方式、行列移动、复制、格式化和删除。
- Paste or insert images, resize Markdown image hints, save images as files, and jump to linked reader sources. / 可粘贴或插入图片、调整 Markdown 图片尺寸标记、另存图片，并跳转到关联 reader 来源。
- Preview inline and block math through KaTeX. / 通过 KaTeX 预览行内和块级公式。
- Render Mermaid diagrams from fenced `mermaid` code blocks. / 从 `mermaid` 代码围栏渲染 Mermaid 图。
- Render GitHub-style callouts: `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, and `CAUTION`. / 渲染 GitHub 风格提示块。
- Render task lists with `- [ ]` and `- [x]`. / 渲染任务列表。
- Render sanitized HTML blocks for details, images, tables, media, and simple layout markup when enabled. / 启用后渲染经过清理的 HTML 块。
- Use synchronized Markdown zoom with `Ctrl` + mouse wheel. / 使用 `Ctrl` + 鼠标滚轮同步缩放 Markdown 窗口字号。

Markdown rendering supports headings, paragraphs, lists, blockquotes, tables, code blocks, KaTeX math, Mermaid diagrams, callouts, task lists, safe links, local image assets, image captions, image size hints, reader anchor links, `readerp://` links, `readerm://` links, and `==highlight==` syntax.

Markdown 渲染支持标题、段落、列表、引用、表格、代码块、KaTeX、Mermaid、提示块、任务列表、安全链接、本地图片资产、图注、图片尺寸标记、reader anchor link、`readerp://`、`readerm://` 和 `==高亮==` 语法。

Reader anchor links use this shape / Reader anchor link 形式:

```text
/reader?documentId=...&anchor=...
```

Image size hints use this shape / 图片尺寸标记形式:

```markdown
![caption](assets/image.png =320x)
![caption](assets/image.png =320x180)
```

PDF regions can be captured into Markdown assets. In ReaderM, the PDF/source pane can insert selected PDF regions back into the Markdown document.

PDF 区域可以截取为 Markdown 图片资产。在 ReaderM 中，PDF/来源窗格可将选中的 PDF 区域插回 Markdown 文档。

## ReaderP / ReaderP 阅读包

ReaderP is the PDF-centered package format. Its manifest format is `paper-reader-plus.readerp`, version `1`.

ReaderP 是以 PDF 为中心的阅读包格式。manifest format 为 `paper-reader-plus.readerp`，版本为 `1`。

ReaderP can include / ReaderP 可包含:

- `manifest.json`: package metadata, document ID, title, file name, package mode, timestamps, and file map. / 包元数据、文档 ID、标题、文件名、包模式、时间戳和文件映射。
- `document.pdf` or `pdfs/<documentId>.pdf`: one or more PDF files. / 一个或多个 PDF 文件。
- `sources/<documentId>.tex`: attached LaTeX source when available. / 可用时附带的 LaTeX 源码。
- `documents.json`: related document metadata for markdown-centered package mode. / markdown-centered 包模式中的关联文档元数据。
- `notes.md`, `summary.md`, `ai-history.json`. / 笔记、摘要、AI 历史。
- `anchors.json`, `annotations.json`, `symbols.json`. / 锚点、批注、符号。
- `assets/` and optional `assets/assets.json`. / 图片资产和可选资产清单。

The history list can copy Markdown links for ReaderP entries. The default target view is configurable as PDF, Markdown notes, or Summary.

历史列表可以复制 ReaderP 条目的 Markdown 链接。默认目标视图可配置为 PDF、Markdown 笔记或 Summary。

## ReaderM / ReaderM 写作包

ReaderM is the Markdown-centered writing package. Its manifest format is `paper-reader-plus.readerm`, version `1`, and package mode is `markdown-centered`.

ReaderM 是以 Markdown 为中心的写作包。manifest format 为 `paper-reader-plus.readerm`，版本为 `1`，包模式为 `markdown-centered`。

ReaderM can include / ReaderM 可包含:

- `readerm.md`: the main Markdown document. / 主 Markdown 文档。
- `documents.json`: referenced local documents. / 被引用的本地文档。
- `references.json`: resolved and unresolved reader links. / 已解析和未解析的 reader link。
- `anchors.json`, `annotations.json`, `symbols.json`. / 锚点、批注、符号。
- `pdfs/<documentId>.pdf` and `sources/<documentId>.tex`. / 被 Markdown 引用的 PDF 和 LaTeX 源码。
- `assets/`: images used by the Markdown document. / Markdown 使用的图片。

ReaderM workflows / ReaderM 工作流:

- Edit only: focused source editing. / 仅编辑，专注源码编辑。
- Live: source editing with in-place rendering for common Markdown structures. / 实时，源码编辑并就地渲染常见 Markdown 结构。
- Preview: rendered document view. / 预览，渲染后的文档视图。
- Edit + preview: split editor and preview, with preview on the right or below. / 编辑 + 预览，编辑器和预览分屏，预览可在右侧或下方。
- Referenced source pane: open referenced PDF, Markdown, or Summary sources when available. / 引用来源窗格，可打开引用到的 PDF、Markdown 或 Summary 来源。

ReaderM reference links use `/reader?documentId=...&anchor=...`. The reference index reports whether each link is resolved, missing its document, or missing its anchor. Selecting a reference opens the corresponding source in the source pane when possible. Save ReaderM to refresh the reference index after editing links.

ReaderM 引用链接使用 `/reader?documentId=...&anchor=...`。引用索引会显示每个链接是否已解析、缺失文档或缺失锚点。选择引用后，会尽量在来源窗格打开对应来源。编辑链接后保存 ReaderM 可刷新引用索引。

## AI Reading / AI 阅读

The AI panel and selection actions use an OpenAI-compatible Chat Completions API. The current UI preset provider is `volcengine`; the service layer currently accepts only `agent_api_type = chat`.

AI 面板和选区动作使用 OpenAI-compatible Chat Completions API。当前 UI 预设 provider 为 `volcengine`，服务层当前只接受 `agent_api_type = chat`。

AI tasks / AI 任务:

- Free-form chat about the active paper. / 围绕当前论文自由对话。
- Ask AI about selected text or a detected paragraph block. / 对选中文本或检测到的段落提问。
- Translate a selection through AI mode. / 使用 AI 模式翻译选区。
- Explain a selection with a metaphor. / 用隐喻解释选区。
- Generate or update an AI summary. / 生成或更新 AI 摘要。
- Use evidence context from anchors, annotations, notes, summary, loaded text, and selected text. / 使用来自锚点、批注、笔记、摘要、已加载文本和选区的证据上下文。
- Attach figure images to summary requests when configured. / 配置允许时，为摘要请求附带图像。

Prompt templates are stored under `docs/*.j2`: `system.j2`, `literature-read.j2`, `literature-translate.j2`, and `literature-metaphor.j2`.

提示词模板位于 `docs/*.j2`，包括 `system.j2`、`literature-read.j2`、`literature-translate.j2` 和 `literature-metaphor.j2`。

For API key setup and provider-specific checks, open `Help > API Guide`.

如需查看 API 密钥创建和服务商检查步骤，请打开 `Help > API Guide`。

## Formula OCR / 公式 OCR

Formula OCR uses SimpleTex LaTeX OCR Turbo when enabled. It is used by Markdown and ReaderM workflows that recognize formulas from selected PDF image regions.

启用后，公式 OCR 使用 SimpleTex LaTeX OCR Turbo。它用于 Markdown 和 ReaderM 工作流中从 PDF 图片选区识别公式。

OCR settings / OCR 设置:

| UI field / UI 字段 | Internal field / 内部字段 | Required when / 何时需要 |
| --- | --- | --- |
| Enable SimpleTex OCR | `simpletex_ocr_enabled` | Formula OCR workflow / 使用公式 OCR 工作流 |
| SimpleTex OCR Token | `simpletex_ocr_token` | SimpleTex OCR requests / 请求 SimpleTex OCR |

Open `Help > API Guide` for SimpleTex token setup and test steps.

打开 `Help > API Guide` 可查看 SimpleTex Token 创建和测试步骤。

## Translation / 翻译

Translation supports two modes / 翻译支持两种模式:

| Mode | Internal value | Behavior |
| --- | --- | --- |
| Use AI chat API / 使用 AI 聊天 API | `ai` | Reuses Agent API and writes the result to the right AI panel. / 复用 Agent API，结果进入右侧 AI 面板。 |
| Use translation API / 使用独立翻译 API | `api` | Uses Google Cloud Translation or Baidu General Translation and shows a translation modal. Google Translation can use the configured network proxy. / 使用 Google Cloud Translation 或百度通用翻译，并显示翻译弹窗。Google 翻译可使用已配置的网络代理。 |

Translation settings / 翻译设置:

| UI field / UI 字段 | Internal field / 内部字段 | Required when / 何时需要 |
| --- | --- | --- |
| Translation Mode | `translator_mode` | Always / 始终 |
| Target Language | `translator_target_language` | Always / 始终 |
| Translation Provider | `translation_provider` | `api` mode / `api` 模式 |
| Google Project ID | `google_project_id` | Google mode / Google 模式 |
| Google API Key | `google_api_key` | Google mode / Google 模式 |
| Baidu App ID | `baidu_app_id` | Baidu mode / 百度模式 |
| Baidu App Key | `baidu_app_key` | Baidu mode / 百度模式 |

Reserved fields `translator_api_url` and `translator_api_key` exist in internal settings, but the current UI and implementation do not use them. Custom translation HTTP endpoints are not supported yet. The General network proxy applies to Google Cloud Translation when enabled; Baidu translation still uses the direct request path.

内部设置中保留了 `translator_api_url` 和 `translator_api_key`，但当前 UI 和实现没有使用它们；暂不支持自定义翻译 HTTP 接口。启用后，通用网络代理会应用于 Google Cloud Translation；百度翻译仍使用直连请求路径。

## Paragraph Actions / 段落级操作

The PDF text layer groups visible text into action blocks. Detected block kinds include `paragraph`, `heading`, `formula`, `figure`, and `table`.

PDF 文本层会把可见文本聚合为可操作 block。检测类型包括 `paragraph`、`heading`、`formula`、`figure` 和 `table`。

Available actions / 可用操作:

- Translate paragraph. / 翻译段落。
- Ask AI about paragraph. / 针对段落询问 AI。
- Quote paragraph. / 引用段落。
- Reuse cached translation when the same paragraph and target language have already been translated through API mode. / API 模式下，同一段落和目标语言已翻译时复用缓存。

## LaTeX, arXiv, and Symbols / LaTeX、arXiv 与符号

arXiv import accepts an arXiv ID or URL. It can download only the PDF or download the PDF plus LaTeX source from the arXiv e-print archive. Network proxy settings can be used for arXiv downloads, source imports, and Google Cloud Translation.

arXiv 导入接受 arXiv 编号或 URL。可以只下载 PDF，也可以同时从 arXiv e-print 下载 LaTeX 源码。网络代理设置可用于 arXiv 下载、源码导入和 Google Cloud Translation。

LaTeX source can also be attached manually to a PDF document.

PDF 文档也可以手动绑定 LaTeX 源码。

The Symbol Tracker can / 符号追踪器可以:

- Extract symbols and abbreviations from attached LaTeX. / 从绑定的 LaTeX 中抽取符号和缩写。
- Fall back to loaded PDF page text when LaTeX is not available. / 没有 LaTeX 时回退到已加载 PDF 页面文本。
- Track source type: `latex`, `pdf`, or `grobid`. / 记录来源类型：`latex`、`pdf` 或 `grobid`。
- Favorite, edit, delete, regenerate, filter, and jump to PDF anchors when available. / 支持收藏、编辑、删除、重新生成、过滤，并在有锚点时跳转到 PDF。

## Dictionary and Author Network / 词典与作者网络

The local dictionary stores term definitions with optional source document and source anchor IDs. Dictionary entries can appear as hover previews in the reader.

本地词典保存术语定义，并可选关联来源文档和来源锚点。词典条目可在阅读器中以悬停预览显示。

The author network uses local library metadata to build coauthor relationships. It shows local paper counts and closest coauthors. Citation counts, H-index, and advisor lineage require external metadata and are not provided by the local graph.

作者关系图使用本地文库元数据构建合作者关系。它显示本地论文数量和最近合作者；引用数、H-index 和导师谱系需要外部元数据，当前本地图谱不提供。

## Settings / 设置

Settings panels / 设置面板:

- `Settings > General`: interface language, capture image scale, ReaderP history link view, and network proxy for arXiv/Google Translation. / 配置界面语言、截图高清倍数、历史 ReaderP 链接视图，以及 arXiv/Google 翻译使用的网络代理。
- `Settings > Markdown`: default editor mode, Markdown font size, Markdown line height, font family, code font family, code line height, code ligatures, ReaderM edit split default, preview position, code line numbers, highlight syntax/color, math rendering, and live HTML rendering. / 配置默认编辑模式、Markdown 字号、行高、字体、代码字体、代码行高、连字、ReaderM 分屏默认值、预览位置、代码行号、高亮语法/颜色、数学渲染和实时 HTML 渲染。
- `Settings > Agent API`: provider, base URL, model, API key, professional field, research area, summary source, figure attachment limit, and AI context options. / 配置 AI provider、Base URL、模型、API key、专业领域、研究方向、摘要来源、图像附件数量和 AI 上下文选项。
- `Settings > OCR API`: SimpleTex OCR enablement, UAT token, and test OCR. / 配置 SimpleTex OCR 开关、UAT Token，并测试 OCR。
- `Settings > Translation API`: translation mode, target language, Google/Baidu credentials, and test translation. / 配置翻译模式、目标语言、Google/百度凭据，并测试翻译。
- `Settings > File Associations`: bind `.readerp`, `.readerm`, and `.md` files to the app on Windows. / 在 Windows 上将 `.readerp`、`.readerm` 和 `.md` 关联到本应用。
- `Settings > Default System Prompt`: edit reader system prompt. / 编辑阅读器系统提示词。
- `Settings > Default Summary Prompt`: edit summary prompt template. / 编辑摘要提示词模板。

Quote templates / 引用模板:

- `copy_quote_template`: copied Markdown quote. / 复制 Markdown 引用。
- `quote_to_note_template`: text inserted when quoting into notes. / 引用到笔记时插入的文本。
- `quote_to_readerm_template`: source link inserted into ReaderM. / 插入 ReaderM 的来源链接。

Available template variables include `paragraph_content`, `content`, `page_marker`, `passage_name`, `page_number`, `page_label`, and `href`. Simple conditionals such as `{% if passage_name %}...{% endif %}` are supported.

可用模板变量包括 `paragraph_content`、`content`、`page_marker`、`passage_name`、`page_number`、`page_label` 和 `href`。支持 `{% if passage_name %}...{% endif %}` 这样的简单条件。

`docs/key.example.json` is only a placeholder template. If you need file-based local defaults during development, copy it to `docs/key.local.json` and fill your own credentials. `key.local.json` is ignored and should not be committed or distributed.

`docs/key.example.json` 只是占位模板。开发时如需使用文件预填本机默认配置，可复制为 `docs/key.local.json` 并填入自己的凭据。`key.local.json` 已被忽略，不应提交或随发布包分发。

## Local Data and Privacy / 本地数据与隐私

Application data is stored under Electron `app.getPath("userData")`. It includes JSON store, imported PDF copies, Markdown/ReaderM content, LaTeX files, image assets, AI history, annotations, anchors, dictionary entries, symbols, and paragraph translation cache.

应用数据保存在 Electron `app.getPath("userData")` 下，包括 JSON store、导入 PDF 副本、Markdown/ReaderM 内容、LaTeX 文件、图片资产、AI 历史、批注、锚点、词典、符号和段落翻译缓存。

AI, translation, and OCR requests are sent to the configured providers. Local-only reading data stays local unless included in those requests.

AI、翻译和 OCR 请求会发送到用户配置的服务商。本地阅读数据默认留在本机，除非作为上下文被包含进这些请求。

## Menu and Shortcuts / 菜单与快捷键

| Action / 动作 | Menu / 菜单 | Shortcut / 快捷键 |
| --- | --- | --- |
| Import ReaderP / 导入 ReaderP | `File > Import ReaderP` | - |
| Import PDF / 导入 PDF | `File > Create ReaderP from PDF` | `Ctrl+O` |
| Import arXiv / 导入 arXiv | `File > Create ReaderP from arXiv` | `Ctrl+Shift+O` |
| Attach LaTeX / 绑定 LaTeX | `File > Attach LaTeX Source` | - |
| Import ReaderM / 导入 ReaderM | `File > Import ReaderM` | - |
| Create ReaderM / 创建 ReaderM | `File > Create Empty ReaderM` | - |
| Create ReaderM from Markdown / 从 Markdown 创建 ReaderM | `File > Create ReaderM from Markdown` | - |
| Export ReaderP / 导出 ReaderP | `File > Export ReaderP` | `Ctrl+E` |
| Export ReaderM / 导出 ReaderM | `File > Export ReaderM` | - |
| Search loaded pages / 搜索已加载页 | `Edit > Search loaded pages` | `Ctrl+F` |
| Copy quote / 复制引用 | `Edit > Copy quote` | `Ctrl+Shift+C` |
| Quote to note / 引用到笔记 | `Edit > Quote to note` | `Ctrl+Shift+N` |
| Toggle right panel / 切换右侧面板 | `View > Toggle reader panel` | `Ctrl+B` |
| Fullscreen / 全屏 | `View > Toggle fullscreen` | `F11` |
| Select tool / 选择工具 | `Reader > Select` | `Esc` |
| Highlight / 高亮 | `Reader > Highlight` | `Ctrl+H` |
| Underline / 下划线 | `Reader > Underline` | `Ctrl+U` |
| Note / 笔记工具 | `Reader > Note` | `Ctrl+Shift+H` |
| Copy image region / 复制图片区域 | `Reader > Copy image region tool` | `Ctrl+Shift+I` |
| Ask AI / 询问 AI | `Reader > Ask AI selection` | `Ctrl+Shift+A` |
| Translate / 翻译 | `Reader > Translate selection` | `Ctrl+Shift+T` |
| General settings / 通用设置 | `Settings > General` | `Ctrl+,` |
| Open help / 打开帮助 | `Help > Open Help` | `F1` |
| Open API guide / 打开 API 指南 | `Help > API Guide` | - |

On macOS, Electron maps `Ctrl` shortcuts to `Cmd` where `CmdOrCtrl` is used.

在 macOS 上，Electron 会把使用 `CmdOrCtrl` 的快捷键映射为 `Cmd`。
