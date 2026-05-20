import { WidgetType, type EditorView } from "@codemirror/view";
import katex from "katex";
import { LiveBlockChrome } from "./liveBlock.js";
import type { SilkdownLiveBlockLabels } from "../plugin.js";

export class MathBlockEditorWidget extends WidgetType {
  constructor(
    private readonly latex: string,
    private readonly from: number,
    private readonly to: number,
    private readonly sourceLineCount: number,
    private readonly labels: SilkdownLiveBlockLabels,
  ) {
    super();
  }

  override eq(other: MathBlockEditorWidget): boolean {
    return other.latex === this.latex
      && other.from === this.from
      && other.to === this.to
      && other.sourceLineCount === this.sourceLineCount
      && other.labels.mathFormula === this.labels.mathFormula
      && other.labels.emptyMathBlock === this.labels.emptyMathBlock
      && other.labels.finishEditingMathBlock === this.labels.finishEditingMathBlock;
  }

  override toDOM(view: EditorView): HTMLElement {
    const preview = document.createElement("div");
    preview.className = "sd-live-block-preview sd-math-block-preview";
    const latex = this.latex.trim();
    if (latex) {
      try {
        katex.render(latex, preview, {
          displayMode: true,
          throwOnError: false,
          strict: false,
          trust: false,
        });
      } catch {
        preview.textContent = latex;
      }
    } else {
      preview.classList.add("empty");
      preview.textContent = this.labels.emptyMathBlock;
    }

    return LiveBlockChrome.editorShell(view, "math", this.labels.mathFormula, preview, this.to, this.sourceLineCount, this.labels.finishEditingMathBlock);
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
