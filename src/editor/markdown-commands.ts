import type { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';

export type MarkdownCommand =
  | 'heading-1' | 'heading-2' | 'heading-3'
  | 'bold' | 'italic' | 'link'
  | 'unordered-list' | 'ordered-list' | 'quote'
  | 'inline-code' | 'code-block';

type Range = { from: number; to: number };

const inlineWrappers: Partial<Record<MarkdownCommand, { before: string; after: string }>> = {
  bold: { before: '**', after: '**' },
  italic: { before: '*', after: '*' },
  'inline-code': { before: '`', after: '`' },
  link: { before: '[', after: '](url)' }
};

const linePrefixes: Partial<Record<MarkdownCommand, string>> = {
  'heading-1': '# ',
  'heading-2': '## ',
  'heading-3': '### ',
  'unordered-list': '- ',
  'ordered-list': '1. ',
  quote: '> '
};

function selectedRanges(view: EditorView): Range[] {
  return view.state.selection.ranges.map(({ from, to }) => ({ from, to }));
}

function linePrefixCommand(view: EditorView, prefix: string) {
  const changes: Array<{ from: number; to: number; insert: string }> = [];
  const selections = selectedRanges(view);
  const seen = new Set<number>();

  for (const selection of selections) {
    const startLine = view.state.doc.lineAt(selection.from);
    const endLine = view.state.doc.lineAt(selection.to);
    for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
      const line = view.state.doc.line(lineNumber);
      if (seen.has(line.from)) continue;
      seen.add(line.from);
      const existing = line.text.match(/^(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s+)/)?.[0] ?? '';
      const insert = existing === prefix ? '' : prefix;
      if (existing) {
        changes.push({ from: line.from, to: line.from + existing.length, insert });
      } else {
        changes.push({ from: line.from, to: line.from, insert });
      }
    }
  }

  view.dispatch({ changes, scrollIntoView: true });
  view.focus();
}

function wrapSelection(view: EditorView, before: string, after: string) {
  const transaction = view.state.changeByRange((range) => {
    const selected = view.state.sliceDoc(range.from, range.to);
    const isWrapped = selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length;
    if (isWrapped) {
      return {
        changes: { from: range.from, to: range.to, insert: selected.slice(before.length, -after.length) },
        range: EditorSelection.range(range.from, range.to - before.length - after.length)
      };
    }

    const insert = `${before}${selected || (before === '[' ? 'text' : 'text')}${after}`;
    const selectedStart = range.from + before.length;
    const selectedEnd = selectedStart + (selected || 'text').length;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(selectedStart, selectedEnd)
    };
  });
  view.dispatch(transaction);
  view.focus();
}

export function applyMarkdownCommand(view: EditorView, command: MarkdownCommand): void {
  const wrapper = inlineWrappers[command];
  if (wrapper) {
    wrapSelection(view, wrapper.before, wrapper.after);
    return;
  }

  if (command === 'code-block') {
    wrapSelection(view, '```\n', '\n```');
    return;
  }

  const prefix = linePrefixes[command];
  if (prefix) linePrefixCommand(view, prefix);
}
