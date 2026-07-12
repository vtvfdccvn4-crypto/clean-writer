import { state } from '../../state';
import { ProjectService } from '../../services/ProjectService';
import { showNotice } from '../components/Notice';
import { showConfirmDialog } from '../confirm-dialog';
import { describeWorkspaceError } from '../../services/project-runtime-feedback';
import type { Platform } from '../../platform/types';

let activePlatform: Platform | null = null;
import { getBaseName, getParentPath, isDescendantPath, normalizeExplorerPath } from '../../utils/path-utils';
import { getExplorerDisplayRoots, type ExplorerTreeNode } from '../../utils/tree-utils';
import {
  deleteIconMarkup,
  fileIconMarkup,
  folderIconMarkup,
  pageBreakIconMarkup,
  renameIconMarkup,
  chevronIconMarkup
} from './SectionListIcons';
import {
  clearDragState,
  ensureFolderExpandedInDom,
  findRowByPath,
  getTreeChildrenContainer
} from './SectionListInteractions';
import { getCollapsedFoldersForActiveProject, setFolderCollapsed, revealAncestorFolders } from './SectionListState';
import { SECTION_TEMPLATES, getSectionTemplate, type SectionTemplateId } from '../../editor/section-templates';

async function openActiveProjectSession() {
  const projectRef = state.get.projectRef;
  if (!activePlatform || !projectRef) {
    throw new Error('No project is open.');
  }
  return activePlatform.workspaceRepository.open(projectRef);
}

