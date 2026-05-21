import { clipboard, ipcMain, nativeImage } from "electron";
import { createApplicationMenu } from "../appMenu.js";
import { requestAgentChat, streamAgentChatDeltas } from "../services/AgentApiService.js";
import { openHelpWindow } from "../services/HelpWindowService.js";
import { listTemplateStatus } from "../services/DocsConfigService.js";
import { getFileAssociationStatus, registerFileAssociation, registerFileAssociations, unregisterFileAssociation, type FileAssociationExtension } from "../services/FileAssociationService.js";
import { requestSimpleTexLatexOcrDataUrl } from "../services/SimpleTexOcrService.js";
import { requestTranslation } from "../services/TranslationApiService.js";
import type { Settings } from "../services/SettingsTypes.js";
import type { IpcContext } from "./storeContext.js";

function clampCaptureImageScale(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 2;
  return Math.min(6, Math.max(1, Math.round(numeric * 10) / 10));
}

function clampMarkdownDefaultFontSize(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 15;
  return Math.min(28, Math.max(11, Math.round(numeric)));
}

function clampMarkdownLineHeight(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1.6;
  return Math.min(2.2, Math.max(1.1, Math.round(numeric * 100) / 100));
}

function clampMarkdownCodeFontScale(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.86;
  return Math.min(1.1, Math.max(0.7, Math.round(numeric * 100) / 100));
}

function clampMarkdownCodeLineHeight(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1.22;
  return Math.min(1.8, Math.max(1, Math.round(numeric * 100) / 100));
}

function cleanMarkdownHighlightColor(value: unknown) {
  const color = typeof value === "string" ? value.trim() : "";
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#fff3bf";
}

function cleanMarkdownFontFamily(value: unknown) {
  const fontFamily = typeof value === "string" ? value.trim() : "";
  return ["current", "Aptos", "Arial", "Cambria", "Georgia", "Segoe UI", "Times New Roman"].includes(fontFamily)
    ? fontFamily
    : "current";
}

function cleanMarkdownCodeFontFamily(value: unknown) {
  const fontFamily = typeof value === "string" ? value.trim() : "";
  return [
    "Anonymous Pro",
    "Consolas",
    "DejaVu Sans Mono",
    "Menlo",
    "Monaco",
    "Monaspace Argon",
    "Monaspace Krypton",
    "Monaspace Neon",
    "Monaspace Radon",
    "Monaspace Xenon",
    "Source Code Pro",
    "Space Mono",
  ].includes(fontFamily) ? fontFamily : "Consolas";
}

function cleanHistoryReaderpLinkView(value: unknown): Settings["history_readerp_link_view"] {
  return value === "markdown" || value === "summary" ? value : "pdf";
}

function cleanQuoteTemplate(value: unknown, fallback: string) {
  const template = typeof value === "string" ? value : "";
  return template.trim() ? template.slice(0, 20000) : fallback;
}

