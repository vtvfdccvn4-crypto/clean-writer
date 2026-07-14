import { EditorView } from '@codemirror/view';
import type { ImageEditorActions } from './imageDecorationPlugin';

/** Imports an image pasted from the system clipboard and inserts the resulting Markdown. */
export function imagePasteExtension(actions: ImageEditorActions) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const file = Array.from(event.clipboardData?.files ?? []).find(candidate => candidate.type.startsWith('image/'));
      if (!file) return false;
      event.preventDefault();
      void actions.onImageFile(file).then(markdown => {
        if (!markdown) return;
        const selection = view.state.selection.main;
        view.dispatch({ changes: { from: selection.from, to: selection.to, insert: markdown }, selection: { anchor: selection.from + markdown.length }, scrollIntoView: true });
      });
      return true;
    }
  });
}
