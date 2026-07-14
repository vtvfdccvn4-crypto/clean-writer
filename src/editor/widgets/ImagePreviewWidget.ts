import { WidgetType } from '@codemirror/view';

export class ImagePreviewWidget extends WidgetType {
  private readonly alt: string;
  private readonly source: string;
  private readonly resolveSource: (source: string) => Promise<string>;

  constructor(alt: string, source: string, resolveSource: (source: string) => Promise<string>) {
    super();
    this.alt = alt;
    this.source = source;
    this.resolveSource = resolveSource;
  }

  eq(other: ImagePreviewWidget): boolean {
    return this.source === other.source && this.alt === other.alt;
  }

  toDOM(): HTMLElement {
    const image = document.createElement('img');
    image.className = 'cm-image-preview';
    image.alt = this.alt;
    image.title = this.alt;
    image.contentEditable = 'false';
    void this.resolveSource(this.source).then(value => { image.src = value; });
    return image;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
