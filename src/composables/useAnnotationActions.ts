import { nextTick, type ComputedRef, type Ref } from "vue";
import type { RightPanelTab } from "@/components/ReaderPanelTabs";
import type { PdfTextItem } from "@/pdf/pdfTypes";
import { toIpcPlainObject } from "@/services/IpcPayloadService";
import { buildAnchorCreateRequest, type ReaderSelection } from "@/services/ReaderAnchorService";
import { buildAnnotationCreateRequest, type AnnotationToolMode } from "@/services/ReaderAnnotationService";
import { buildTemplatedMarkdownQuote } from "@/services/QuoteTemplateService";
import type { Anchor, Annotation, AnnotationType, DocumentContext, RectPct, Settings } from "@/types";

type TextSelection = ReaderSelection & { position: { left: number; top: number; bottom?: number } };
type AnnotationCommentEditor = {
  annotationId: string;
  type: "highlight" | "underline";
  color: string;
  draft: string;
  tagsDraft: string;
  position: { left: number; top: number };
};

type UseAnnotationActionsOptions = {
  context: Ref<DocumentContext | null>;
  selectedText: ComputedRef<string>;
  selectionState: Ref<TextSelection | null>;
  activeAnchor: Ref<Anchor | null>;
  activeAnnotation: Ref<Annotation | null>;
  annotationToolMode: Ref<AnnotationToolMode>;
  annotationColor: Ref<string>;
  pendingImageInsert: Ref<{ target: "notes" | "summary"; selection?: { start: number; end: number } } | null>;
  lastCreatedAnnotationId: Ref<string | null>;
  annotationCommentEditor: Ref<AnnotationCommentEditor | null>;
  annotationCommentTextarea: Ref<HTMLTextAreaElement | null>;
  noteDraft: Ref<string>;
  notesMode: Ref<"edit" | "live" | "preview">;
  settings: Ref<Settings | null> | ComputedRef<Settings | null>;
  getNoteInsertionSelection?: () => { start: number; end: number } | undefined;
  rightPanelTab: Ref<RightPanelTab>;
  rightPanelCollapsed: Ref<boolean>;
  pageTextItems: Ref<Record<number, PdfTextItem[]>>;
  scrollToPage: (pageIndex: number, options?: { rectsPct?: RectPct[]; block?: "start" | "center" }) => void;
  showNotice: (message: string) => void;
};

