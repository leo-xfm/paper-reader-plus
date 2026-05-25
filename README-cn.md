# Paper Reader Plus

简体中文 | [English](README.md)

Paper Reader Plus 是一个面向学术论文阅读、批注、翻译和写作的桌面工作区。它把 PDF 阅读器、Markdown 编辑器、证据链接笔记、AI 助手、翻译工具，以及可迁移的 ReaderP/ReaderM 包整合在一个本地 Electron 应用中。

## 版本

当前应用版本：`0.2.3`

包清单版本：ReaderP `1`，ReaderM `1`

## 0.2.3 更新内容

- 新增 PDF 设置面板，可控制段落操作、作者图谱悬停，以及内部 PDF 链接 / 图 / 表预览。
- 新增 AI 最大输出 token 设置。数值大于 `0` 时会作为 `max_tokens` 发送到普通聊天和流式请求。
- 新增 Live Markdown 列表折叠，支持单个列表切换，也支持通过工具栏全部展开或全部折叠。
- PDF、Markdown、表格和图片工具栏新增“更多工具”弹出菜单，在较窄工作区中也能访问次级操作。
- 左侧文库侧栏支持拖拽调整宽度；设置弹窗改为草稿编辑，点击保存前不会写入正式设置。
- 扩展了新设置的中英文界面文案、迁移逻辑和测试覆盖。

## 概览

### ReaderP 阅读工作区

ReaderP 将 PDF、文库历史、批注工具和证据链接 Markdown 笔记放在同一个工作区中。

![ReaderP 阅读工作区，包含 PDF 选区工具、链接笔记和 Markdown 预览](docs/screenshots/readerp_workspace1.png)

选区动作可以把论文上下文发送给 AI，翻译或解释选中文本，并把回答链接回精确的 PDF 位置。

![ReaderP 工作区，展示 AI 解释、PDF 选中文本和内部 PDF 链接预览](docs/screenshots/readerp_workspace2.png)

阅读器大纲、浮动选区动作和批注列表可以帮助你复查证据并快速返回重点段落。

![ReaderP 工作区，展示 PDF 大纲、选区动作和批注列表](docs/screenshots/readerm_workspace3.png)

### ReaderM 写作工作区

ReaderM 提供以 Markdown 为中心的写作模式，支持实时渲染、公式辅助工具和并排来源窗格。

![ReaderM 实时 Markdown 工作区，包含公式工具和引用 PDF 来源窗格](docs/screenshots/readerm_workspace1.png)

ReaderM 文档可以组合渲染表格、高亮代码、丰富 Markdown 内容，并在 PDF、笔记和摘要之间进行来源导航。

![ReaderM 实时 Markdown 工作区，包含表格、代码块和引用摘要来源](docs/screenshots/readerm_workspace2.png)

## 功能

- 本地论文文库：将 `.pdf`、`.md`、`.readerp` 和 `.readerm` 文件导入本地 Electron `userData` 工作区。
- PDF 阅读：滚动阅读论文、缩放、跳页、搜索已加载页面、查看缩略图和大纲、跟随 PDF 内部链接、从跳转位置返回，并可按需关闭段落操作、作者图谱悬停或内部链接 / 图 / 表预览。
- 证据锚点：从笔记和 AI 输出创建稳定链接，使用 `/reader?documentId=...&anchor=...` 回到精确 PDF 位置。
- 批注：高亮、下划线、添加笔记、将选中文本引用到 Markdown、询问 AI 或翻译选中文本。
- 段落动作：检测可见 PDF 文本块，并对段落内容执行引用、翻译或询问 AI。
- Markdown 写作：使用 CodeMirror 驱动的 Markdown 编辑，支持 Live 模式列表折叠、KaTeX 公式、Mermaid 图、提示块、任务列表、表格、安全 HTML 块、带可选行号的代码块、语法高亮、安全链接、本地图片资产、图片尺寸标记、图注和 reader 锚点链接。
- ReaderP 包：将以 PDF 为中心的阅读会话、笔记、摘要、AI 历史、锚点、批注、符号和引用资产保存为可迁移的 `.readerp` 文件。
- ReaderM 包：将以 Markdown 为中心的写作项目、关联论文引用、锚点、批注、符号、资产和编辑/预览分屏工作流保存为可迁移的 `.readerm` 文件。
- AI 阅读助手：使用 OpenAI-compatible Chat Completions API 进行论文问答、选区解释、摘要、翻译、隐喻解释、证据链接回答，并可配置回复 token 上限。
- 翻译模式：通过 AI provider 翻译，或使用 Google Cloud Translation / 百度通用翻译集成。
- 公式 OCR：配置后可通过 SimpleTex OCR 识别选中的 PDF 公式区域。
- 引用模板：使用 `paragraph_content`、`page_marker`、`passage_name`、`page_number`、`page_label` 和 `href` 等变量自定义复制引用、笔记标记和 ReaderM 来源链接。
- 网络代理：启用后可为 arXiv 下载、源码导入和 Google Cloud Translation 使用配置的 HTTP 代理。
- arXiv 支持：导入 arXiv PDF，并在可用时绑定 LaTeX 源码。
- 符号追踪：从 PDF 和 LaTeX 上下文中提取并管理论文符号或缩写。
- 图表辅助：预览图和表，检查抽取的表格内容，并打开类似电子表格的表格视图。
- 本地词典：保存定义，并将术语链接回来源文档或锚点。
- 作者网络预览：从导入文库元数据中查看本地作者关系。
- 双语界面：渲染器文本、Electron 菜单和常见对话框支持系统语言、英文和简体中文。

