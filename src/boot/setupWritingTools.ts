import type { Platform } from '../platform/types';
import type { EditorManager } from '../ui/editor-manager';
import { initDocumentOutlineDrawer } from '../ui/document-outline';
import { initProjectReviewDrawer } from '../ui/project-review';
import { initProjectSearchDrawer } from '../ui/project-search';
import { initWritingWorkflow } from '../ui/keyboard-shortcuts';
import { initWorkspaceLayout } from '../ui/workspace-layout';

/** Registers keyboard writing workflow controls before settings drawer bindings. */
export function setupWritingWorkflow(editorManager: EditorManager): void {
  initWritingWorkflow(editorManager);
}

/** Registers the project navigation tools that share the active editor. */
export function setupWritingTools(platform: Platform, editorManager: EditorManager): void {
  initWorkspaceLayout();
  initDocumentOutlineDrawer(platform, editorManager);
  initProjectSearchDrawer(platform, editorManager);
  initProjectReviewDrawer(platform, editorManager);
}