export function useAnnotationActions(options: UseAnnotationActionsOptions) {
  async function ensureAnchor(createdFrom: Anchor["created_from"] = "selection") {
    if (!options.context.value || !options.selectionState.value) return null;
    const pageItems = options.pageTextItems.value[options.selectionState.value.pageIndex] || [];
    const payload = toIpcPlainObject(buildAnchorCreateRequest(options.selectionState.value, pageItems, createdFrom));
    const anchor = await window.paperReaderPlus.createAnchor(options.context.value.document.document_id, payload);
    options.context.value.anchors = [...options.context.value.anchors, anchor];
    options.activeAnchor.value = anchor;
    return anchor;
  }

  async function createAnnotation(type: AnnotationType) {
    if (!options.context.value || !options.selectionState.value) return;
    try {
      const editorPosition = {
        left: options.selectionState.value.position.left,
        top: options.selectionState.value.position.bottom ?? options.selectionState.value.position.top,
      };
      window.getSelection()?.removeAllRanges();
      const anchor = await ensureAnchor("annotation");
      if (!anchor) return;
      const payload = toIpcPlainObject(buildAnnotationCreateRequest(anchor, type, options.annotationColor.value));
      const annotation = await window.paperReaderPlus.createAnnotation(options.context.value.document.document_id, payload);
      options.context.value.annotations = [...options.context.value.annotations, annotation];
      options.activeAnnotation.value = annotation;
      options.lastCreatedAnnotationId.value = annotation.annotation_id;
      options.selectionState.value = null;
      if (type === "highlight" || type === "underline") {
        openAnnotationCommentEditor(annotation, annotationPopoverPosition(annotation, editorPosition));
      } else {
        options.showNotice(`${type} created`);
      }
      if (type === "note") {
        options.rightPanelCollapsed.value = false;
        options.rightPanelTab.value = "annotations";
      }
    } catch (cause) {
      options.showNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function handleSelection(payload: TextSelection) {
    options.selectionState.value = payload;
    if (options.annotationToolMode.value === "highlight" || options.annotationToolMode.value === "underline" || options.annotationToolMode.value === "note") {
      void createAnnotation(options.annotationToolMode.value);
    }
  }

  function handleAnnotationToolMode(mode: AnnotationToolMode) {
    if (mode === "select") {
      options.annotationToolMode.value = "select";
      options.pendingImageInsert.value = null;
      return;
    }
    if (mode === "image") {
      options.selectionState.value = null;
      options.annotationToolMode.value = "image";
      options.showNotice("Drag a region on the PDF to copy it as an image");
      return;
    }
    if (options.selectionState.value) {
      void createAnnotation(mode);
      return;
    }
    options.annotationToolMode.value = mode;
    options.showNotice(`Select text to create ${mode}`);
  }

  async function openAnnotationCommentEditor(annotation: Annotation, position: { left: number; top: number }) {
    if (annotation.type !== "highlight" && annotation.type !== "underline") return;
    options.annotationCommentEditor.value = {
      annotationId: annotation.annotation_id,
      type: annotation.type,
      color: annotation.color,
      draft: annotation.comment || "",
      tagsDraft: annotation.tags.join(", "),
      position,
    };
    await nextTick();
    options.annotationCommentTextarea.value?.focus();
  }

  async function saveAnnotationCommentEditor() {
    const editor = options.annotationCommentEditor.value;
    if (!editor || !options.context.value) return;
    const annotation = options.context.value.annotations.find((item) => item.annotation_id === editor.annotationId);
    options.annotationCommentEditor.value = null;
    if (!annotation) return;
    const comment = editor.draft.trim();
    const tags = parseAnnotationTags(editor.tagsDraft);
    const patch = {
      type: editor.type,
      color: editor.color,
      comment,
      tags,
    };
    if (
      patch.type === annotation.type
      && patch.color === annotation.color
      && patch.comment === annotation.comment
      && patch.tags.join("\u0000") === annotation.tags.join("\u0000")
    ) return;
    await updateAnnotation(annotation, patch);
  }

  function parseAnnotationTags(value: string) {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  async function updateAnnotationCommentEditorType(type: "highlight" | "underline") {
    const editor = options.annotationCommentEditor.value;
    if (!editor || !options.context.value) return;
    editor.type = type;
    const annotation = options.context.value.annotations.find((item) => item.annotation_id === editor.annotationId);
    if (!annotation || annotation.type === type) return;
    await updateAnnotation(annotation, { type });
  }

  async function updateAnnotationCommentEditorColor(color: string) {
    const editor = options.annotationCommentEditor.value;
    if (!editor || !options.context.value) return;
    editor.color = color;
    const annotation = options.context.value.annotations.find((item) => item.annotation_id === editor.annotationId);
    if (!annotation || annotation.color.toLowerCase() === color.toLowerCase()) return;
    await updateAnnotation(annotation, { color });
  }

  async function undoLastAnnotation() {
    if (!options.context.value || !options.lastCreatedAnnotationId.value) {
      options.showNotice("Nothing to undo");
      return;
    }
    const annotation = options.context.value.annotations.find((item) => item.annotation_id === options.lastCreatedAnnotationId.value);
    if (!annotation) {
      options.lastCreatedAnnotationId.value = null;
      options.showNotice("Nothing to undo");
      return;
    }
    await window.paperReaderPlus.deleteAnnotation(options.context.value.document.document_id, annotation.annotation_id);
    options.context.value.annotations = options.context.value.annotations.filter((item) => item.annotation_id !== annotation.annotation_id);
    if (options.activeAnnotation.value?.annotation_id === annotation.annotation_id) options.activeAnnotation.value = null;
    options.lastCreatedAnnotationId.value = null;
    options.showNotice("Undid last annotation");
  }

  async function copySelectedText() {
    if (!options.selectedText.value) return;
    await navigator.clipboard.writeText(options.selectedText.value);
    options.showNotice("Copied");
  }

  async function copyQuote() {
    const anchor = await ensureAnchor("selection");
    if (!anchor) {
      options.showNotice("Select text first");
      return;
    }
    const quote = buildTemplatedMarkdownQuote({
      anchor,
      document: options.context.value?.document,
      text: options.selectionState.value?.text,
      template: options.settings.value?.copy_quote_template,
    });
    await navigator.clipboard.writeText(quote);
    options.showNotice("Quote copied");
  }

  async function quoteToNote() {
    const anchor = await ensureAnchor("selection");
    if (!anchor) {
      options.showNotice("Select text first");
      return;
    }
    const quote = buildTemplatedMarkdownQuote({
      anchor,
      document: options.context.value?.document,
      template: options.settings.value?.quote_to_note_template,
    });
    options.noteDraft.value = insertMarkdownAt(options.noteDraft.value, quote, options.getNoteInsertionSelection?.());
    options.rightPanelCollapsed.value = false;
    options.rightPanelTab.value = "notes";
    options.notesMode.value = "live";
  }

  function insertMarkdownAt(value: string, markdown: string, selection?: { start: number; end: number }) {
    const insertion = `\n\n${markdown}\n\n`;
    if (!selection) return `${value}${insertion}`;
    return `${value.slice(0, selection.start)}${insertion}${value.slice(selection.end)}`;
  }

  async function updateAnnotation(annotation: Annotation, patch: { type?: AnnotationType; color?: string; comment?: string; tags?: string[] }) {
    if (!options.context.value) return;
    const updated = await window.paperReaderPlus.updateAnnotation(options.context.value.document.document_id, annotation.annotation_id, toIpcPlainObject(patch));
    options.context.value.annotations = options.context.value.annotations.map((item) => item.annotation_id === updated.annotation_id ? updated : item);
    if (options.activeAnnotation.value?.annotation_id === updated.annotation_id) options.activeAnnotation.value = updated;
  }

  async function deleteAnnotation(annotation: Annotation) {
    if (!options.context.value) return;
    await window.paperReaderPlus.deleteAnnotation(options.context.value.document.document_id, annotation.annotation_id);
    options.context.value.annotations = options.context.value.annotations.filter((item) => item.annotation_id !== annotation.annotation_id);
    if (options.activeAnnotation.value?.annotation_id === annotation.annotation_id) options.activeAnnotation.value = null;
  }

  function selectAnnotation(annotation: Annotation) {
    options.activeAnnotation.value = annotation;
    options.activeAnchor.value = null;
    options.scrollToPage(annotation.page_index, { rectsPct: annotation.target.rects_pct, block: "center" });
  }

  function annotationPopoverPosition(annotation: Annotation, fallback?: { left: number; top: number }) {
    const rect = annotation.target.rects_pct[0];
    const page = document.querySelector<HTMLElement>(`.pdf-page[data-page-index="${annotation.page_index}"]`);
    const pageBox = page?.getBoundingClientRect();
    if (!rect || !pageBox) return fallback || { left: 12, top: 12 };
    const viewportMargin = 12;
    const popoverWidth = 380;
    const popoverHeight = 208;
    const targetLeft = pageBox.left + rect.left * pageBox.width;
    const targetRight = pageBox.left + (rect.left + rect.width) * pageBox.width;
    const targetTop = pageBox.top + rect.top * pageBox.height;
    const targetBottom = pageBox.top + (rect.top + rect.height) * pageBox.height;
    const rightSide = targetRight + 12;
    const leftSide = targetLeft - popoverWidth - 12;
    let left = rightSide + popoverWidth <= window.innerWidth - viewportMargin ? rightSide : leftSide;
    if (left < viewportMargin) left = Math.min(Math.max(viewportMargin, fallback?.left ?? targetLeft), window.innerWidth - popoverWidth - viewportMargin);
    let top = targetTop;
    if (top + popoverHeight > window.innerHeight - viewportMargin) top = targetBottom + 12;
    if (top + popoverHeight > window.innerHeight - viewportMargin) top = targetTop - popoverHeight - 12;
    return {
      left,
      top,
    };
  }

  function handleAnnotationClick(annotation: Annotation) {
    options.activeAnnotation.value = annotation;
    options.activeAnchor.value = null;
    if (annotation.type === "highlight" || annotation.type === "underline") {
      void openAnnotationCommentEditor(annotation, annotationPopoverPosition(annotation));
    }
  }

  return {
    ensureAnchor,
    createAnnotation,
    handleSelection,
    handleAnnotationToolMode,
    openAnnotationCommentEditor,
    saveAnnotationCommentEditor,
    updateAnnotationCommentEditorType,
    updateAnnotationCommentEditorColor,
    undoLastAnnotation,
    copySelectedText,
    copyQuote,
    quoteToNote,
    updateAnnotation,
    deleteAnnotation,
    selectAnnotation,
    handleAnnotationClick,
  };
}
