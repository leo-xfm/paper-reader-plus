import type { Ref } from "vue";
import type { RightPanelTab } from "@/components/ReaderPanelTabs";
import type { PdfTextItem } from "@/pdf/pdfTypes";
import { toIpcPlainObject } from "@/services/IpcPayloadService";
import { buildImageRegionAnchorCreateRequest, type ReaderSelection } from "@/services/ReaderAnchorService";
import { linkedImageMarkdown, markdownImagePattern, resizeMarkdownImage } from "@/services/MarkdownImageService";
import type { Anchor, AnnotationType, DocumentContext, RectPct } from "@/types";

type TextSelection = ReaderSelection & { position: { left: number; top: number; bottom?: number } };
type MarkdownTarget = "notes" | "summary";
type PendingImageInsert = { target: MarkdownTarget; selection?: { start: number; end: number } };

type UseMarkdownImageActionsOptions = {
  context: Ref<DocumentContext | null>;
  noteDraft: Ref<string>;
  summaryDraft: Ref<string>;
  notesMode: Ref<"edit" | "live" | "preview">;
  summaryMode: Ref<"edit" | "live" | "preview">;
  rightPanelTab: Ref<RightPanelTab>;
  rightPanelCollapsed: Ref<boolean>;
  pendingImageInsert: Ref<PendingImageInsert | null>;
  selectionState: Ref<TextSelection | null>;
  annotationToolMode: Ref<AnnotationType | "select" | "image">;
  activeAnchor: Ref<Anchor | null>;
  showNotice: (message: string) => void;
};

function insertMarkdownAt(value: string, markdown: string, selection?: { start: number; end: number }) {
  const insertion = `\n\n${markdown}\n\n`;
  if (!selection) return `${value}${insertion}`;
  return `${value.slice(0, selection.start)}${insertion}${value.slice(selection.end)}`;
}

export function useMarkdownImageActions(options: UseMarkdownImageActionsOptions) {
  function appendMarkdown(target: MarkdownTarget, markdown: string, selection?: { start: number; end: number }) {
    if (target === "summary") {
      options.summaryDraft.value = insertMarkdownAt(options.summaryDraft.value, markdown, selection);
      options.rightPanelTab.value = "summary";
      if (options.summaryMode.value === "preview") options.summaryMode.value = "live";
    } else {
      options.noteDraft.value = insertMarkdownAt(options.noteDraft.value, markdown, selection);
      options.rightPanelTab.value = "notes";
      if (options.notesMode.value === "preview") options.notesMode.value = "live";
    }
    options.rightPanelCollapsed.value = false;
  }

  async function insertImageAsset(payload: PendingImageInsert) {
    if (!options.context.value) return;
    if (options.context.value.document.source_type === "markdown") {
      options.showNotice("Open a PDF document before capturing an image region");
      return;
    }
    options.pendingImageInsert.value = payload;
    options.selectionState.value = null;
    options.annotationToolMode.value = "image";
    options.showNotice(`Drag a region on the PDF to insert it into ${payload.target === "summary" ? "Summary" : "Notes"}`);
  }

  async function pasteImageAsset(payload: PendingImageInsert & { dataUrl: string }) {
    if (!options.context.value) return;
    try {
      const result = await window.paperReaderPlus.saveImageDataUrl(options.context.value.document.document_id, payload.dataUrl, "pasted-image");
      appendMarkdown(payload.target, result.markdown, payload.selection);
      options.context.value.assets = [...(options.context.value.assets || []), result.asset];
      options.showNotice("Pasted image inserted");
    } catch (cause) {
      options.showNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function resizeMarkdownAssetImage(payload: { target: MarkdownTarget; assetPath: string }) {
    const current = payload.target === "summary" ? options.summaryDraft.value : options.noteDraft.value;
    const match = current.match(markdownImagePattern(payload.assetPath));
    if (!match) {
      options.showNotice("Could not find this image in the current markdown.");
      return;
    }
    const currentWidth = match[3] || "";
    const currentHeight = match[4] || "";
    const widthInput = window.prompt("Image width in pixels. Leave blank for auto.", currentWidth);
    if (widthInput === null) return;
    const heightInput = window.prompt("Image height in pixels. Leave blank for auto.", currentHeight);
    if (heightInput === null) return;
    const width = widthInput.trim() ? Number(widthInput.trim()) : 0;
    const height = heightInput.trim() ? Number(heightInput.trim()) : 0;
    if ((!Number.isFinite(width) || width < 0 || width > 9999) || (!Number.isFinite(height) || height < 0 || height > 9999)) {
      options.showNotice("Image size must be between 0 and 9999 pixels.");
      return;
    }
    const next = resizeMarkdownImage(current, payload.assetPath, Math.round(width), Math.round(height));
    if (payload.target === "summary") options.summaryDraft.value = next;
    else options.noteDraft.value = next;
    options.showNotice("Image size updated");
  }

  async function copyImageSelection(payload: { pageIndex: number; dataUrl: string; rectPct: RectPct }) {
    try {
      if (!options.context.value) return;
      const pending = options.pendingImageInsert.value;
      const target = pending?.target || (options.rightPanelTab.value === "summary" ? "summary" : "notes");
      const result = await window.paperReaderPlus.saveImageDataUrl(
        options.context.value.document.document_id,
        payload.dataUrl,
        `page-${payload.pageIndex + 1}`,
      );
      const anchor = await window.paperReaderPlus.createAnchor(
        options.context.value.document.document_id,
        toIpcPlainObject(buildImageRegionAnchorCreateRequest(payload.pageIndex, payload.rectPct)),
      );
      options.context.value.anchors = [...options.context.value.anchors, anchor];
      options.activeAnchor.value = anchor;
      appendMarkdown(target, linkedImageMarkdown(result.markdown, anchor), pending?.selection);
      options.context.value.assets = [...(options.context.value.assets || []), result.asset];
      options.pendingImageInsert.value = null;
      options.annotationToolMode.value = "select";
      options.showNotice(`Inserted image from page ${payload.pageIndex + 1}`);
    } catch (cause) {
      options.pendingImageInsert.value = null;
      options.showNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return {
    appendMarkdown,
    insertImageAsset,
    pasteImageAsset,
    resizeMarkdownAssetImage,
    copyImageSelection,
  };
}
