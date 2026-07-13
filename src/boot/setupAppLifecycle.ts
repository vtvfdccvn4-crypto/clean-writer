import type { Platform } from '../platform/types';
import type { EditorManager } from '../ui/editor-manager';
import { showNotice } from '../ui/components/Notice';
import { describeWorkspaceError } from '../services/project-runtime-feedback';

/** Registers save-on-close and browser navigation-loss safeguards. */
export function setupAppLifecycle(platform: Platform, editorManager: EditorManager): void {
  platform.appLifecycle.onBeforeClose(async () => {
    try {
      await editorManager.flushCurrentDocument();
      platform.appLifecycle.confirmClose(true);
    } catch (error) {
      console.error('Unable to save before closing:', error);
      showNotice(describeWorkspaceError(error, 'close'), 'error');
      platform.appLifecycle.confirmClose(false, error instanceof Error ? error.message : String(error));
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (editorManager.hasUnsavedChanges() || editorManager.isSaveInFlight()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}
