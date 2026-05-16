import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAgentMessages, parseAgentStreamEvent, streamAgentChatDeltas } from "../electron/services/AgentApiService";
import type { Settings } from "../electron/services/SettingsTypes";

const settings: Settings = {
  agent_provider: "volcengine",
  ai_base_url: "https://ark.cn-beijing.volces.com/api/v3",
  ai_api_key: "test-key",
  ai_model: "deepseek-v3-2-251201",
  agent_api_type: "chat",
  professional_field: "computer-science research",
  research_area: "",
  reader_prompt: "",
  summary_template: "",
  summary_source: "pdf-extractor",
  summary_figure_attachment_limit: 10,
  translator_mode: "ai",
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

describe("AgentApiService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses backend system template for chat and ignores frontend prompt override", () => {
    const messages = buildAgentMessages(settings, {
      prompt: "frontend override",
      task: "chat",
      messages: [{ role: "user", content: "What is the method?" }],
      reader_context: { document: { title: "Paper" } },
    });
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("world-class academic research expert");
    expect(messages[0].content).not.toContain("frontend override");
    expect(messages.at(-1)?.content).toBe("What is the method?");
  });

  it("renders settings global variables into the system template", () => {
    const messages = buildAgentMessages({
      ...settings,
      professional_field: "robotics",
      research_area: "embodied reasoning",
      translator_target_language: "English",
    }, {
      task: "chat",
      messages: [{ role: "user", content: "What is the method?" }],
      reader_context: { document: { title: "Paper" } },
    });
    expect(messages[0].content).toContain("majoring in robotics");
    expect(messages[0].content).toContain("conducting research on embodied reasoning");
  });

  it("uses saved system and summary templates before file defaults", () => {
    const messages = buildAgentMessages({
      ...settings,
      reader_prompt: "System language={{ language }} field={{ professional_field }}",
      summary_template: "Summarize {{ paper_content }} for {{ research_area }}",
      professional_field: "biology",
      research_area: "cell signaling",
      translator_target_language: "Chinese",
    }, {
      task: "summary",
      reader_context: {
        document: { title: "Runtime document title" },
        summary_source: { content: "Runtime paper content." },
      },
    });
    expect(messages[0].content).toBe("System language=Chinese field=biology");
    expect(messages.at(-1)?.content).toBe("Summarize Runtime paper content. for cell signaling");
  });

  it("uses the summary j2 template for summary tasks", () => {
    const messages = buildAgentMessages(settings, {
      task: "summary",
      reader_context: {
        document: { title: "Paper" },
        summary_source: { content: "Paper content for summary." },
      },
    });
    const prompt = messages.at(-1)?.content || "";
    expect(prompt).toContain("Deeply deconstruct the provided paper text");
    expect(prompt).toContain("Paper content for summary.");
    expect(prompt).not.toContain("Translate the provided academic paper content");
  });

  it("renders reader evidence anchors into summary prompts", () => {
    const messages = buildAgentMessages(settings, {
      task: "summary",
      summary_source_mode: "pdf-extractor",
      reader_context: {
        document: { title: "Paper" },
        note: "Focus on method evidence.",
        summary: "Existing draft.",
        summary_source: {
          mode: "pdf-extractor",
          label: "PDF text extracted from loaded pages",
          content: "The method uses a retrieval-augmented pipeline.",
        },
        evidences: [{
          evidence_id: "ann-1",
          document_id: "doc-1",
          anchor_id: "anc-1",
          page_index: 2,
          href: "/reader?documentId=doc-1&anchor=anc-1&page=3",
          quote: "retrieval-augmented pipeline",
          comment: "method detail",
        }],
      },
    });
    const prompt = messages.at(-1)?.content || "";
    expect(prompt).toContain("Reader evidence anchors:");
    expect(prompt).toContain("Quote: retrieval-augmented pipeline");
    expect(prompt).toContain("Evidence: [p. 3](/reader?documentId=doc-1&anchor=anc-1&page=3)");
    expect(prompt).toContain("Focus on method evidence.");
    expect(prompt).toContain("Existing draft.");
  });

  it("prepends evidence anchors when a saved summary template omits them", () => {
    const messages = buildAgentMessages({
      ...settings,
      summary_template: "Summarize {{ paper_content }}.",
    }, {
      task: "summary",
      reader_context: {
        document: { title: "Paper" },
        summary_source: { content: "The paper introduces a verifier." },
        evidences: [{
          evidence_id: "anc-2",
          document_id: "doc-1",
          anchor_id: "anc-2",
          page_index: 0,
          href: "/reader?documentId=doc-1&anchor=anc-2&page=1",
          quote: "introduces a verifier",
        }],
      },
    });
    const prompt = messages.at(-1)?.content || "";
    expect(prompt).toContain("Reader evidence anchors:");
    expect(prompt).toContain("Evidence-link rules:");
    expect(prompt).toContain("Evidence: [p. 1](/reader?documentId=doc-1&anchor=anc-2&page=1)");
    expect(prompt).toContain("Summarize The paper introduces a verifier.");
  });

  it("adds PDF figure attachments to summary messages", () => {
    const messages = buildAgentMessages(settings, {
      task: "summary",
      reader_context: {
        document: { title: "Paper" },
        summary_source: { content: "Paper content for summary." },
        figure_attachments: [{
          label: "Figure 1",
          caption: "Figure 1. Pipeline overview.",
          page_index: 2,
          data_url: "data:image/png;base64,AAAA",
        }],
      },
    });
    const content = messages.at(-1)?.content;
    expect(Array.isArray(content)).toBe(true);
    expect(Array.isArray(content) ? content[0].text : "").toContain("Figure 1. Pipeline overview.");
    expect(Array.isArray(content) ? content[1] : null).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } });
  });

  it("can build text-only summary messages when image attachments are disabled", () => {
    const messages = buildAgentMessages(settings, {
      task: "summary",
      reader_context: {
        document: { title: "Paper" },
        summary_source: { content: "Paper content for summary." },
        figure_attachments: [{
          label: "Figure 2",
          caption: "Figure 2. Ablation results.",
          page_index: 0,
          data_url: "data:image/png;base64,BBBB",
        }],
      },
    }, { includeImages: false });
    const content = messages.at(-1)?.content;
    expect(typeof content).toBe("string");
    expect(content).toContain("Figure 2. Ablation results.");
  });

  it("uses payload text as paper_content for translation tasks", () => {
    const messages = buildAgentMessages(settings, {
      task: "translate",
      text: "A selected block to translate.",
      reader_context: { document: { title: "Paper" } },
    });
    const prompt = messages.at(-1)?.content || "";
    expect(prompt).toContain("Translate the provided academic paper content");
    expect(prompt).toContain("A selected block to translate.");
  });

  it("uses the metaphor j2 template for metaphor tasks", () => {
    const messages = buildAgentMessages(settings, {
      task: "metaphor",
      reader_context: {
        document: { title: "Paper" },
        selection: { text: "Attention weights value vectors.", page_index: 1 },
      },
    });
    const prompt = messages.at(-1)?.content || "";
    expect(prompt).toContain("**Metaphor**");
    expect(prompt).toContain("Attention weights value vectors.");
  });

  it("parses streaming chat completion delta events", () => {
    expect(parseAgentStreamEvent('data: {"choices":[{"delta":{"content":"Hel"}}]}')).toEqual({ done: false, delta: "Hel" });
    expect(parseAgentStreamEvent("data: [DONE]")).toEqual({ done: true, delta: "" });
  });

  it("aggregates streamed chat completion content", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"lo"}}]}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    let content = "";
    for await (const delta of streamAgentChatDeltas(settings, {
      task: "chat",
      messages: [{ role: "user", content: "Say hello." }],
      reader_context: { document: { title: "Paper" } },
    })) {
      content += delta;
    }
    expect(content).toBe("Hello");
  });
});
