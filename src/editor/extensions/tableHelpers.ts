import { StateField, type Extension, type Range, type Text } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

import { parseEditorMarkdownTables, type EditorMarkdownTable } from '../markdown/parseMarkdownTable';
import { TableHelperWidget, type TableHelperAction } from '../widgets/TableHelperWidget';

export type EditTablePresentation = (table: EditorMarkdownTable, action: TableHelperAction) => void;

const headerRowDecoration = Decoration.line({ class: 'cm-table-row cm-table-row-header' });
const delimiterRowDecoration = Decoration.line({ class: 'cm-table-row cm-table-row-delimiter' });
const bodyRowDecoration = Decoration.line({ class: 'cm-table-row' });

function tableDecorationRanges(document: Text, onAction: EditTablePresentation): readonly Range<Decoration>[] {
  const decorations: Range<Decoration>[] = [];
  for (const table of parseEditorMarkdownTables(document.toString())) {
    decorations.push(Decoration.widget({
      side: -1,
      block: true,
      widget: new TableHelperWidget(
        table.header,
        table.alignments,
        table.body.length,
        action => onAction(table, action)
      )
    }).range(table.start));
    for (let lineNumber = table.startLine; lineNumber <= table.endLine; lineNumber += 1) {
      const line = document.line(lineNumber);
      const decoration = lineNumber === table.startLine
        ? headerRowDecoration
        : lineNumber === table.startLine + 1
          ? delimiterRowDecoration
          : bodyRowDecoration;
      decorations.push(decoration.range(line.from));
    }
  }
  return decorations;
}

function tableDecorations(document: Text, onAction: EditTablePresentation): DecorationSet {
  return Decoration.set(tableDecorationRanges(document, onAction), true);
}

/**
 * Adds a column and row builder above every Markdown table without replacing its
 * source. The helper is a block widget, which CodeMirror only accepts from a state
 * field: a view plugin throws "Block decorations may not be specified via plugins"
 * because the vertical layout is computed before plugin decorations are read.
 */
export function tableHelperExtension(onAction: EditTablePresentation): Extension {
  return StateField.define<DecorationSet>({
    create: state => tableDecorations(state.doc, onAction),
    // Table structure spans several lines, so one changed line can join or split a
    // whole block; recomputing keeps the widgets honest, and the widget's `eq`
    // keeps the DOM in place when nothing about a table actually changed.
    update: (decorations, transaction) => transaction.docChanged
      ? tableDecorations(transaction.state.doc, onAction)
      : decorations,
    provide: field => EditorView.decorations.from(field)
  });
}
