import type { Settings } from "./SettingsTypes.js";
import { readTemplate } from "./DocsConfigService.js";
import { renderTemplate, type TemplateValues } from "./PromptTemplateService.js";

type AgentMessageContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
type AgentMessage = { role: string; content: AgentMessageContent };
type AgentStreamOptions = { signal?: AbortSignal };

export type AgentChatPayload = {
  messages?: AgentMessage[];
  prompt?: string;
  text?: string;
  task?: string;
  document_id?: string;
  summary_source_mode?: string;
  reader_context?: Record<string, unknown> | null;
};

type BuildMessageOptions = {
  includeImages?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageText(content: AgentMessageContent) {
  if (typeof content === "string") return content;
  return content
    .map((part) => part.type === "text" ? part.text : "[image attachment]")
    .join("\n");
}

function selectedText(payload: AgentChatPayload) {
  const readerContext = payload.reader_context;
  const selection = isRecord(readerContext) && isRecord(readerContext.selection) ? readerContext.selection : null;
  if (typeof selection?.text === "string" && selection.text.trim()) return selection.text;
  return typeof payload.text === "string" ? payload.text : "";
}

function loadedText(payload: AgentChatPayload) {
  const readerContext = payload.reader_context;
  const source = isRecord(readerContext) && isRecord(readerContext.summary_source) ? readerContext.summary_source : null;
  if (typeof source?.content === "string" && source.content.trim()) return source.content;
  return selectedText(payload);
}

function readerEvidences(payload: AgentChatPayload) {
  const readerContext = payload.reader_context;
  return isRecord(readerContext) && Array.isArray(readerContext.evidences)
    ? readerContext.evidences.filter(isRecord)
    : [];
}

function evidenceListMarkdown(payload: AgentChatPayload) {
  const evidences = readerEvidences(payload);
  if (!evidences.length) return "Evidence: Needs verification";
  return evidences
    .map((evidence, index) => {
      const pageIndex = typeof evidence.page_index === "number" ? evidence.page_index : 0;
      const quote = typeof evidence.quote === "string" ? evidence.quote : "";
      const href = typeof evidence.href === "string" ? evidence.href : "";
      const comment = typeof evidence.comment === "string" ? evidence.comment : "";
      return [
        `${index + 1}. Quote: ${quote || "(no quote text)"}`,
        `   Evidence: [p. ${pageIndex + 1}](${href || "Needs verification"})`,
        comment ? `   Comment: ${comment}` : "",
      ].filter(Boolean).join("\n");
    })
    .join("\n");
}

function documentTitle(payload: AgentChatPayload) {
  const doc = isRecord(payload.reader_context) && isRecord(payload.reader_context.document) ? payload.reader_context.document : null;
  return typeof doc?.title === "string" ? doc.title : "";
}

function pageLabel(payload: AgentChatPayload) {
  const selection = isRecord(payload.reader_context) && isRecord(payload.reader_context.selection) ? payload.reader_context.selection : null;
  const pageIndex = typeof selection?.page_index === "number" ? selection.page_index : null;
  return pageIndex === null ? "Selected content" : `Page ${pageIndex + 1}`;
}

function templateValues(settings: Settings, payload: AgentChatPayload): TemplateValues {
  const documentResearchArea = documentTitle(payload);
  const readerContext = payload.reader_context;
  const source = isRecord(readerContext) && isRecord(readerContext.summary_source) ? readerContext.summary_source : null;
  const sourceMode = typeof source?.mode === "string" ? source.mode : payload.summary_source_mode || "pdf-extractor";
  const sourceLabel = typeof source?.label === "string" ? source.label : "Reader evidence / loaded pages";
  const notes = isRecord(readerContext) && typeof readerContext.note === "string" ? readerContext.note : "";
  const summary = isRecord(readerContext) && typeof readerContext.summary === "string" ? readerContext.summary : "";
  const loaded = loadedText(payload);
  return {
    professional_field: settings.professional_field?.trim() || "computer-science research",
    research_area: settings.research_area?.trim() || documentResearchArea,
    language: settings.translator_target_language || "English",
    document_title: documentTitle(payload),
    page_label: pageLabel(payload),
    paper_content: payload.task === "summary" ? loaded : selectedText(payload) || loaded,
    loaded_text_context: loaded || "(no loaded text context)",
    evidence_list: evidenceListMarkdown(payload),
    notes: notes || "(none)",
    current_summary: summary || "(none)",
    summary_source_mode: sourceMode,
    summary_source_label: sourceLabel,
  };
}

function systemTemplate(settings: Settings) {
  return settings.reader_prompt?.trim() || readTemplate("system");
}

function taskTemplate(settings: Settings, payload: AgentChatPayload) {
  if (payload.task === "summary") return settings.summary_template?.trim() || readTemplate("literature-read");
  if (payload.task === "translate") return readTemplate("literature-translate");
  if (payload.task === "metaphor") return readTemplate("literature-metaphor");
  return "";
}

function figureAttachments(payload: AgentChatPayload) {
  const readerContext = payload.reader_context;
  const figures = isRecord(readerContext) && Array.isArray(readerContext.figure_attachments) ? readerContext.figure_attachments : [];
  return figures
    .filter(isRecord)
    .map((figure) => ({
      label: typeof figure.label === "string" ? figure.label : "Figure",
      caption: typeof figure.caption === "string" ? figure.caption : "",
      page_index: typeof figure.page_index === "number" ? figure.page_index : 0,
      data_url: typeof figure.data_url === "string" && figure.data_url.startsWith("data:image/") ? figure.data_url : "",
      href: typeof figure.href === "string" ? figure.href : "",
    }))
    .filter((figure) => figure.caption.trim() || figure.data_url);
}

function figureAttachmentText(payload: AgentChatPayload) {
  const figures = figureAttachments(payload);
  if (!figures.length) return "";
  return [
    "Extracted PDF figures attached to this request:",
    ...figures.map((figure, index) => {
      const source = figure.href ? ` ${figure.href}` : "";
      return `${index + 1}. ${figure.label}, page ${figure.page_index + 1}.${source}\nCaption: ${figure.caption || "(no caption text)"}`;
    }),
    "Use these images only as visual evidence for their listed figures. If the image is unclear or unsupported, rely on the caption and mark uncertain claims as Evidence: Needs verification.",
  ].join("\n");
}

function summaryEvidenceText(payload: AgentChatPayload) {
  const evidences = readerEvidences(payload);
  if (!evidences.length) return "";
  return [
    "Reader evidence anchors:",
    evidenceListMarkdown(payload),
    "",
    "Evidence-link rules:",
    "- Every major claim must be followed by an Evidence line.",
    "- Use only the reader anchor links listed above; do not invent documentId, anchor, page, or URL values.",
    "- If a claim is supported by loaded text but no matching reader anchor is available, write: Evidence: Needs verification.",
  ].join("\n");
}

function taskPromptContent(taskPrompt: string, payload: AgentChatPayload, options: BuildMessageOptions): AgentMessageContent {
  const evidenceText = payload.task === "summary" && !taskPrompt.includes("Reader evidence anchors:")
    ? summaryEvidenceText(payload)
    : "";
  const figureText = figureAttachmentText(payload);
  const promptText = evidenceText ? `${evidenceText}\n\n${taskPrompt}` : taskPrompt;
  const text = figureText ? `${promptText}\n\n${figureText}` : promptText;
  if (!options.includeImages) return text;
  const images = figureAttachments(payload).filter((figure) => figure.data_url);
  if (!images.length) return text;
  return [
    { type: "text", text },
    ...images.map((figure) => ({
      type: "image_url" as const,
      image_url: { url: figure.data_url },
    })),
  ];
}

function hasImageContent(messages: AgentMessage[]) {
  return messages.some((message) => Array.isArray(message.content) && message.content.some((part) => part.type === "image_url"));
}

export function buildAgentMessages(settings: Settings, payload: AgentChatPayload, options: BuildMessageOptions = { includeImages: true }): AgentMessage[] {
  const values = templateValues(settings, payload);
  const system = renderTemplate(systemTemplate(settings), values);
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const template = taskTemplate(settings, payload);
  if (!template) return [{ role: "system", content: system }, ...messages.filter((message) => message.role !== "system")];
  const taskPrompt = renderTemplate(template, values);
  return [
    { role: "system", content: system },
    ...messages.filter((message) => message.role !== "system"),
    { role: "user", content: taskPromptContent(taskPrompt, payload, options) },
  ];
}

function extractAgentContent(data: unknown): string {
  if (!isRecord(data)) return "";
  const choices = data.choices;
  if (Array.isArray(choices) && isRecord(choices[0])) {
    const first = choices[0];
    if (isRecord(first.message) && typeof first.message.content === "string") return first.message.content;
    if (typeof first.text === "string") return first.text;
  }
  if (typeof data.output_text === "string") return data.output_text;
  return "";
}

export function extractAgentDelta(data: unknown): string {
  if (!isRecord(data)) return "";
  const choices = data.choices;
  if (Array.isArray(choices) && isRecord(choices[0])) {
    const first = choices[0];
    if (isRecord(first.delta) && typeof first.delta.content === "string") return first.delta.content;
    if (typeof first.text === "string") return first.text;
    if (isRecord(first.message) && typeof first.message.content === "string") return first.message.content;
  }
  if (typeof data.output_text === "string") return data.output_text;
  return "";
}

export function parseAgentStreamEvent(event: string) {
  const data = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
  if (!data) return { done: false, delta: "" };
  if (data === "[DONE]") return { done: true, delta: "" };
  try {
    return { done: false, delta: extractAgentDelta(JSON.parse(data)) };
  } catch {
    return { done: false, delta: "" };
  }
}

function agentRequestBody(settings: Settings, payload: AgentChatPayload, stream = false) {
  const messages = buildAgentMessages(settings, payload, { includeImages: true });
  return {
    model: settings.ai_model,
    messages,
    temperature: 0.2,
    ...(stream ? { stream: true } : {}),
  };
}

function textOnlyAgentRequestBody(settings: Settings, payload: AgentChatPayload, stream = false) {
  return {
    model: settings.ai_model,
    messages: buildAgentMessages(settings, payload, { includeImages: false }).map((message) => ({
      ...message,
      content: messageText(message.content),
    })),
    temperature: 0.2,
    ...(stream ? { stream: true } : {}),
  };
}

export async function requestAgentChat(settings: Settings, payload: AgentChatPayload) {
  if (!settings.ai_api_key) throw new Error("AI API key is not configured.");
  if (settings.agent_api_type !== "chat") throw new Error("Only chat agent API is currently supported.");
  const body = agentRequestBody(settings, payload);
  if (payload.task === "summary" && payload.summary_source_mode === "pdf-direct" && typeof payload.document_id === "string") {
    throw new Error("PDF direct summary is not supported by the configured agent provider.");
  }
  const endpoint = `${settings.ai_base_url.replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.ai_api_key}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    if (hasImageContent(body.messages)) {
      const retry = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.ai_api_key}`,
        },
        body: JSON.stringify(textOnlyAgentRequestBody(settings, payload)),
      });
      if (retry.ok) return { content: extractAgentContent(await retry.json()) };
    }
    throw new Error(text || `AI request failed: ${response.status}`);
  }
  return { content: extractAgentContent(await response.json()) };
}