function showProjectUpdateError(operation: string, error: unknown): void {
  console.error(`[SectionList] Failed to ${operation}:`, error);
  showNotice(describeWorkspaceError(error, 'project'), 'error');
}

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
  const li = document.createElement('li');
  li.className = 'tree-node';
  li.dataset.path = node.path;
  li.dataset.isDir = String(node.isDir);

  const row = document.createElement('div');
  row.className = `sidebar-item tree-row ${normalizedActiveFile === node.path && !node.isDir ? 'active' : ''}`;
  if (node.isDir) {
    row.classList.add('folder-row');
  }
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

    const btnToggle = row.querySelector('.btn-toggle-folder') as HTMLButtonElement | null;
    if (btnToggle) {
      btnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const collapsed = collapsedFolders.has(node.path);
        setFolderCollapsed(node.path, !collapsed);
        requestRender();
      });
    }

    row.addEventListener('click', () => {
      const collapsed = collapsedFolders.has(node.path);
      setFolderCollapsed(node.path, !collapsed);
      requestRender();
    });
  } else {
    row.addEventListener('click', async () => {
      if (normalizedActiveFile === node.path) return;
      try {
        if (!await globalSaveActiveFile()) return;
        state.setActiveFile(node.path);
      } catch (error) {
        console.error('[SectionList] Failed to save before section switch:', error);
        showNotice('The current section could not be saved. The section was not changed.', 'error');
      }
    });
  }

  row.draggable = true;

  row.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.setData('application/x-clear-writer-section', node.path);
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
      container.classList.add('is-section-dragging');
    }
  });

  row.addEventListener('dragend', (e) => {
    e.stopPropagation();
    clearDragState(container);
  });

  row.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('application/x-clear-writer-section')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    const bounding = row.getBoundingClientRect();
    const offset = e.clientY - bounding.top;

    row.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');

    if (node.isDir && offset > bounding.height * 0.25 && offset < bounding.height * 0.75) {
      row.classList.add('drag-over-center');
    } else if (offset > bounding.height / 2) {
      row.classList.add('drag-over-bottom');
    } else {
      row.classList.add('drag-over-top');
    }
  });

  row.addEventListener('dragleave', (e) => {
    e.stopPropagation();
    row.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');
  });

  row.addEventListener('drop', async (e) => {
    if (!e.dataTransfer?.types.includes('application/x-clear-writer-section')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    const dropIsCenter = row.classList.contains('drag-over-center');
    const dropIsAfter = row.classList.contains('drag-over-bottom');
    row.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');

    const draggedFile = e.dataTransfer.getData('application/x-clear-writer-section');
    if (!draggedFile) return;

    const normalizedDraggedFile = normalizeExplorerPath(draggedFile);
    const normalizedTargetFile = node.path;
    if (normalizedDraggedFile === normalizedTargetFile) return;

    try {
      const session = await openActiveProjectSession();
      const success = dropIsCenter && node.isDir
        ? isDescendantPath(normalizedDraggedFile, normalizedTargetFile)
          ? false
          : await ProjectService.moveSection(session, normalizedDraggedFile, normalizedTargetFile, 'inside')
        : isDescendantPath(normalizedDraggedFile, normalizedTargetFile)
          ? false
          : await ProjectService.moveSection(
            session,
            normalizedDraggedFile,
            normalizedTargetFile,
            dropIsAfter ? 'after' : 'before'
          );
      if (success && dropIsCenter && node.isDir) setFolderCollapsed(node.path, false);
      if (!success && !isDescendantPath(normalizedDraggedFile, normalizedTargetFile)) {
        showNotice('The section could not be moved. Check the destination and try again.', 'error');
      }
    } catch (error) {
      showProjectUpdateError('move the section', error);
    } finally {
      clearDragState(container);
    }
  });

  const btnPageBreak = row.querySelector('.btn-page-break-toggle') as HTMLButtonElement | null;
  if (btnPageBreak) {
    btnPageBreak.addEventListener('click', async (e) => {
      console.log('[SectionList] page break toggle clicked for:', node.path);
      e.stopPropagation();
      btnPageBreak.disabled = true;
      try {
        const session = await openActiveProjectSession();
        const result = await ProjectService.togglePageBreak(session, node.path);
        if (!result) showNotice('The page break setting could not be updated. Try again.', 'error');
      } catch (err) {
        showProjectUpdateError('update the page break', err);
      } finally {
        btnPageBreak.disabled = false;
      }
    });
  }

  const btnNewFile = row.querySelector('.btn-new-file') as HTMLElement | null;
  if (btnNewFile) {
    btnNewFile.addEventListener('click', (e) => {
      e.stopPropagation();
      setFolderCollapsed(node.path, false);
      renderInlineCreate(container, false, node.path);
    });
  }

  const btnRename = row.querySelector('.btn-rename') as HTMLElement;
  btnRename.addEventListener('click', async (e) => {
    e.stopPropagation();
    const { projectRef } = state.get;
    if (!projectRef) return;

    try {
      if (!await globalSaveActiveFile()) return;
    } catch (error) {
      showProjectUpdateError('save before renaming', error);
      return;
    }

    const actionsContainer = row.querySelector('.item-actions') as HTMLElement;
    actionsContainer.style.display = 'none';

    const displayContainer = row.querySelector('.tree-row-main') as HTMLElement;
    displayContainer.style.display = 'none';

    const editContainer = document.createElement('div');
    editContainer.className = 'inline-editor tree-inline-editor';
    editContainer.style.display = 'flex';
    editContainer.style.width = '100%';

    const input = document.createElement('input');
    input.type = node.isDir ? 'text' : 'text';
    input.value = node.isDir ? basename : basename.replace(/\.md$/i, '');
    input.className = 'inline-input';
    input.placeholder = 'Enter to save, Esc to cancel';

    editContainer.appendChild(input);
    row.appendChild(editContainer);
    input.focus();

    let isFinished = false;
    const finishRename = async (save: boolean) => {
      if (isFinished) return;
      isFinished = true;

      if (!save || !input.value.trim()) {
        editContainer.remove();
        displayContainer.style.display = 'flex';
        actionsContainer.style.display = 'none';
        return;
      }

      const newName = input.value.trim();
      const currentBaseName = node.isDir ? basename : basename.replace(/\.md$/i, '');
      if (newName === currentBaseName) {
        editContainer.remove();
        displayContainer.style.display = 'flex';
        return;
      }

      const prefix = getParentPath(node.path);
      const fullNewName = prefix ? `${prefix}/${newName}` : newName;

      try {
        const session = await openActiveProjectSession();
        const success = await ProjectService.renameSection(session, node.path, fullNewName);
        if (success) {
          revealAncestorFolders(fullNewName);
          return;
        }
        showNotice('Failed to rename. File might already exist or name is invalid.', 'error');
      } catch (error) {
        showProjectUpdateError('rename the section', error);
      }
      input.focus();
      isFinished = false;
    };

    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') finishRename(true);
      if (ev.key === 'Escape') finishRename(false);
    });
    input.addEventListener('click', (ev) => ev.stopPropagation());
    input.addEventListener('blur', () => finishRename(false));
  });

  const btnDelete = row.querySelector('.btn-delete') as HTMLElement;
  btnDelete.addEventListener('click', async (e) => {
    e.stopPropagation();
    const { projectRef } = state.get;
    if (!projectRef) return;

    try {
      if (!await globalSaveActiveFile()) return;
    } catch (error) {
      showProjectUpdateError('save before deleting', error);
      return;
    }

    const proceed = await showConfirmDialog({
      title: 'Delete Section',
      message: `Are you sure you want to delete ${basename}?`,
      confirmLabel: 'Delete',
      tone: 'danger'
    });
    if (!proceed) return;

    try {
      const session = await openActiveProjectSession();
      const success = await ProjectService.deleteSection(session, node.path);
      if (!success) showNotice('Failed to delete file.', 'error');
    } catch (error) {
      showProjectUpdateError('delete the section', error);
    }
  });

  return li;
}

