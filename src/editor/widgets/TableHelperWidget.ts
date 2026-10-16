import { WidgetType, type EditorView } from '@codemirror/view';

import { materialIcon } from '../../ui/components/icon';
import {
  decodeTableCell,
  nextTableColumnAlignment,
  type TableColumnAlignment
} from '../markdown/parseMarkdownTable';

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

/**
 * The widget is not in the document when it is built, so the caret has to wait for
 * it to be attached. An animation frame is the natural moment, but it never arrives
 * while the window is unpainted — behind another window, or in a background tab —
 * and the keystrokes after a Tab would then land in the document instead of the
 * cell. Timers keep firing there, so they back the frame up.
 */
function focusCellWhenAttached(target: HTMLElement): void {
  let focused = false;
  const focusCell = () => {
    if (focused || !target.isConnected) return;
    target.focus();
    if (document.activeElement !== target) return;
    focused = true;
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(target);
    selection?.removeAllRanges();
    selection?.addRange(range);
  };
  requestAnimationFrame(focusCell);
  setTimeout(focusCell, 0);
  setTimeout(focusCell, 60);
}

const alignmentIcons: Record<TableColumnAlignment, string> = {
  '': 'align_horizontal_left',
  left: 'align_horizontal_left',
  center: 'align_horizontal_center',
  right: 'align_horizontal_right'
};

const alignmentNames: Record<TableColumnAlignment, string> = {
  '': 'left',
  left: 'left',
  center: 'centre',
  right: 'right'
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
  private widthObserver: ResizeObserver | null = null;

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

  /**
   * One small toggle per column rather than a button per alignment: it shows the
   * column's current alignment and each click moves it to the next one, so the
   * heading cell keeps the width and height of a rendered one.
   */
  private headerCell(column: number): HTMLTableCellElement {
    const cell = this.cell('th', -1, column, this.header[column] ?? '');
    const current = this.alignments[column] ?? '';
    const next = nextTableColumnAlignment(current);
    const toggle = this.iconButton(
      alignmentIcons[current],
      `Column ${column + 1} alignment: ${alignmentNames[current]}. Click to align ${alignmentNames[next]}.`,
      { type: 'alignment', column, alignment: next }
    );
    toggle.classList.add('cm-table-helper-alignment');
    toggle.dataset.alignment = current || 'default';
    cell.appendChild(toggle);
    return cell;
  }

  /**
   * A percentage max-width resolves against the content element, which is only as
   * wide as this widget made it, so the constraint is circular and a wide table
   * widens the whole editor pane. Measuring the scroller in pixels is the only
   * bound that bites; the observer keeps it current as the pane is resized.
   */
  private constrainWidth(view: EditorView, container: HTMLElement): void {
    const measure = () => {
      if (!container.isConnected && this.widthObserver) return;
      const style = window.getComputedStyle(view.contentDOM);
      const padding = parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0');
      const available = view.scrollDOM.clientWidth - Math.max(0, view.contentDOM.offsetLeft) - padding;
      if (available > 40) container.style.maxWidth = `${Math.floor(available)}px`;
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    this.widthObserver = new ResizeObserver(measure);
    this.widthObserver.observe(view.scrollDOM);
  }

  destroy(): void {
    this.widthObserver?.disconnect();
    this.widthObserver = null;
  }

  toDOM(view: EditorView): HTMLElement {
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

    this.constrainWidth(view, container);

    if (this.pendingFocus) {
      const { row, column } = this.pendingFocus;
      const target = container.querySelector<HTMLElement>(
        `.cm-table-helper-cell-text[data-table-row="${row}"][data-table-column="${column}"]`
      );
      if (target) focusCellWhenAttached(target);
    }

    return container;
  }

  ignoreEvent(): boolean {
    // The grid owns all of its own editing; CodeMirror must not treat a click or
    // a keystroke inside a cell as an edit to the replaced Markdown.
    return true;
  }
}
