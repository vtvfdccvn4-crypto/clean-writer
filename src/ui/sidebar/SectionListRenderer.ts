import { state } from '../../state';

import { normalizeExplorerPath } from '../../utils/path-utils';
import { getExplorerDisplayRoots, type ExplorerTreeNode } from '../../utils/tree-utils';
import { getCollapsedFoldersForActiveProject } from './SectionListState';
import { createSectionListItemView } from './SectionListItemView';
import { createSectionListRootDropZone } from './SectionListRootDropZone';
import { bindSectionListRowDragAndDrop } from './SectionListDragAndDrop';
import { bindSectionListRowActions } from './SectionListRowActions';
import { bindSectionListRowNavigation } from './SectionListNavigation';

export { renderInlineCreate } from './SectionListInlineCreate';

function renderNode(
  node: ExplorerTreeNode,
  activeFile: string | null,
  globalSaveActiveFile: () => Promise<boolean>,
  container: HTMLElement,
  requestRender: () => void
): HTMLLIElement {
  const collapsedFolders = getCollapsedFoldersForActiveProject();
  const normalizedActiveFile = activeFile ? normalizeExplorerPath(activeFile) : null;
  const isCollapsed = node.isDir && collapsedFolders.has(node.path);
  const { li, row, basename } = createSectionListItemView(node, normalizedActiveFile, isCollapsed);
  if (!node.isDir && normalizedActiveFile === node.path) {
    const indicator = row.querySelector<HTMLElement>('.section-save-indicator');
    if (indicator) {
      const saveState = document.body.dataset.editorSaveState || 'idle';
      indicator.dataset.state = saveState;
      indicator.title = saveState === 'dirty' ? 'Unsaved changes' : saveState === 'saving' ? 'Saving...' : saveState === 'error' ? 'Save failed' : 'Saved';
    }
  }

  li.appendChild(row);

  if (node.isDir) {
    const children = document.createElement('ul');
    children.className = 'file-list tree-children';
    children.hidden = isCollapsed;
    li.appendChild(children);

    if (isCollapsed) {
      row.classList.add('folder-collapsed');
    }

    node.children.forEach(child => {
      children.appendChild(renderNode(child, activeFile, globalSaveActiveFile, container, requestRender));
    });

  }

  bindSectionListRowNavigation({ row, node, collapsedFolders, requestRender, saveActiveFile: globalSaveActiveFile });
  bindSectionListRowDragAndDrop(row, node, container);

  bindSectionListRowActions({ row, node, basename, container, saveActiveFile: globalSaveActiveFile });

  return li;
}

export function renderSectionList(
  container: HTMLElement,
  globalSaveActiveFile: () => Promise<boolean>,
  requestRender: () => void,
  _platform: unknown
) {
  const { sections, activeFile } = state.current;
  const normalizedActiveFile = activeFile ? normalizeExplorerPath(activeFile) : null;
  // `sections` is the workspace storage root, already represented by this
  // panel's heading, so render its contents directly.
  const tree = getExplorerDisplayRoots(sections);
  container.innerHTML = '';

  tree.forEach(node => {
    const li = renderNode(node, normalizedActiveFile, globalSaveActiveFile, container, requestRender);
    container.appendChild(li);
  });
  container.appendChild(createSectionListRootDropZone(container));
}
