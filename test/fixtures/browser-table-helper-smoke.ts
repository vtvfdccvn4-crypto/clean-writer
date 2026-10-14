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

function tableLines(value: string): string[] {
  return value.split('\n').filter(line => line.trim().startsWith('|'));
}

async function run() {
  const parent = document.getElementById('editor');
  if (!parent) throw new Error('Editor root missing.');
  const editor = createEditor(parent, initial, { onChange: () => {} });

  // A block widget supplied from a view plugin throws inside CodeMirror and never
  // reaches the DOM, so rendering the control at all is the thing worth asserting.
  const control = await waitFor(
    'table helper control',
    () => document.querySelector<HTMLElement>('.cm-table-helper-control')
  );
  const renderedAboveTable = control.compareDocumentPosition(editor.view.contentDOM)
    === Node.DOCUMENT_POSITION_CONTAINS + Node.DOCUMENT_POSITION_PRECEDING;
  const columnGroups = document.querySelectorAll('.cm-table-helper-column').length;

  const alignCentre = document.querySelector<HTMLButtonElement>(
    '.cm-table-helper-column .cm-table-helper-button[aria-label="Align Name center"]'
  );
  if (!alignCentre) throw new Error('Column alignment control missing.');
  alignCentre.click();
  await waitFor('centre alignment written', () => editor.getValue().includes(':-'));
  const centred = /\|\s*:-+:\s*\|/.test(editor.getValue());

  const addColumn = document.querySelector<HTMLButtonElement>(
    '.cm-table-helper-footer .cm-table-helper-button[aria-label="Add column"]'
  );
  if (!addColumn) throw new Error('Add column control missing.');
  addColumn.click();
  await waitFor('third column added', () => editor.getValue().includes('Column 3'));

  const addRow = document.querySelector<HTMLButtonElement>(
    '.cm-table-helper-footer .cm-table-helper-button[aria-label="Add row"]'
  );
  if (!addRow) throw new Error('Add row control missing.');
  addRow.click();
  await waitFor('fourth table line added', () => tableLines(editor.getValue()).length === 4);

  const lines = tableLines(editor.getValue());
  const aligned = new Set(lines.map(line => line.length)).size === 1;
  await waitFor(
    'helper redrawn for the wider table',
    () => document.querySelectorAll('.cm-table-helper-column').length === 3
  );
  const columnGroupsAfterEdits = document.querySelectorAll('.cm-table-helper-column').length;

  // The toolbar's insert command had no browser coverage: the fixture below
  // builds a table from an empty document the way the Table button does.
  const blank = createEditor(document.body.appendChild(document.createElement('div')), 'Prose only.', { onChange: () => {} });
  applyMarkdownCommand(blank.view, 'table');
  const insertedHelper = await waitFor(
    'helper for the inserted table',
    () => document.querySelectorAll('.cm-table-helper-control').length === 2
  );
  const insertedValue = blank.getValue();
  const insertedColumns = /\| Column 1 \| Column 2 \| Column 3 \|/.test(insertedValue);
  const insertedRows = insertedValue.split('\n').filter(line => line.trim().startsWith('|')).length;
  const keptExistingProse = insertedValue.includes('Prose only.');
  blank.destroy();

  window.__HARNESS_RESULT__ = {
    ok: true,
    insertedHelper: insertedHelper === true,
    insertedColumns,
    insertedRows,
    keptExistingProse,
    rendered: true,
    renderedAboveTable,
    columnGroups,
    centred,
    aligned,
    columnGroupsAfterEdits,
    rowsAfterEdits: lines.length,
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
