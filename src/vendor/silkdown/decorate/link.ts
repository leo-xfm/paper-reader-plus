import { Decoration, EditorView } from "@codemirror/view";
import type { EditorSelection, Range, Text } from "@codemirror/state";
import type { SyntaxNode, Tree } from "@lezer/common";
import { selectionTouchesLineRange, selectionTouchesRange } from "../util/selection.js";
import { children } from "../util/tree.js";
import { HIDE, MUTED_MARK, pushAtomicRange, pushRevealableMark, rangeIntersectsAnyRange, type SourceRange } from "./shared.js";
import { defaultUrlPolicy, type UrlPolicy } from "../url.js";
import { ImageWidget } from "../widgets/image.js";

type LinkReferenceMap = ReadonlyMap<string, string>;

export interface SilkdownLinkOptions {
  resolveImageUrl?: (src: string, context: { alt: string; from: number; to: number; href?: string }) => string;
}

interface LinkParts {
  marks: SyntaxNode[];
  urlNode: SyntaxNode | null;
  labelNode: SyntaxNode | null;
  textFrom: number;
  textTo: number;
  url: string;
  imageWidth?: string;
  imageHeight?: string;
  imageTitle?: string;
}

const LABEL_WHITESPACE_RE = /\s+/g;
const SIZED_IMAGE_PATTERN = /!\[([^\]\n]*)\]\(([^)\s\n]+)\s+=([1-9]\d{0,3})?x([1-9]\d{0,3})?(?:\s+"([^"]*)")?\)/g;
const LINKED_SIZED_IMAGE_PATTERN = /\[(!\[([^\]\n]*)\]\(([^)\s\n]+)\s+=([1-9]\d{0,3})?x([1-9]\d{0,3})?(?:\s+"([^"]*)")?\))\]\(((?:\/reader\?|https?:\/\/|www\.|readerp:\/\/|readerm:\/\/)[^)\s\n]+)\)/g;

/**
 * Walk the doc once for `LinkReference` definitions and return a label → URL
 * map. Labels are normalized (trimmed + lowercased) per CommonMark.
 */
export function buildLinkReferences(tree: Tree, doc: Text): LinkReferenceMap {
  const refs = new Map<string, string>();
  tree.iterate({
    enter(node) {
      if (node.name !== "LinkReference") return;
      let label: string | null = null;
      let url: string | null = null;
      for (const child of children(node.node)) {
        if (child.name === "LinkLabel") label = labelKey(doc, child);
        else if (child.name === "URL") url = doc.sliceString(child.from, child.to);
      }
      if (label && url) refs.set(label, url);
    },
  });
  return refs;
}

function labelKey(doc: Text, labelNode: SyntaxNode): string {
  // LinkLabel spans `[label]` including brackets. Strip them.
  return normalizeReferenceLabel(doc.sliceString(labelNode.from + 1, labelNode.to - 1));
}

function normalizeReferenceLabel(label: string): string {
  return label.trim().replace(LABEL_WHITESPACE_RE, " ").toLowerCase();
}

function parseLink(node: SyntaxNode, doc: Text, references: LinkReferenceMap): LinkParts | null {
  const marks: SyntaxNode[] = [];
  let urlNode: SyntaxNode | null = null;
  let labelNode: SyntaxNode | null = null;
  let bangMark: SyntaxNode | null = null;

  for (const child of children(node)) {
    if (child.name === "LinkMark") {
      const literal = doc.sliceString(child.from, child.to);
      if (literal === "!") bangMark = child;
      else marks.push(child);
    } else if (child.name === "URL") {
      urlNode = child;
    } else if (child.name === "LinkLabel") {
      labelNode = child;
    }
  }

  const open = marks[0];
  const close = marks[1];
  if (!open || !close) return null;

  const textFrom = open.to;
  const textTo = close.from;

  let url = "";
  let imageWidth = "";
  let imageHeight = "";
  if (urlNode) {
    url = doc.sliceString(urlNode.from, urlNode.to);
    const sizeMatch = url.match(/\s+=([1-9]\d{0,3})?x([1-9]\d{0,3})?$/);
    if (sizeMatch) {
      url = url.replace(/\s+=([1-9]\d{0,3})?x([1-9]\d{0,3})?$/, "");
      imageWidth = sizeMatch[1] || "";
      imageHeight = sizeMatch[2] || "";
    }
  } else if (labelNode) {
    // Full reference: `[text][label]`. Resolve via the references map.
    url = references.get(labelKey(doc, labelNode)) ?? "";
  } else {
    // Shortcut reference: `[label]` where the brackets contain the label.
    const key = normalizeReferenceLabel(doc.sliceString(textFrom, textTo));
    url = references.get(key) ?? "";
  }

  const allMarks = bangMark ? [bangMark, ...marks] : marks;
  return { marks: allMarks, urlNode, labelNode, textFrom, textTo, url, imageWidth, imageHeight };
}

