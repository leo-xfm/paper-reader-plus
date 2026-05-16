import { buildReaderAnchorHref } from "@/services/ReaderAnchorService";
import type { Anchor } from "@/types";

export function markdownImagePattern(assetPath: string) {
  const escapedPath = assetPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`!\\[([^\\]]*)\\]\\((${escapedPath}|\\.\\/${escapedPath})(?:\\s+=([1-9]\\d{0,3})?x([1-9]\\d{0,3})?)?(?:\\s+"([^"]*)")?\\)`);
}

export function resizeMarkdownImage(source: string, assetPath: string, width: number, height: number) {
  const pattern = markdownImagePattern(assetPath);
  return source.replace(pattern, (_match, alt: string, path: string, _oldWidth: string, _oldHeight: string, title: string) => {
    const size = width || height ? ` =${width || ""}x${height || ""}` : "";
    const titlePart = title ? ` "${title}"` : "";
    return `![${alt}](${path}${size}${titlePart})`;
  });
}

export function linkedImageMarkdown(markdown: string, anchor: Anchor) {
  return `[${markdown}](${buildReaderAnchorHref(anchor, anchor.page_index + 1)})`;
}
