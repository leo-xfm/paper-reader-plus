import { existsSync } from "node:fs";
import { resolveReadermReferences, type ReadermReference } from "./ReadermPackageService.js";
import type { DbDocument, StoredAsset, StoredData } from "../ipc/storeContext.js";
import type { StoredAnchor, StoredAnnotation } from "../storeMigration.js";

export type PackageHealthStatus = "ok" | "warning" | "error";

export type PackageHealthIssue = {
  issue_id: string;
  status: Exclude<PackageHealthStatus, "ok">;
  kind:
    | "missing-main-file"
    | "missing-package-file"
    | "missing-referenced-document"
    | "missing-anchor"
    | "orphan-annotation"
    | "missing-asset";
  message: string;
  document_id?: string;
  anchor_id?: string;
  annotation_id?: string;
  asset_id?: string;
  reference_id?: string;
};

export type PackageHealthReport = {
  document_id: string;
  status: PackageHealthStatus;
  issues: PackageHealthIssue[];
  checked_at: string;
};

type HealthStore = Pick<StoredData, "documents" | "notes" | "anchors" | "annotations" | "assets">;

function issue(input: Omit<PackageHealthIssue, "issue_id">): PackageHealthIssue {
  return {
    ...input,
    issue_id: [
      input.kind,
      input.document_id,
      input.anchor_id,
      input.annotation_id,
      input.asset_id,
      input.reference_id,
    ].filter(Boolean).join(":"),
  };
}

function documentById(documents: DbDocument[]) {
  return new Map(documents.map((document) => [document.document_id, document]));
}

function anchorKey(anchor: Pick<StoredAnchor, "document_id" | "anchor_id">) {
  return `${anchor.document_id}:${anchor.anchor_id}`;
}

function anchorIssueForReference(reference: ReadermReference): PackageHealthIssue {
  return issue({
    status: "error",
    kind: reference.status === "missing-document" ? "missing-referenced-document" : "missing-anchor",
    message: reference.status === "missing-document"
      ? `ReaderM reference points to missing document ${reference.document_id}.`
      : `ReaderM reference points to missing anchor ${reference.anchor_id}.`,
    document_id: reference.document_id,
    anchor_id: reference.anchor_id,
    reference_id: reference.reference_id,
  });
}

export function buildPackageHealthReport(store: HealthStore, documentId: string, checkedAt = new Date().toISOString()): PackageHealthReport {
  const documents = documentById(store.documents);
  const document = documents.get(documentId);
  const issues: PackageHealthIssue[] = [];
  if (!document) {
    return {
      document_id: documentId,
      status: "error",
      checked_at: checkedAt,
      issues: [issue({
        status: "error",
        kind: "missing-referenced-document",
        message: `Document ${documentId} is not in the library.`,
        document_id: documentId,
      })],
    };
  }

  if (!existsSync(document.file_path)) {
    issues.push(issue({
      status: "error",
      kind: "missing-main-file",
      message: `Main file is missing: ${document.file_path}`,
      document_id: document.document_id,
    }));
  }
  if (document.readerp_path && !existsSync(document.readerp_path)) {
    issues.push(issue({
      status: "error",
      kind: "missing-package-file",
      message: `ReaderP package is missing: ${document.readerp_path}`,
      document_id: document.document_id,
    }));
  }
  if (document.package_path && !existsSync(document.package_path)) {
    issues.push(issue({
      status: "error",
      kind: "missing-package-file",
      message: `ReaderM package is missing: ${document.package_path}`,
      document_id: document.document_id,
    }));
  }

  const anchorKeys = new Set(store.anchors.map(anchorKey));
  for (const annotation of store.annotations.filter((item) => item.document_id === documentId)) {
    if (!anchorKeys.has(anchorKey(annotation))) {
      issues.push(issue({
        status: "warning",
        kind: "orphan-annotation",
        message: `Annotation ${annotation.annotation_id} points to missing anchor ${annotation.anchor_id}.`,
        document_id: annotation.document_id,
        anchor_id: annotation.anchor_id,
        annotation_id: annotation.annotation_id,
      }));
    }
  }

  for (const asset of store.assets.filter((item: StoredAsset) => item.document_id === documentId)) {
    if (!existsSync(asset.path)) {
      issues.push(issue({
        status: "warning",
        kind: "missing-asset",
        message: `Image asset is missing: ${asset.file_name}`,
        document_id: asset.document_id,
        asset_id: asset.asset_id,
      }));
    }
  }

  if (document.source_type === "readerm") {
    const markdown = store.notes[documentId]?.content || "";
    const references = resolveReadermReferences(markdown, store.documents, store.anchors);
    for (const reference of references) {
      if (reference.status !== "resolved") issues.push(anchorIssueForReference(reference));
    }
    const referencedIds = new Set(references.map((reference) => reference.document_id));
    for (const id of referencedIds) {
      const referenced = documents.get(id);
      if (referenced && !existsSync(referenced.file_path)) {
        issues.push(issue({
          status: "error",
          kind: "missing-main-file",
          message: `Referenced document file is missing: ${referenced.file_path}`,
          document_id: id,
        }));
      }
    }
  }

  const status: PackageHealthStatus = issues.some((item) => item.status === "error")
    ? "error"
    : issues.length
      ? "warning"
      : "ok";
  return {
    document_id: documentId,
    status,
    issues,
    checked_at: checkedAt,
  };
}