function imageTitleFromSource(source: string): string {
  const match = source.match(/(?:^|[\s)])(?:"([^"]*)"|'([^']*)'|\(([^()]*)\))\)$/);
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : "";
}

function parseImage(node: SyntaxNode, doc: Text, references: LinkReferenceMap): LinkParts | null {
  const parts = parseLink(node, doc, references);
  if (!parts) return null;
  return {
    ...parts,
    imageTitle: imageTitleFromSource(doc.sliceString(node.from, node.to)),
  };
}

function muteLinkSyntax(ranges: Range<Decoration>[], parts: LinkParts): void {
  for (const m of parts.marks) {
    ranges.push(MUTED_MARK.range(m.from, m.to));
  }
  if (parts.urlNode) {
    ranges.push(MUTED_MARK.range(parts.urlNode.from, parts.urlNode.to));
  }
  if (parts.labelNode) {
    ranges.push(MUTED_MARK.range(parts.labelNode.from, parts.labelNode.to));
  }
}

export function decorateLink(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  node: SyntaxNode,
  doc: Text,
  sel: EditorSelection,
  references: LinkReferenceMap,
  urlPolicy: UrlPolicy = defaultUrlPolicy,
): void {
  const parts = parseLink(node, doc, references);
  if (!parts) return;

  const safe = urlPolicy(parts.url);
  const revealed = selectionTouchesRange(sel, node.from, node.to);

  if (revealed) {
    muteLinkSyntax(ranges, parts);
    if (safe && parts.textFrom < parts.textTo) {
      ranges.push(linkMark(safe).range(parts.textFrom, parts.textTo));
    }
    return;
  }

  if (parts.textFrom > node.from) {
    pushAtomicRange(ranges, atomicRanges, HIDE, node.from, parts.textFrom);
  }
  if (safe && parts.textFrom < parts.textTo) {
    ranges.push(linkMark(safe).range(parts.textFrom, parts.textTo));
  }
  if (parts.textTo < node.to) {
    pushAtomicRange(ranges, atomicRanges, HIDE, parts.textTo, node.to);
  }
}

function findNestedImage(node: SyntaxNode, doc: Text, references: LinkReferenceMap): LinkParts | null {
  for (const child of children(node)) {
    if (child.name === "Image") {
      const image = parseImage(child, doc, references);
      if (image) return image;
    }
    const nested = findNestedImage(child, doc, references);
    if (nested) return nested;
  }
  return null;
}

function selectionTouches(sel: EditorSelection, from: number, to: number): boolean {
  return sel.ranges.some((range) => range.from < to && range.to > from);
}

function pushSizedImageWidget(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  _doc: Text,
  sel: EditorSelection,
  from: number,
  to: number,
  alt: string,
  src: string,
  width: string,
  height: string,
  title: string,
  readerHref: string,
  urlPolicy: UrlPolicy,
  options: SilkdownLinkOptions,
): void {
  const safe = urlPolicy(src);
  if (!safe) return;
  const resolved = options.resolveImageUrl?.(safe, { alt, from, to, href: readerHref }) ?? safe;
  if (selectionTouches(sel, from, to)) {
    ranges.push(Decoration.widget({
      widget: new ImageWidget(resolved, alt, safe, from, to, readerHref, false, width, height, title),
      side: 1,
    }).range(to));
    return;
  }
  pushAtomicRange(
    ranges,
    atomicRanges,
    Decoration.replace({ widget: new ImageWidget(resolved, alt, safe, from, to, readerHref, true, width, height, title) }),
    from,
    to,
  );
}

