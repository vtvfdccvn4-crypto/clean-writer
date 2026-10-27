import type { Platform, WorkspaceRef } from '../platform/types';
import type { WelcomeControllerDependencies } from './WelcomeController';
import { showNewProjectModal, showOpenProjectModal } from './project-flow-modal';
import { openProjectWithRecovery } from './project-opening';
import { importProjectBackup } from './project-backup-actions';

type WelcomeProjectActions = Pick<
  WelcomeControllerDependencies,
  'onNewDocument' | 'onOpenDocument' | 'onOpenRecent'
>;

/** Keeps welcome-screen project acquisition separate from editor orchestration. */
export function createWelcomeProjectActions(platform: Platform): WelcomeProjectActions {
  return {
    onNewDocument: async () => {
      const choice = await showNewProjectModal();
      if (!choice) return;
      let ref: WorkspaceRef | null = null;
      if (choice.action === 'directory') {
        ref = await platform.workspaceRepository.selectDirectory({ kind: 'directory' });
      } else if (choice.action === 'opfs') {
        ref = await platform.workspaceRepository.selectDirectory({ kind: 'opfs', name: choice.name });
      }
      if (ref) await openProjectWithRecovery(platform, ref);
    },
    onOpenDocument: async () => {
      const recents = platform.workspaceRepository.listKnownBrowserWorkspaces
        ? await platform.workspaceRepository.listKnownBrowserWorkspaces()
        : [];
      const choice = await showOpenProjectModal(recents);
      if (!choice) return;
      let ref: WorkspaceRef | null = null;
      if (choice.action === 'directory-picker') {
        ref = await platform.workspaceRepository.selectDirectory({ kind: 'directory' });
      } else if (choice.action === 'open-ref') {
        ref = choice.ref;
      } else if (choice.action === 'import-backup') {
        ref = await importProjectBackup(platform, choice.file);
      }
      if (ref) await openProjectWithRecovery(platform, ref);
    },
    onOpenRecent: async ref => {
      await openProjectWithRecovery(platform, ref);
    }
  };
}
