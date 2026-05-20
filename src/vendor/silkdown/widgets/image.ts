import { WidgetType } from "@codemirror/view";

export class ImageWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string,
    private readonly sourceSrc: string = src,
    private readonly sourceFrom: number = -1,
    private readonly sourceTo: number = -1,
    private readonly readerHref: string = "",
    private readonly showSource: boolean = true,
    private readonly width: string = "",
    private readonly height: string = "",
    private readonly title: string = "",
  ) {
    super();
  }

  override eq(other: ImageWidget): boolean {
    return other.src === this.src &&
      other.alt === this.alt &&
      other.sourceSrc === this.sourceSrc &&
      other.sourceFrom === this.sourceFrom &&
      other.sourceTo === this.sourceTo &&
      other.readerHref === this.readerHref &&
      other.showSource === this.showSource &&
      other.width === this.width &&
      other.height === this.height &&
      other.title === this.title;
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "sd-image-frame";
    wrapper.dataset.sourceSrc = this.sourceSrc;
    if (this.sourceFrom >= 0) wrapper.dataset.sourceFrom = String(this.sourceFrom);
    if (this.sourceTo >= 0) wrapper.dataset.sourceTo = String(this.sourceTo);
    if (this.readerHref) wrapper.dataset.readerHref = this.readerHref;

    if (this.showSource) {
      const source = document.createElement("span");
      source.className = "sd-image-source";
      source.setAttribute("role", "button");
      source.tabIndex = 0;
      source.textContent = this.readerHref ? `[![${this.alt}](${this.sourceSrc})](${this.readerHref})` : `![${this.alt}](${this.sourceSrc})`;
      wrapper.appendChild(source);
    }

    const imageWrap = document.createElement("span");
    imageWrap.className = "sd-image-wrap";
    wrapper.appendChild(imageWrap);

    if (this.readerHref) {
      const anchor = document.createElement("button");
      anchor.type = "button";
      anchor.className = "sd-image-anchor";
      anchor.dataset.href = this.readerHref;
      anchor.title = "Open anchor";
      anchor.textContent = "?";
      imageWrap.appendChild(anchor);
    }

    const img = document.createElement("img");
    img.className = "sd-image-widget";
    img.src = this.src;
    img.alt = this.alt;
    if (this.title) img.title = this.title;
    img.loading = "lazy";
    img.decoding = "async";
    if (this.width) img.width = Number(this.width);
    if (this.height) img.height = Number(this.height);
    img.dataset.sourceSrc = this.sourceSrc;
    if (this.sourceFrom >= 0) img.dataset.sourceFrom = String(this.sourceFrom);
    if (this.sourceTo >= 0) img.dataset.sourceTo = String(this.sourceTo);
    if (this.readerHref) img.dataset.readerHref = this.readerHref;
    imageWrap.appendChild(img);
    return wrapper;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
