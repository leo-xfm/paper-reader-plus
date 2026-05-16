import type { AiContextOptions, ReaderContextPayload } from "@/types";

export function filterReaderContextForAi(context: ReaderContextPayload, options?: Partial<AiContextOptions> | null): ReaderContextPayload {
  const settings = {
    ai_send_notes_context: options?.ai_send_notes_context !== false,
    ai_send_summary_context: options?.ai_send_summary_context !== false,
    ai_send_annotations_context: options?.ai_send_annotations_context !== false,
    ai_send_loaded_pdf_text: options?.ai_send_loaded_pdf_text !== false,
    ai_send_figure_attachments: options?.ai_send_figure_attachments !== false,
  };
  const next: ReaderContextPayload = {
    ...context,
    note: settings.ai_send_notes_context ? context.note : "",
    summary: settings.ai_send_summary_context ? context.summary : "",
    evidences: settings.ai_send_annotations_context ? context.evidences : [],
  };
  if (!settings.ai_send_loaded_pdf_text) {
    next.summary_source = context.summary_source
      ? {
        ...context.summary_source,
        content: "(loaded PDF text context disabled in AI Context settings)",
      }
      : undefined;
  }
  if (!settings.ai_send_figure_attachments) delete next.figure_attachments;
  return next;
}
