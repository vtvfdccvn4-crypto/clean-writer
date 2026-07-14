import { EditorView } from '@codemirror/view';
import { buildProjectImageMarkdown } from '../../images/imageMarkdown';
import type { ImageEditorActions } from './imageDecorationPlugin';

/** Imports image files dropped from the operating system at the exact drop position. */
export function imageDropExtension(actions: ImageEditorActions) {
  return EditorView.domEventHandlers({
    dragover(event) {
      if (!event.dataTransfer?.types.includes('Files')
        && !event.dataTransfer?.types.includes('application/x-clear-writer-project-image')) return false;
      event.preventDefault(); event.dataTransfer.dropEffect = 'copy';
      return true;
    },
    drop(event, view) {
      const projectImagePath = event.dataTransfer?.getData('application/x-clear-writer-project-image');
      if (projectImagePath) {
        event.preventDefault();
        const position = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.from;
        const markdown = buildProjectImageMarkdown(projectImagePath);
        view.dispatch({ changes: { from: position, insert: markdown }, selection: { anchor: position + markdown.length }, scrollIntoView: true });
        view.focus();
        return true;
      }
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
