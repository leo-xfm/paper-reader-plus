# Paper Reader Plus

Paper Reader Plus is a desktop workspace for reading, annotating, translating, and writing around academic papers. It combines a PDF reader, Markdown editor, evidence-linked notes, AI assistance, translation tools, and portable ReaderP/ReaderM packages in one local Electron app.

The current interface is designed for desktop use. The main window expects a wide layout and has a minimum size of `1320 x 760`.

## Features

- Local paper library: import `.pdf`, `.md`, `.readerp`, and `.readerm` files into a local Electron `userData` workspace.
- PDF reading: scroll through papers, zoom, jump to pages, search loaded pages, view thumbnails and outlines, follow internal PDF links, and navigate back to previous positions.
- Evidence anchors: create stable links from notes and AI output back to exact PDF locations with `/reader?documentId=...&anchor=...` links.
- Annotations: highlight, underline, add notes, quote selected text into Markdown, ask AI about a selection, or translate selected text.
- Paragraph actions: detect visible PDF text blocks and run actions such as quote, translate, or ask AI on paragraph-level content.
- Markdown writing: write notes and ReaderM documents with Markdown, KaTeX math, tables, code blocks, safe links, local image assets, and reader anchor links.
- ReaderP packages: save PDF-centered reading sessions, notes, summaries, AI history, anchors, annotations, symbols, and referenced assets into portable `.readerp` files.
- ReaderM packages: save Markdown-centered writing projects with linked paper references, anchors, annotations, symbols, and assets into portable `.readerm` files.
- AI reading assistant: use an OpenAI-compatible chat completion API for paper Q&A, selection explanations, summaries, translations, metaphor explanations, and evidence-linked answers.
- Translation modes: translate with the AI provider or dedicated Google Cloud Translation / Baidu General Translation integrations.
- arXiv support: import arXiv PDFs and bind LaTeX source files when available.
- Symbol tracking: extract and manage paper symbols or abbreviations from PDF and LaTeX context.
- Figure and table assistance: preview figures and tables, inspect extracted table content, and open spreadsheet-style table views.
- Local dictionary: save definitions and link terms back to source documents or anchors.
- Author network preview: inspect local author relationships from the imported library metadata.
- Bilingual UI: renderer text and Electron menus support system language, English, and Simplified Chinese.

## Data Storage

Runtime data is stored in Electron's `app.getPath("userData")` directory. On Windows this is typically:

```text
C:\Users\<user>\AppData\Roaming\Paper Reader Plus
```

This directory contains:

```text
paper-reader-plus.json      # library records, notes, summaries, settings, AI history, anchors, annotations
library\                    # imported document copies
library-assets\             # local Markdown image assets
```

Installing or updating the app does not automatically remove this data. To reset the app manually, close Paper Reader Plus and delete the user data directory.

Built-in prompt templates and help files live in `docs/`. During packaging, the `docs` directory is copied into the app resources so templates and examples are available in installed builds.

## Development

Install dependencies:

```bash
npm install
```

Run the app in development mode:

```bash
npm run dev
```

Build the renderer and Electron main process:

```bash
npm run build
```

Run tests:

```bash
npm run test
```

Start from existing build output:

```bash
npm start
```

## Packaging

Create an unpacked Windows app directory:

```bash
npm run package
```

Create a Windows installer:

```bash
npm run dist
```

Build outputs are written to:

```text
release/
```

## License

Paper Reader Plus is licensed under the PolyForm Noncommercial License 1.0.0.
You may use, copy, modify, and distribute it for noncommercial purposes only.
Commercial use requires separate permission.

## Project Structure

```text
paper-reader-plus/
  electron/                  Electron main process, preload, IPC, packaging services
  electron/ipc/              Document, library, asset, annotation, settings, and ReaderM IPC
  electron/services/         AI, translation, arXiv, help, docs config, health, and maintenance services
  src/                       Vue renderer application
  src/components/            PDF reader, sidebars, panels, editor, modals, and previews
  src/composables/           Document lifecycle, PDF, AI, translation, annotation, and preview logic
  src/pdf/                   PDF viewport, coordinates, references, text, and rendering utilities
  src/services/              Renderer-side domain logic for anchors, annotations, Markdown, AI, dictionary, symbols, tables
  src/styles/                Domain-specific CSS modules
  tests/                     Vitest coverage for services, IPC contracts, PDF logic, packages, and migrations
  docs/                      Help content, prompt templates, and example key configuration
  icon/                      Application icons
  dist/                      Vite build output
  dist-electron/             Electron TypeScript build output
  release/                   electron-builder output
```

## Notes for Contributors

- Renderer code calls local capabilities through `window.paperReaderPlus`; it should not directly read or write local filesystem paths.
- IPC channel names follow a `domain:action` convention.
- Persistent schema changes should update shared types, preload typings, IPC handlers, store migration, and tests together.
- Keep PDF coordinate, text-layer, anchor, and annotation logic in dedicated services or `src/pdf/` utilities instead of duplicating conversions inside Vue components.
- Keep styling in the relevant `src/styles/` file, with global tokens and base styles in `src/style.css`.
