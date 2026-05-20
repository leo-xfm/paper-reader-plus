import { WidgetType } from "@codemirror/view";

export class BulletMarkerWidget extends WidgetType {
  constructor(
    private readonly marker: string,
    private readonly level: number,
  ) {
    super();
  }

  override eq(other: BulletMarkerWidget): boolean {
    return other.marker === this.marker && other.level === this.level;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    const visualLevel = Math.min(Math.max(0, this.level), 3);
    span.className = `sd-list-marker sd-list-marker-${visualLevel}`;
    span.textContent = bulletForLevel(visualLevel);
    span.dataset.marker = this.marker;
    span.dataset.level = String(this.level);
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

function bulletForLevel(level: number): string {
  if (level === 1) return "◦";
  if (level === 2) return "▪";
  if (level >= 3) return "▫";
  return "•";
}
