import type { EditorManager } from '../ui/editor-manager';
import { initWritingWorkflow } from '../ui/keyboard-shortcuts';

/** Registers the always-available keyboard workflow without loading optional drawers. */
export function setupWritingWorkflow(editorManager: EditorManager): void {
  initWritingWorkflow(editorManager);
}
