import { type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

import { parseEditorMarkdownTables, type EditorMarkdownTable } from '../markdown/parseMarkdownTable';
import { TableHelperWidget, type TableHelperAction } from '../widgets/TableHelperWidget';

export type EditTablePresentation = (table: EditorMarkdownTable, action: TableHelperAction) => void;

const headerRowDecoration = Decoration.line({ class: 'cm-table-row cm-table-row-header' });
const delimiterRowDecoration = Decoration.line({ class: 'cm-table-row cm-table-row-delimiter' });
const bodyRowDecoration = Decoration.line({ class: 'cm-table-row' });

function tableDecorationRanges(view: EditorView, onAction: EditTablePresentation): readonly Range<Decoration>[] {
  const decorations: Range<Decoration>[] = [];
  const document = view.state.doc;
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

function tableDecorations(view: EditorView, onAction: EditTablePresentation): DecorationSet {
  return Decoration.set(tableDecorationRanges(view, onAction), true);
}

/** Adds a column and row builder above every Markdown table without replacing its source. */
export function tableHelperExtension(onAction: EditTablePresentation) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = tableDecorations(view, onAction);
    }

    update(update: ViewUpdate): void {
      // Table structure spans several lines, so a changed line can join or split a
      // whole block; recomputing the set keeps the widgets honest and widget `eq`
      // keeps the DOM in place when nothing about a table changed.
      if (!update.docChanged) return;
      this.decorations = tableDecorations(update.view, onAction);
    }
  }, { decorations: value => value.decorations });
}
