import { normalizeExplorerPath } from '../../utils/path-utils';
import { chevronIconMarkup } from './SectionListIcons';
import { getCollapsedFoldersForActiveProject } from './SectionListState';

function findRowByPath(container: HTMLElement, path: string): HTMLElement | null {
  const normalizedPath = normalizeExplorerPath(path);
  const rows = container.querySelectorAll<HTMLElement>('.tree-row[data-path]');
  for (const row of Array.from(rows)) {
    if (row.dataset.path === normalizedPath) return row;
  }
  return null;
}

function getTreeChildrenContainer(row: HTMLElement): HTMLUListElement | null {
  for (const child of Array.from(row.parentElement?.children || [])) {
    if (child instanceof HTMLUListElement && child.classList.contains('tree-children')) {
      return child;
    }
  }
  return null;
}

function clearDragState(container: HTMLElement) {
  container.classList.remove('is-section-dragging');
  container.querySelectorAll<HTMLElement>('.tree-row').forEach(row => {
    row.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom', 'drag-over-center');
  });
  container.querySelectorAll<HTMLElement>('.tree-root-drop-zone').forEach(zone => {
    zone.classList.remove('is-drag-target');
  });
}

function ensureFolderExpandedInDom(container: HTMLElement, folderPath: string) {
  const row = findRowByPath(container, folderPath);
  if (!row) return;

  const collapsedFolders = getCollapsedFoldersForActiveProject();
  collapsedFolders.delete(normalizeExplorerPath(folderPath));

  const li = row.parentElement as HTMLLIElement | null;
  const children = li ? li.querySelector(':scope > ul.tree-children') as HTMLUListElement | null : null;
  if (children) {
    children.hidden = false;
  }
  row.classList.remove('folder-collapsed');

  const toggle = row.querySelector('.btn-toggle-folder') as HTMLButtonElement | null;
  if (toggle) {
    toggle.innerHTML = chevronIconMarkup(false);
    toggle.title = 'Collapse folder';
    toggle.setAttribute('aria-expanded', 'true');
  }
}

export { clearDragState, ensureFolderExpandedInDom, findRowByPath, getTreeChildrenContainer };
