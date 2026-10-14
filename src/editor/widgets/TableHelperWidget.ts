import { WidgetType } from '@codemirror/view';

import { materialIcon } from '../../ui/components/icon';
import { decodeTableCell, type TableColumnAlignment } from '../markdown/parseMarkdownTable';

export type TableHelperAction =
  | { type: 'alignment'; column: number; alignment: TableColumnAlignment }
  | { type: 'cell'; row: number; column: number; value: string; focus?: TableCellAddress }
  | { type: 'add-column' }
  | { type: 'add-row' }
  | { type: 'tidy' }
  | { type: 'show-source' };

/** Row -1 addresses the header row. */
export interface TableCellAddress {
  row: number;
  column: number;
}

const alignmentIcons: Record<Exclude<TableColumnAlignment, ''>, string> = {
  left: 'format_align_left',
  center: 'format_align_center',
  right: 'format_align_right'
};

/**
 * Replaces a Markdown table's pipe source with the table as it will be rendered,
 * with every cell editable in place and the column controls in the header.
 */
export class TableHelperWidget extends WidgetType {
  private readonly header: readonly string[];
  private readonly alignments: readonly TableColumnAlignment[];
  private readonly body: readonly (readonly string[])[];
  private readonly onAction: (action: TableHelperAction) => void;
  private readonly pendingFocus: TableCellAddress | null;

  constructor(
    header: readonly string[],
    alignments: readonly TableColumnAlignment[],
    body: readonly (readonly string[])[],
    onAction: (action: TableHelperAction) => void,
    pendingFocus: TableCellAddress | null = null
  ) {
    super();
    this.header = header;
    this.alignments = alignments;
    this.body = body;
    this.onAction = onAction;
    this.pendingFocus = pendingFocus;
  }

  private signature(): string {
    return JSON.stringify([this.header, this.alignments, this.body]);
  }

  eq(other: TableHelperWidget): boolean {
    // A pending focus must rebuild even when the content matches, so the caret
    // lands in the cell the keyboard asked for.
    return this.signature() === other.signature()
      && this.pendingFocus === null
      && other.pendingFocus === null;
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
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => this.onAction(action));
    return button;
  }

  private columnCount(): number {
    return Math.max(this.header.length, ...this.body.map(row => row.length), 1);
  }

  /** Commits a cell on blur, Enter or Tab, never per keystroke, so typing is not interrupted. */
  private cell(tag: 'th' | 'td', row: number, column: number, text: string): HTMLTableCellElement {
    const cell = document.createElement(tag);
    cell.className = 'cm-table-helper-cell';
    const alignment = this.alignments[column];
    if (alignment) cell.style.textAlign = alignment;

    const field = document.createElement('div');
    field.className = 'cm-table-helper-cell-text';
    field.contentEditable = 'true';
    field.spellcheck = false;
    field.textContent = decodeTableCell(text);
    field.dataset.tableRow = String(row);
    field.dataset.tableColumn = String(column);
    field.setAttribute('role', 'textbox');
    field.setAttribute(
      'aria-label',
      row < 0 ? `Heading for column ${column + 1}` : `Row ${row + 1}, column ${column + 1}`
    );

    const commit = (focus?: TableCellAddress) => {
      const value = field.textContent ?? '';
      if (decodeTableCell(text) === value.trim() && !focus) return;
      this.onAction({ type: 'cell', row, column, value, focus });
    };

    field.addEventListener('blur', () => commit());
    field.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        field.textContent = decodeTableCell(text);
        field.blur();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        const lastColumn = this.columnCount() - 1;
        const forward = !event.shiftKey;
        let nextColumn = column + (forward ? 1 : -1);
        let nextRow = row;
        if (nextColumn > lastColumn) { nextColumn = 0; nextRow = row + 1; }
        if (nextColumn < 0) { nextColumn = lastColumn; nextRow = row - 1; }
        if (nextRow < -1 || nextRow >= this.body.length) { commit(); return; }
        commit({ row: nextRow, column: nextColumn });
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const nextRow = row + 1;
        if (nextRow >= this.body.length) { commit(); return; }
        commit({ row: nextRow, column });
      }
    });

    cell.appendChild(field);
    return cell;
  }

  private headerCell(column: number): HTMLTableCellElement {
    const cell = this.cell('th', -1, column, this.header[column] ?? '');
    const alignment = document.createElement('span');
    alignment.className = 'cm-table-helper-alignment';
    (['left', 'center', 'right'] as const).forEach(value => {
      alignment.appendChild(this.iconButton(
        alignmentIcons[value],
        `Align column ${column + 1} ${value}`,
        { type: 'alignment', column, alignment: value },
        this.alignments[column] === value
      ));
    });
    cell.appendChild(alignment);
    return cell;
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'cm-table-helper-control';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Table');

    const columns = this.columnCount();
    const toolbar = document.createElement('div');
    toolbar.className = 'cm-table-helper-toolbar';
    const label = document.createElement('span');
    label.className = 'cm-table-helper-label';
    label.textContent = `Table · ${columns} ${columns === 1 ? 'column' : 'columns'} × ${this.body.length} ${this.body.length === 1 ? 'row' : 'rows'}`;
    const actions = document.createElement('span');
    actions.className = 'cm-table-helper-actions';
    actions.append(
      this.iconButton('add_column_right', 'Add column', { type: 'add-column' }),
      this.iconButton('add_row_below', 'Add row', { type: 'add-row' }),
      this.iconButton('auto_fix_high', 'Tidy table layout', { type: 'tidy' }),
      this.iconButton('code', 'Edit as Markdown', { type: 'show-source' })
    );
    toolbar.append(label, actions);

    const grid = document.createElement('table');
    grid.className = 'cm-table-helper-grid';
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (let column = 0; column < columns; column += 1) headRow.appendChild(this.headerCell(column));
    head.appendChild(headRow);

    const tbody = document.createElement('tbody');
    this.body.forEach((row, rowIndex) => {
      const tableRow = document.createElement('tr');
      for (let column = 0; column < columns; column += 1) {
        tableRow.appendChild(this.cell('td', rowIndex, column, row[column] ?? ''));
      }
      tbody.appendChild(tableRow);
    });
    grid.append(head, tbody);

    const scroller = document.createElement('div');
    scroller.className = 'cm-table-helper-scroller';
    scroller.appendChild(grid);
    container.append(toolbar, scroller);

    if (this.pendingFocus) {
      const { row, column } = this.pendingFocus;
      const target = container.querySelector<HTMLElement>(
        `.cm-table-helper-cell-text[data-table-row="${row}"][data-table-column="${column}"]`
      );
      // The widget is not in the document yet, so focusing waits for layout.
      if (target) requestAnimationFrame(() => {
        target.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(target);
        selection?.removeAllRanges();
        selection?.addRange(range);
      });
    }

    return container;
  }

  ignoreEvent(): boolean {
    // The grid owns all of its own editing; CodeMirror must not treat a click or
    // a keystroke inside a cell as an edit to the replaced Markdown.
    return true;
  }
}
