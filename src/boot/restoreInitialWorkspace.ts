import { state } from '../state';
import type { Platform } from '../platform/types';
import type { EditorManager } from '../ui/editor-manager';
import { projectSession } from '../services/ProjectSessionStore';
import { openProjectWithRecovery } from '../ui/project-opening';

function shouldRestoreLastWorkspace(): boolean {
  return new URLSearchParams(window.location.search).get('restoreLastWorkspace') === 'true';
}

export async function restoreInitialWorkspace(platform: Platform, editorManager: EditorManager): Promise<void> {
  let projectRef = state.current.projectRef;
  if (!projectRef && shouldRestoreLastWorkspace() && platform.workspaceRepository.getLastOpenedWorkspace) {
    try {
      projectRef = await platform.workspaceRepository.getLastOpenedWorkspace();
    } catch (error) {
      console.warn('Failed to restore last-opened browser project', error);
    }
  }

  // Startup restoration may yield to IndexedDB or a permission check. During
  // that time the user can open or create a project through the already-rendered
  // shell. The project lifecycle reports such an open from the moment it starts,
  // including while its snapshot is still loading, so this stale startup task
  // can neither open a second project nor fall back to the welcome screen.
  if (projectSession.isProjectPresent()) return;

  if (projectRef) {
    const opened = await openProjectWithRecovery(platform, projectRef);
    if (opened) return;
  }

  if (projectSession.isProjectPresent()) return;

  editorManager.renderEmptyWorkspace();
}
