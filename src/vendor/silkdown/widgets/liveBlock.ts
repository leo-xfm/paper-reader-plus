import { WidgetType, type EditorView } from "@codemirror/view";

export type LiveBlockToolbarAction = {
  className: string;
  title: string;
  text: string;
  onClick: (view: EditorView, event: MouseEvent) => void;
};

export class LiveBlockLineNumberWidget extends WidgetType {
  constructor(private readonly lineNumber: number) {
    super();
  }

  override eq(other: LiveBlockLineNumberWidget): boolean {
    return other.lineNumber === this.lineNumber;
  }

  override toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "sd-live-block-line-number";
    element.textContent = String(this.lineNumber);
    return element;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

export class LiveBlockChrome {
  static toolbar(view: EditorView, labelText: string, actions: LiveBlockToolbarAction | LiveBlockToolbarAction[], extraClass = "") {
    const toolbar = document.createElement("div");
    toolbar.className = ["sd-live-block-toolbar", extraClass].filter(Boolean).join(" ");

    const label = document.createElement("span");
    label.className = "sd-live-block-label";
    label.textContent = labelText;
    toolbar.appendChild(label);

    for (const action of Array.isArray(actions) ? actions : [actions]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `sd-live-block-action ${action.className}`;
      button.title = action.title;
      button.textContent = action.text;
      const stopEditorMouseSelection = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
      };
      button.addEventListener("pointerdown", stopEditorMouseSelection);
      button.addEventListener("mousedown", stopEditorMouseSelection);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        action.onClick(view, event);
      });
      toolbar.appendChild(button);
    }
    return toolbar;
  }

  static renderShell(view: EditorView, kind: string, label: string, content: HTMLElement, editTarget: number, editTitle = `Edit ${label} block`) {
    const wrapper = document.createElement("div");
    wrapper.className = `sd-live-block sd-live-block-render sd-live-block-${kind}`;
    wrapper.append(
      LiveBlockChrome.toolbar(view, label, {
        className: "sd-live-block-edit",
        title: editTitle,
        text: "</>",
        onClick: (editorView) => {
          const target = Math.min(editTarget, editorView.state.doc.length);
          editorView.dispatch({ selection: { anchor: target }, effects: editorView.scrollSnapshot() });
          editorView.focus();
        },
      }, "sd-live-block-render-toolbar"),
      content,
    );
    return wrapper;
  }

  static editorShell(view: EditorView, kind: string, label: string, content: HTMLElement, to: number, sourceLineCount: number, finishTitle = `Finish editing ${label} block`) {
    const wrapper = document.createElement("div");
    wrapper.className = `sd-live-block-editor-widget sd-live-block-${kind}-editor-widget`;
    wrapper.style.setProperty("--sd-live-block-source-lines", String(sourceLineCount));
    wrapper.append(
      LiveBlockChrome.toolbar(view, label, {
        className: "sd-live-block-done",
        title: finishTitle,
        text: "✓",
        onClick: (editorView) => {
          const target = Math.min(to + 1, editorView.state.doc.length);
          editorView.dispatch({ selection: { anchor: target }, effects: editorView.scrollSnapshot() });
          editorView.focus();
        },
      }),
      content,
    );
    return wrapper;
  }
}
