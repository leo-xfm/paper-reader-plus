import { clipboard, ipcMain, nativeImage } from "electron";
import { createApplicationMenu } from "../appMenu.js";
import { requestAgentChat, streamAgentChatDeltas } from "../services/AgentApiService.js";
import { openHelpWindow } from "../services/HelpWindowService.js";
import { listTemplateStatus } from "../services/DocsConfigService.js";
import { getFileAssociationStatus, registerFileAssociations } from "../services/FileAssociationService.js";
import { requestTranslation } from "../services/TranslationApiService.js";
import type { Settings } from "../services/SettingsTypes.js";
import type { IpcContext } from "./storeContext.js";

export function registerSettingsAiIpc(ctx: IpcContext) {
  ipcMain.handle("settings:get", () => ctx.getSettings());

  ipcMain.handle("settings:update", (_event, patch: Partial<Settings>) => {
    const current = ctx.getSettings();
    const next = {
      ...current,
      ...patch,
      summary_figure_attachment_limit: ctx.clampSummaryFigureAttachmentLimit(
        patch.summary_figure_attachment_limit ?? current.summary_figure_attachment_limit,
      ),
      ai_send_notes_context: patch.ai_send_notes_context !== false,
      ai_send_summary_context: patch.ai_send_summary_context !== false,
      ai_send_annotations_context: patch.ai_send_annotations_context !== false,
      ai_send_loaded_pdf_text: patch.ai_send_loaded_pdf_text !== false,
      ai_send_figure_attachments: patch.ai_send_figure_attachments !== false,
    };
    ctx.store.settings = next;
    ctx.saveStore();
    createApplicationMenu((action) => ctx.window?.webContents.send("menu:action", action), next.ui_language, () => openHelpWindow(ctx.window));
    return next;
  });

  ipcMain.handle("settings:templates", () => listTemplateStatus());
  ipcMain.handle("settings:file-associations-status", () => getFileAssociationStatus());
  ipcMain.handle("settings:register-file-associations", () => registerFileAssociations());

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

  ipcMain.handle("ai:history:save", (_event, documentId: string, history: Array<{ role: "user" | "assistant"; content: string }> = []) => {
    ctx.getDocument(documentId);
    ctx.store.ai_history[documentId] = history
      .filter((message) => (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
      .map((message) => ({ role: message.role, content: message.content }));
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

  ipcMain.handle("clipboard:write-image", (_event, dataUrl: string) => {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
      throw new Error("Invalid image data.");
    }
    const image = nativeImage.createFromDataURL(dataUrl);
    if (image.isEmpty()) throw new Error("Could not create image from selection.");
    clipboard.writeImage(image);
  });
}
