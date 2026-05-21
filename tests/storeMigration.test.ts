import { describe, expect, it } from "vitest";
import { migrateStoreToV3, STORE_SCHEMA_VERSION } from "../electron/storeMigration";

describe("store migration", () => {
  it("migrates legacy anchors and annotations to v2 targets", () => {
    const migrated = migrateStoreToV3({
      documents: [{ document_id: "doc-1", title: "Paper" }],
      notes: { "doc-1": { content: "note", updated_at: "2026-01-01T00:00:00.000Z" } },
      summaries: {},
      anchors: [{
        anchor_id: "anc-1",
        document_id: "doc-1",
        page_index: 3,
        rects_pct: [{ left: 0.1, top: 0.2, width: 0.3, height: 0.04 }],
        text_quote: { exact: "quoted text" },
        created_from: "selection",
        metadata: { font: "serif" },
        created_at: "2026-01-01T00:00:00.000Z",
      }],
      annotations: [{
        annotation_id: "ann-1",
        document_id: "doc-1",
        anchor_id: "anc-1",
        type: "highlight",
        color: "#FDE68A",
        page_index: 3,
        rects_pct: [{ left: 0.1, top: 0.2, width: 0.3, height: 0.04 }],
        text_quote: { exact: "quoted text" },
        comment: "comment",
        tags: ["tag"],
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      }],
      settings: {},
    });

    expect(migrated.schema_version).toBe(STORE_SCHEMA_VERSION);
    expect(migrated.anchors[0].text_quote).toEqual({ exact: "quoted text", prefix: undefined, suffix: undefined });
    expect(migrated.annotations[0]).toMatchObject({
      annotation_id: "ann-1",
      sort_index: "000003:2026-01-01T00:00:00.000Z:ann-1",
      target: {
        rects_pct: [{ left: 0.1, top: 0.2, width: 0.3, height: 0.04 }],
        text_quote: { exact: "quoted text" },
      },
    });
    expect("rects_pct" in migrated.annotations[0]).toBe(false);
    expect("text_quote" in migrated.annotations[0]).toBe(false);
    expect(migrated.paragraph_translations).toEqual({});
    expect(migrated.settings.summary_figure_attachment_limit).toBe(10);
    expect(migrated.settings.summary_text_char_limit).toBe(120000);
    expect(migrated.settings.markdown_western_font_family).toBe("current");
    expect(migrated.settings.markdown_chinese_font_family).toBe("current");
    expect(migrated.settings.markdown_code_font_family).toBe("Consolas");
    expect(migrated.settings.markdown_line_height).toBe(1.6);
    expect(migrated.settings.markdown_code_font_scale).toBe(0.86);
    expect(migrated.settings.markdown_code_line_height).toBe(1.22);
    expect(migrated.settings.markdown_code_ligatures).toBe(true);
    expect(migrated.settings.markdown_html_live_enabled).toBe(true);
    expect(migrated.settings.markdown_default_editor_mode).toBe("live");
    expect(migrated.settings.simpletex_ocr_token).toBe("");
    expect(migrated.settings.simpletex_ocr_enabled).toBe(false);
  });

  it("clamps markdown line height settings", () => {
    expect(migrateStoreToV3({ settings: { markdown_line_height: 3 } }).settings.markdown_line_height).toBe(2.2);
    expect(migrateStoreToV3({ settings: { markdown_line_height: 0.8 } }).settings.markdown_line_height).toBe(1.1);
    expect(migrateStoreToV3({ settings: { markdown_line_height: "bad" } }).settings.markdown_line_height).toBe(1.6);
  });

  it("clamps markdown code typography settings", () => {
    expect(migrateStoreToV3({ settings: { markdown_code_font_scale: 2 } }).settings.markdown_code_font_scale).toBe(1.1);
    expect(migrateStoreToV3({ settings: { markdown_code_font_scale: 0.2 } }).settings.markdown_code_font_scale).toBe(0.7);
    expect(migrateStoreToV3({ settings: { markdown_code_font_scale: "bad" } }).settings.markdown_code_font_scale).toBe(0.86);
    expect(migrateStoreToV3({ settings: { markdown_code_line_height: 3 } }).settings.markdown_code_line_height).toBe(1.8);
    expect(migrateStoreToV3({ settings: { markdown_code_line_height: 0.5 } }).settings.markdown_code_line_height).toBe(1);
    expect(migrateStoreToV3({ settings: { markdown_code_line_height: "bad" } }).settings.markdown_code_line_height).toBe(1.22);
  });

  it("migrates and cleans split markdown body font settings", () => {
    expect(migrateStoreToV3({ settings: { markdown_font_family: "Georgia" } }).settings).toMatchObject({
      markdown_western_font_family: "Georgia",
      markdown_chinese_font_family: "current",
    });
    expect(migrateStoreToV3({ settings: { markdown_western_font_family: "Arial", markdown_chinese_font_family: "微软雅黑" } }).settings).toMatchObject({
      markdown_western_font_family: "Arial",
      markdown_chinese_font_family: "微软雅黑",
    });
    expect(migrateStoreToV3({ settings: { markdown_western_font_family: "bad", markdown_chinese_font_family: "bad" } }).settings).toMatchObject({
      markdown_western_font_family: "current",
      markdown_chinese_font_family: "current",
    });
  });

  it("cleans markdown default editor mode", () => {
    expect(migrateStoreToV3({ settings: { markdown_default_editor_mode: "edit" } }).settings.markdown_default_editor_mode).toBe("edit");
    expect(migrateStoreToV3({ settings: { markdown_default_editor_mode: "preview" } }).settings.markdown_default_editor_mode).toBe("preview");
    expect(migrateStoreToV3({ settings: { markdown_default_editor_mode: "bad" } }).settings.markdown_default_editor_mode).toBe("live");
  });

  it("migrates and cleans document view states", () => {
    const migrated = migrateStoreToV3({
      documents: [{ document_id: "doc-1", title: "Paper" }],
      view_states: {
        "doc-1": {
          pdf: { page_index: 4, scroll_top: 1200, scroll_left: 8, zoom: 1.5 },
          reader_panel: { active_tab: "notes", collapsed: false, width: 420, notes_mode: "live", summary_mode: "bad", notes_scroll_top: 88 },
          markdown: { mode: "preview", scroll_top: 300, selection_start: 5, selection_end: 9 },
          readerm: { mode: "edit-preview", source_view: "summary", source_document_id: "source-doc", active_reference_id: "ref-1", pdf_collapsed: true, pdf_pane_width: 520 },
        },
        missing: {
          pdf: { page_index: 1 },
        },
      },
      settings: {},
    });

    expect(migrated.view_states?.["missing"]).toBeUndefined();
    expect(migrated.view_states?.["doc-1"]).toMatchObject({
      version: 1,
      pdf: { page_index: 4, scroll_top: 1200, scroll_left: 8, zoom: 1.5 },
      reader_panel: { active_tab: "notes", collapsed: false, width: 420, notes_mode: "live", notes_scroll_top: 88 },
      markdown: { mode: "preview", scroll_top: 300, selection_start: 5, selection_end: 9 },
      readerm: { mode: "edit-preview", source_view: "summary", source_document_id: "source-doc", active_reference_id: "ref-1", pdf_collapsed: true, pdf_pane_width: 520 },
    });
    expect(migrated.view_states?.["doc-1"]?.reader_panel?.summary_mode).toBeUndefined();
  });

  it("is idempotent for v3 stores", () => {
    const first = migrateStoreToV3({
      schema_version: 3,
      documents: [],
      notes: {},
      summaries: {},
      anchors: [{
        anchor_id: "anc-1",
        document_id: "doc-1",
        page_index: 0,
        page_label: "1",
        rects_pct: [{ left: 0, top: 0, width: 0.1, height: 0.1 }],
        text_quote: { exact: "x", prefix: "a", suffix: "b" },
        created_from: "annotation",
        metadata: {},
        created_at: "2026-01-01T00:00:00.000Z",
      }],
      annotations: [{
        annotation_id: "ann-1",
        document_id: "doc-1",
        anchor_id: "anc-1",
        type: "note",
        color: "#BBD4F6",
        page_index: 0,
        sort_index: "custom",
        target: {
          rects_pct: [{ left: 0, top: 0, width: 0.1, height: 0.1 }],
          text_quote: { exact: "x", prefix: "a", suffix: "b" },
        },
        comment: "",
        tags: [],
        read_only: false,
        imported_from_pdf: false,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      }],
      paragraph_translations: {
        "doc-1": [{
          document_id: "doc-1",
          page_index: 0,
          source_text: "Source paragraph.",
          source_hash: "fnv1a-12345678",
          target_language: "Chinese",
          provider: "google",
          translated_text: "译文",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        }],
      },
      settings: { summary_figure_attachment_limit: 10, summary_text_char_limit: 120000 },
    });

    expect(migrateStoreToV3(first)).toEqual(first);
  });

  it("clamps summary figure attachment settings", () => {
    expect(migrateStoreToV3({ settings: { summary_figure_attachment_limit: 99 } }).settings.summary_figure_attachment_limit).toBe(20);
    expect(migrateStoreToV3({ settings: { summary_figure_attachment_limit: -3 } }).settings.summary_figure_attachment_limit).toBe(0);
    expect(migrateStoreToV3({ settings: { summary_figure_attachment_limit: "bad" } }).settings.summary_figure_attachment_limit).toBe(10);
  });

  it("clamps summary text character limit settings", () => {
    expect(migrateStoreToV3({ settings: { summary_text_char_limit: 3000000 } }).settings.summary_text_char_limit).toBe(2000000);
    expect(migrateStoreToV3({ settings: { summary_text_char_limit: -3 } }).settings.summary_text_char_limit).toBe(0);
    expect(migrateStoreToV3({ settings: { summary_text_char_limit: "bad" } }).settings.summary_text_char_limit).toBe(120000);
  });

  it("cleans paragraph translation cache entries", () => {
    const migrated = migrateStoreToV3({
      paragraph_translations: {
        "doc-1": [{
          document_id: "doc-1",
          page_index: 4,
          source_text: " A   paragraph. ",
          source_hash: "fnv1a-abcdef12",
          target_language: "Chinese",
          provider: "baidu",
          translated_text: "一段文字。",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
        }, {
          document_id: "other-doc",
          source_text: "wrong document",
          source_hash: "fnv1a-bad",
          target_language: "Chinese",
          provider: "google",
          translated_text: "bad",
        }, {
          document_id: "doc-1",
          source_text: "",
          source_hash: "fnv1a-empty",
          target_language: "Chinese",
          provider: "google",
          translated_text: "bad",
        }],
      },
      settings: {},
    });

    expect(migrated.paragraph_translations?.["doc-1"]).toHaveLength(1);
    expect(migrated.paragraph_translations?.["doc-1"]?.[0]).toMatchObject({
      document_id: "doc-1",
      page_index: 4,
      provider: "baidu",
      translated_text: "一段文字。",
    });
  });
});
