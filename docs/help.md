# Paper Reader Plus Help / Paper Reader Plus 帮助

Version / 版本：`0.1.0`

Package manifest version / 包清单版本：ReaderP `1`, ReaderM `1`

Runtime / 运行形态：Electron desktop application with Vue, PDF.js, Markdown-it, KaTeX, JSZip, and local JSON storage. / 基于 Electron、Vue、PDF.js、Markdown-it、KaTeX、JSZip 与本地 JSON 存储的桌面应用。

Paper Reader Plus is a standalone academic reading and writing workspace for PDF papers, arXiv papers, LaTeX source, Markdown notes, evidence-linked annotations, AI-assisted reading, translation, and portable ReaderP/ReaderM packages.

Paper Reader Plus 是面向论文阅读、批注、引用整理、AI 辅助理解、翻译和 Markdown 写作的本地桌面工作台。它把 PDF、arXiv、LaTeX 源码、笔记、摘要、锚点、批注、AI 历史和写作引用整合在同一个工作流里。

## Quick Start / 快速开始

1. Import a paper with `File > Create ReaderP from PDF`, drag a `.pdf` file into the start screen, or use `File > Create ReaderP from arXiv`.
2. Read in the central PDF workspace. Use the left sidebar for library, thumbnails, and outline. Use the right panel for annotations, notes, summary, symbols, dictionary, and AI.
3. Select PDF text to copy text, copy a Markdown quote, highlight, underline, add a note, ask AI, translate, or explain with a metaphor.
4. Save notes, summaries, and ReaderM documents from the toolbar or menu. ReaderP/ReaderM packages can be exported when you need to move the work to another machine.
5. Open `Settings > Agent API` and `Settings > Translation API` before using AI or API translation.

1. 通过 `File > Create ReaderP from PDF` 导入论文，也可以把 `.pdf` 拖到启动页，或使用 `File > Create ReaderP from arXiv`。
2. 在中间 PDF 工作区阅读；左侧用于文库、缩略图和大纲，右侧用于批注、笔记、摘要、符号、词典和 AI。
3. 选中 PDF 文本后，可以复制原文、复制 Markdown 引用、高亮、下划线、添加笔记、询问 AI、翻译或用隐喻解释。
4. 通过工具栏或菜单保存笔记、摘要和 ReaderM。需要迁移时导出 `.readerp` 或 `.readerm`。
5. 使用 AI 或 API 翻译前，先配置 `Settings > Agent API` 和 `Settings > Translation API`。

## Supported Files / 支持的文件

- `.pdf`: local PDF papers. / 本地 PDF 论文。
- arXiv ID or URL: downloads PDF and can optionally attach arXiv LaTeX source. / arXiv 编号或链接：下载 PDF，并可选择绑定 arXiv LaTeX 源码。
- `.md`: Markdown notes or Markdown-centered ReaderM source. / Markdown 笔记或 ReaderM 写作源文档。
- `.readerp`: PDF-centered portable reading package. / 以 PDF 阅读为中心的可迁移阅读包。
- `.readerm`: Markdown-centered portable writing package. / 以 Markdown 写作为中心的可迁移写作包。

## Workspace / 工作区

The app is designed for a desktop canvas of at least `1320 x 760`. It is not a mobile layout.

应用面向至少 `1320 x 760` 的桌面画布，不是移动端布局。

Main areas / 主要区域：

- Start screen: import PDF, import arXiv, create blank ReaderM, create ReaderM from Markdown, or drag supported files. / 启动页：导入 PDF、导入 arXiv、创建空 ReaderM、从 Markdown 创建 ReaderM，或拖入支持的文件。
- Left sidebar: local history/library, ReaderP/ReaderM history, PDF thumbnails, and PDF outline. / 左侧栏：本地历史/文库、ReaderP/ReaderM 历史、PDF 缩略图和 PDF 大纲。
- Center workspace: PDF reader, Markdown/ReaderM editor, live preview, and referenced PDF pane. / 中间工作区：PDF 阅读器、Markdown/ReaderM 编辑器、实时预览和引用 PDF 对照窗格。
- Right reader panel: annotations, notes, summary, symbols, dictionary, and AI chat. / 右侧面板：批注、笔记、摘要、符号、词典和 AI 对话。
- Floating tools: selection toolbar, translation result modal, table sheet modal, figure/table preview, author preview, and dictionary preview. / 浮动工具：选区工具栏、翻译结果弹窗、表格视图、图表预览、作者预览和词典预览。

