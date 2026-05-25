import { WidgetType, type EditorView } from "@codemirror/view";

export class BulletMarkerWidget extends WidgetType {
  constructor(
    private readonly marker: string,
    private readonly level: number,
    private readonly collapsed = false,
  ) {
    super();
  }

  override eq(other: BulletMarkerWidget): boolean {
    return other.marker === this.marker && other.level === this.level && other.collapsed === this.collapsed;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    const visualLevel = Math.min(Math.max(0, this.level), 4);
    span.className = `sd-list-marker sd-list-marker-${visualLevel}${this.collapsed ? " sd-list-marker-collapsed" : ""}`;
    span.textContent = bulletForLevel(visualLevel);
    span.dataset.marker = this.marker;
    span.dataset.level = String(this.level);
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

export class ListFoldToggleWidget extends WidgetType {
  constructor(
    private readonly collapsed: boolean,
    private readonly from: number,
    private readonly to: number,
  ) {
    super();
  }

  override eq(other: ListFoldToggleWidget): boolean {
    return other.collapsed === this.collapsed && other.from === this.from && other.to === this.to;
  }

  override toDOM(view: EditorView): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `sd-list-fold-toggle ${this.collapsed ? "sd-list-fold-toggle-collapsed" : "sd-list-fold-toggle-expanded"}`;
    button.setAttribute("aria-label", this.collapsed ? "Expand list item" : "Collapse list item");
    button.title = this.collapsed ? "Expand list item" : "Collapse list item";
    const icon = document.createElement("span");
    icon.className = "sd-list-fold-toggle-icon";
    button.append(icon);
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: this.collapsed ? "+" : "*",
        },
      });
    });
    return button;
  }

  override ignoreEvent(event: Event): boolean {
    return event.type !== "mousedown" && event.type !== "click";
  }
}

function bulletForLevel(level: number): string {
  if (level === 1) return "◦";
  if (level === 2) return "▪";
  if (level >= 3) return "▫";
  return "•";
}
