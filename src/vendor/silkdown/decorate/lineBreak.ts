import type { Range, Text } from "@codemirror/state";
import { Decoration, WidgetType } from "@codemirror/view";
import { pushAtomicRange, rangeIntersectsAnyRange, type SourceRange } from "./shared.js";

class HtmlBreakWidget extends WidgetType {
  constructor(private readonly source: string) {
    super();
  }

  override eq(other: HtmlBreakWidget): boolean {
    return other.source === this.source;
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "sd-html-br";
    const marker = document.createElement("span");
    marker.className = "sd-html-br-mark";
    marker.textContent = this.source;
    wrapper.append(marker, document.createElement("br"));
    return wrapper;
  }
}

const HTML_BREAK_PATTERN = /<br\s*\/?>/gi;

export function decorateHtmlBreaks(
  ranges: Range<Decoration>[],
  atomicRanges: Range<Decoration>[],
  doc: Text,
  from: number,
  to: number,
  excludedRanges: readonly SourceRange[] = [],
): void {
  const source = doc.sliceString(from, to);
  HTML_BREAK_PATTERN.lastIndex = 0;
  for (const match of source.matchAll(HTML_BREAK_PATTERN)) {
    const start = from + (match.index || 0);
    const end = start + match[0].length;
    if (rangeIntersectsAnyRange(start, end, excludedRanges)) continue;
    pushAtomicRange(
      ranges,
      atomicRanges,
      Decoration.replace({ widget: new HtmlBreakWidget(match[0]) }),
      start,
      end,
    );
  }
}
