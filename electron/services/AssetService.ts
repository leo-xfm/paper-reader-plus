import { basename, extname } from "node:path";
import { randomUUID } from "node:crypto";

export type AssetLike = {
  file_name: string;
  original_name?: string;
};

export function sanitizeAssetFileName(fileName: string) {
  const ext = extname(fileName).toLowerCase();
  const stem = basename(fileName, ext).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
  return `${stem.slice(0, 48)}-${randomUUID().slice(0, 8)}${ext}`;
}

export function mimeTypeForImagePath(filePath: string) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "";
}

export function imageExtensionForMime(mimeType: string) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return ".jpg";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/svg+xml") return ".svg";
  return "";
}

export function normalizeMarkdownAssetPath(assetPath: string) {
  const normalized = String(assetPath || "").trim().replace(/^\.\/+/, "").split(/[?#]/)[0].replace(/\\/g, "/");
  if (!/^assets\/[^/\\][^\\]*$/i.test(normalized) || normalized.includes("..")) return "";
  return normalized;
}

export function markdownForAsset(asset: AssetLike) {
  const original = asset.original_name || asset.file_name;
  const alt = basename(original, extname(original)).replace(/[\]\n\r]/g, " ");
  return `![${alt}](assets/${asset.file_name})`;
}
