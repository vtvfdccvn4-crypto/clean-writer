import { EditorView } from 'codemirror';
import { showNotice } from '../ui/components/Notice';
import { getBaseName, normalizeExplorerPath } from '../utils/path-utils';

export function normalizeProjectImageMarkdownPath(path: string): string {
  const normalized = normalizeExplorerPath(path);
  if (!normalized) return normalized;
  return normalized.startsWith('images/') ? normalized : `images/${normalized}`;
}

export function buildProjectImageMarkdown(path: string): string {
  const assetPath = normalizeProjectImageMarkdownPath(path);
  const basename = getBaseName(assetPath);
  const altText = basename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
  return `![${altText}](<${assetPath}>){width=100% align=center margin="6mm 0"}`;
}

export const dragDropHandlers = EditorView.domEventHandlers({
  dragover(event) {
    if (event.dataTransfer?.types.includes('application/x-clear-writer-project-image')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      return true;
    }
    // Prevent dropping external files directly into the editor
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'none';
      return true;
    }
    return false;
  },
  drop(event, view) {
    const file = event.dataTransfer?.getData('application/x-clear-writer-project-image');
    if (file) {
      event.preventDefault();
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos !== null) {
        const mdText = buildProjectImageMarkdown(file);
        view.dispatch({
          changes: { from: pos, insert: mdText },
          selection: { anchor: pos + mdText.length },
          scrollIntoView: true
        });
        view.focus();
      }
      return true;
    }
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      showNotice('Dropping external files directly into the editor is not supported yet. Use the Images panel to upload and insert images.', 'info');
      return true;
    }
    return false;
  },
  paste(event) {
    if (event.clipboardData?.types.includes('Files')) {
      event.preventDefault();
      showNotice('Pasting files into the editor is not supported yet. Use the Images panel to upload and insert images.', 'info');
      return true;
    }
    return false;
  }
});
