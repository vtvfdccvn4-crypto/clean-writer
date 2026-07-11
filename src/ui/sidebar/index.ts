import { SidebarController } from './SidebarController';
import type { Platform, WorkspaceSession } from '../../platform/types';

export function initSidebar(
  platform: Platform,
  onLoadProject: (session: WorkspaceSession) => Promise<void>,
  onSaveActiveFile: () => Promise<boolean>,
  onInsertText?: (text: string) => boolean
) {
  new SidebarController(platform, onLoadProject, onSaveActiveFile, onInsertText);
}
