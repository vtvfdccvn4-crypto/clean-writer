import { EditorView } from '@codemirror/view';

const IMAGE_MARKDOWN_MIME = 'text/x-clear-writer-image-markdown';

function isTextDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).some(type => {
    const normalized = type.toLowerCase();
    return normalized === 'text' || normalized === 'text/plain';
  });
}

/** Accepts Markdown dragged from the project image list and inserts it at the drop point. */
export function imageDropExtension() {
  return EditorView.domEventHandlers({
    dragover(event) {
      if (!event.dataTransfer) return false;
      if (Array.from(event.dataTransfer.types).includes(IMAGE_MARKDOWN_MIME)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        return true;
      }
      if (isTextDrag(event.dataTransfer)) {
        // Browsers only deliver `drop` after dragover is cancelled. Return
        // false so CodeMirror's built-in text drop handler still owns the
        // final move/copy transaction.
        event.preventDefault();
      }
      return false;
    },
    drop(event, view) {
      const markdown = event.dataTransfer?.getData(IMAGE_MARKDOWN_MIME);
      if (!markdown) return false;

      event.preventDefault();
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
      view.dispatch({
        changes: { from: pos, to: pos, insert: markdown },
        selection: { anchor: pos + markdown.length },
        scrollIntoView: true
      });
      view.focus();
      return true;
    }
  });
}
