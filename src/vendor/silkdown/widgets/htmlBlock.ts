import { WidgetType, type EditorView } from "@codemirror/view";
import { renderMarkdownHtmlBlock, type MarkdownHtmlBlockKind } from "@/services/MarkdownHtmlBlockService";
import { LiveBlockChrome } from "./liveBlock.js";

export class HtmlBlockWidget extends WidgetType {
  constructor(
    private readonly kind: MarkdownHtmlBlockKind,
    private readonly source: string,
    private readonly from: number,
    private readonly to: number,
    private readonly sourceLineCount: number,
    private readonly editing: boolean,
  ) {
    super();
  }

  override eq(other: HtmlBlockWidget): boolean {
    return other.kind === this.kind &&
      other.source === this.source &&
      other.from === this.from &&
      other.to === this.to &&
      other.sourceLineCount === this.sourceLineCount &&
      other.editing === this.editing;
  }

  override toDOM(view: EditorView): HTMLElement {
    const content = document.createElement("div");
    content.className = "sd-live-block-content sd-html-block-content";
    content.dataset.sourceFrom = String(this.from);
    content.dataset.sourceTo = String(this.to);
    content.innerHTML = renderMarkdownHtmlBlock({ kind: this.kind, source: this.source });
    content.addEventListener("submit", (event) => {
      event.preventDefault();
    });

    if (this.editing) return LiveBlockChrome.editorShell(view, "html", "HTML", content, this.to, this.sourceLineCount);
    return LiveBlockChrome.renderShell(view, "html", "HTML", content, this.from + 1);
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
