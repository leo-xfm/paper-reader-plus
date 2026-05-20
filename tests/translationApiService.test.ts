import { describe, expect, it } from "vitest";
import { baiduLanguageCode, baiduSign, googleLanguageCode, googleTranslationProxyAgentFor } from "../electron/services/TranslationApiService";
import type { Settings } from "../electron/services/SettingsTypes";

const settings: Settings = {
  ui_language: "system",
  agent_provider: "volcengine",
  ai_base_url: "https://ark.cn-beijing.volces.com/api/v3",
  ai_api_key: "test-key",
  ai_model: "deepseek-v3-2-251201",
  agent_api_type: "chat",
  professional_field: "computer-science research",
  research_area: "",
  reader_prompt: "",
  summary_template: "",
  copy_quote_template: "> {{ paragraph_content }}\n\nSource: {{ page_marker }}",
  quote_to_note_template: "{{ page_marker }}",
  quote_to_readerm_template: "[{{ passage_name }}, p.{{ page_number }}]({{ href }})",
  summary_source: "pdf-extractor",
  summary_text_char_limit: 120000,
  summary_figure_attachment_limit: 10,
  capture_image_scale: 2,
  markdown_default_font_size: 15,
  markdown_line_height: 1.6,
  markdown_code_font_scale: 0.86,
  markdown_code_line_height: 1.22,
  markdown_font_family: "current",
  markdown_code_font_family: "Consolas",
  markdown_code_line_numbers: true,
  markdown_code_ligatures: true,
  markdown_highlight_enabled: true,
  markdown_highlight_color: "#fff3bf",
  markdown_math_enabled: true,
  markdown_html_live_enabled: true,
  markdown_default_editor_mode: "live",
  readerm_edit_split_default: false,
  readerm_preview_position: "right",
  history_readerp_link_view: "pdf",
  ai_send_notes_context: true,
  ai_send_summary_context: true,
  ai_send_annotations_context: true,
  ai_send_loaded_pdf_text: true,
  ai_send_figure_attachments: true,
  simpletex_ocr_token: "",
  simpletex_ocr_enabled: false,
  translator_mode: "api",
  translation_provider: "google",
  translator_api_url: "",
  translator_api_key: "",
  translator_target_language: "Chinese",
  google_project_id: "project",
  google_api_key: "google-key",
  baidu_app_id: "appid",
  baidu_app_key: "appkey",
  network_proxy_enabled: false,
  network_proxy_url: "",
};

describe("TranslationApiService", () => {
  it("maps common language names per provider", () => {
    expect(googleLanguageCode("Chinese")).toBe("zh-CN");
    expect(googleLanguageCode("English")).toBe("en");
    expect(baiduLanguageCode("Chinese")).toBe("zh");
    expect(baiduLanguageCode("English")).toBe("en");
    expect(googleLanguageCode("ja")).toBe("ja");
    expect(baiduLanguageCode("jp")).toBe("jp");
  });

  it("builds Baidu md5 signatures", () => {
    expect(baiduSign("2015063000000001", "apple", "65478", "1234567890"))
      .toBe("a1a7461d92e5194c5cae3182b5b24de1");
  });

  it("uses the configured network proxy for Google HTTPS requests", () => {
    expect(googleTranslationProxyAgentFor("https://translation.googleapis.com/v3/projects/test:translateText", settings)).toBeUndefined();
    expect(googleTranslationProxyAgentFor("https://translation.googleapis.com/v3/projects/test:translateText", {
      ...settings,
      network_proxy_enabled: true,
      network_proxy_url: "http://127.0.0.1:7890",
    })).toBeDefined();
  });
});
