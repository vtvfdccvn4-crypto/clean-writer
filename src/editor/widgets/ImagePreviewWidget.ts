import { WidgetType } from '@codemirror/view';

export class ImagePreviewWidget extends WidgetType {
  private readonly alt: string;
  private readonly source: string;
  private readonly resolveSource: (source: string) => Promise<string>;
  private readonly width: string;
  private readonly alignment: 'left' | 'center' | 'right' | '';
  private readonly onEdit: (update: { alignment?: 'left' | 'center' | 'right'; width?: string }) => void;

  constructor(
    alt: string,
    source: string,
    width: string,
    alignment: 'left' | 'center' | 'right' | '',
    resolveSource: (source: string) => Promise<string>,
    onEdit: (update: { alignment?: 'left' | 'center' | 'right'; width?: string }) => void
  ) {
    super();
    this.alt = alt;
    this.source = source;
    this.width = width;
    this.alignment = alignment;
    this.resolveSource = resolveSource;
    this.onEdit = onEdit;
  }

  eq(other: ImagePreviewWidget): boolean {
    return this.source === other.source && this.alt === other.alt && this.width === other.width && this.alignment === other.alignment;
  }

  toDOM(): HTMLElement {
    const container = document.createElement('span');
    container.className = 'cm-image-preview-control';
    container.contentEditable = 'false';

    const image = document.createElement('img');
    image.className = 'cm-image-preview';
    image.alt = this.alt;
    image.title = this.alt;

    const label = document.createElement('label');
    label.className = 'cm-image-preview-width';
    label.textContent = 'Width: ';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = this.width;
    input.placeholder = 'auto';
    input.inputMode = 'decimal';
    input.setAttribute('aria-label', `Width for ${this.alt || 'image'}`);
    input.title = 'Examples: 50%, 320px, or 80mm';
    const saveWidth = () => {
      const width = input.value.trim();
      if (width === this.width) return;
      this.onEdit({ width });
    };
    input.addEventListener('change', saveWidth);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveWidth();
      }
    });

    const alignmentControls = document.createElement('span');
    alignmentControls.className = 'cm-image-preview-alignment';
    (['left', 'center', 'right'] as const).forEach(alignment => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cm-image-preview-align-button';
      button.textContent = alignment === 'left' ? 'Left' : alignment === 'center' ? 'Center' : 'Right';
      button.setAttribute('aria-pressed', String(this.alignment === alignment));
      button.title = `Align image ${alignment}`;
      button.addEventListener('click', () => this.onEdit({ alignment }));
      alignmentControls.appendChild(button);
    });
    void this.resolveSource(this.source).then(value => { image.src = value; });
    label.appendChild(input);
    const controls = document.createElement('span');
    controls.className = 'cm-image-preview-controls';
    controls.append(label, alignmentControls);
    container.append(image, controls);
    return container;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
