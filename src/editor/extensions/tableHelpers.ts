import { StateEffect, StateField, type Extension, type Range, type Text } from '@codemirror/state';
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

function tableDecorationRanges(
  document: Text,
  showingSource: readonly number[],
  onAction: EditTablePresentation,
  pendingFocus: PendingFocus | null
): readonly Range<Decoration>[] {
  const decorations: Range<Decoration>[] = [];
  for (const table of parseEditorMarkdownTables(document.toString())) {
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

function tableDecorations(
  document: Text,
  showingSource: readonly number[],
  onAction: EditTablePresentation,
  pendingFocus: PendingFocus | null
): DecorationSet {
  return Decoration.set(tableDecorationRanges(document, showingSource, onAction, pendingFocus), true);
}

export interface PendingFocus {
  start: number;
  cell: TableCellAddress;
}

/**
 * Shows every Markdown table as the grid it will render as, with each cell editable
 * in place. The decorations replace whole lines, which CodeMirror only accepts from a
 * state field: a view plugin throws "Block decorations may not be specified via
 * plugins" because vertical layout is computed before plugin decorations are read.
 */
export function tableHelperExtension(
  onAction: EditTablePresentation,
  readPendingFocus: () => PendingFocus | null = () => null
): Extension {
  const field = StateField.define<DecorationSet>({
    create: state => tableDecorations(state.doc, state.field(tableSourceVisibility), onAction, readPendingFocus()),
    update: (decorations, transaction) => {
      const showingSource = transaction.state.field(tableSourceVisibility);
      const toggled = transaction.effects.some(
        effect => effect.is(toggleTableSource) || effect.is(refreshTableGrids)
      );
      if (!transaction.docChanged && !toggled) return decorations;
      return tableDecorations(transaction.state.doc, showingSource, onAction, readPendingFocus());
    },
    provide: stateField => EditorView.decorations.from(stateField)
  });
  return [tableSourceVisibility, field];
}