## PDF Reading / PDF 阅读

The PDF reader includes / PDF 阅读器包括：

- Page rendering with current-page and nearby-page lazy loading. / 当前页和附近页面懒加载渲染。
- Zoom in, zoom out, reset zoom, page jump, and scroll reading. / 放大、缩小、重置缩放、页码跳转和滚动阅读。
- Loaded-page search with `Ctrl+F`. / 已加载页面搜索，快捷键为 `Ctrl+F`。
- PDF thumbnails and outline navigation. / PDF 缩略图和大纲导航。
- Text selection for quoting, annotations, AI, and translation. / 文本选区可用于引用、批注、AI 和翻译。
- Internal PDF links and return navigation from preview/reference jumps. / PDF 内部链接跳转，以及预览/引用跳转后的返回。
- Floating preview for references and current page. / 引用和当前页浮动预览。
- Figure/table hover preview and larger inspection. / 图和表的悬停预览与放大查看。
- Table extraction into a spreadsheet-like view with filtering, sorting, row/column deletion, and CSV export. / 表格可打开为类电子表格视图，支持过滤、排序、删除行列和导出 CSV。

PDF extraction quality depends on the PDF text layer. Scanned PDFs or unusual layouts may produce incomplete selection, search, paragraph grouping, or table results.

PDF 抽取质量取决于 PDF 自身文本层。扫描版或复杂排版可能导致选区、搜索、段落聚合或表格结果不完整。

## Annotations and Anchors / 批注与锚点

Annotations are evidence-linked. Each annotation points to an anchor containing page index, percentage-based rectangles, selected quote, optional surrounding text, and optional extracted text position.

批注是证据链接式批注。每条批注指向一个 anchor，anchor 保存页码、百分比坐标矩形、选中文本、可选上下文和可选文本位置。

Supported annotation types / 支持的批注类型：

- Highlight / 高亮
- Underline / 下划线
- Note / 笔记

Annotation features / 批注功能：

- Choose color, add comments, and add comma-separated tags. / 选择颜色、添加评论、添加逗号分隔标签。
- Filter by type, page, color, comment status, and tag status. / 按类型、页码、颜色、是否有评论、是否有标签过滤。
- Jump from an annotation back to the PDF location. / 从批注跳回 PDF 原位置。
- Undo the last annotation. / 撤销最近一次批注。
- Copy selected text or copy a Markdown quote with a `/reader?documentId=...&anchor=...` link. / 复制选中文本，或复制带 `/reader?documentId=...&anchor=...` 链接的 Markdown 引用。
- Quote selected text directly into notes. / 将选中文本直接引用到笔记。

## Notes, Summary, and Markdown / 笔记、摘要与 Markdown

The right panel contains separate Notes and Summary editors. Markdown rendering supports headings, paragraphs, lists, blockquotes, tables, code blocks, KaTeX math, safe links, local image assets, and reader anchor links.

右侧面板提供独立的笔记和摘要编辑区。Markdown 渲染支持标题、段落、列表、引用、表格、代码块、KaTeX 公式、安全链接、本地图片资产和 reader anchor link。

Reader anchor links use this shape / Reader anchor link 形态：

```text
/reader?documentId=...&anchor=...
```

PDF regions can be captured into Markdown assets. In ReaderM, the right PDF pane can insert selected PDF regions back into the Markdown document.

PDF 区域可以截取为 Markdown 图片资产。在 ReaderM 中，右侧 PDF 对照窗格可将选中的 PDF 区域插回 Markdown 文档。

## ReaderP / ReaderP 阅读包

ReaderP is the PDF-centered package format. Its manifest format is `paper-reader-plus.readerp`, version `1`.

