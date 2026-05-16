import { existsSync, rmSync } from "node:fs";
import { extractAssetPathsFromMarkdown } from "../ReaderPackageService.js";
import type { StoredData } from "../ipc/storeContext.js";

export type CleanupUnusedResult = {
  document_id: string;
  removed_anchors: number;
  removed_assets: number;
  removed_asset_files: number;
};

type CleanupStore = Pick<StoredData, "notes" | "summaries" | "ai_history" | "anchors" | "annotations" | "assets" | "dictionary">;

function readerAnchorIds(...sources: string[]) {
  const ids = new Set<string>();
  for (const source of sources) {
    for (const match of String(source || "").matchAll(/\/reader\?[^)\s"']+/g)) {
      try {
        const url = new URL(match[0], "http://paper-reader-plus.local");
        const anchorId = url.searchParams.get("anchor");
        if (anchorId) ids.add(anchorId);
      } catch {
        // Ignore malformed reader links.
      }
    }
  }
  return ids;
}

export function cleanupUnusedDocumentResources(store: CleanupStore, documentId: string): CleanupUnusedResult {
  const note = store.notes[documentId]?.content || "";
  const summary = store.summaries[documentId]?.content || "";
  const aiText = (store.ai_history[documentId] || []).map((message) => message.content).join("\n");

  const usedAnchors = readerAnchorIds(note, summary, aiText);
  for (const annotation of store.annotations.filter((item) => item.document_id === documentId)) {
    usedAnchors.add(annotation.anchor_id);
  }
  for (const entry of store.dictionary) {
    if (entry.source_document_id === documentId && entry.source_anchor_id) usedAnchors.add(entry.source_anchor_id);
  }

  const beforeAnchors = store.anchors.length;
  store.anchors = store.anchors.filter((anchor) => anchor.document_id !== documentId || usedAnchors.has(anchor.anchor_id));

  const usedAssets = extractAssetPathsFromMarkdown(note, summary, aiText);
  let removedAssetFiles = 0;
  const nextAssets = [];
  for (const asset of store.assets) {
    if (asset.document_id !== documentId || usedAssets.has(`assets/${asset.file_name}`)) {
      nextAssets.push(asset);
      continue;
    }
    if (existsSync(asset.path)) {
      rmSync(asset.path, { force: true });
      removedAssetFiles += 1;
    }
  }
  const beforeAssets = store.assets.length;
  store.assets = nextAssets;

  return {
    document_id: documentId,
    removed_anchors: beforeAnchors - store.anchors.length,
    removed_assets: beforeAssets - store.assets.length,
    removed_asset_files: removedAssetFiles,
  };
}
