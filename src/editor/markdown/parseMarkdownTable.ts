export type TableColumnAlignment = 'left' | 'center' | 'right' | '';

export interface EditorMarkdownTable {
  /** Document offset of the first character of the header row. */
  start: number;
  /** Document offset of the last character of the final body row. */
  end: number;
  /** One-based line number of the header row. */
  startLine: number;
  /** One-based line number of the final body row. */
  endLine: number;
  /** The table block exactly as it appears in the document. */
  source: string;
  header: string[];
  alignments: TableColumnAlignment[];
  body: string[][];
}

const delimiterCellPattern = /^:?-+:?$/;

/** Splits one Markdown table row into cells, honouring escaped pipes. */
export function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '\\' && line[index + 1] === '|') {
      cell += '\\|';
      index += 1;
      continue;
    }
    if (character === '|') {
      cells.push(cell);
      cell = '';
      continue;
    }
    cell += character;
  }
  cells.push(cell);
  // A leading or trailing pipe is optional in GFM and produces an empty edge cell.
  if (cells.length > 1 && !cells[0].trim()) cells.shift();
  if (cells.length > 1 && !cells[cells.length - 1].trim()) cells.pop();
  return cells.map(value => value.trim());
}

function delimiterAlignment(cell: string): TableColumnAlignment {
  const value = cell.trim();
  if (!delimiterCellPattern.test(value)) return '';
  const left = value.startsWith(':');
  const right = value.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return '';
}

function isDelimiterRow(line: string): boolean {
  if (!line.includes('-')) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every(cell => delimiterCellPattern.test(cell.trim()));
}

function isTableRow(line: string): boolean {
  return line.includes('|') && Boolean(line.trim());
}

/** Renders the delimiter cell that carries a column's alignment. */
function delimiterCell(alignment: TableColumnAlignment, width: number): string {
  const dashes = Math.max(3, width);
  if (alignment === 'center') return `:${'-'.repeat(Math.max(1, dashes - 2))}:`;
  if (alignment === 'right') return `${'-'.repeat(Math.max(2, dashes - 1))}:`;
  if (alignment === 'left') return `:${'-'.repeat(Math.max(2, dashes - 1))}`;
  return '-'.repeat(dashes);
}

function padCell(value: string, width: number, alignment: TableColumnAlignment): string {
  const padding = Math.max(0, width - value.length);
  if (alignment === 'right') return `${' '.repeat(padding)}${value}`;
  if (alignment === 'center') {
    const left = Math.floor(padding / 2);
    return `${' '.repeat(left)}${value}${' '.repeat(padding - left)}`;
  }
  return `${value}${' '.repeat(padding)}`;
}

/** Normalises a table so every pipe lines up in the editor. */
export function formatMarkdownTable(table: Pick<EditorMarkdownTable, 'header' | 'alignments' | 'body'>): string {
  const columnCount = Math.max(
    table.header.length,
    table.alignments.length,
    ...table.body.map(row => row.length),
    1
  );
  const cellAt = (row: string[], column: number) => row[column] ?? '';
  const widths = Array.from({ length: columnCount }, (_, column) => Math.max(
    3,
    cellAt(table.header, column).length,
    ...table.body.map(row => cellAt(row, column).length)
  ));
  const alignments = Array.from({ length: columnCount }, (_, column) => table.alignments[column] ?? '');
  const renderRow = (row: string[]) => `| ${alignments
    .map((alignment, column) => padCell(cellAt(row, column), widths[column], alignment))
    .join(' | ')} |`;

  return [
    renderRow(table.header),
    `| ${alignments.map((alignment, column) => delimiterCell(alignment, widths[column])).join(' | ')} |`,
    ...table.body.map(renderRow)
  ].join('\n');
}