## API 配置

在应用中打开 `Help > API Guide` 可查看逐步配置说明。该指南也存放在 `docs/api.md`。

应用支持：

- Agent API：OpenAI-compatible Chat Completions 端点，用于 AI 阅读、选区问答、摘要、AI 翻译和隐喻解释。
- Translation API：当 `Translation Mode` 设置为 API 模式时，可使用 Google Cloud Translation 或百度通用翻译。
- OCR API：SimpleTex LaTeX OCR Turbo，用于识别选中 PDF 区域中的公式。

配置保存在本地应用设置中。不要提交真实 API key；`docs/key.example.json` 只是开发模板，`docs/key.local.json` 应保持为本地文件。

## 数据存储

运行时数据保存在 Electron 的 `app.getPath("userData")` 目录中。Windows 上通常是：

```text
C:\Users\<user>\AppData\Roaming\Paper Reader Plus
```

该目录包含：

```text
paper-reader-plus.json      # 文库记录、笔记、摘要、设置、AI 历史、锚点、批注
library\                    # 导入文档副本
library-assets\             # 本地 Markdown 图片资产
```

安装或更新应用不会自动删除这些数据。若要手动重置应用，请关闭 Paper Reader Plus 并删除用户数据目录。

内置提示词模板和帮助文件位于 `docs/`，包括 `help.md`、`api.md` 和 `*.j2` 提示词模板。打包时，`docs` 目录会复制到应用资源中，以便安装版也能使用模板、API 指南和示例配置。

## Markdown 参考

Paper Reader Plus 使用源码优先的 Markdown。编辑器以原始 Markdown 文本作为事实来源，同时在 live 模式和 preview 模式中渲染常见结构。

支持的扩展包括：

- 通过 KaTeX 渲染 `$...$` 行内公式和 `$$` 块级公式。
- 使用 `mermaid` 代码围栏渲染 Mermaid 图。
- GitHub 风格提示块，如 `> [!NOTE]`、`> [!TIP]`、`> [!IMPORTANT]`、`> [!WARNING]` 和 `> [!CAUTION]`。
- 使用 `- [ ]` 和 `- [x]` 的任务列表。
- 启用 Markdown 高亮后支持 `==highlighted text==` 语法。
- 本地和远程图片链接、来自 Markdown title 的图注，以及 `![alt](assets/image.png =320x)` 这样的尺寸标记。
- 启用实时 HTML 渲染后，支持经过清理的 details、图片、表格、媒体和简单布局 HTML 块。
- Reader 链接，如 `/reader?documentId=...&anchor=...`、`readerp://...` 和 `readerm://...`。

## 开发

安装依赖：

```bash
npm install
```

以开发模式运行应用：

```bash
npm run dev
```

构建渲染器和 Electron 主进程：

```bash
npm run build
```

运行测试：

```bash
npm run test
```

从现有构建产物启动：

```bash
npm start
```

## 打包

创建未打包的 Windows 应用目录：

```bash
npm run package
```

创建 Windows 安装程序：

```bash
npm run dist
```

构建产物输出到：

```text
release/
```

## 许可证

Paper Reader Plus 使用 PolyForm Noncommercial License 1.0.0。
你可以在非商业目的下使用、复制、修改和分发它。
商业使用需要单独授权。

## 项目结构

```text
paper-reader-plus/
  electron/                  Electron 主进程、preload、IPC、打包服务
  electron/ipc/              文档、文库、资产、批注、设置和 ReaderM IPC
  electron/services/         AI、翻译、arXiv、帮助、docs 配置、健康检查和维护服务
  src/                       Vue 渲染器应用
  src/components/            PDF 阅读器、侧栏、面板、编辑器、弹窗和预览
  src/composables/           文档生命周期、PDF、AI、翻译、批注和预览逻辑
  src/pdf/                   PDF 视口、坐标、引用、文本和渲染工具
  src/services/              锚点、批注、Markdown、AI、词典、符号和表格等渲染端领域逻辑
  src/vendor/                渲染器使用的 vendored 编辑器集成
  src/styles/                领域相关 CSS 模块
  tests/                     服务、IPC 合约、PDF 逻辑、包和迁移的 Vitest 覆盖
  docs/                      帮助内容、API 指南、提示词模板和示例 key 配置
  icon/                      应用图标
  dist/                      Vite 构建输出
  dist-electron/             Electron TypeScript 构建输出
  release/                   electron-builder 输出
```

## 贡献说明

- 渲染器代码通过 `window.paperReaderPlus` 调用本地能力，不应直接读写本地文件系统路径。
- IPC channel 名称遵循 `domain:action` 约定。
- 持久化 schema 变更应同时更新共享类型、preload typings、IPC handlers、store migration 和测试。
- PDF 坐标、文本层、锚点和批注逻辑应放在专用 service 或 `src/pdf/` 工具中，不要在 Vue 组件中重复转换。
- 样式应放在对应的 `src/styles/` 文件中，全局 token 和基础样式位于 `src/style.css`。
