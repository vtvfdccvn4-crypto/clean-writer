import { WidgetType } from '@codemirror/view';

import { materialIcon } from '../../ui/components/icon';
import type { TableColumnAlignment } from '../markdown/parseMarkdownTable';

export type TableHelperAction =
  | { type: 'alignment'; column: number; alignment: TableColumnAlignment }
  | { type: 'add-column' }
  | { type: 'add-row' }
  | { type: 'tidy' };

const alignmentIcons: Record<Exclude<TableColumnAlignment, ''>, string> = {
  left: 'format_align_left',
  center: 'format_align_center',
  right: 'format_align_right'
};

/** A non-replacing control block that builds and aligns the Markdown table below it. */
export class TableHelperWidget extends WidgetType {
  private readonly header: readonly string[];
  private readonly alignments: readonly TableColumnAlignment[];
  private readonly rowCount: number;
  private readonly onAction: (action: TableHelperAction) => void;

  constructor(
    header: readonly string[],
    alignments: readonly TableColumnAlignment[],
    rowCount: number,
    onAction: (action: TableHelperAction) => void
  ) {
    super();
    this.header = header;
    this.alignments = alignments;
    this.rowCount = rowCount;
    this.onAction = onAction;
  }

  private signature(): string {
    return `${this.rowCount}|${this.header.join('\u0001')}|${this.alignments.join('\u0001')}`;
  }

  eq(other: TableHelperWidget): boolean {
    return this.signature() === other.signature();
  }

  private iconButton(
    icon: string,
    label: string,
    action: TableHelperAction,
    pressed?: boolean
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-table-helper-button';
    button.innerHTML = materialIcon(icon);
    button.setAttribute('aria-label', label);
    button.title = label;
    if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed));
    button.addEventListener('click', () => this.onAction(action));
    return button;
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'cm-table-helper-control';
    container.contentEditable = 'false';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Table helper');

    const header = document.createElement('div');
    header.className = 'cm-table-helper-header';
    const columnCount = this.header.length;
    header.textContent = `Table · ${columnCount} ${columnCount === 1 ? 'column' : 'columns'} × ${this.rowCount} ${this.rowCount === 1 ? 'row' : 'rows'}`;

    const body = document.createElement('div');
    body.className = 'cm-table-helper-columns';
    this.header.forEach((cell, column) => {
      const group = document.createElement('div');
      group.className = 'cm-table-helper-column';

      const label = document.createElement('span');
      label.className = 'cm-table-helper-column-label';
      label.textContent = cell.trim() || `Column ${column + 1}`;
      label.title = label.textContent;

      const alignment = document.createElement('span');
      alignment.className = 'cm-table-helper-alignment';
      (['left', 'center', 'right'] as const).forEach(value => {
        alignment.appendChild(this.iconButton(
          alignmentIcons[value],
          `Align ${label.textContent} ${value}`,
          { type: 'alignment', column, alignment: value },
          this.alignments[column] === value
        ));
      });

      group.append(label, alignment);
      body.appendChild(group);
    });

    const footer = document.createElement('div');
    footer.className = 'cm-table-helper-footer';
    footer.append(
      this.iconButton('add_column_right', 'Add column', { type: 'add-column' }),
      this.iconButton('add_row_below', 'Add row', { type: 'add-row' }),
      this.iconButton('auto_fix_high', 'Tidy table layout', { type: 'tidy' })
    );

    container.append(header, body, footer);
    return container;
  }

  ignoreEvent(): boolean {
    // The widget owns its own buttons; CodeMirror must not treat them as editing gestures.
    return true;
  }
}