ReaderP 是以 PDF 为中心的阅读包格式。manifest format 为 `paper-reader-plus.readerp`，版本为 `1`。

ReaderP can include / ReaderP 可包含：

- `manifest.json`: package metadata, document ID, title, file name, package mode, timestamps, and file map. / 包元数据、文档 ID、标题、文件名、包模式、时间戳和文件映射。
- `document.pdf` or `pdfs/<documentId>.pdf`: one or more PDF files. / 一个或多个 PDF 文件。
- `sources/<documentId>.tex`: attached LaTeX source when available. / 可用时附带的 LaTeX 源码。
- `documents.json`: related document metadata for markdown-centered package mode. / markdown-centered 包模式中的关联文档元数据。
- `notes.md`, `summary.md`, `ai-history.json`. / 笔记、摘要、AI 历史。
- `anchors.json`, `annotations.json`, `symbols.json`. / 锚点、批注、符号。
- `assets/` and optional `assets/assets.json`. / 图片资产和可选资产清单。

ReaderP is best for moving one paper and its reading state as a portable archive.

ReaderP 适合把一篇论文及其阅读状态作为完整归档迁移。

## ReaderM / ReaderM 写作包

ReaderM is the Markdown-centered writing package. Its manifest format is `paper-reader-plus.readerm`, version `1`, and package mode is `markdown-centered`.

ReaderM 是以 Markdown 为中心的写作包。manifest format 为 `paper-reader-plus.readerm`，版本为 `1`，包模式为 `markdown-centered`。

ReaderM can include / ReaderM 可包含：

- `readerm.md`: the main Markdown document. / 主 Markdown 文档。
- `documents.json`: referenced local documents. / 被引用的本地文档。
- `references.json`: resolved and unresolved reader links. / 已解析和未解析的 reader link。
- `anchors.json`, `annotations.json`, `symbols.json`. / 锚点、批注、符号。
- `pdfs/<documentId>.pdf` and `sources/<documentId>.tex`. / 被 Markdown 引用的 PDF 和 LaTeX 源码。
- `assets/`: images used by the Markdown document. / Markdown 使用的图片。

ReaderM reference links use `/reader?documentId=...&anchor=...`. The reference index reports whether each link is resolved, missing its document, or missing its anchor. Selecting a reference opens the corresponding PDF in the right pane when possible. Save ReaderM to refresh the reference index after editing links.

ReaderM 引用链接使用 `/reader?documentId=...&anchor=...`。引用索引会显示每个链接是否已解析、缺失文档或缺失锚点。选择引用后，会尽量在右侧窗格打开对应 PDF。编辑链接后保存 ReaderM 可刷新引用索引。

## AI Reading / AI 阅读

The AI panel and selection actions use an OpenAI-compatible chat completions API. The current UI preset provider is `volcengine`; the service layer currently accepts only `agent_api_type = chat`.

AI 面板和选区动作使用 OpenAI-compatible chat completions API。当前 UI 预设 provider 为 `volcengine`；服务层当前只接受 `agent_api_type = chat`。

AI settings / AI 设置字段：

- Provider: currently Volcengine Ark. / Provider：当前为 Volcengine Ark。
- API type: currently Chat completions only. / API 类型：当前仅 Chat completions。
- Base URL, API key, and model. / Base URL、API Key 和模型名。
- Professional field, research area, answer language. / 专业领域、研究方向、回答语言。
- Reader system prompt and summary template. / 阅读器系统提示词和摘要模板。
- Summary source: `pdf-extractor`, `pdf-direct`, or `latex`. / 摘要来源：`pdf-extractor`、`pdf-direct` 或 `latex`。
- Figure attachment limit for summary requests. / 摘要请求的图像附件数量限制。

AI tasks / AI 任务：

- Free-form chat about the active paper. / 围绕当前论文自由对话。
- Ask AI about selected text or a detected paragraph block. / 对选中文本或检测到的段落提问。
- Translate a selection through AI mode. / 使用 AI 模式翻译选区。
- Explain a selection with a metaphor. / 用隐喻解释选区。
- Generate or update an AI summary. / 生成或更新 AI 摘要。
- Use evidence context from anchors, annotations, notes, summary, loaded text, and selected text. / 使用来自锚点、批注、笔记、摘要、已加载文本和选区的证据上下文。
- Attach figure images to summary requests when configured. / 配置允许时，为摘要请求附带图像。

