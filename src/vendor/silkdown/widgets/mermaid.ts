import { WidgetType, type EditorView } from "@codemirror/view";
import { renderMermaidElement, renderMermaidPlaceholder } from "@/services/MermaidRenderService";
import { LiveBlockChrome } from "./liveBlock.js";

export class MermaidBlockWidget extends WidgetType {
  constructor(
    private readonly source: string,
    private readonly from: number,
    private readonly to: number,
    private readonly sourceLineCount: number,
    private readonly editing: boolean,
    private readonly label: string,
  ) {
    super();
  }

  override eq(other: MermaidBlockWidget): boolean {
    return other.source === this.source
      && other.from === this.from
      && other.to === this.to
      && other.sourceLineCount === this.sourceLineCount
      && other.editing === this.editing
      && other.label === this.label;
  }

  override toDOM(view: EditorView): HTMLElement {
    const content = document.createElement("div");
    content.className = "sd-live-block-content sd-mermaid-block-content";
    content.innerHTML = renderMermaidPlaceholder(this.source);
    const mermaidElement = content.querySelector<HTMLElement>(".markdown-mermaid");
    if (mermaidElement) queueMicrotask(() => void renderMermaidElement(mermaidElement));

    if (this.editing) return LiveBlockChrome.editorShell(view, "mermaid", this.label, content, this.to, this.sourceLineCount);
    return LiveBlockChrome.renderShell(view, "mermaid", this.label, content, this.from + 1);
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
