import { StateEffect, StateField, type Extension, type Range, type Text, type Transaction } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

import { parseEditorMarkdownTables, type EditorMarkdownTable } from '../markdown/parseMarkdownTable';
import { TableHelperWidget, type TableCellAddress, type TableHelperAction } from '../widgets/TableHelperWidget';
import { TableSourceToggleWidget } from '../widgets/TableSourceToggleWidget';

export type EditTablePresentation = (table: EditorMarkdownTable, action: TableHelperAction) => void;

/** Reveals or re-hides the Markdown behind one table, addressed by its start offset. */
export const toggleTableSource = StateEffect.define<number>();

/** Redraws the grids without changing the document, to hand the caret its next cell. */
export const refreshTableGrids = StateEffect.define<null>();

const headerRowDecoration = Decoration.line({ class: 'cm-table-row cm-table-row-header' });
const delimiterRowDecoration = Decoration.line({ class: 'cm-table-row cm-table-row-delimiter' });
const bodyRowDecoration = Decoration.line({ class: 'cm-table-row' });

/** Start offsets of the tables currently showing their Markdown instead of a grid. */
const tableSourceVisibility = StateField.define<readonly number[]>({
  create: () => [],
  update: (positions, transaction) => {
    let next = transaction.docChanged
      ? positions.map(position => transaction.changes.mapPos(position))
      : positions;
    for (const effect of transaction.effects) {
      if (!effect.is(toggleTableSource)) continue;
      next = next.includes(effect.value)
        ? next.filter(position => position !== effect.value)
        : [...next, effect.value];
    }
    return next === positions ? positions : next;
  }
});

/** Decorations for the given tables. Positions and line numbers are absolute in `document`. */
function tableDecorationRanges(
  tables: readonly EditorMarkdownTable[],
  document: Text,
  showingSource: readonly number[],
  onAction: EditTablePresentation,
  pendingFocus: PendingFocus | null
): Range<Decoration>[] {
  const decorations: Range<Decoration>[] = [];
  for (const table of tables) {
    if (showingSource.includes(table.start)) {
      // The Markdown stays visible and editable; only the toggle is drawn above it.
      decorations.push(Decoration.widget({
        side: -1,
        block: true,
        widget: new TableSourceToggleWidget(() => onAction(table, { type: 'show-source' }))
      }).range(table.start));
      for (let lineNumber = table.startLine; lineNumber <= table.endLine; lineNumber += 1) {
        const line = document.line(lineNumber);
        decorations.push((lineNumber === table.startLine
          ? headerRowDecoration
          : lineNumber === table.startLine + 1
            ? delimiterRowDecoration
            : bodyRowDecoration).range(line.from));
      }
      continue;
    }

    decorations.push(Decoration.replace({
      block: true,
      widget: new TableHelperWidget(
        table.header,
        table.alignments,
        table.body,
        action => onAction(table, action),
        pendingFocus && pendingFocus.start === table.start ? pendingFocus.cell : null
      )
    }).range(table.start, table.end));
  }
  return decorations;
}

export interface PendingFocus {
  start: number;
  cell: TableCellAddress;
}

function tableDecorations(
  document: Text,
  showingSource: readonly number[],
  onAction: EditTablePresentation,
  pendingFocus: PendingFocus | null
): DecorationSet {
  const tables = parseEditorMarkdownTables(document.toString());
  return Decoration.set(tableDecorationRanges(tables, document, showingSource, onAction, pendingFocus), true);
}

/**
 * Parses the lines from `fromLine` to `toLine` on their own and places the
 * result at its real document position. Callers must pass whole tables, which
 * `updateTableDecorations` guarantees by widening the range.
 */
function tableDecorationsForLines(
  document: Text,
  fromLine: number,
  toLine: number,
  showingSource: readonly number[],
  onAction: EditTablePresentation,
  pendingFocus: PendingFocus | null
): Range<Decoration>[] {
  const from = document.line(fromLine).from;
  const to = document.line(toLine).to;
  const lineOffset = fromLine - 1;
  const tables = parseEditorMarkdownTables(document.sliceString(from, to)).map(table => ({
    ...table,
    start: table.start + from,
    end: table.end + from,
    startLine: table.startLine + lineOffset,
    endLine: table.endLine + lineOffset
  }));
  return tableDecorationRanges(tables, document, showingSource, onAction, pendingFocus);
}

/**
 * Updates the decorations for one transaction. Existing decorations are mapped
 * through the changes, then the changed lines are widened to the nearest blank
 * lines on each side and only that region is re-parsed.
 *
 * Widening by table rows alone is not enough: the parser scans greedily, and a
 * delimiter row may contain no pipe, so a table can begin several lines from an
 * edit. A blank line is a safe boundary. It is never a table row or a delimiter,
 * and it restarts the scan, so a region between two blank lines parses the same
 * way it does inside the whole document.
 */
function updateTableDecorations(
  decorations: DecorationSet,
  transaction: Transaction,
  showingSource: readonly number[],
  onAction: EditTablePresentation,
  pendingFocus: PendingFocus | null
): DecorationSet {
  const document = transaction.state.doc;
  const mapped = decorations.map(transaction.changes);
  let firstLine = Number.POSITIVE_INFINITY;
  let lastLine = Number.NEGATIVE_INFINITY;
  transaction.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    firstLine = Math.min(firstLine, document.lineAt(fromB).number);
    lastLine = Math.max(lastLine, document.lineAt(toB).number);
  });
  if (firstLine > lastLine) return mapped;

  const isBlank = (lineNumber: number) => document.line(lineNumber).text.trim() === '';
  while (firstLine > 1 && !isBlank(firstLine - 1)) firstLine -= 1;
  while (lastLine < document.lines && !isBlank(lastLine + 1)) lastLine += 1;

  return mapped.update({
    filterFrom: document.line(firstLine).from,
    filterTo: document.line(lastLine).to,
    filter: () => false,
    add: tableDecorationsForLines(document, firstLine, lastLine, showingSource, onAction, pendingFocus),
    sort: true
  });
}

export function tableHelperExtension(
  onAction: EditTablePresentation,
  readPendingFocus: () => PendingFocus | null = () => null
): Extension {
  const field = StateField.define<DecorationSet>({
    create: state => tableDecorations(state.doc, state.field(tableSourceVisibility), onAction, readPendingFocus()),
    update: (decorations, transaction) => {
      const showingSource = transaction.state.field(tableSourceVisibility);
      const rebuild = transaction.effects.some(
        effect => effect.is(toggleTableSource) || effect.is(refreshTableGrids)
      );
      if (rebuild) return tableDecorations(transaction.state.doc, showingSource, onAction, readPendingFocus());
      if (!transaction.docChanged) return decorations;
      return updateTableDecorations(decorations, transaction, showingSource, onAction, readPendingFocus());
    },
    provide: stateField => EditorView.decorations.from(stateField)
  });
  return [tableSourceVisibility, field];
}
