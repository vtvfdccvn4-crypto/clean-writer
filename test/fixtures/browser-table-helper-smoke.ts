import '/src/style.css';
import { createEditor } from '/src/editor/createEditor.ts';
import { applyMarkdownCommand } from '/src/editor/markdown-commands.ts';
import { waitFor } from './helpers/smoke-dom.ts';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
  }
}

const initial = [
  'Intro.',
  '',
  '| Name | Qty |',
  '| ---- | --- |',
  '| Pen  | 2   |',
  '',
  'Outro.'
].join('\n');

function cell(row: number, column: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `.cm-table-helper-cell-text[data-table-row="${row}"][data-table-column="${column}"]`
  );
}

function press(target: HTMLElement, key: string, shiftKey = false): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
}

async function run() {
  const parent = document.getElementById('editor');
  if (!parent) throw new Error('Editor root missing.');
  const editor = createEditor(parent, initial, { onChange: () => {} });

  // A replacing block decoration from a view plugin throws inside CodeMirror and
  // never reaches the DOM, so rendering the grid at all is worth asserting.
  const control = await waitFor('table grid', () => document.querySelector<HTMLElement>('.cm-table-helper-control'));
  const renderedInEditor = editor.view.contentDOM.contains(control);
  const headerCells = document.querySelectorAll('.cm-table-helper-grid thead th').length;
  const bodyCells = document.querySelectorAll('.cm-table-helper-grid tbody td').length;
  const readsContent = cell(0, 0)?.textContent === 'Pen' && cell(-1, 1)?.textContent === 'Qty';
  // The point of the change: the pipe source must no longer be on screen.
  const pipesHidden = !editor.view.contentDOM.textContent?.includes('| Name | Qty |');
  const sourceIntact = editor.getValue().includes('| Name | Qty |');

  const target = cell(0, 1);
  if (!target) throw new Error('Body cell missing.');
  target.textContent = '7';
  target.dispatchEvent(new FocusEvent('blur'));
  await waitFor('cell edit written to the document', () => editor.getValue().includes('| 7'));
  const editKeptOtherCells = editor.getValue().includes('Pen');

  const centre = document.querySelector<HTMLButtonElement>(
    '.cm-table-helper-grid thead .cm-table-helper-button[aria-label="Align column 2 center"]'
  );
  if (!centre) throw new Error('Column alignment control missing from the heading.');
  centre.click();
  await waitFor('centre alignment written', () => /\|\s*:-+:\s*\|/.test(editor.getValue()));

  document.querySelector<HTMLButtonElement>('.cm-table-helper-actions [aria-label="Add row"]')?.click();
  await waitFor('row added', () => document.querySelectorAll('.cm-table-helper-grid tbody tr').length === 2);
  document.querySelector<HTMLButtonElement>('.cm-table-helper-actions [aria-label="Add column"]')?.click();
  await waitFor('column added', () => document.querySelectorAll('.cm-table-helper-grid thead th').length === 3);

  // Tab moves to the next cell and the caret follows into the rebuilt widget.
  const tabFrom = cell(0, 0);
  if (!tabFrom) throw new Error('Cell for the Tab move missing.');
  tabFrom.focus();
  press(tabFrom, 'Tab');
  const tabMovedCaret = await waitFor(
    'caret moved to the next cell',
    () => document.activeElement instanceof HTMLElement
      && document.activeElement.dataset.tableRow === '0'
      && document.activeElement.dataset.tableColumn === '1'
  );

  document.querySelector<HTMLButtonElement>('.cm-table-helper-actions [aria-label="Edit as Markdown"]')?.click();
  const sourceShown = await waitFor(
    'markdown revealed',
    () => document.querySelector('.cm-table-helper-source-toggle') !== null
      && document.querySelector('.cm-table-helper-grid') === null
  );
  const pipesVisible = editor.view.contentDOM.textContent?.includes('| Pen') === true;

  document.querySelector<HTMLButtonElement>('.cm-table-helper-source-toggle .cm-table-helper-button')?.click();
  const gridRestored = await waitFor('grid restored', () => document.querySelector('.cm-table-helper-grid') !== null);

  const blank = createEditor(document.body.appendChild(document.createElement('div')), 'Prose only.', { onChange: () => {} });
  applyMarkdownCommand(blank.view, 'table');
  const insertedGrid = await waitFor(
    'grid for the inserted table',
    () => document.querySelectorAll('.cm-table-helper-grid').length === 2
  );
  const insertedValue = blank.getValue();
  const insertedColumns = /\| Column 1 \| Column 2 \| Column 3 \|/.test(insertedValue);
  const insertedRows = insertedValue.split('\n').filter(line => line.trim().startsWith('|')).length;
  const keptExistingProse = insertedValue.includes('Prose only.');
  blank.destroy();

  window.__HARNESS_RESULT__ = {
    ok: true,
    renderedInEditor,
    headerCells,
    bodyCells,
    readsContent,
    pipesHidden,
    sourceIntact,
    editKeptOtherCells,
    tabMovedCaret: tabMovedCaret === true,
    sourceShown: sourceShown === true,
    pipesVisible,
    gridRestored: gridRestored === true,
    insertedGrid: insertedGrid === true,
    insertedColumns,
    insertedRows,
    keptExistingProse,
    preservedSurroundingText: editor.getValue().startsWith('Intro.') && editor.getValue().endsWith('Outro.')
  };
  editor.destroy();
}

run().catch(error => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? error.stack : String(error)
  };
});