Prompt templates are stored under `docs/*.j2`: `system.j2`, `literature-read.j2`, `literature-translate.j2`, and `literature-metaphor.j2`.

提示词模板位于 `docs/*.j2`：`system.j2`、`literature-read.j2`、`literature-translate.j2` 和 `literature-metaphor.j2`。

## Translation / 翻译

Translation supports two modes / 翻译支持两种模式：

| Mode | Internal value | Behavior |
| --- | --- | --- |
| Use AI chat API / 使用 AI 对话 API | `ai` | Reuses Agent API and writes the result to the right AI panel. / 复用 Agent API，结果进入右侧 AI 面板。 |
| Use translation API / 使用独立翻译 API | `api` | Uses Google Cloud Translation or Baidu General Translation and shows a translation modal. / 使用 Google Cloud Translation 或百度通用翻译，并显示翻译弹窗。 |

Translation settings / 翻译设置：

| UI field / UI 字段 | Internal field / 内部字段 | Required when / 何时需要 |
| --- | --- | --- |
| Translation Mode | `translator_mode` | Always / 始终 |
| Target Language | `translator_target_language` | Always / 始终 |
| Translation Provider | `translation_provider` | `api` mode / `api` 模式 |
| Google Project ID | `google_project_id` | Google mode / Google 模式 |
| Google API Key | `google_api_key` | Google mode / Google 模式 |
| Baidu App ID | `baidu_app_id` | Baidu mode / 百度模式 |
| Baidu App Key | `baidu_app_key` | Baidu mode / 百度模式 |

Reserved fields `translator_api_url` and `translator_api_key` exist in internal settings, but the current UI and implementation do not use them. Custom translation HTTP endpoints are not supported yet.

内部设置中保留了 `translator_api_url` 和 `translator_api_key`，但当前 UI 和实现没有使用它们；暂不支持自定义翻译 HTTP 接口。

### Google Cloud Translation

When `Translation Mode = Use translation API` and `Translation Provider = Google Cloud Translation`, fill:

- `Target Language`
- `Google Project ID`
- `Google API Key`

The app calls / 程序调用：

```text
POST https://translation.googleapis.com/v3/projects/{google_project_id}:translateText?key={google_api_key}
Content-Type: application/json
```

Request body / 请求体：

```json
{
  "contents": ["selected text"],
  "sourceLanguageCode": "auto",
  "targetLanguageCode": "zh-CN",
  "mimeType": "text/plain"
}
```

Common target mapping / 常用目标语言映射：

| Input | Google value |
| --- | --- |
| `Chinese`, `中文`, `zh`, `zh-CN` | `zh-CN` |
| `English`, `英文`, `en`, `en-US` | `en` |
| Other values / 其他值 | Passed through / 原样传递 |

### Baidu General Translation / 百度通用翻译

When `Translation Mode = Use translation API` and `Translation Provider = Baidu General Translation`, fill:

- `Target Language`
- `Baidu App ID`
- `Baidu App Key`

The app calls / 程序调用：

```text
POST https://fanyi-api.baidu.com/api/trans/vip/translate
Content-Type: application/x-www-form-urlencoded
```

Form fields / 表单字段：

| Field | Value |
| --- | --- |
| `q` | Text to translate / 待翻译文本 |
| `from` | `auto` |
| `to` | Target language code / 目标语言代码 |
| `appid` | `baidu_app_id` |
| `salt` | Random integer string / 随机数字字符串 |
| `sign` | `md5(appid + q + salt + appkey)` |

Common target mapping / 常用目标语言映射：

| Input | Baidu value |
| --- | --- |
| `Chinese`, `中文`, `zh`, `zh-CN` | `zh` |
| `English`, `英文`, `en`, `en-US` | `en` |
| Other values / 其他值 | Passed through / 原样传递 |

