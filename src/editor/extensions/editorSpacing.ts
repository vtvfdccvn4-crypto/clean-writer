import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

export function editorSpacingExtension(): Extension {
  return EditorView.theme({
    '.cm-gutters': {
      marginRight: '15px'
    },
    '.cm-content': {
      paddingLeft: '15px',
      paddingRight: '15px'
    },
    '.cm-scroller': {
      paddingTop: '10px',
      paddingBottom: '30px'
    }
  });
}
