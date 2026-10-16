import { WidgetType } from '@codemirror/view';
import { materialIcon } from '../../ui/components/icon';

type ImageAlignment = 'left' | 'center' | 'right' | '';

const alignmentIcons: Record<ImageAlignment, string> = {
  '': 'align_horizontal_left',
  left: 'align_horizontal_left',
  center: 'align_horizontal_center',
  right: 'align_horizontal_right'
};

const alignmentNames: Record<ImageAlignment, string> = {
  '': 'left',
  left: 'left',
  center: 'centre',
  right: 'right'
};

/** Same cycle as a table column's toggle: unset reads as left, then centre, right, left. */
function nextImageAlignment(current: ImageAlignment): 'left' | 'center' | 'right' {
  if (current === 'center') return 'right';
  if (current === 'right') return 'left';
  return 'center';
}

export class ImagePreviewWidget extends WidgetType {
  private readonly alt: string;
  private readonly source: string;
  private readonly resolveSource: (source: string) => Promise<string>;
  private readonly width: string;
  private readonly alignment: ImageAlignment;
  private readonly onEdit: (update: { alignment?: 'left' | 'center' | 'right'; width?: string }) => void;

  constructor(
    alt: string,
    source: string,
    width: string,
    alignment: ImageAlignment,
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

  /** One toggle that shows the current alignment; each click moves it to the next, as a table column's does. */
  private alignmentToggle(): HTMLButtonElement {
    const next = nextImageAlignment(this.alignment);
    const label = `Image alignment: ${alignmentNames[this.alignment]}. Click to align ${alignmentNames[next]}.`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-image-preview-align-toggle';
    button.innerHTML = materialIcon(alignmentIcons[this.alignment]);
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.alignment = this.alignment || 'default';
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => this.onEdit({ alignment: next }));
    return button;
  }

  toDOM(): HTMLElement {
    const container = document.createElement('span');
    container.className = 'cm-image-preview-control';
    container.contentEditable = 'false';
    container.dataset.imagePreviewDragSource = 'true';
    container.title = 'Hold and drag to move this image';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Image');

    const header = document.createElement('span');
    header.className = 'cm-image-preview-header';
    header.textContent = this.alt || this.source.split('/').pop() || 'Image';

    const body = document.createElement('span');
    body.className = 'cm-image-preview-body';

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
    label.appendChild(input);

    const footer = document.createElement('span');
    footer.className = 'cm-image-preview-footer';
    footer.append(label, this.alignmentToggle());

    void this.resolveSource(this.source).then(value => { image.src = value; });
    body.append(image);
    container.append(header, body, footer);
    return container;
  }

  ignoreEvent(event: Event): boolean {
    // CodeMirror needs the pointer gesture plus its native drag events to
    // move the Markdown line represented by this widget.
    return !event.type.startsWith('pointer') && !event.type.startsWith('drag');
  }
}
