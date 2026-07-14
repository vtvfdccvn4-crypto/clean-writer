import { EditorView } from '@codemirror/view';
import type { ImageEditorActions } from './imageDecorationPlugin';

/** Imports image files dropped from the operating system at the exact drop position. */
export function imageDropExtension(actions: ImageEditorActions) {
  return EditorView.domEventHandlers({
    dragover(event) {
      if (!event.dataTransfer?.types.includes('Files')) return false;
      event.preventDefault(); event.dataTransfer.dropEffect = 'copy';
      return true;
    },
    drop(event, view) {
      const file = Array.from(event.dataTransfer?.files ?? []).find(candidate => candidate.type.startsWith('image/'));
      if (!file) return false;
      event.preventDefault();
      const position = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.from;
      void actions.onImageFile(file).then(markdown => {
        if (!markdown) return;
        view.dispatch({ changes: { from: position, insert: markdown }, selection: { anchor: position + markdown.length }, scrollIntoView: true });
      });
      return true;
    }
  });
}
