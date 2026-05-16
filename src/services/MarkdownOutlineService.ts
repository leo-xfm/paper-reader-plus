import type { PdfOutlineItem } from "@/pdf/pdfTypes";

const ATX_HEADING_PATTERN = /^(#{1,3})[ \t]+(.+?)[ \t]*#*[ \t]*$/;

export function markdownHeadingIdFromLine(lineIndex: number) {
  return `markdown-heading-${lineIndex}`;
}

export function extractMarkdownOutline(source: string): PdfOutlineItem[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const result: PdfOutlineItem[] = [];
  let fenceMarker: string | null = null;

  lines.forEach((line, lineIndex) => {
    const fenceMatch = line.trimStart().match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const nextMarker = fenceMatch[1][0];
      fenceMarker = fenceMarker === nextMarker ? null : fenceMarker || nextMarker;
      return;
    }
    if (fenceMarker) return;

    const match = line.match(ATX_HEADING_PATTERN);
    if (!match) return;
    const title = match[2].trim();
    if (!title) return;
    result.push({
      id: markdownHeadingIdFromLine(lineIndex),
      title,
      page_index: 0,
      level: match[1].length - 1,
    });
  });

  return result;
}