export function decorateSizedMarkdownImages(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  doc: Text,
  sel: EditorSelection,
  from: number,
  to: number,
  urlPolicy: UrlPolicy = defaultUrlPolicy,
  options: SilkdownLinkOptions = {},
  excludedRanges: readonly SourceRange[] = [],
): void {
  const startLine = doc.lineAt(Math.max(0, from));
  const endLine = doc.lineAt(Math.min(doc.length, to));
  const scanFrom = startLine.from;
  const scanTo = endLine.to;
  const source = doc.sliceString(scanFrom, scanTo);
  const covered: Array<[number, number]> = [];

  for (const match of source.matchAll(LINKED_SIZED_IMAGE_PATTERN)) {
    const start = scanFrom + (match.index || 0);
    const end = start + match[0].length;
    if (end < from || start > to) continue;
    if (rangeIntersectsAnyRange(start, end, excludedRanges)) continue;
    covered.push([start, end]);
    pushSizedImageWidget(
      ranges,
      atomicRanges,
      doc,
      sel,
      start,
      end,
      match[2] || "",
      match[3] || "",
      match[4] || "",
      match[5] || "",
      match[6] || "",
      match[7] || "",
      urlPolicy,
      options,
    );
  }

  for (const match of source.matchAll(SIZED_IMAGE_PATTERN)) {
    const start = scanFrom + (match.index || 0);
    const end = start + match[0].length;
    if (end < from || start > to) continue;
    if (rangeIntersectsAnyRange(start, end, excludedRanges)) continue;
    if (covered.some(([coveredFrom, coveredTo]) => start >= coveredFrom && end <= coveredTo)) continue;
    pushSizedImageWidget(
      ranges,
      atomicRanges,
      doc,
      sel,
      start,
      end,
      match[1] || "",
      match[2] || "",
      match[3] || "",
      match[4] || "",
      match[5] || "",
      "",
      urlPolicy,
      options,
    );
  }
}

export function decorateImage(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  node: SyntaxNode,
  doc: Text,
  sel: EditorSelection,
  references: LinkReferenceMap,
  urlPolicy: UrlPolicy = defaultUrlPolicy,
  options: SilkdownLinkOptions = {},
  outerHref = "",
): void {
  const parts = parseImage(node, doc, references);
  if (!parts) return;

  const alt = doc.sliceString(parts.textFrom, parts.textTo);
  const safe = urlPolicy(parts.url);

  if (!safe) return;
  const resolved = options.resolveImageUrl?.(safe, { alt, from: node.from, to: node.to, href: outerHref }) ?? safe;
  if (selectionTouches(sel, node.from, node.to)) {
    ranges.push(Decoration.widget({
      widget: new ImageWidget(resolved, alt, safe, node.from, node.to, outerHref, false, parts.imageWidth, parts.imageHeight, parts.imageTitle),
      side: 1,
    }).range(node.to));
    return;
  }
  pushAtomicRange(
    ranges,
    atomicRanges,
    Decoration.replace({ widget: new ImageWidget(resolved, alt, safe, node.from, node.to, outerHref, true, parts.imageWidth, parts.imageHeight, parts.imageTitle) }),
    node.from,
    node.to,
  );
}