export async function* streamAgentChatDeltas(settings: Settings, payload: AgentChatPayload, options: AgentStreamOptions = {}) {
  if (!settings.ai_api_key) throw new Error("AI API key is not configured.");
  if (settings.agent_api_type !== "chat") throw new Error("Only chat agent API is currently supported.");
  const endpoint = `${settings.ai_base_url.replace(/\/$/, "")}/chat/completions`;
  const body = agentRequestBody(settings, payload, true);
  let response = await fetch(endpoint, {
    method: "POST",
    signal: options.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.ai_api_key}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    if (hasImageContent(body.messages)) {
      response = await fetch(endpoint, {
        method: "POST",
        signal: options.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.ai_api_key}`,
        },
        body: JSON.stringify(textOnlyAgentRequestBody(settings, payload, true)),
      });
      if (response.ok) {
        // Continue below and stream the text-only retry.
      } else {
        const retryText = await response.text();
        throw new Error(retryText || text || `AI request failed: ${response.status}`);
      }
    } else {
      throw new Error(text || `AI request failed: ${response.status}`);
    }
  }
  if (!response.body) throw new Error("AI stream did not return a readable body.");

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer = `${buffer}${decoder.decode(value, { stream: true })}`.replace(/\r\n/g, "\n");
    let separator = buffer.indexOf("\n\n");
    while (separator >= 0) {
      const event = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      const parsed = parseAgentStreamEvent(event);
      if (parsed.done) return;
      if (parsed.delta) yield parsed.delta;
      separator = buffer.indexOf("\n\n");
    }
  }

  buffer = `${buffer}${decoder.decode()}`.replace(/\r\n/g, "\n");
  if (buffer.trim()) {
    const parsed = parseAgentStreamEvent(buffer);
    if (!parsed.done && parsed.delta) yield parsed.delta;
  }
}
