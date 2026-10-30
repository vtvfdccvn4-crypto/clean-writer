import type { Platform, WorkspaceRef } from '../platform/types';
import type { WelcomeControllerDependencies } from './WelcomeController';
import { showNewProjectModal, showOpenProjectModal } from './project-flow-modal';
import { openProjectWithRecovery } from './project-opening';
import { openProjectDocument } from './project-backup-actions';
import { openDocumentInPlace } from './document-in-place';

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
      const choice = await showOpenProjectModal();
      if (!choice) return;
      if (choice.action === 'open-in-place') {
        await openDocumentInPlace();
        return;
      }
      const ref = await openProjectDocument(platform, choice.file);
      if (ref) await openProjectWithRecovery(platform, ref);
    },
    onOpenRecent: async ref => {
      await openProjectWithRecovery(platform, ref);
    }
  };
}