export function decorateLinkedImage(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  node: SyntaxNode,
  doc: Text,
  sel: EditorSelection,
  references: LinkReferenceMap,
  urlPolicy: UrlPolicy = defaultUrlPolicy,
  options: SilkdownLinkOptions = {},
): boolean {
  const link = parseLink(node, doc, references);
  const image = findNestedImage(node, doc, references);
  if (!link || !image) return false;

  const safeImage = urlPolicy(image.url);

  if (!safeImage) return true;
  const alt = doc.sliceString(image.textFrom, image.textTo);
  const href = urlPolicy(link.url) || link.url;
  const resolved = options.resolveImageUrl?.(safeImage, { alt, from: node.from, to: node.to, href }) ?? safeImage;
  if (selectionTouches(sel, node.from, node.to)) {
    ranges.push(Decoration.widget({
      widget: new ImageWidget(resolved, alt, safeImage, node.from, node.to, href, false, image.imageWidth, image.imageHeight, image.imageTitle),
      side: 1,
    }).range(node.to));
    return true;
  }
  pushAtomicRange(
    ranges,
    atomicRanges,
    Decoration.replace({ widget: new ImageWidget(resolved, alt, safeImage, node.from, node.to, href, true, image.imageWidth, image.imageHeight, image.imageTitle) }),
    node.from,
    node.to,
  );
  return true;
}

/**
 * Angle-bracketed autolink (`<https://example.com>`) and bare URLs that Lezer
 * detects in plain prose. Both are made clickable; for `Autolink` the angle
 * brackets hide off-line and mute on-line.
 */
export function decorateAutolink(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  node: SyntaxNode,
  doc: Text,
  sel: EditorSelection,
  urlPolicy: UrlPolicy = defaultUrlPolicy,
): void {
  let urlNode: SyntaxNode | null = null;
  const marks: SyntaxNode[] = [];
  for (const child of children(node)) {
    if (child.name === "URL") urlNode = child;
    else if (child.name === "LinkMark") marks.push(child);
  }
  if (!urlNode) return;

  const url = doc.sliceString(urlNode.from, urlNode.to);
  const safe = urlPolicy(url);
  if (!safe) return;

  ranges.push(linkMark(safe).range(urlNode.from, urlNode.to));

  const revealed = selectionTouchesLineRange(doc, sel, node.from, node.to);
  for (const m of marks) {
    pushRevealableMark(ranges, atomicRanges, revealed, m.from, m.to);
  }
}

/** A bare URL (Lezer's GFM extended-autolink) parsed as a top-level `URL` node. */
export function decorateBareUrl(
  ranges: Range<Decoration>[],
  node: SyntaxNode,
  doc: Text,
  urlPolicy: UrlPolicy = defaultUrlPolicy,
): void {
  const url = doc.sliceString(node.from, node.to);
  const safe = urlPolicy(url);
  if (!safe) return;
  ranges.push(linkMark(safe).range(node.from, node.to));
}

/**
 * `[label]: url` definition lines. Hidden entirely when cursor is off the
 * line (they're auxiliary metadata, not part of the rendered document).
 */
export function decorateLinkReference(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  node: SyntaxNode,
  doc: Text,
  sel: EditorSelection,
): void {
  if (selectionTouchesLineRange(doc, sel, node.from, node.to)) return;
  const startLine = doc.lineAt(node.from);
  const endLine = doc.lineAt(node.to);
  if (startLine.from === endLine.from) {
    pushAtomicRange(ranges, atomicRanges, HIDE, startLine.from, endLine.to);
  } else {
    // Hide only the reference node so adjacent content on boundary lines stays visible.
    pushAtomicRange(ranges, atomicRanges, HIDE, node.from, node.to);
  }
}

function linkMark(href: string) {
  return Decoration.mark({
    class: "sd-link",
    attributes: { "data-href": href },
  });
}

function closestHrefElement(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest("[data-href]") : null;
}

/** Modifier-click opens the URL; plain click stays as cursor positioning so users can edit the link text. */
export const linkClickHandler = EditorView.domEventHandlers({
  click(event) {
    if (!(event.metaKey || event.ctrlKey)) return false;
    const link = closestHrefElement(event.target);
    if (!link) return false;
    const href = link.getAttribute("data-href");
    if (!href) return false;
    window.open(href, "_blank", "noopener,noreferrer");
    event.preventDefault();
    return true;
  },
});
