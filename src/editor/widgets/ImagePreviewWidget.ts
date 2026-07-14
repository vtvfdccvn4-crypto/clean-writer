import { WidgetType } from '@codemirror/view';

export class ImagePreviewWidget extends WidgetType {
  private readonly alt: string;
  private readonly source: string;
  private readonly resolveSource: (source: string) => Promise<string>;
  private readonly width: string;
  private readonly onEditWidth: () => void;

  constructor(alt: string, source: string, width: string, resolveSource: (source: string) => Promise<string>, onEditWidth: () => void) {
    super();
    this.alt = alt;
    this.source = source;
    this.width = width;
    this.resolveSource = resolveSource;
    this.onEditWidth = onEditWidth;
  }

  eq(other: ImagePreviewWidget): boolean {
    return this.source === other.source && this.alt === other.alt && this.width === other.width;
  }

  toDOM(): HTMLElement {
    const image = document.createElement('img');
    image.className = 'cm-image-preview';
    image.alt = this.alt;
    image.title = 'Edit image width';
    image.contentEditable = 'false';
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label', `Edit width for ${this.alt || 'image'}`);
    if (this.width) image.style.width = this.width;
    const editWidth = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onEditWidth();
    };
    image.addEventListener('click', editWidth);
    image.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') editWidth(event);
    });
    void this.resolveSource(this.source).then(value => { image.src = value; });
    return image;
  }

  ignoreEvent(): boolean {
    return false;
  }
}
