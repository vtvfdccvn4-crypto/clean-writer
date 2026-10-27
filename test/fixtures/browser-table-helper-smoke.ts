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

  // The reference is a clean rendered table, so the controls must not be on
  // screen until the pointer or the caret is in the table. :hover cannot be
  // simulated, but :focus-within is the same rule and can be.
  // The toolbar strip is permanent chrome now that it sits above the heading row,
  // so what must be hidden at rest are the action buttons inside it, not the strip.
  const toolbarActions = document.querySelector<HTMLElement>('.cm-table-helper-toolbar .cm-table-helper-actions');
  const headerControls = document.querySelector<HTMLElement>('.cm-table-helper-grid thead .cm-table-helper-alignment');
  if (!toolbarActions || !headerControls) throw new Error('Table controls missing.');
  const chromeHiddenAtRest = getComputedStyle(toolbarActions).opacity === '0'
    && getComputedStyle(headerControls).opacity === '0';
  const headerHeight = document.querySelector('.cm-table-helper-grid thead tr')?.getBoundingClientRect().height ?? 0;
  cell(-1, 0)?.focus();
  const chromeShownOnFocus = await waitFor(
    'controls revealed by focus',
    () => getComputedStyle(toolbarActions).opacity === '1'
  );
  // Revealing them must not move anything: they are laid over the table.
  const headerHeightUnchanged = Math.abs(
    (document.querySelector('.cm-table-helper-grid thead tr')?.getBoundingClientRect().height ?? 0) - headerHeight
  ) < 0.5;
  cell(-1, 0)?.blur();

  // `display: flex` on a th takes the cell out of its row and stacks every heading
  // in one column, which no count or height assertion notices. Geometry does: the
  // headings must share a top, and each must sit over its own body column.
  const headerRects = Array.from(
    document.querySelectorAll('.cm-table-helper-grid thead th')
  ).map(node => node.getBoundingClientRect());
  const bodyRects = Array.from(
    document.querySelectorAll('.cm-table-helper-grid tbody tr:first-child td')
  ).map(node => node.getBoundingClientRect());
  const headingsShareOneRow = headerRects.length > 1
    && headerRects.every(rect => Math.abs(rect.top - headerRects[0].top) < 0.5)
    && headerRects.every((rect, index) => index === 0 || rect.left > headerRects[index - 1].left);
  const headingsSitOverTheirColumns = headerRects.length === bodyRects.length
    && headerRects.every((rect, index) => Math.abs(rect.left - bodyRects[index].left) < 0.5);

  const target = cell(0, 1);
  if (!target) throw new Error('Body cell missing.');
  target.textContent = '7';
  target.dispatchEvent(new FocusEvent('blur'));
  await waitFor('cell edit written to the document', () => editor.getValue().includes('| 7'));
  const editKeptOtherCells = editor.getValue().includes('Pen');

  // One toggle per column now, cycling through the alignments; from unset it centres.
  const alignToggles = document.querySelectorAll('.cm-table-helper-grid thead .cm-table-helper-alignment').length;
  const centre = document.querySelector<HTMLButtonElement>(
    '.cm-table-helper-grid thead th:nth-child(2) .cm-table-helper-alignment'
  );
  if (!centre) throw new Error('Column alignment toggle missing from the heading.');
  const alignmentShown = centre.dataset.alignment === 'default';
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

  // A table wider than the pane must scroll inside its own box. A percentage
  // max-width cannot do that, because it resolves against a content element the
  // table itself widened, so this is the assertion that the pixel bound holds.
  const narrowHost = document.body.appendChild(document.createElement('div'));
  narrowHost.style.width = '320px';
  const wideTable = [
    '| A | B | C | D | E | F |',
    '| --- | --- | --- | --- | --- | --- |',
    '| aaaaaaaaaa | bbbbbbbbbb | cccccccccc | dddddddddd | eeeeeeeeee | ffffffffff |'
  ].join('\n');
  const wide = createEditor(narrowHost, wideTable, { onChange: () => {} });
  const wideScroller = await waitFor(
    'wide grid',
    () => narrowHost.querySelector<HTMLElement>('.cm-table-helper-scroller')
  );
  const paneDidNotWiden = await waitFor(
    'editor pane not widened by the table',
    () => wide.view.contentDOM.scrollWidth <= wide.view.scrollDOM.clientWidth + 1
  );
  const tableScrollsInItsBox = wideScroller instanceof HTMLElement
    && wideScroller.scrollWidth > wideScroller.clientWidth;
  wide.destroy();
  narrowHost.remove();

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
    chromeHiddenAtRest,
    chromeShownOnFocus: chromeShownOnFocus === true,
    headerHeightUnchanged,
    sourceIntact,
    editKeptOtherCells,
    tabMovedCaret: tabMovedCaret === true,
    sourceShown: sourceShown === true,
    pipesVisible,
    gridRestored: gridRestored === true,
    alignToggles,
    headingsShareOneRow,
    headingsSitOverTheirColumns,
    alignmentShown,
    paneDidNotWiden: paneDidNotWiden === true,
    tableScrollsInItsBox,
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
    error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error)
  };
});
