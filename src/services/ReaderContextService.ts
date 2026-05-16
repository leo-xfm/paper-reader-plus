import { buildReaderAnchorHref } from "@/services/ReaderAnchorService";
import type { Anchor, Annotation, DocumentContext, LibraryDocument, ReaderContextPayload, ReaderEvidence } from "@/types";

export function buildReaderEvidence(anchor: Anchor, annotation?: Annotation | null): ReaderEvidence {
  return {
    evidence_id: annotation?.annotation_id || anchor.anchor_id,
    document_id: anchor.document_id,
    anchor_id: anchor.anchor_id,
    page_index: anchor.page_index,
    href: buildReaderAnchorHref(anchor, anchor.page_index + 1),
    quote: annotation?.target.text_quote?.exact || anchor.text_quote.exact,
    annotation_id: annotation?.annotation_id,
    annotation_type: annotation?.type,
    comment: annotation?.comment || undefined,
  };
}

export function collectReaderEvidences(context: Pick<DocumentContext, "anchors" | "annotations"> | null, limit = 12): ReaderEvidence[] {
  if (!context) return [];
  const documentIds = new Set(context.anchors.map((anchor) => anchor.document_id));
  const currentDocumentId = documentIds.size === 1 ? [...documentIds][0] : null;
  const currentAnchors = currentDocumentId
    ? context.anchors.filter((anchor) => anchor.document_id === currentDocumentId)
    : context.anchors;
  const currentAnnotations = currentDocumentId
    ? context.annotations.filter((annotation) => annotation.document_id === currentDocumentId)
    : context.annotations;
  const anchorsById = new Map(currentAnchors.map((anchor) => [anchor.anchor_id, anchor]));
  const annotated = currentAnnotations
    .slice()
    .sort((left, right) => left.sort_index.localeCompare(right.sort_index))
    .map((annotation) => {
      const anchor = anchorsById.get(annotation.anchor_id);
      return anchor ? buildReaderEvidence(anchor, annotation) : null;
    })
    .filter((evidence): evidence is ReaderEvidence => Boolean(evidence));
  const annotatedAnchorIds = new Set(annotated.map((evidence) => evidence.anchor_id));
  const bareAnchors = currentAnchors
    .filter((anchor) => !annotatedAnchorIds.has(anchor.anchor_id))
    .map((anchor) => buildReaderEvidence(anchor));
  return [...annotated, ...bareAnchors].slice(0, limit);
}

export function buildReaderContextPayload(args: {
  document: LibraryDocument;
  context: Pick<DocumentContext, "anchors" | "annotations">;
  note: string;
  summary: string;
  selection?: ReaderContextPayload["selection"];
  activeAnchor?: Anchor | null;
  activeAnnotation?: Annotation | null;
  evidenceLimit?: number;
}): ReaderContextPayload {
  const currentContext = {
    anchors: args.context.anchors.filter((anchor) => anchor.document_id === args.document.document_id),
    annotations: args.context.annotations.filter((annotation) => annotation.document_id === args.document.document_id),
  };
  return {
    document: args.document,
    selection: args.selection || null,
    active_anchor: args.activeAnchor || null,
    active_annotation: args.activeAnnotation || null,
    note: args.note,
    summary: args.summary,
    evidences: collectReaderEvidences(currentContext, args.evidenceLimit),
  };
}

export function evidenceListMarkdown(evidences: ReaderEvidence[]) {
  if (!evidences.length) return "Evidence: Needs verification";
  return evidences
    .map((evidence, index) => [
      `${index + 1}. Quote: ${evidence.quote}`,
      `   Evidence: [p. ${evidence.page_index + 1}](${evidence.href})`,
      evidence.comment ? `   Comment: ${evidence.comment}` : "",
    ].filter(Boolean).join("\n"))
    .join("\n");
}