/** Finds every GFM pipe table in the document. */
export function parseEditorMarkdownTables(document: string): EditorMarkdownTable[] {
  const tables: EditorMarkdownTable[] = [];
  const lines = document.split('\n');
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }

  let index = 0;
  while (index < lines.length - 1) {
    const headerLine = lines[index];
    const delimiterLine = lines[index + 1];
    if (!isTableRow(headerLine) || !isDelimiterRow(delimiterLine)) {
      index += 1;
      continue;
    }
    const header = splitTableRow(headerLine);
    const alignments = splitTableRow(delimiterLine).map(delimiterAlignment);
    if (alignments.length !== header.length) {
      index += 1;
      continue;
    }

    let last = index + 1;
    const body: string[][] = [];
    for (let cursor = index + 2; cursor < lines.length; cursor += 1) {
      if (!isTableRow(lines[cursor]) || isDelimiterRow(lines[cursor])) break;
      body.push(splitTableRow(lines[cursor]));
      last = cursor;
    }

    const start = lineStarts[index];
    const end = lineStarts[last] + lines[last].length;
    tables.push({
      start,
      end,
      startLine: index + 1,
      endLine: last + 1,
      source: document.slice(start, end),
      header,
      alignments,
      body
    });
    index = last + 1;
  }

  return tables;
}

/** Turns a stored cell back into the text a reader sees in a rendered table. */
export function decodeTableCell(cell: string): string {
  return cell.replace(/\\\|/g, '|').trim();
}

/** Turns edited text back into a cell that cannot break the row apart. */
export function encodeTableCell(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\\(?=\|)/g, '').replace(/\|/g, '\\|').trim();
}

type TableData = Pick<EditorMarkdownTable, 'header' | 'alignments' | 'body'>;

function tableData(table: TableData): TableData {
  return {
    header: [...table.header],
    alignments: [...table.alignments],
    body: table.body.map(row => [...row])
  };
}

/** Returns the table with one column's alignment replaced. */
export function withTableColumnAlignment(
  table: TableData,
  column: number,
  alignment: TableColumnAlignment
): TableData {
  const next = tableData(table);
  if (column < 0 || column >= next.header.length) return next;
  next.alignments[column] = next.alignments[column] === alignment ? '' : alignment;
  return next;
}

/**
 * The alignment a single toggle moves a column to next, cycling centre, right, left.
 * An unset column already renders left, so the first click centres it rather than
 * setting an alignment that looks like no change at all.
 */
export function nextTableColumnAlignment(current: TableColumnAlignment): TableColumnAlignment {
  if (current === 'center') return 'right';
  if (current === 'right') return 'left';
  return 'center';
}

/** Returns the table with an empty column appended. */
export function withAppendedTableColumn(table: TableData, label?: string): TableData {
  const next = tableData(table);
  next.header.push(label ?? `Column ${next.header.length + 1}`);
  next.alignments.push('');
  next.body = next.body.map(row => [...row, '']);
  return next;
}

/** Returns the table with an empty row appended. */
export function withAppendedTableRow(table: TableData): TableData {
  const next = tableData(table);
  next.body.push(next.header.map(() => ''));
  return next;
}

/** Returns the table with one cell replaced. Row -1 addresses the header. */
export function withTableCell(table: TableData, row: number, column: number, value: string): TableData {
  const next = tableData(table);
  if (column < 0 || column >= next.header.length) return next;
  const encoded = encodeTableCell(value);
  if (row < 0) {
    next.header[column] = encoded;
    return next;
  }
  if (row >= next.body.length) return next;
  // A short row is padded so the edited column exists before it is written.
  while (next.body[row].length < next.header.length) next.body[row].push('');
  next.body[row][column] = encoded;
  return next;
}

/** Builds the Markdown for a new, empty table. */
export function createMarkdownTable(columns = 3, rows = 2): string {
  return formatMarkdownTable({
    header: Array.from({ length: columns }, (_, column) => `Column ${column + 1}`),
    alignments: Array.from({ length: columns }, () => ''),
    body: Array.from({ length: rows }, () => Array.from({ length: columns }, () => ''))
  });
}
