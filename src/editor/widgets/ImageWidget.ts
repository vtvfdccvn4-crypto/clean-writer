import { WidgetType } from '@codemirror/view';
import type { EditorMarkdownImage } from '../markdown/parseMarkdownImage';

export interface ImageWidgetActions {
  copyImage(image: EditorMarkdownImage): void;
  deleteImage(image: EditorMarkdownImage): void;
  replaceImage(image: EditorMarkdownImage): void;
  resizeImage(image: EditorMarkdownImage, width: string): void;
  resolveSource(source: string): Promise<string>;
}

export class ImageWidget extends WidgetType {
  private readonly image: EditorMarkdownImage;
  private readonly actions: ImageWidgetActions;

  constructor(image: EditorMarkdownImage, actions: ImageWidgetActions) {
    super();
    this.image = image;
    this.actions = actions;
  }

  eq(other: ImageWidget): boolean {
    return this.image.start === other.image.start && this.image.end === other.image.end
      && this.image.source === other.image.source && this.image.attributes === other.image.attributes;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-markdown-image';
    wrapper.contentEditable = 'false';
    const image = document.createElement('img');
    image.alt = this.image.alt;
    image.title = this.image.title ?? this.image.alt;
    const width = this.image.attributes.match(/\bwidth=([^\s}]+)/)?.[1];
    if (width) image.style.width = width.replace(/^"|"$/g, '');
    image.onerror = () => {
      wrapper.classList.add('is-broken');
      image.alt = `Broken image: ${this.image.alt || this.image.source}`;
      image.title = `Unable to load: ${this.image.source}`;
    };
    void this.actions.resolveSource(this.image.source).then(source => { image.src = source; });
    wrapper.append(image);

    wrapper.addEventListener('contextmenu', event => {
      event.preventDefault();
      const menu = document.createElement('span');
      menu.className = 'cm-markdown-image-menu';
      const addButton = (label: string, action: () => void) => {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = label;
        button.addEventListener('click', () => { action(); menu.remove(); });
        menu.append(button);
      };
      addButton('Copy', () => this.actions.copyImage(this.image));
      addButton('Replace', () => this.actions.replaceImage(this.image));
      addButton('Delete', () => this.actions.deleteImage(this.image));
      wrapper.querySelector('.cm-markdown-image-menu')?.remove();
      wrapper.append(menu);
    });

    const handle = document.createElement('span');
    handle.className = 'cm-markdown-image-resize-handle';
    handle.setAttribute('aria-label', 'Resize image');
    handle.addEventListener('pointerdown', event => this.resize(event, image, wrapper));
    wrapper.append(handle);
    return wrapper;
  }

  ignoreEvent(): boolean { return false; }

  private resize(event: PointerEvent, image: HTMLImageElement, wrapper: HTMLElement): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = image.getBoundingClientRect().width;
    const onMove = (move: PointerEvent) => { image.style.width = `${Math.max(32, Math.round(startWidth + move.clientX - startX))}px`; };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      this.actions.resizeImage(this.image, image.style.width);
      wrapper.focus();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp, { once: true });
  }
}
