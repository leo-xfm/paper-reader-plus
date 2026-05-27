import JSZip from "jszip";

export type ReaderPackageDocumentKind = "pdf" | "markdown" | "pdf-markdown";
export type ReaderPackageMode = "pdf-centered" | "markdown-centered";

export type ReaderPackageDocument = {
  document_id: string;
  title: string;
  file_name: string;
  file_size: number;
  source_type?: "pdf" | "markdown" | "readerp" | "readerm";
  readerp_path?: string;
  latex_file_name?: string;
  created_at: string;
  updated_at: string;
};

export type ReaderPackagePayload = {
  document: ReaderPackageDocument;
  documents?: ReaderPackageDocument[];
  packageMode?: ReaderPackageMode;
  note: string;
  summary: string;
  aiHistory: Array<{ role: "user" | "assistant"; content: string; [key: string]: unknown }>;
  anchors: unknown[];
  annotations: unknown[];
  symbols?: unknown[];
  formulas?: unknown[];
  pdfData?: Buffer;
  pdfDataByDocumentId?: Record<string, Buffer>;
  latexData?: Buffer;
  latexDataByDocumentId?: Record<string, Buffer>;
  assets?: ReaderPackageAssetInput[];
};

export type ReaderPackageReadResult = ReaderPackagePayload & {
  manifest: ReaderPackageManifest;
  pdfDataByDocumentId: Record<string, Buffer>;
  latexData?: Buffer;
  latexDataByDocumentId: Record<string, Buffer>;
  assets: ReaderPackageAssetReadResult[];
};

export type ReaderPackageAssetInput = {
  asset_id: string;
  document_id?: string;
  file_name: string;
  mime_type: string;
  data: Buffer;
  original_name?: string;
  created_at?: string;
};

export type ReaderPackageAssetManifestEntry = {
  asset_id: string;
  document_id?: string;
  file_name: string;
  mime_type: string;
  path: string;
  original_name?: string;
  created_at?: string;
};

export type ReaderPackageAssetReadResult = ReaderPackageAssetManifestEntry & {
  data: Buffer;
};

export type ReaderPackageManifest = {
  format: "paper-reader-plus.readerp";
  version: 1;
  document_id: string;
  title: string;
  file_name: string;
  document_kind: ReaderPackageDocumentKind;
  package_mode?: ReaderPackageMode;
  created_at: string;
  updated_at: string;
  files: {
    pdf?: string;
    pdfs?: Record<string, string>;
    latex?: string;
    latex_files?: Record<string, string>;
    documents?: string;
    notes: string;
    summary: string;
    ai_history: string;
    anchors: string;
    annotations: string;
    symbols?: string;
    formulas?: string;
    assets: string;
    assets_manifest?: string;
  };
};

const PACKAGE_FORMAT = "paper-reader-plus.readerp";

function belongsToDocument(value: unknown, documentId: string) {
  return typeof value === "object"
    && value !== null
    && "document_id" in value
    && (value as { document_id?: unknown }).document_id === documentId;
}

function currentDocumentAnchors(payload: ReaderPackagePayload) {
  return payload.anchors.filter((anchor) => belongsToDocument(anchor, payload.document.document_id));
}

function currentDocumentAnnotations(payload: ReaderPackagePayload) {
  return payload.annotations.filter((annotation) => belongsToDocument(annotation, payload.document.document_id));
}

function packageDocumentIds(payload: ReaderPackagePayload) {
  if (payload.packageMode === "markdown-centered") {
    return new Set((payload.documents?.length ? payload.documents : [payload.document]).map((document) => document.document_id));
  }
  return new Set([payload.document.document_id]);
}

function packageAnchors(payload: ReaderPackagePayload) {
  const documentIds = packageDocumentIds(payload);
  return payload.packageMode === "markdown-centered"
    ? payload.anchors.filter((anchor) => typeof anchor === "object" && anchor !== null && documentIds.has((anchor as { document_id?: string }).document_id || ""))
    : currentDocumentAnchors(payload);
}

function packageAnnotations(payload: ReaderPackagePayload) {
  const documentIds = packageDocumentIds(payload);
  return payload.packageMode === "markdown-centered"
    ? payload.annotations.filter((annotation) => typeof annotation === "object" && annotation !== null && documentIds.has((annotation as { document_id?: string }).document_id || ""))
    : currentDocumentAnnotations(payload);
}