function createRootDropZone(container: HTMLElement): HTMLLIElement {
  const zone = document.createElement('li');
  zone.className = 'tree-root-drop-zone';
  zone.textContent = 'Move to sections root';

  zone.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('application/x-clear-writer-section')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    zone.classList.add('is-drag-target');
  });

  zone.addEventListener('dragleave', (e) => {
    e.stopPropagation();
    zone.classList.remove('is-drag-target');
  });

  zone.addEventListener('drop', async (e) => {
    if (!e.dataTransfer?.types.includes('application/x-clear-writer-section')) return;
    e.preventDefault();
    e.stopPropagation();

    const sourcePath = e.dataTransfer.getData('application/x-clear-writer-section');
    clearDragState(container);
    if (!sourcePath) return;
    try {
      const session = await openActiveProjectSession();
      const success = await ProjectService.moveSection(session, sourcePath, null, 'root');
      if (!success) showNotice('The section could not be moved to the project root. Try again.', 'error');
    } catch (error) {
      showProjectUpdateError('move the section to the project root', error);
    }
  });

  return zone;
}

export function renderSectionList(
  container: HTMLElement,
  globalSaveActiveFile: () => Promise<boolean>,
  requestRender: () => void,
  platform: Platform
) {
  activePlatform = platform;
  const { sections, activeFile } = state.get;
  const normalizedActiveFile = activeFile ? normalizeExplorerPath(activeFile) : null;
  // `sections` is the workspace storage root, already represented by this
  // panel's heading, so render its contents directly.
  const tree = getExplorerDisplayRoots(sections);
  container.innerHTML = '';

  tree.forEach(node => {
    const li = renderNode(node, normalizedActiveFile, globalSaveActiveFile, container, requestRender);
    container.appendChild(li);
  });
  container.appendChild(createRootDropZone(container));
}

