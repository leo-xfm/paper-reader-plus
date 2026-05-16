import JSZip from "jszip";
import { extractAssetPathsFromMarkdown, type ReaderPackageAssetInput, type ReaderPackageDocument } from "../ReaderPackageService.js";

export type ReadermReferenceStatus = "resolved" | "missing-document" | "missing-anchor";

export type ReadermReference = {
  reference_id: string;
  document_id: string;
  anchor_id: string;
  href: string;
  markdown_start: number;
  markdown_end: number;
  label: string;
  status: ReadermReferenceStatus;
  page_index?: number;
  page_label?: string;
  rects_pct?: Array<{ left: number; top: number; width: number; height: number }>;
  text_quote?: { exact: string; prefix?: string; suffix?: string };
};

export type ReadermPackageManifest = {
  format: "paper-reader-plus.readerm";
  version: 1;
  document_id: string;
  title: string;
  file_name: string;
  document_kind: "readerm";
  package_mode: "markdown-centered";
  created_at: string;
  updated_at: string;
  files: {
    markdown: string;
    documents: string;
    references: string;
    anchors: string;
    annotations: string;
    symbols?: string;
    pdfs?: Record<string, string>;
    latex_files?: Record<string, string>;
    assets: string;
    assets_manifest?: string;
  };
};

export type ReadermPackagePayload = {
  document: ReaderPackageDocument;
  markdown: string;
  references: ReadermReference[];
  documents: ReaderPackageDocument[];
  anchors: unknown[];
  annotations: unknown[];
  symbols?: unknown[];
  pdfDataByDocumentId?: Record<string, Buffer>;
  latexDataByDocumentId?: Record<string, Buffer>;
  assets?: ReaderPackageAssetInput[];
};

export type ReadermPackageReadResult = ReadermPackagePayload & {
  manifest: ReadermPackageManifest;
  pdfDataByDocumentId: Record<string, Buffer>;
  latexDataByDocumentId: Record<string, Buffer>;
  assets: Array<{
    asset_id: string;
    document_id?: string;
    file_name: string;
    mime_type: string;
    path: string;
    original_name?: string;
    created_at?: string;
    data: Buffer;
  }>;
};

