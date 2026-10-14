const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let parseEditorMarkdownTables;
let formatMarkdownTable;
let withTableColumnAlignment;
let withAppendedTableColumn;
let withAppendedTableRow;
let createMarkdownTable;
let splitTableRow;

before(async () => {
  server = await createTestServer();
  ({
    parseEditorMarkdownTables,
    formatMarkdownTable,
    withTableColumnAlignment,
    withAppendedTableColumn,
    withAppendedTableRow,
    createMarkdownTable,
    splitTableRow
  } = await server.ssrLoadModule('/src/editor/markdown/parseMarkdownTable.ts'));
});

after(async () => {
  await server?.close();
});

test('a pipe table is parsed with its alignments, cells and document range', () => {
  const document = [
    'Intro paragraph.',
    '',
    '| Name | Qty | Price |',
    '| :--- | :-: | ----: |',
    '| Pen  | 2   | 1.50  |',
    '| Pad  | 1   | 3.00  |',
    '',
    'Outro.'
  ].join('\n');

  const tables = parseEditorMarkdownTables(document);
  assert.equal(tables.length, 1);
  const [table] = tables;
  assert.deepEqual(table.header, ['Name', 'Qty', 'Price']);
  assert.deepEqual(table.alignments, ['left', 'center', 'right']);
  assert.deepEqual(table.body, [['Pen', '2', '1.50'], ['Pad', '1', '3.00']]);
  assert.equal(table.startLine, 3);
  assert.equal(table.endLine, 6);
  assert.equal(document.slice(table.start, table.end), table.source);
  assert.ok(table.source.startsWith('| Name'));
  assert.ok(table.source.endsWith('3.00  |'));
});

test('tables without outer pipes and with escaped pipes keep their cells', () => {
  assert.deepEqual(splitTableRow('a | b\\|c | d'), ['a', 'b\\|c', 'd']);
  const tables = parseEditorMarkdownTables(['Name | Qty', '--- | ---', 'Pen | 2'].join('\n'));
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].header, ['Name', 'Qty']);
  assert.deepEqual(tables[0].body, [['Pen', '2']]);
});

test('text that only looks like a table is not treated as one', () => {
  assert.deepEqual(parseEditorMarkdownTables('No pipes here\njust prose'), []);
  // A delimiter row whose column count disagrees with the header is not a GFM table.
  assert.deepEqual(parseEditorMarkdownTables('| a | b |\n| --- |\n| 1 | 2 |'), []);
  assert.deepEqual(parseEditorMarkdownTables('| a | b |\n| not | dashes |'), []);
});

test('formatting lines up every pipe and encodes alignment in the delimiter row', () => {
  const formatted = formatMarkdownTable({
    header: ['Name', 'Qty', 'Price'],
    alignments: ['left', 'center', 'right'],
    body: [['Pen', '2', '1.50'], ['Notebook', '1', '12.00']]
  });

  assert.deepEqual(formatted.split('\n'), [
    '| Name     | Qty | Price |',
    '| :------- | :-: | ----: |',
    '| Pen      |  2  |  1.50 |',
    '| Notebook |  1  | 12.00 |'
  ]);
  const widths = new Set(formatted.split('\n').map(line => line.length));
  assert.equal(widths.size, 1);
});

test('formatting a parsed table is stable, so tidying twice changes nothing', () => {
  const once = formatMarkdownTable(parseEditorMarkdownTables(createMarkdownTable())[0]);
  const twice = formatMarkdownTable(parseEditorMarkdownTables(once)[0]);
  assert.equal(once, twice);
});

test('alignment is set per column and toggled off when picked again', () => {
  const table = parseEditorMarkdownTables(createMarkdownTable(3, 1))[0];
  assert.deepEqual(withTableColumnAlignment(table, 1, 'center').alignments, ['', 'center', '']);
  const centered = withTableColumnAlignment(table, 1, 'center');
  assert.deepEqual(withTableColumnAlignment(centered, 1, 'center').alignments, ['', '', '']);
  assert.deepEqual(withTableColumnAlignment(centered, 1, 'right').alignments, ['', 'right', '']);
  // An out-of-range column leaves the table untouched.
  assert.deepEqual(withTableColumnAlignment(table, 9, 'left').alignments, ['', '', '']);
});

