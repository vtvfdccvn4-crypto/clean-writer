import type { Platform, WorkspaceRef } from '../platform/types';
import { projectSession } from '../services/ProjectSessionStore';
import {
  buildProjectHealthFailureMessage,
  buildRecoveryPromptMessage,
  describeWorkspaceError
} from '../services/project-runtime-feedback';
import { showConfirmDialog } from './confirm-dialog';
import { showNotice } from './components/Notice';

/**
 * The sole user-facing workspace-open flow. Every entry point validates a
 * project before activation so recovery and permission feedback stay uniform.
 */
export async function openProjectWithRecovery(platform: Platform, ref: WorkspaceRef): Promise<boolean> {
  try {
    const session = await platform.workspaceRepository.open(ref);
    const health = await session.inspectProject();
    if (!health.valid) {
      if (!health.recoverable) {
        showNotice(buildProjectHealthFailureMessage(health), 'error');
        return false;
      }

      const shouldRecover = await showConfirmDialog({
        title: 'Settings Recovery',
        message: buildRecoveryPromptMessage(health),
        confirmLabel: 'Recover Settings',
        cancelLabel: 'Cancel'
      });
      if (!shouldRecover) return false;

      const recovered = await session.recoverProjectSettings();
      if (!recovered.valid) {
        showNotice(buildProjectHealthFailureMessage(recovered), 'error');
        return false;
      }
      showNotice('Project settings were recovered successfully.');
    }

    await projectSession.activate(ref, session);
    return true;
  } catch (error) {
    console.error('Failed to open project', error);
    showNotice(describeWorkspaceError(error, 'open'), 'error');
    return false;
  }
}