const READERM_FORMAT = "paper-reader-plus.readerm";

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeAssetPath(value: string) {
  const withoutQuery = value.trim().replace(/^\.\/+/, "").split(/[?#]/)[0];
  if (!/^assets\/[^/\\][^\\]*$/i.test(withoutQuery)) return "";
  if (withoutQuery.includes("..")) return "";
  return withoutQuery.replace(/\\/g, "/");
}

function asManifest(value: unknown): ReadermPackageManifest {
  if (!value || typeof value !== "object") throw new Error("Invalid readerm manifest.");
  const manifest = value as Partial<ReadermPackageManifest>;
  if (manifest.format !== READERM_FORMAT || manifest.version !== 1 || manifest.document_kind !== "readerm") {
    throw new Error("Unsupported readerm package format.");
  }
  if (!manifest.files?.markdown || !manifest.files.documents || !manifest.files.references) {
    throw new Error("ReaderM package manifest is missing required files.");
  }
  return manifest as ReadermPackageManifest;
}

function safeReferenceId(documentId: string, anchorId: string) {
  return `ref_${Buffer.from(`${documentId}:${anchorId}`).toString("base64url").slice(0, 24)}`;
}

export function extractReadermReferenceLinks(markdown: string): ReadermReference[] {
  const references: ReadermReference[] = [];
  const seen = new Set<string>();
  const source = String(markdown || "");
  const linkPattern = /\[(!\[[^\]]*\]\([^)]*\))\]\((\/reader\?[^)\s"']+)(?:\s+[^)]*)?\)|\[([^\]]*)\]\((\/reader\?[^)\s"']+)(?:\s+[^)]*)?\)|(?<!\]\()\/reader\?[^)\s"']+/g;
  for (const match of source.matchAll(linkPattern)) {
    const href = match[2] || match[4] || match[0];
    const labelSource = match[1] || match[3] || "";
    try {
      const url = new URL(href, "http://paper-reader-plus.local");
      const documentId = url.searchParams.get("documentId") || "";
      const anchorId = url.searchParams.get("anchor") || "";
      if (!documentId || !anchorId) continue;
      const key = `${documentId}:${anchorId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const markdownStart = match.index || 0;
      const markdownEnd = markdownStart + match[0].length;
      references.push({
        reference_id: safeReferenceId(documentId, anchorId),
        document_id: documentId,
        anchor_id: anchorId,
        href,
        markdown_start: markdownStart,
        markdown_end: markdownEnd,
        label: labelSource.replace(/^!?\[/, "").replace(/\]\([^)]*\)$/, "") || url.searchParams.get("page") || anchorId,
        status: "missing-document",
      });
    } catch {
      // Ignore malformed links; the Markdown source remains untouched.
    }
  }
  return references;
}

export function resolveReadermReferences(
  markdown: string,
  documents: Array<{ document_id: string }>,
  anchors: Array<{
    anchor_id: string;
    document_id: string;
    page_index?: number;
    page_label?: string;
    rects_pct?: ReadermReference["rects_pct"];
    text_quote?: ReadermReference["text_quote"];
  }>,
): ReadermReference[] {
  const documentIds = new Set(documents.map((document) => document.document_id));
  const anchorsByKey = new Map(anchors.map((anchor) => [`${anchor.document_id}:${anchor.anchor_id}`, anchor]));
  return extractReadermReferenceLinks(markdown).map((reference) => {
    if (!documentIds.has(reference.document_id)) return reference;
    const anchor = anchorsByKey.get(`${reference.document_id}:${reference.anchor_id}`);
    if (!anchor) return { ...reference, status: "missing-anchor" };
    return {
      ...reference,
      status: "resolved",
      page_index: anchor.page_index,
      page_label: anchor.page_label,
      rects_pct: anchor.rects_pct,
      text_quote: anchor.text_quote,
    };
  });
}

function referencedDocumentIds(references: ReadermReference[]) {
  return new Set(references.map((reference) => reference.document_id));
}

function packageAssets(payload: ReadermPackagePayload) {
  const referenced = extractAssetPathsFromMarkdown(payload.markdown);
  return (payload.assets || []).filter((asset) => referenced.has(`assets/${asset.file_name}`));
}

function buildManifest(payload: ReadermPackagePayload): ReadermPackageManifest {
  const assets = packageAssets(payload);
  return {
    format: READERM_FORMAT,
    version: 1,
    document_id: payload.document.document_id,
    title: payload.document.title,
    file_name: payload.document.file_name,
    document_kind: "readerm",
    package_mode: "markdown-centered",
    created_at: payload.document.created_at,
    updated_at: payload.document.updated_at,
    files: {
      markdown: "readerm.md",
      documents: "documents.json",
      references: "references.json",
      anchors: "anchors.json",
      annotations: "annotations.json",
      symbols: "symbols.json",
      pdfs: payload.pdfDataByDocumentId
        ? Object.fromEntries(Object.keys(payload.pdfDataByDocumentId).map((documentId) => [documentId, `pdfs/${documentId}.pdf`]))
        : undefined,
      latex_files: payload.latexDataByDocumentId
        ? Object.fromEntries(Object.keys(payload.latexDataByDocumentId).map((documentId) => [documentId, `sources/${documentId}.tex`]))
        : undefined,
      assets: "assets/",
      assets_manifest: assets.length ? "assets/assets.json" : undefined,
    },
  };
}

export async function createReadermPackageBuffer(payload: ReadermPackagePayload) {
  const zip = new JSZip();
  const manifest = buildManifest(payload);
  const references = payload.references.length ? payload.references : resolveReadermReferences(payload.markdown, payload.documents, payload.anchors as Parameters<typeof resolveReadermReferences>[2]);
  const referencedIds = referencedDocumentIds(references);
  const documents = payload.documents.filter((document) => document.document_id === payload.document.document_id || referencedIds.has(document.document_id));
  const anchors = payload.anchors.filter((anchor) => typeof anchor === "object" && anchor !== null && referencedIds.has((anchor as { document_id?: string }).document_id || ""));
  const annotations = payload.annotations.filter((annotation) => typeof annotation === "object" && annotation !== null && referencedIds.has((annotation as { document_id?: string }).document_id || ""));
  const assets = packageAssets(payload);
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("readerm.md", payload.markdown);
  zip.file("documents.json", JSON.stringify(documents, null, 2));
  zip.file("references.json", JSON.stringify(references, null, 2));
  zip.file("anchors.json", JSON.stringify(anchors, null, 2));
  zip.file("annotations.json", JSON.stringify(annotations, null, 2));
  zip.file("symbols.json", JSON.stringify(payload.symbols || [], null, 2));
  for (const [documentId, pdfData] of Object.entries(payload.pdfDataByDocumentId || {})) {
    if (referencedIds.has(documentId)) zip.file(`pdfs/${documentId}.pdf`, pdfData);
  }
  for (const [documentId, latexData] of Object.entries(payload.latexDataByDocumentId || {})) {
    if (referencedIds.has(documentId)) zip.file(`sources/${documentId}.tex`, latexData);
  }
  const assetsFolder = zip.folder("assets");
  if (assetsFolder && assets.length) {
    assetsFolder.file("assets.json", JSON.stringify(assets.map((asset) => ({
      asset_id: asset.asset_id,
      document_id: asset.document_id,
      file_name: asset.file_name,
      mime_type: asset.mime_type,
      path: `assets/${asset.file_name}`,
      original_name: asset.original_name,
      created_at: asset.created_at,
    })), null, 2));
    for (const asset of assets) assetsFolder.file(asset.file_name, asset.data);
  } else {
    zip.folder("assets");
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function readReadermPackageBuffer(buffer: Buffer): Promise<ReadermPackageReadResult> {
  const zip = await JSZip.loadAsync(buffer);
  const manifest = asManifest(parseJson(await zip.file("manifest.json")?.async("string"), null));
  const markdown = await zip.file(manifest.files.markdown)?.async("string") || "";
  const documents = parseJson<ReaderPackageDocument[]>(await zip.file(manifest.files.documents)?.async("string"), []);
  const references = parseJson<ReadermReference[]>(await zip.file(manifest.files.references)?.async("string"), []);
  const anchors = parseJson<unknown[]>(await zip.file(manifest.files.anchors)?.async("string"), []);
  const annotations = parseJson<unknown[]>(await zip.file(manifest.files.annotations)?.async("string"), []);
  const symbols = parseJson<unknown[]>(await zip.file(manifest.files.symbols || "symbols.json")?.async("string"), []);
  const pdfDataByDocumentId: Record<string, Buffer> = {};
  const latexDataByDocumentId: Record<string, Buffer> = {};
  for (const [documentId, pdfPath] of Object.entries(manifest.files.pdfs || {})) {
    const data = await zip.file(pdfPath)?.async("uint8array");
    if (data) pdfDataByDocumentId[documentId] = Buffer.from(data);
  }
  for (const [documentId, latexPath] of Object.entries(manifest.files.latex_files || {})) {
    const data = await zip.file(latexPath)?.async("uint8array");
    if (data) latexDataByDocumentId[documentId] = Buffer.from(data);
  }
  const assetManifest = parseJson<Array<{
    asset_id: string;
    document_id?: string;
    file_name: string;
    mime_type: string;
    path: string;
    original_name?: string;
    created_at?: string;
  }>>(await zip.file(manifest.files.assets_manifest || "assets/assets.json")?.async("string"), []);
  const assets: ReadermPackageReadResult["assets"] = [];
  for (const entry of assetManifest) {
    const normalizedPath = normalizeAssetPath(entry.path || `assets/${entry.file_name}`);
    if (!normalizedPath) continue;
    const data = await zip.file(normalizedPath)?.async("uint8array");
    if (data) assets.push({ ...entry, path: normalizedPath, data: Buffer.from(data) });
  }
  return {
    manifest,
    document: {
      document_id: manifest.document_id,
      title: manifest.title,
      file_name: manifest.file_name,
      file_size: Buffer.byteLength(markdown),
      source_type: "readerm",
      created_at: manifest.created_at,
      updated_at: manifest.updated_at,
    },
    markdown,
    references,
    documents,
    anchors,
    annotations,
    symbols,
    pdfDataByDocumentId,
    latexDataByDocumentId,
    assets,
  };
}
