import { SidebarController } from './SidebarController';
import type { Platform, WorkspaceSession, WorkspaceRef } from '../../platform/types';

export function initSidebar(
  platform: Platform,
  onLoadProject: (ref: WorkspaceRef, session: WorkspaceSession) => Promise<void>,
  onCloseProject: () => void,
  onSaveActiveFile: () => Promise<boolean>,
  onInsertText?: (text: string) => boolean
) {
  new SidebarController(platform, onLoadProject, onCloseProject, onSaveActiveFile, onInsertText);
}