export function renderInlineCreate(container: HTMLElement, isFolder: boolean = false, parentFolder?: string) {
  const li = document.createElement('li');
  li.className = 'tree-node';
  if (parentFolder) {
    li.dataset.path = normalizeExplorerPath(parentFolder);
  }

  const row = document.createElement('div');
  row.className = 'sidebar-item tree-row tree-inline-create';
  row.style.display = 'flex';
  row.style.width = '100%';

  const spacer = document.createElement('span');
  spacer.className = 'folder-toggle-spacer';
  spacer.style.display = isFolder ? 'inline-block' : 'inline-block';

  const icon = document.createElement('span');
  icon.className = 'explorer-icon-wrap';
  icon.innerHTML = isFolder ? folderIconMarkup() : fileIconMarkup();

  const info = document.createElement('div');
  info.className = 'item-info';
  info.innerHTML = `<span class="item-title">${isFolder ? 'New folder' : 'New section'}</span>`;

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = isFolder ? 'New folder name...' : 'New section name...';
  input.className = 'inline-input';
  input.style.flex = '1 1 140px';
  input.style.minWidth = '120px';

  const templateSelect = document.createElement('select');
  templateSelect.className = 'section-template-select';
  templateSelect.setAttribute('aria-label', 'Section template');
  templateSelect.title = 'Section template';
  SECTION_TEMPLATES.forEach(template => {
    const option = document.createElement('option');
    option.value = template.id;
    option.textContent = template.label;
    templateSelect.appendChild(option);
  });

  const main = document.createElement('div');
  main.className = 'tree-row-main';
  main.appendChild(spacer);
  main.appendChild(icon);
  main.appendChild(info);
  if (!isFolder) main.appendChild(templateSelect);
  main.appendChild(input);

  row.appendChild(main);
  li.appendChild(row);

  const targetContainer = parentFolder ? (() => {
    ensureFolderExpandedInDom(container, parentFolder);
    const parentRow = findRowByPath(container, parentFolder);
    if (!parentRow) return container;
    const parentLi = parentRow.closest('li.tree-node') as HTMLLIElement | null;
    const children = parentLi ? getTreeChildrenContainer(parentLi.firstElementChild as HTMLElement) : null;
    if (children) return children;

    const createdChildren = document.createElement('ul');
    createdChildren.className = 'file-list tree-children';
    parentLi?.appendChild(createdChildren);
    return createdChildren;
  })() : container;

  if (targetContainer.firstChild) {
    targetContainer.insertBefore(li, targetContainer.firstChild);
  } else {
    targetContainer.appendChild(li);
  }

  input.focus();

  let isFinished = false;
  const finishCreate = async (save: boolean) => {
    if (isFinished) return;
    isFinished = true;

    if (!save || !input.value.trim()) {
      li.remove();
      return;
    }

    const name = input.value.trim();
    const fullName = parentFolder ? `${normalizeExplorerPath(parentFolder)}/${name}` : name;
    const projectRef = state.get.projectRef;

    if (!activePlatform || !projectRef) {
      showNotice('The project is still loading. Please try again in a moment.', 'error');
      input.focus();
      isFinished = false;
      return;
    }

    let success = false;
    try {
      const session = await activePlatform.workspaceRepository.open(projectRef);
      success = isFolder
        ? await ProjectService.createFolder(session, fullName)
        : await ProjectService.createSection(
          session,
          fullName,
          getSectionTemplate(templateSelect.value as SectionTemplateId).markdown
        );
    } catch (error) {
      showProjectUpdateError(isFolder ? 'create the folder' : 'create the section', error);
      input.focus();
      isFinished = false;
      return;
    }

    if (success) {
      revealAncestorFolders(fullName);
    }

    if (!success) {
      showNotice('Failed to create. Check if name is valid and does not already exist.', 'error');
      input.focus();
      isFinished = false;
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finishCreate(true);
    if (e.key === 'Escape') finishCreate(false);
  });

  input.addEventListener('blur', (event) => {
    const nextTarget = (event as FocusEvent).relatedTarget as Node | null;
    if (nextTarget && row.contains(nextTarget)) return;
    finishCreate(false);
  });
}
