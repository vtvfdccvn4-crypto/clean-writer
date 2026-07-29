import { state } from '../state';
import type { Platform } from '../platform/types';
import type { EditorManager } from '../ui/editor-manager';
import { openProjectWithRecovery } from '../ui/project-opening';

function shouldRestoreLastWorkspace(): boolean {
  return new URLSearchParams(window.location.search).get('restoreLastWorkspace') === 'true';
}

/** Restores the requested last workspace or renders the empty project state. */
export async function restoreInitialWorkspace(platform: Platform, editorManager: EditorManager): Promise<void> {
  let projectRef = state.current.projectRef;
  if (!projectRef && shouldRestoreLastWorkspace() && platform.workspaceRepository.getLastOpenedWorkspace) {
    try {
      projectRef = await platform.workspaceRepository.getLastOpenedWorkspace();
    } catch (error) {
      console.warn('Failed to restore last-opened browser project', error);
    }
  }

  if (projectRef) {
    const opened = await openProjectWithRecovery(platform, projectRef);
    if (opened) return;
  }
  editorManager.renderEmptyWorkspace();
}