test('adding a column or a row keeps every row the same width', () => {
  const table = parseEditorMarkdownTables([
    '| Name | Qty |',
    '| :--- | --: |',
    '| Pen  | 2   |'
  ].join('\n'))[0];

  const withColumn = withAppendedTableColumn(table);
  assert.deepEqual(withColumn.header, ['Name', 'Qty', 'Column 3']);
  assert.deepEqual(withColumn.alignments, ['left', 'right', '']);
  assert.deepEqual(withColumn.body, [['Pen', '2', '']]);

  const withRow = withAppendedTableRow(table);
  assert.deepEqual(withRow.body, [['Pen', '2'], ['', '']]);
  assert.deepEqual(withRow.header, table.header);

  // Round-tripping both edits produces a table that parses back identically.
  const reparsed = parseEditorMarkdownTables(formatMarkdownTable(withAppendedTableRow(withColumn)))[0];
  assert.deepEqual(reparsed.header, ['Name', 'Qty', 'Column 3']);
  assert.deepEqual(reparsed.alignments, ['left', 'right', '']);
  assert.equal(reparsed.body.length, 2);
});

test('a new table is a parseable three column starter grid', () => {
  const tables = parseEditorMarkdownTables(createMarkdownTable());
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].header, ['Column 1', 'Column 2', 'Column 3']);
  assert.equal(tables[0].body.length, 2);
  assert.deepEqual(tables[0].alignments, ['', '', '']);
});

test('consecutive tables separated by a blank line are found separately', () => {
  const tables = parseEditorMarkdownTables([
    '| a | b |',
    '| - | - |',
    '| 1 | 2 |',
    '',
    '| c | d |',
    '| - | - |',
    '| 3 | 4 |'
  ].join('\n'));
  assert.equal(tables.length, 2);
  assert.deepEqual(tables[0].header, ['a', 'b']);
  assert.deepEqual(tables[1].header, ['c', 'd']);
  assert.equal(tables[1].startLine, 5);
});

test('the Markdown toolbar ships its command buttons disabled', async () => {
  const { editorPanelTemplate } = await server.ssrLoadModule('/src/ui/components/EditorPanel.ts');
  const markup = editorPanelTemplate();
  const buttons = markup.match(/<button[^>]*data-markdown-command[^>]*>/g) ?? [];

  // Every command is a silent no-op while no document is open, so none of the
  // buttons may be live until an editor exists to receive it.
  assert.equal(buttons.length, 13);
  for (const button of buttons) {
    assert.match(button, /\bdisabled\b/, `Toolbar button is live before an editor exists: ${button}`);
  }
  assert.match(markup, /data-markdown-command="table"[^>]*disabled/);
});

test('an editor becoming available or going away reports the change once', async () => {
  const { DocumentSessionController } = await server.ssrLoadModule('/src/ui/DocumentSessionController.ts');
  const changes = [];
  const session = new DocumentSessionController(available => changes.push(available));
  const editor = {
    getSelection: () => ({ from: 0, to: 0 }),
    view: { scrollDOM: { scrollTop: 0 } },
    destroy: () => {}
  };
  const projectRef = { kind: 'memory', id: 'test' };

  session.activate(projectRef, 'one.md', editor);
  assert.deepEqual(changes, [true]);
  // Switching documents keeps an editor available, so the toolbar must not flicker.
  session.activate(projectRef, 'two.md', editor);
  assert.deepEqual(changes, [true]);
  session.destroyActive();
  assert.deepEqual(changes, [true, false]);
  session.destroyActive();
  assert.deepEqual(changes, [true, false]);
});
