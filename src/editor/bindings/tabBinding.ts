import { EditorView } from 'codemirror';
import { EditorSelection } from '@codemirror/state';
import type { KeyBinding } from '@codemirror/view';

export const tabBinding: KeyBinding = {
  key: 'Tab',
  run: (editorView: EditorView) => {
    const transaction = editorView.state.changeByRange((range) => ({
      changes: { from: range.from, to: range.to, insert: '  ' },
      range: EditorSelection.cursor(range.from + 2)
    }));
    editorView.dispatch(transaction);
    return true;
  }
};
