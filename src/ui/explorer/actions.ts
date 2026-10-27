import type { Platform } from '../../platform/types';
import { state } from '../../state';
import { projectSession } from '../../services/ProjectSessionStore';
import { ProjectService } from '../../services/ProjectService';
import { showNewProjectModal, showOpenProjectModal } from '../project-flow-modal';
import { openProjectWithRecovery } from '../project-opening';
import { showTrashDialog } from '../trash-dialog';

export function initTaskPanelActions(platform: Platform): void {
  const btnNew = document.getElementById('btn-task-new-project');
  const btnOpen = document.getElementById('btn-task-open-project');
  const btnClose = document.getElementById('btn-task-close-project');
  const btnRefresh = document.getElementById('btn-task-refresh-project') as HTMLButtonElement | null;

  btnNew?.addEventListener('click', async () => {
    const choice = await showNewProjectModal();
    if (!choice) return;
    let ref: import('../../platform/types').WorkspaceRef | null = null;
    if (choice.action === 'directory') {
      ref = await platform.workspaceRepository.selectDirectory({ kind: 'directory' });
    } else if (choice.action === 'opfs') {
      ref = await platform.workspaceRepository.selectDirectory({ kind: 'opfs', name: choice.name });
    }
    if (!ref) return;
    await openProjectWithRecovery(platform, ref);
  });

  btnOpen?.addEventListener('click', async () => {
    const recents = platform.workspaceRepository.listKnownBrowserWorkspaces
      ? await platform.workspaceRepository.listKnownBrowserWorkspaces()
      : [];
    const choice = await showOpenProjectModal(recents);
    if (!choice) return;
    let ref: import('../../platform/types').WorkspaceRef | null = null;
    if (choice.action === 'directory-picker') {
      ref = await platform.workspaceRepository.selectDirectory({ kind: 'directory' });
    } else if (choice.action === 'open-ref') {
      ref = choice.ref;
    }
    if (!ref) return;
    await openProjectWithRecovery(platform, ref);
  });

  document.getElementById('btn-task-trash')?.addEventListener('click', () => {
    void showTrashDialog({
      list: () => projectSession.listTrash(),
      restore: id => projectSession.restoreFromTrash(id),
      purge: id => projectSession.purgeTrash(id)
    }).then(() => document.getElementById('btn-task-trash')?.focus());
  });

  btnClose?.addEventListener('click', () => {
    // Blob URLs are project-scoped. Release them before the session reference
    // changes so a later project cannot retain the previous project's assets.
    platform.assetResolver.releaseAll();
    projectSession.close();
  });

  btnRefresh?.addEventListener('click', async () => {
    const session = projectSession.getSession();
    if (!session || !state.current.projectRef) return;
    btnRefresh.disabled = true;
    try {
      // Windows Explorer can replace an image without changing its path. Drop
      // blob URLs first so the next preview render reads the new bytes.
      platform.assetResolver.releaseAll();
      await ProjectService.refreshProjectTree(session);
    } catch (error) {
      console.error('Failed to refresh project files', error);
    } finally {
      btnRefresh.disabled = false;
    }
  });
}
