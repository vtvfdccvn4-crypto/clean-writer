import type { ExplorerTreeNode } from '../../utils/tree-utils';
import { getBaseName } from '../../utils/path-utils';
import {
  chevronIconMarkup,
  deleteIconMarkup,
  fileIconMarkup,
  folderIconMarkup,
  pageBreakIconMarkup,
  renameIconMarkup
} from './SectionListIcons';

export interface SectionListItemView {
  li: HTMLLIElement;
  row: HTMLDivElement;
  basename: string;
}

/**
 * Builds the static DOM for one section-tree item. Behaviour is attached by
 * SectionListRenderer so this view can stay focused on presentation only.
 */
export function createSectionListItemView(
  node: ExplorerTreeNode,
  normalizedActiveFile: string | null,
  isCollapsed: boolean
): SectionListItemView {
  const li = document.createElement('li');
  li.className = 'tree-node';
  li.dataset.path = node.path;
  li.dataset.isDir = String(node.isDir);

  const row = document.createElement('div');
  row.className = `sidebar-item tree-row ${normalizedActiveFile === node.path && !node.isDir ? 'active' : ''}`;
  if (node.isDir) row.classList.add('folder-row');
  row.dataset.path = node.path;
  row.dataset.isDir = String(node.isDir);

  const basename = getBaseName(node.path);
  const toggleMarkup = node.isDir
    ? `<button class="btn-toggle-folder" title="${isCollapsed ? 'Expand folder' : 'Collapse folder'}" aria-expanded="${(!isCollapsed).toString()}">${chevronIconMarkup(isCollapsed)}</button>`
    : '';

  row.innerHTML = `
    <div class="tree-row-main">
      ${toggleMarkup}
      ${node.isDir ? folderIconMarkup() : fileIconMarkup()}
      <div class="item-info">
        <span class="item-title"></span>
        ${!node.isDir ? '<span class="section-save-indicator" aria-hidden="true"></span>' : ''}
      </div>
    </div>
    <div class="item-actions">
      ${node.isDir ? `<button class="btn-new-file" title="New File" aria-label="New File">${fileIconMarkup()}</button>` : ''}
      <button class="btn-rename" title="Rename" aria-label="Rename">${renameIconMarkup()}</button>
      <button class="btn-delete" title="Delete" aria-label="Delete">${deleteIconMarkup()}</button>
      ${!node.isDir ? `
        <button class="btn-page-break-toggle ${node.pageBreak ? 'is-active' : ''}" title="${node.pageBreak ? 'Remove Page Break before this section' : 'Add Page Break before this section'}" aria-pressed="${(!!node.pageBreak).toString()}">
          ${pageBreakIconMarkup()}
        </button>
      ` : ''}
    </div>
  `;

  // Project paths can originate in imported folders. Keep them out of HTML
  // parsing entirely so unusual filenames remain literal UI text.
  const itemTitle = row.querySelector<HTMLElement>('.item-title');
  if (itemTitle) {
    itemTitle.textContent = basename;
    itemTitle.title = node.path;
  }

  return { li, row, basename };
}
