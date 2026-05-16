import { buildReaderAnchorHref } from "@/services/ReaderAnchorService";
import { evidenceListMarkdown } from "@/services/ReaderContextService";
import type { AiChatRequest, ReaderContextPayload } from "@/types";

type AiMessage = AiChatRequest["messages"][number];

const PROVENANCE_RULES = [
  "Use only the provided reader evidence for citations.",
  "For every key claim, include an Evidence line.",
  "When evidence exists, format it as Evidence: [p. N](/reader?documentId=...&anchor=...).",
  "When no evidence supports a claim, write Evidence: Needs verification.",
].join("\n");

export const DEFAULT_SUMMARY_TEMPLATE = [
  "Deeply deconstruct the paper as a computer-science research analyst.",
  "Focus on methodology, motivation, design logic, evidence, limitations, and practical reproduction value.",
  "Use only the provided reader context, notes, summary, and evidence links as source material.",
  "Do not invent citations, experiments, datasets, metrics, implementation details, or open-source status.",
  "If evidence is absent or ambiguous, state the uncertainty directly.",
  "",
  "Output valid Markdown with this exact structure:",
  "**1. Method Motivation**",
  "a) **Driving Force:**",
  "b) **Existing Limitations:**",
  "c) **Research Hypothesis:**",
  "",
  "**2. Method Design**",
  "a) **Pipeline Summary:**",
  "b) **Module Architecture:**",
  "c) **Formulas & Algorithms:**",
  "",
  "**3. Comparison with Existing Methods**",
  "a) **Fundamental Differences:**",
  "b) **Innovations:**",
  "c) **Applicable Scenarios:**",
  "d) **Comparison Table:**",
  "",
  "**4. Experimental Performance & Advantages**",
  "a) **Validation Design:**",
  "b) **Key Results:**",
  "c) **Best Use Cases:**",
  "d) **Limitations:**",
  "",
  "**5. Learning & Application**",
  "a) **Reproduction Steps:**",
  "b) **Implementation Details:**",
  "c) **Transferability:**",
  "",
  "**6. Summary**",
  "a) **Core Idea:** one sentence under 20 words.",
  "b) **Cheat-Sheet Pipeline:** 3-5 steps.",
].join("\n");

function contextHeader(payload: ReaderContextPayload) {
  return [
    `Document: ${payload.document.title}`,
    `File: ${payload.document.file_name}`,
    "",
    "Reader evidence:",
    evidenceListMarkdown(payload.evidences),
    "",
    "Current notes:",
    payload.note || "(none)",
    "",
    "Current summary:",
    payload.summary || "(none)",
  ].join("\n");
}

function sourceForSelection(payload: ReaderContextPayload) {
  const anchor = payload.selection?.anchor || payload.active_anchor;
  if (!payload.selection || !anchor) return "Evidence: Needs verification";
  return `Evidence: [p. ${payload.selection.page_index + 1}](${buildReaderAnchorHref(anchor, payload.selection.page_index + 1)})`;
}

function loadedTextContext(payload: ReaderContextPayload) {
  if (payload.summary_source?.content) return payload.summary_source.content;
  return payload.evidences
    .map((evidence) => [
      `Page ${evidence.page_index + 1}`,
      `Quote: ${evidence.quote}`,
      evidence.comment ? `Comment: ${evidence.comment}` : "",
      `Evidence: [p. ${evidence.page_index + 1}](${evidence.href})`,
    ].filter(Boolean).join("\n"))
    .join("\n\n") || "(no loaded text context)";
}

function renderSummaryTemplate(template: string, payload: ReaderContextPayload) {
  const values: Record<string, string> = {
    document_title: payload.document.title,
    document_file: payload.document.file_name,
    evidence_list: evidenceListMarkdown(payload.evidences),
    notes: payload.note || "(none)",
    current_summary: payload.summary || "(none)",
    summary_source_mode: payload.summary_source?.mode || "pdf-extractor",
    summary_source_label: payload.summary_source?.label || "Reader evidence / loaded pages",
    loaded_text_context: loadedTextContext(payload),
  };
  return (template || DEFAULT_SUMMARY_TEMPLATE).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");
}

export function buildAskSelectionMessages(payload: ReaderContextPayload): AiMessage[] {
  return [{
    role: "user",
    content: [
      PROVENANCE_RULES,
      "",
      contextHeader(payload),
      "",
      "Explain this selected text with concise evidence:",
      payload.selection?.text || "",
      sourceForSelection(payload),
    ].join("\n"),
  }];
}

export function buildTranslateSelectionMessages(payload: ReaderContextPayload, targetLanguage = "Chinese"): AiMessage[] {
  return [{
    role: "user",
    content: [
      PROVENANCE_RULES,
      "",
      contextHeader(payload),
      "",
      `Translate the selected text into ${targetLanguage}.`,
      "Preserve formulas, inline citations, symbols, and Markdown links exactly when possible.",
      "Do not add explanation unless a term is ambiguous; if you add a note, keep it under one sentence.",
      "Return Markdown with this structure:",
      "**Translation**",
      "",
      "<translated text>",
      "",
      sourceForSelection(payload),
      "",
      "Selected text:",
      payload.selection?.text || "",
    ].join("\n"),
  }];
}

export function buildMetaphorSelectionMessages(payload: ReaderContextPayload): AiMessage[] {
  return [{
    role: "user",
    content: [
      PROVENANCE_RULES,
      "",
      contextHeader(payload),
      "",
      "# Persona",
      "You are a patient science communicator for beginners.",
      "Your job is to turn abstract mathematical or algorithmic mechanisms into concrete everyday intuition.",
      "",
      "# Task",
      "Explain the selected mechanism using vivid real-life metaphors.",
      "Use one main analogy, such as a library, kitchen, delivery network, classroom, or city traffic system.",
      "Map each technical component to a concrete object in the analogy.",
      "After the analogy, return to the original technical terms and state what the metaphor helps explain and what it does not cover.",
      "",
      "# Output",
      "**Metaphor**: one short name for the analogy.",
      "**Story**: explain with a concrete scenario.",
      "**Mapping**: bullet list mapping technical terms to concrete objects.",
      "**Back to the paper**: restate the mechanism in plain technical language.",
      "**Limits of the metaphor**: one or two caveats.",
      "",
      sourceForSelection(payload),
      "",
      "Selected text:",
      payload.selection?.text || "",
    ].join("\n"),
  }];
}

export function buildSummaryMessages(payload: ReaderContextPayload, summaryTemplate = DEFAULT_SUMMARY_TEMPLATE): AiMessage[] {
  return [{
    role: "user",
    content: [
      PROVENANCE_RULES,
      "",
      contextHeader(payload),
      "",
      renderSummaryTemplate(summaryTemplate, payload),
      "",
      "Every major claim must be followed by an Evidence line.",
      payload.evidences.length ? "Prefer the provided reader evidence links." : "No reader evidence is available, so unsupported claims must use Evidence: Needs verification.",
    ].join("\n"),
  }];
}

export function buildChatMessages(payload: ReaderContextPayload, userInput: string): AiMessage[] {
  return [{
    role: "user",
    content: [
      PROVENANCE_RULES,
      "",
      contextHeader(payload),
      "",
      "User question:",
      userInput,
    ].join("\n"),
  }];
}
