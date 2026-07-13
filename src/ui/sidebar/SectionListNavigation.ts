import { state } from '../../state';
import { normalizeExplorerPath } from '../../utils/path-utils';
import { showNotice } from '../components/Notice';
import type { ExplorerTreeNode } from '../../utils/tree-utils';
import { setFolderCollapsed } from './SectionListState';

interface BindSectionListRowNavigationOptions {
  row: HTMLElement;
  node: ExplorerTreeNode;
  collapsedFolders: ReadonlySet<string>;
  requestRender: () => void;
  saveActiveFile: () => Promise<boolean>;
}

export function bindSectionListRowNavigation({
  row,
  node,
  collapsedFolders,
  requestRender,
  saveActiveFile
}: BindSectionListRowNavigationOptions): void {
  if (node.isDir) {
    const toggleFolder = (event?: Event) => {
      event?.stopPropagation();
      const collapsed = collapsedFolders.has(node.path);
      setFolderCollapsed(node.path, !collapsed);
      requestRender();
    };
    row.querySelector<HTMLButtonElement>('.btn-toggle-folder')?.addEventListener('click', toggleFolder);
    row.addEventListener('click', () => toggleFolder());
    return;
  }

  row.addEventListener('click', async () => {
    const activeFile = state.current.activeFile;
    if (activeFile && normalizeExplorerPath(activeFile) === node.path) return;
    try {
      if (!await saveActiveFile()) return;
      state.setActiveFile(node.path);
    } catch (error) {
      console.error('[SectionList] Failed to save before section switch:', error);
      showNotice('The current section could not be saved. The section was not changed.', 'error');
    }
  });
}