function packageFormulas(payload: ReaderPackagePayload) {
  const documentIds = packageDocumentIds(payload);
  return (payload.formulas || []).filter((formula) => typeof formula === "object" && formula !== null && documentIds.has((formula as { document_id?: string }).document_id || ""));
}

export function extractAssetPathsFromMarkdown(...sources: string[]) {
  const paths = new Set<string>();
  for (const source of sources) {
    const matches = String(source || "").matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g);
    for (const match of matches) {
      const normalized = normalizeAssetPath(match[1] || "");
      if (normalized) paths.add(normalized);
    }
  }
  return paths;
}

function normalizeAssetPath(value: string) {
  const withoutQuery = value.trim().replace(/^\.\/+/, "").split(/[?#]/)[0];
  if (!/^assets\/[^/\\][^\\]*$/i.test(withoutQuery)) return "";
  if (withoutQuery.includes("..")) return "";
  return withoutQuery.replace(/\\/g, "/");
}

function packageAssets(payload: ReaderPackagePayload) {
  const referencedPaths = extractAssetPathsFromMarkdown(
    payload.note,
    payload.summary,
    payload.aiHistory.map((message) => message.content).join("\n"),
  );
  return (payload.assets || []).filter((asset) => referencedPaths.has(`assets/${asset.file_name}`));
}

function packageKind(payload: ReaderPackagePayload): ReaderPackageDocumentKind {
  const hasPdf = Boolean(payload.pdfData);
  const hasMarkdown = Boolean(payload.note.trim() || payload.summary.trim());
  if (hasPdf && hasMarkdown) return "pdf-markdown";
  return hasPdf ? "pdf" : "markdown";
}

function buildManifest(payload: ReaderPackagePayload): ReaderPackageManifest {
  const assets = packageAssets(payload);
  return {
    format: PACKAGE_FORMAT,
    version: 1,
    document_id: payload.document.document_id,
    title: payload.document.title,
    file_name: payload.document.file_name,
    document_kind: packageKind(payload),
    package_mode: payload.packageMode || "pdf-centered",
    created_at: payload.document.created_at,
    updated_at: payload.document.updated_at,
    files: {
      pdf: payload.pdfData ? "document.pdf" : undefined,
      pdfs: payload.pdfDataByDocumentId
        ? Object.fromEntries(Object.keys(payload.pdfDataByDocumentId).map((documentId) => [documentId, `pdfs/${documentId}.pdf`]))
        : undefined,
      latex: payload.latexData ? `sources/${payload.document.document_id}.tex` : undefined,
      latex_files: payload.latexDataByDocumentId
        ? Object.fromEntries(Object.keys(payload.latexDataByDocumentId).map((documentId) => [documentId, `sources/${documentId}.tex`]))
        : undefined,
      documents: payload.documents?.length ? "documents.json" : undefined,
      notes: "notes.md",
      summary: "summary.md",
      ai_history: "ai-history.json",
      anchors: "anchors.json",
      annotations: "annotations.json",
      symbols: "symbols.json",
      formulas: "formulas.json",
      assets: "assets/",
      assets_manifest: assets.length ? "assets/assets.json" : undefined,
    },
  };
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function asManifest(value: unknown): ReaderPackageManifest {
  if (!value || typeof value !== "object") throw new Error("Invalid reader package manifest.");
  const manifest = value as Partial<ReaderPackageManifest>;
  if (manifest.format !== PACKAGE_FORMAT || manifest.version !== 1) {
    throw new Error("Unsupported reader package format.");
  }
  if (!manifest.files?.notes || !manifest.files.summary || !manifest.files.ai_history) {
    throw new Error("Reader package manifest is missing required files.");
  }
  return manifest as ReaderPackageManifest;
}

export async function createReaderPackageBuffer(payload: ReaderPackagePayload) {
  const zip = new JSZip();
  const manifest = buildManifest(payload);
  const assets = packageAssets(payload);
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  if (payload.pdfData) zip.file("document.pdf", payload.pdfData);
  if (payload.latexData) zip.file(`sources/${payload.document.document_id}.tex`, payload.latexData);
  if (payload.documents?.length) zip.file("documents.json", JSON.stringify(payload.documents, null, 2));
  if (payload.pdfDataByDocumentId) {
    for (const [documentId, pdfData] of Object.entries(payload.pdfDataByDocumentId)) {
      zip.file(`pdfs/${documentId}.pdf`, pdfData);
    }
  }
  if (payload.latexDataByDocumentId) {
    for (const [documentId, latexData] of Object.entries(payload.latexDataByDocumentId)) {
      zip.file(`sources/${documentId}.tex`, latexData);
    }
  }
  zip.file("notes.md", payload.note);
  zip.file("summary.md", payload.summary);
  zip.file("ai-history.json", JSON.stringify(payload.aiHistory, null, 2));
  zip.file("anchors.json", JSON.stringify(packageAnchors(payload), null, 2));
  zip.file("annotations.json", JSON.stringify(packageAnnotations(payload), null, 2));
  zip.file("symbols.json", JSON.stringify(payload.symbols || [], null, 2));
  zip.file("formulas.json", JSON.stringify(packageFormulas(payload), null, 2));
  const assetsFolder = zip.folder("assets");
  if (assetsFolder && assets.length) {
    const assetManifest: ReaderPackageAssetManifestEntry[] = assets.map((asset) => ({
      asset_id: asset.asset_id,
      document_id: asset.document_id,
      file_name: asset.file_name,
      mime_type: asset.mime_type,
      path: `assets/${asset.file_name}`,
      original_name: asset.original_name,
      created_at: asset.created_at,
    }));
    assetsFolder.file("assets.json", JSON.stringify(assetManifest, null, 2));
    for (const asset of assets) {
      assetsFolder.file(asset.file_name, asset.data);
    }
  } else {
    zip.folder("assets");
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function readReaderPackageBuffer(buffer: Buffer): Promise<ReaderPackageReadResult> {
  const zip = await JSZip.loadAsync(buffer);
  const manifest = asManifest(parseJson(await zip.file("manifest.json")?.async("string"), null));
  const pdfData = manifest.files.pdf ? Buffer.from(await zip.file(manifest.files.pdf)?.async("uint8array") || new Uint8Array()) : undefined;
  const latexData = manifest.files.latex ? Buffer.from(await zip.file(manifest.files.latex)?.async("uint8array") || new Uint8Array()) : undefined;
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
  const documents = manifest.files.documents
    ? parseJson<ReaderPackageDocument[]>(await zip.file(manifest.files.documents)?.async("string"), [])
    : [];
  const note = await zip.file(manifest.files.notes)?.async("string") || "";
  const summary = await zip.file(manifest.files.summary)?.async("string") || "";
  const aiHistory = parseJson<Array<{ role: "user" | "assistant"; content: string; [key: string]: unknown }>>(
    await zip.file(manifest.files.ai_history)?.async("string"),
    [],
  );
  const anchors = parseJson<unknown[]>(await zip.file(manifest.files.anchors)?.async("string"), []);
  const annotations = parseJson<unknown[]>(await zip.file(manifest.files.annotations)?.async("string"), []);
  const symbols = parseJson<unknown[]>(await zip.file(manifest.files.symbols || "symbols.json")?.async("string"), []);
  const formulas = parseJson<unknown[]>(await zip.file(manifest.files.formulas || "formulas.json")?.async("string"), []);
  const assetManifest = parseJson<ReaderPackageAssetManifestEntry[]>(
    await zip.file(manifest.files.assets_manifest || "assets/assets.json")?.async("string"),
    [],
  );
  const assets: ReaderPackageAssetReadResult[] = [];
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
      file_size: pdfData?.byteLength || 0,
      source_type: manifest.files.pdf ? "readerp" : "markdown",
      created_at: manifest.created_at,
      updated_at: manifest.updated_at,
    },
    note,
    summary,
    aiHistory,
    anchors,
    annotations,
    symbols,
    formulas,
    pdfData,
    latexData,
    pdfDataByDocumentId,
    latexDataByDocumentId,
    assets,
    documents,
    packageMode: manifest.package_mode || "pdf-centered",
  };
}
