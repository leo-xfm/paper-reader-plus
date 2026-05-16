import type { Anchor, Annotation, AnnotationCreateRequest, AnnotationType } from "@/types";

export type AnnotationToolMode = "select" | "image" | AnnotationType;

export type AnnotationFilters = {
  type: "all" | AnnotationType;
  color: "all" | string;
  page: "all" | number;
  content: "all" | "commented" | "tagged";
};

export const ANNOTATION_COLORS = ["#FACC15", "#F87171", "#55AE3A", "#38A6D9", "#9B80D9", "#D75CE5", "#F7982B", "#A3A3A3"];

export function buildAnnotationSortIndex(anchor: Pick<Anchor, "page_index" | "created_at" | "anchor_id">) {
  return `${String(anchor.page_index).padStart(6, "0")}:${anchor.created_at}:${anchor.anchor_id}`;
}

export function buildAnnotationCreateRequest(anchor: Anchor, type: AnnotationType, color: string): AnnotationCreateRequest {
  return {
    anchor_id: String(anchor.anchor_id),
    type,
    color: String(color || "#BBD4F6"),
    sort_index: buildAnnotationSortIndex(anchor),
    target: {
      rects_pct: anchor.rects_pct.map((rect) => ({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      })),
      text_quote: {
        exact: anchor.text_quote.exact,
        prefix: anchor.text_quote.prefix,
        suffix: anchor.text_quote.suffix,
      },
      text_position: anchor.text_position ? {
        start: anchor.text_position.start,
        end: anchor.text_position.end,
        extraction_version: anchor.text_position.extraction_version,
      } : undefined,
    },
    comment: type === "note" ? "New note" : "",
    tags: [],
  };
}

export function annotationMatchesFilters(annotation: Pick<Annotation, "type" | "color" | "page_index" | "comment" | "tags">, filters: AnnotationFilters) {
  if (filters.type !== "all" && annotation.type !== filters.type) return false;
  if (filters.color !== "all" && annotation.color.toLowerCase() !== filters.color.toLowerCase()) return false;
  if (filters.page !== "all" && annotation.page_index !== filters.page) return false;
  if (filters.content === "commented" && !annotation.comment.trim()) return false;
  if (filters.content === "tagged" && annotation.tags.length === 0) return false;
  return true;
}

export function sortAnnotations(annotations: Annotation[]) {
  return annotations.slice().sort((left, right) => {
    const sort = left.sort_index.localeCompare(right.sort_index);
    return sort || left.created_at.localeCompare(right.created_at);
  });
}

export function hasActiveAnnotationFilters(filters: AnnotationFilters) {
  return filters.type !== "all" || filters.color !== "all" || filters.page !== "all" || filters.content !== "all";
}

export function parseTagsInput(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
