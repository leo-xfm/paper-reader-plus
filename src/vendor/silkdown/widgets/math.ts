import { WidgetType, type EditorView } from "@codemirror/view";
import katex from "katex";
import { LiveBlockChrome } from "./liveBlock.js";
import type { SilkdownLiveBlockLabels } from "../plugin.js";

export class MathWidget extends WidgetType {
  constructor(
    private readonly latex: string,
    private readonly displayMode: boolean,
    private readonly from?: number,
    private readonly to?: number,
    private readonly labels?: SilkdownLiveBlockLabels,
  ) {
    super();
  }

  override eq(other: MathWidget): boolean {
    return other.latex === this.latex
      && other.displayMode === this.displayMode
      && other.from === this.from
      && other.to === this.to
      && other.labels?.mathFormula === this.labels?.mathFormula
      && other.labels?.emptyMathBlock === this.labels?.emptyMathBlock
      && other.labels?.editMathBlock === this.labels?.editMathBlock;
  }

  override toDOM(view: EditorView): HTMLElement {
    if (this.displayMode) return this.toBlockDOM(view);
    const element = document.createElement(this.displayMode ? "div" : "span");
    element.className = this.displayMode ? "sd-math sd-math-block" : "sd-math sd-math-inline";
    renderMathContent(element, this.latex, false);
    return element;
  }

  private toBlockDOM(view: EditorView): HTMLElement {
    const content = document.createElement("div");
    content.className = "sd-live-block-content sd-math-block-content";
    renderMathContent(content, this.latex, true, this.labels?.emptyMathBlock);
    const target = typeof this.from === "number"
      ? firstMathContentLineEnd(view, this.from)
      : view.state.selection.main.from;
    return LiveBlockChrome.renderShell(view, "math", this.labels?.mathFormula || "Math formula", content, target, this.labels?.editMathBlock);
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

function firstMathContentLineEnd(view: EditorView, from: number) {
  const openLine = view.state.doc.lineAt(Math.min(from, view.state.doc.length));
  if (openLine.number >= view.state.doc.lines) return Math.min(from + 3, view.state.doc.length);
  return view.state.doc.line(openLine.number + 1).to;
}

function renderMathContent(element: HTMLElement, latex: string, displayMode: boolean, emptyLabel = "< Empty Math Block >") {
  if (displayMode && !latex.trim()) {
    element.classList.add("empty");
    element.textContent = emptyLabel;
    return;
  }
    try {
      katex.render(latex, element, {
        displayMode,
        throwOnError: false,
        strict: false,
        trust: false,
      });
    } catch {
      element.textContent = latex;
    }
}
