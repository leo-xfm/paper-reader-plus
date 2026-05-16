import { randomUUID } from "node:crypto";
import { ipcMain } from "electron";
import type { StoredAnchor, StoredAnnotation } from "../storeMigration.js";
import type { IpcContext } from "./storeContext.js";

export function registerAnnotationIpc(ctx: IpcContext) {
  ipcMain.handle("anchors:create", (_event, documentId: string, payload: Record<string, unknown>) => {
    ctx.getDocument(documentId);
    const createdFrom = payload.created_from === "markdown" || payload.created_from === "ai" || payload.created_from === "annotation"
      ? payload.created_from
      : "selection";
    const anchor: StoredAnchor = {
      anchor_id: randomUUID(),
      document_id: documentId,
      page_index: Number(payload.page_index || 0),
      page_label: typeof payload.page_label === "string" ? payload.page_label : undefined,
      rects_pct: ctx.cleanRectList(payload.rects_pct),
      text_quote: ctx.cleanTextQuote(payload.text_quote),
      text_position: ctx.isRecord(payload.text_position) ? payload.text_position as StoredAnchor["text_position"] : undefined,
      created_from: createdFrom,
      metadata: ctx.isRecord(payload.metadata) ? payload.metadata : {},
      created_at: ctx.now(),
    };
    ctx.store.anchors.push(anchor);
    ctx.saveStore();
    return anchor;
  });

  ipcMain.handle("annotations:create", (_event, documentId: string, payload: Record<string, unknown>) => {
    ctx.getDocument(documentId);
    const anchorId = String(payload.anchor_id || "");
    const anchor = ctx.listAnchors(documentId).find((item) => item.anchor_id === anchorId);
    if (!anchor) throw new Error("Anchor not found.");
    const timestamp = ctx.now();
    const annotationId = randomUUID();
    const payloadTarget = ctx.isRecord(payload.target) ? payload.target : {};
    const targetRects = ctx.cleanRectList(payloadTarget.rects_pct);
    const annotation: StoredAnnotation = {
      annotation_id: annotationId,
      document_id: documentId,
      anchor_id: anchorId,
      type: payload.type === "underline" || payload.type === "note" ? payload.type : "highlight",
      color: String(payload.color || "#BBD4F6"),
      page_index: anchor.page_index,
      sort_index: typeof payload.sort_index === "string" && payload.sort_index
        ? payload.sort_index
        : ctx.buildSortIndex(anchor.page_index, timestamp, annotationId),
      target: {
        rects_pct: targetRects.length ? targetRects : anchor.rects_pct,
        text_quote: ctx.isRecord(payloadTarget.text_quote) ? ctx.cleanTextQuote(payloadTarget.text_quote) : anchor.text_quote,
        text_position: ctx.isRecord(payloadTarget.text_position) ? payloadTarget.text_position as StoredAnchor["text_position"] : anchor.text_position,
        quad_points_pdf: Array.isArray(payloadTarget.quad_points_pdf) ? payloadTarget.quad_points_pdf as number[][] : undefined,
        source_map: payloadTarget.source_map,
      },
      comment: String(payload.comment || ""),
      tags: Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is string => typeof tag === "string") : [],
      read_only: payload.read_only === true,
      imported_from_pdf: payload.imported_from_pdf === true,
      created_at: timestamp,
      updated_at: timestamp,
    };
    ctx.store.annotations.push(annotation);
    ctx.saveStore();
    return annotation;
  });

  ipcMain.handle("annotations:update", (_event, documentId: string, annotationId: string, payload: Record<string, unknown>) => {
    ctx.getDocument(documentId);
    const existing = ctx.listAnnotations(documentId).find((item) => item.annotation_id === annotationId);
    if (!existing) throw new Error("Annotation not found.");
    const payloadTarget = ctx.isRecord(payload.target) ? payload.target : null;
    const targetRects = payloadTarget ? ctx.cleanRectList(payloadTarget.rects_pct) : [];
    const updated = {
      type: payload.type === "underline" || payload.type === "note" || payload.type === "highlight" ? payload.type : existing.type,
      color: typeof payload.color === "string" ? payload.color : existing.color,
      comment: typeof payload.comment === "string" ? payload.comment : existing.comment,
      tags: Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is string => typeof tag === "string") : existing.tags,
      target: payloadTarget ? {
        rects_pct: targetRects.length ? targetRects : existing.target.rects_pct,
        text_quote: ctx.isRecord(payloadTarget.text_quote) ? ctx.cleanTextQuote(payloadTarget.text_quote) : existing.target.text_quote,
        text_position: ctx.isRecord(payloadTarget.text_position) ? payloadTarget.text_position as StoredAnchor["text_position"] : existing.target.text_position,
        quad_points_pdf: Array.isArray(payloadTarget.quad_points_pdf) ? payloadTarget.quad_points_pdf as number[][] : existing.target.quad_points_pdf,
        source_map: payloadTarget.source_map ?? existing.target.source_map,
      } : existing.target,
      updated_at: ctx.now(),
    };
    existing.type = updated.type;
    existing.color = updated.color;
    existing.comment = updated.comment;
    existing.tags = updated.tags;
    existing.target = updated.target;
    existing.updated_at = updated.updated_at;
    ctx.saveStore();
    return existing;
  });

  ipcMain.handle("annotations:delete", (_event, documentId: string, annotationId: string) => {
    ctx.getDocument(documentId);
    ctx.store.annotations = ctx.store.annotations.filter((item) => !(item.annotation_id === annotationId && item.document_id === documentId));
    ctx.saveStore();
  });

  ipcMain.handle("dictionary:list", () => ctx.store.dictionary || []);
}
