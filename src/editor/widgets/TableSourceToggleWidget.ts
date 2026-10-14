import { WidgetType } from '@codemirror/view';

import { materialIcon } from '../../ui/components/icon';

/** The one control left in place while a table shows its raw Markdown. */
export class TableSourceToggleWidget extends WidgetType {
  private readonly onToggle: () => void;

  constructor(onToggle: () => void) {
    super();
    this.onToggle = onToggle;
  }

  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'cm-table-helper-source-toggle';

    const label = document.createElement('span');
    label.className = 'cm-table-helper-label';
    label.textContent = 'Table Markdown';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-table-helper-button';
    button.innerHTML = materialIcon('table');
    button.setAttribute('aria-label', 'Show the table as a grid');
    button.title = 'Show the table as a grid';
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => this.onToggle());

    container.append(label, button);
    return container;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
