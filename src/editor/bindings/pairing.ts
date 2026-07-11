import { EditorView } from 'codemirror';
import { EditorSelection } from '@codemirror/state';
import type { KeyBinding } from '@codemirror/view';

export const customPairs: Record<string, string> = {
  '*': '*',
  '+': '+',
  '-': '-',
  '|': '|',
  '$': '$'
};

export const pairingBindings: KeyBinding[] = Object.entries(customPairs).map(([open, close]) => ({
  key: open,
  run: (view: EditorView) => {
    const state = view.state;

    // Plus and minus are common typing characters, so only use them as
    // wrappers when text is selected. Returning false lets CodeMirror insert
    // a single character normally when the cursor has no selection.
    if ((open === '+' || open === '-') && state.selection.ranges.some(range => range.empty)) {
      return false;
    }

    const changes: any[] = [];
    const selections: any[] = [];
    let handled = false;

    for (const range of state.selection.ranges) {
      if (!range.empty) {
        changes.push({ from: range.from, insert: open });
        changes.push({ from: range.to, insert: close });
        selections.push(EditorSelection.range(
          range.from + open.length,
          range.to + open.length
        ));
        handled = true;
      } else {
        if (open === '*') {
          changes.push({ from: range.from, insert: open });
          selections.push(EditorSelection.cursor(range.from + open.length));
          handled = true;
        } else {
          changes.push({ from: range.from, insert: open + close });
          selections.push(EditorSelection.cursor(range.from + open.length));
          handled = true;
        }
      }
    }

    if (handled) {
      view.dispatch({
        changes,
        selection: EditorSelection.create(selections, state.selection.mainIndex),
        scrollIntoView: true
      });
      return true;
    }
    return false;
  }
}));

export const backspaceBinding: KeyBinding = {
  key: "Backspace",
  run: (view: EditorView) => {
    const state = view.state;
    const changes: any[] = [];
    const selections: any[] = [];
    let handled = false;

    if (state.selection.ranges.some(r => !r.empty)) return false;

    for (const range of state.selection.ranges) {
      if (range.from > 0 && range.from < state.doc.length) {
        const prev = state.sliceDoc(range.from - 1, range.from);
        const next = state.sliceDoc(range.from, range.from + 1);
        if (customPairs[prev] && customPairs[prev] === next) {
          changes.push({ from: range.from - 1, to: range.from + 1 });
          selections.push(EditorSelection.cursor(range.from - 1));
          handled = true;
          continue;
        }
      }
      return false;
    }

    if (handled) {
      view.dispatch({
        changes,
        selection: EditorSelection.create(selections, state.selection.mainIndex),
        scrollIntoView: true
      });
      return true;
    }
    return false;
  }
};