Common Baidu codes / 常用百度代码：`auto`, `zh`, `en`, `jp`, `kor`, `fra`, `spa`, `ru`, `de`, `it`, `pt`, `cht`.

### Selection vs Paragraph Translation / 选区翻译与段落翻译

Selection translation is triggered manually from the selection toolbar, `Reader > Translate selection`, or `Ctrl+Shift+T`.

选区翻译由选区工具栏、`Reader > Translate selection` 或 `Ctrl+Shift+T` 手动触发。

Paragraph translation uses PDF text-layer paragraph blocks. When `translator_mode = api`, paragraph translations are cached by:

段落翻译使用 PDF 文本层聚合出的段落 block。当 `translator_mode = api` 时，段落翻译缓存键包括：

- `document_id`
- `page_index`
- `source_hash`
- `target_language`
- `provider`

AI-mode paragraph translation does not use this API translation cache.

AI 模式下的段落翻译不走该 API 翻译缓存。

## Paragraph Actions / 段落级操作

The PDF text layer groups visible text into action blocks. Detected block kinds include `paragraph`, `heading`, `formula`, `figure`, and `table`.

PDF 文本层会把可见文本聚合为可操作 block。检测类型包括 `paragraph`、`heading`、`formula`、`figure` 和 `table`。

Available actions / 可用操作：

- Translate paragraph. / 翻译段落。
- Ask AI about paragraph. / 针对段落询问 AI。
- Quote paragraph. / 引用段落。
- Reuse cached translation when the same paragraph and target language have already been translated through API mode. / API 模式下，同一段落和目标语言已翻译时复用缓存。

## LaTeX, arXiv, and Symbols / LaTeX、arXiv 与符号

arXiv import accepts an arXiv ID or URL. It can download only the PDF or download the PDF plus LaTeX source from the arXiv e-print archive. Network proxy settings can be used for arXiv downloads and source imports.

arXiv 导入接受 arXiv 编号或 URL。可以只下载 PDF，也可以同时从 arXiv e-print 下载 LaTeX 源码。网络代理设置可用于 arXiv 下载和源码导入。

LaTeX source can also be attached manually to a PDF document.

PDF 文档也可以手动绑定 LaTeX 源码。

The Symbol Tracker can / 符号追踪器可以：

- Extract symbols and abbreviations from attached LaTeX. / 从绑定的 LaTeX 中抽取符号和缩写。
- Fall back to loaded PDF page text when LaTeX is not available. / 没有 LaTeX 时回退到已加载 PDF 页面文本。
- Track source type: `latex`, `pdf`, or `grobid`. / 记录来源类型：`latex`、`pdf` 或 `grobid`。
- Store symbol, normalized symbol, kind, definition, source, page, rectangle, paragraph, LaTeX line, confidence, favorite status, deletion status, and user-modified status. / 保存符号、规范化符号、类型、定义、来源、页码、矩形、段落、LaTeX 行号、置信度、收藏状态、删除状态和用户修改状态。
- Regenerate symbols with progress, filter by kind/favorite, favorite/edit/delete entries, and set a PDF anchor from current selection. / 带进度重新生成，按类型/收藏过滤，收藏/编辑/删除，并从当前选区设置 PDF 锚点。
- Jump from a symbol to its PDF location when an anchor is available. / 有锚点时从符号跳到 PDF 位置。

## Dictionary and Author Network / 词典与作者网络

The local dictionary stores term definitions with optional source document and source anchor IDs. Dictionary entries can appear as hover previews in the reader.

本地词典保存术语定义，并可选关联来源文档和来源锚点。词典条目可在阅读器中以悬停预览显示。

The author network uses local library metadata to build coauthor relationships. It shows local paper counts and closest coauthors. Citation counts, H-index, and advisor lineage require external metadata and are not provided by the local graph.

作者关系图使用本地文库元数据构建合作者关系。它显示本地论文数量和最近合作者；引用数、H-index 和导师谱系需要外部元数据，当前本地图谱不提供。

## Settings / 设置

Settings panels / 设置面板：