function cleanSimpleTexToken(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanReadermPreviewPosition(value: unknown): Settings["readerm_preview_position"] {
  return value === "bottom" ? "bottom" : "right";
}

function cleanMarkdownDefaultEditorMode(value: unknown): Settings["markdown_default_editor_mode"] {
  return value === "edit" || value === "preview" ? value : "live";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanAiHistoryVersion(value: unknown) {
  if (!isRecord(value)) return null;
  const userContent = typeof value.user_content === "string" ? value.user_content : "";
  const assistantContent = typeof value.assistant_content === "string" ? value.assistant_content : "";
  if (!userContent && !assistantContent) return null;
  const redoMode = value.redo_mode === "longer" || value.redo_mode === "shorter" || value.redo_mode === "try-again"
    ? value.redo_mode
    : undefined;
  return {
    user_content: userContent,
    assistant_content: assistantContent,
    ...(redoMode ? { redo_mode: redoMode } : {}),
    ...(typeof value.prompt_append === "string" ? { prompt_append: value.prompt_append } : {}),
    created_at: typeof value.created_at === "string" && value.created_at ? value.created_at : new Date().toISOString(),
  };
}

function cleanAiHistory(history: unknown): Array<{ role: "user" | "assistant"; content: string; [key: string]: unknown }> {
  if (!Array.isArray(history)) return [];
  return history
    .filter((message): message is Record<string, unknown> => (
      isRecord(message)
        && (message.role === "user" || message.role === "assistant")
        && typeof message.content === "string"
    ))
    .map((message) => {
      const versions = Array.isArray(message.versions)
        ? message.versions.map(cleanAiHistoryVersion).filter((version): version is NonNullable<ReturnType<typeof cleanAiHistoryVersion>> => Boolean(version))
        : [];
      const currentVersion = Number(message.current_version);
      return {
        role: message.role as "user" | "assistant",
        content: message.content as string,
        ...(typeof message.turn_id === "string" && message.turn_id ? { turn_id: message.turn_id } : {}),
        ...(versions.length ? {
          current_version: Number.isFinite(currentVersion)
            ? Math.min(versions.length - 1, Math.max(0, Math.trunc(currentVersion)))
            : versions.length - 1,
          versions,
        } : {}),
      };
    });
}

const SIMPLETEX_TEST_IMAGE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADQAAAAUCAYAAADm4pTFAAAAAXNSR0IArs4c6QAAAWJJREFUSEvtlrFOwzAQRd8S3ICBgQ2BiYEBAwMjAwMDAw8BYmBiYOALEGJkYWBgYEJgYmBgQkJC4ijJteOkcbBSlSqV7LXl/PWd7R85nE6nP4QkwPckQGvQf6bJskx3f9hxnKIo6vr6euD7/ibLMszMzABEUWRZ9u9isYjBYKBer3M6nRRFkWmaDMOQJElUVfXW+WVZ1mg0+Pr6Mp1O8/v7O5/PM5lM4vf7hUIhk8mEw+GAw+GAy+WCy+XC6XRKp9PB4XBoNBqFQiGZTJZlWY7H43w+H4qi4PX1lUqlgslkYr/fp9Pp0Gg0MJvNqKqKTqeDw+GA0+mE0WjEbrfL5XJBoVDAZrOJx+PB6/Wi0Wjg8/mw2+1IkmQymXw+H4qiYDabMRgM6HQ6lEolhUIBvV6P3W6H3+/H4/Hg9XqRZRm73Y7BYIDNZkOSJJVKBTqdDjqdDrvdDqPRiM1mQ6/Xo9FoYDAY0Gg0KJVK9Ho9Go0GvV6PXq9HkiQpFAp0Oh0KhQKNRoNRqURRFPz8/Lher4fD4bDZbLBarWg0GgSDQZIkCYfDgU6nQ6fToVQq0Wg0qNVq1Go1Go0Gq9WKRqPBZDKh0WhQqVSo1+uUy2VkWYaqqrIsy7Isr9fr9Qb+AEfqVfnXjS20AAAAAElFTkSuQmCC";

export function registerSettingsAiIpc(ctx: IpcContext) {
  ipcMain.handle("settings:get", () => ctx.getSettings());

  ipcMain.handle("settings:update", (_event, patch: Partial<Settings>) => {
    const current = ctx.getSettings();
    const next = {
      ...current,
      ...patch,
      summary_text_char_limit: ctx.clampSummaryTextCharLimit(
        patch.summary_text_char_limit ?? current.summary_text_char_limit,
      ),
      summary_figure_attachment_limit: ctx.clampSummaryFigureAttachmentLimit(
        patch.summary_figure_attachment_limit ?? current.summary_figure_attachment_limit,
      ),
      capture_image_scale: clampCaptureImageScale(patch.capture_image_scale ?? current.capture_image_scale),
      markdown_default_font_size: clampMarkdownDefaultFontSize(patch.markdown_default_font_size ?? current.markdown_default_font_size),
      markdown_line_height: clampMarkdownLineHeight(patch.markdown_line_height ?? current.markdown_line_height),
      markdown_code_font_scale: clampMarkdownCodeFontScale(patch.markdown_code_font_scale ?? current.markdown_code_font_scale),
      markdown_code_line_height: clampMarkdownCodeLineHeight(patch.markdown_code_line_height ?? current.markdown_code_line_height),
      markdown_font_family: cleanMarkdownFontFamily(patch.markdown_font_family ?? current.markdown_font_family),
      markdown_code_font_family: cleanMarkdownCodeFontFamily(patch.markdown_code_font_family ?? current.markdown_code_font_family),
      markdown_code_line_numbers: patch.markdown_code_line_numbers === undefined ? current.markdown_code_line_numbers : patch.markdown_code_line_numbers !== false,
      markdown_code_ligatures: patch.markdown_code_ligatures === undefined ? current.markdown_code_ligatures : patch.markdown_code_ligatures !== false,
      markdown_highlight_enabled: patch.markdown_highlight_enabled === undefined ? current.markdown_highlight_enabled : patch.markdown_highlight_enabled !== false,
      markdown_highlight_color: cleanMarkdownHighlightColor(patch.markdown_highlight_color ?? current.markdown_highlight_color),
      markdown_math_enabled: patch.markdown_math_enabled === undefined ? current.markdown_math_enabled : patch.markdown_math_enabled !== false,
      markdown_html_live_enabled: patch.markdown_html_live_enabled === undefined ? current.markdown_html_live_enabled : patch.markdown_html_live_enabled !== false,
      markdown_default_editor_mode: cleanMarkdownDefaultEditorMode(patch.markdown_default_editor_mode ?? current.markdown_default_editor_mode),
      readerm_edit_split_default: patch.readerm_edit_split_default === undefined ? current.readerm_edit_split_default : patch.readerm_edit_split_default === true,
      readerm_preview_position: cleanReadermPreviewPosition(patch.readerm_preview_position ?? current.readerm_preview_position),
      history_readerp_link_view: cleanHistoryReaderpLinkView(patch.history_readerp_link_view ?? current.history_readerp_link_view),
      copy_quote_template: cleanQuoteTemplate(
        patch.copy_quote_template ?? current.copy_quote_template,
        "> {{ paragraph_content }}\n\nSource: {{ page_marker }}",
      ),
      quote_to_note_template: cleanQuoteTemplate(
        patch.quote_to_note_template ?? current.quote_to_note_template,
        "{{ page_marker }}",
      ),
      quote_to_readerm_template: cleanQuoteTemplate(
        patch.quote_to_readerm_template ?? current.quote_to_readerm_template,
        "[{{ passage_name }}, p.{{ page_number }}]({{ href }})",
      ),
      ai_send_notes_context: patch.ai_send_notes_context !== false,
      ai_send_summary_context: patch.ai_send_summary_context !== false,
      ai_send_annotations_context: patch.ai_send_annotations_context !== false,
      ai_send_loaded_pdf_text: patch.ai_send_loaded_pdf_text !== false,
      ai_send_figure_attachments: patch.ai_send_figure_attachments !== false,
      ai_redo_longer_prompt: cleanQuoteTemplate(
        patch.ai_redo_longer_prompt ?? current.ai_redo_longer_prompt,
        "Make the answer more detailed and comprehensive while preserving accurate reader evidence links.",
      ),
      ai_redo_shorter_prompt: cleanQuoteTemplate(
        patch.ai_redo_shorter_prompt ?? current.ai_redo_shorter_prompt,
        "Make the answer more concise while preserving the key points and accurate reader evidence links.",
      ),
      ai_redo_try_again_prompt: cleanQuoteTemplate(
        patch.ai_redo_try_again_prompt ?? current.ai_redo_try_again_prompt,
        "Try again with clearer reasoning, better structure, and accurate reader evidence links.",
      ),
      simpletex_ocr_token: cleanSimpleTexToken(patch.simpletex_ocr_token ?? current.simpletex_ocr_token),
      simpletex_ocr_enabled: patch.simpletex_ocr_enabled === undefined ? current.simpletex_ocr_enabled : patch.simpletex_ocr_enabled === true,
    };
    ctx.store.settings = next;
    ctx.saveStore();
    createApplicationMenu((action) => ctx.window?.webContents.send("menu:action", action), next.ui_language, (topic) => openHelpWindow(ctx.window, topic));
    return next;
  });

  ipcMain.handle("settings:templates", () => listTemplateStatus());
  ipcMain.handle("settings:file-associations-status", () => getFileAssociationStatus());
  ipcMain.handle("settings:register-file-associations", () => registerFileAssociations());
  ipcMain.handle("settings:register-file-association", (_event, extension: FileAssociationExtension) => registerFileAssociation(extension));
  ipcMain.handle("settings:unregister-file-association", (_event, extension: FileAssociationExtension) => unregisterFileAssociation(extension));

  ipcMain.handle("settings:test-agent", async (_event, patch: Partial<Settings>) => {
    const settings = { ...ctx.getSettings(), ...patch };
    const response = await requestAgentChat(settings, {
      task: "chat",
      messages: [{ role: "user", content: "Reply with OK if the agent connection works." }],
      reader_context: {
        document: { title: "Connection test" },
        selection: { text: "Connection test", page_index: 0 },
      },
    });
    return { ok: true, content: response.content.slice(0, 500) };
  });

  ipcMain.handle("settings:test-translation", async (_event, patch: Partial<Settings>) => {
    const settings = { ...ctx.getSettings(), ...patch };
    const response = await requestTranslation(settings, {
      text: "This is a translation connection test.",
      target_language: settings.translator_target_language || "Chinese",
      task: "translate",
      reader_context: {
        document: { title: "Connection test" },
        selection: { text: "This is a translation connection test.", page_index: 0 },
      },
    });
    return { ok: true, content: response.content.slice(0, 500) };
  });

  ipcMain.handle("ai:chat", async (_event, payload: Record<string, unknown>) => {
    const settings = ctx.getSettings();
    return requestAgentChat(settings, payload);
  });

  ipcMain.handle("settings:test-simpletex-ocr", async (_event, patch: Partial<Settings>) => {
    const settings = { ...ctx.getSettings(), ...patch };
    const response = await requestSimpleTexLatexOcrDataUrl(settings, SIMPLETEX_TEST_IMAGE_DATA_URL, "simpletex-test.png");
    return { ok: true, content: response.latex.slice(0, 500) };
  });

  ipcMain.handle("ai:history:save", (_event, documentId: string, history: unknown[] = []) => {
    ctx.getDocument(documentId);
    ctx.store.ai_history[documentId] = cleanAiHistory(history);
    ctx.saveStore();
    return ctx.store.ai_history[documentId];
  });

  ipcMain.on("ai:chat:stream:start", async (event, request: { requestId?: string; payload?: Record<string, unknown> }) => {
    const requestId = String(request?.requestId || "");
    if (!requestId) return;
    const payload = ctx.isRecord(request?.payload) ? request.payload : {};
    const controller = new AbortController();
    ctx.aiStreamControllers.set(requestId, controller);
    const send = (suffix: "delta" | "done" | "error", data: Record<string, unknown>) => {
      if (!event.sender.isDestroyed()) event.sender.send(`ai:chat:stream:${suffix}:${requestId}`, data);
    };
    const sendCancelled = () => {
      if (!event.sender.isDestroyed()) event.sender.send(`ai:chat:stream:cancelled:${requestId}`, {});
    };
    try {
      const settings = ctx.getSettings();
      let content = "";
      for await (const delta of streamAgentChatDeltas(settings, payload, { signal: controller.signal })) {
        content += delta;
        send("delta", { delta });
      }
      if (controller.signal.aborted) {
        sendCancelled();
      } else {
        send("done", { content });
      }
    } catch (cause) {
      if (controller.signal.aborted) {
        sendCancelled();
      } else {
        send("error", { message: cause instanceof Error ? cause.message : String(cause) });
      }
    } finally {
      ctx.aiStreamControllers.delete(requestId);
    }
  });

  ipcMain.on("ai:chat:stream:cancel", (_event, requestId: string) => {
    const id = String(requestId || "");
    ctx.aiStreamControllers.get(id)?.abort();
  });

  ipcMain.handle("translate:selection", async (_event, payload: Record<string, unknown>) => {
    const settings = ctx.getSettings();
    return requestTranslation(settings, payload);
  });

  ipcMain.handle("ocr:latex-image", async (_event, dataUrl: string) => {
    const settings = ctx.getSettings();
    return requestSimpleTexLatexOcrDataUrl(settings, dataUrl, "formula.png");
  });

  ipcMain.handle("clipboard:write-image", (_event, dataUrl: string) => {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
      throw new Error("Invalid image data.");
    }
    const image = nativeImage.createFromDataURL(dataUrl);
    if (image.isEmpty()) throw new Error("Could not create image from selection.");
    clipboard.writeImage(image);
  });
}
