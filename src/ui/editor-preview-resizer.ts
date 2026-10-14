import { SplitPaneController } from './SplitPaneController';

const STORAGE_KEY = 'clear-writer:layout:editor-preview-ratio:v1';

export interface EditorPreviewResizerOptions {
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function initEditorPreviewResizer(options: EditorPreviewResizerOptions = {}): SplitPaneController | null {
  const container = document.getElementById('shared-panel');
  const separator = document.getElementById('editor-preview-resizer');
  if (!container || !separator) return null;

  const controller = new SplitPaneController({
    container,
    separator,
    cssProperty: '--editor-pane-width',
    defaultRatio: 0.5,
    minimumLeadingWidth: 320,
    minimumTrailingWidth: 360,
    separatorWidth: 7,
    storageKey: STORAGE_KEY,
    onDragStart: options.onDragStart,
    onDragEnd: options.onDragEnd
  });
  controller.initialize();
  return controller;
}