- `Settings > Agent API`: provider, base URL, model, API key, professional field, research area, summary source, figure attachment limit. / 配置 AI provider、Base URL、模型、API key、专业领域、研究方向、摘要来源和图像附件数量。
- `Settings > Translation API`: translation mode, target language, Google/Baidu credentials, and test translation. / 配置翻译模式、目标语言、Google/百度凭据，并测试翻译。
- `Settings > Network Proxy`: proxy for arXiv downloads and source imports. / 配置 arXiv 下载和源码导入代理。
- `Settings > File Associations`: bind `.readerp` and `.readerm` files to the app on Windows. / 在 Windows 上将 `.readerp` 和 `.readerm` 关联到本应用。
- `Settings > Default System Prompt`: edit reader system prompt. / 编辑阅读器系统提示词。
- `Settings > Default Summary Prompt`: edit summary prompt template. / 编辑摘要提示词模板。

`docs/key.example.json` is only a placeholder template. If you need file-based local defaults during development, copy it to `docs/key.local.json` and fill your own credentials. `key.local.json` is ignored and should not be committed or distributed.

`docs/key.example.json` 只是占位模板。开发时如需用文件预填本机默认配置，可复制为 `docs/key.local.json` 并填入自己的凭据。`key.local.json` 已被忽略，不应提交或随分发包发布。

## Local Data and Privacy / 本地数据与隐私

Application data is stored under Electron `app.getPath("userData")`. It includes JSON store, imported PDF copies, Markdown/ReaderM content, LaTeX files, image assets, AI history, annotations, anchors, dictionary entries, symbols, and paragraph translation cache.

应用数据保存在 Electron `app.getPath("userData")` 下，包括 JSON store、导入 PDF 副本、Markdown/ReaderM 内容、LaTeX 文件、图片资产、AI 历史、批注、锚点、词典、符号和段落翻译缓存。

AI and translation requests are sent to the configured providers. Local-only reading data stays local unless included in those requests.

AI 和翻译请求会发送到用户配置的服务商。本地阅读数据默认留在本机，除非作为上下文被包含进这些请求。

## Menu and Shortcuts / 菜单与快捷键

| Action / 动作 | Menu / 菜单 | Shortcut / 快捷键 |
| --- | --- | --- |
| Import PDF / 导入 PDF | `File > Create ReaderP from PDF` | `Ctrl+O` |
| Import arXiv / 导入 arXiv | `File > Create ReaderP from arXiv` | `Ctrl+Shift+O` |
| Export ReaderP / 导出 ReaderP | `File > Export ReaderP` | `Ctrl+E` |
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
| Agent settings / Agent 设置 | `Settings > Agent API` | `Ctrl+,` |
| Open help / 打开帮助 | `Help > Open Help` | `F1` |

On macOS, Electron maps `Ctrl` shortcuts to `Cmd` where `CmdOrCtrl` is used.

在 macOS 上，Electron 会把使用 `CmdOrCtrl` 的快捷键映射为 `Cmd`。

## Limitations / 当前限制

- Desktop layout only; narrow mobile layouts are not a target. / 主要面向桌面布局，不以窄屏移动端为目标。
- PDF extraction depends on the PDF text layer. / PDF 文本抽取取决于 PDF 自身文本层。
- Paragraph, figure, table, and LaTeX source matching use heuristic rules. / 段落、图、表和 LaTeX 原文定位使用启发式规则。
- AI API currently supports chat completions only; `responses` is reserved in types but not implemented. / AI API 当前只支持 chat completions；`responses` 在类型中预留但未实现。
- `pdf-direct` summary requires the configured provider/model to support the app's direct PDF or multimodal request shape. / `pdf-direct` 摘要要求所配置 provider/model 支持应用当前的 PDF 或多模态请求形态。
- Custom translation API URL/key fields are reserved but unused. / 自定义翻译 API URL/key 字段已预留但未使用。
- Translation API requests do not have a dedicated proxy setting. / 翻译 API 请求没有单独代理设置。
- Author graph is local-library based and does not include external citation metrics. / 作者图谱基于本地文库，不包含外部引用指标。
