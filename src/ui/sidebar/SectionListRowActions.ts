import { state } from '../../state';
import { getParentPath } from '../../utils/path-utils';
import type { ExplorerTreeNode } from '../../utils/tree-utils';
import { showNotice } from '../components/Notice';
import { showConfirmDialog } from '../confirm-dialog';
import { renderInlineCreate } from './SectionListInlineCreate';
import { showProjectUpdateError } from './SectionListFeedback';
import { revealAncestorFolders, setFolderCollapsed } from './SectionListState';
import { sectionTreeActions } from './SectionTreeActions';

interface BindSectionListRowActionsOptions {
  row: HTMLElement;
  node: ExplorerTreeNode;
  basename: string;
  container: HTMLElement;
  saveActiveFile: () => Promise<boolean>;
}

export function bindSectionListRowActions({
  row,
  node,
  basename,
  container,
  saveActiveFile
}: BindSectionListRowActionsOptions): void {
  const pageBreakButton = row.querySelector<HTMLButtonElement>('.btn-page-break-toggle');
  if (pageBreakButton) {
    pageBreakButton.addEventListener('click', async (event) => {
      console.log('[SectionList] page break toggle clicked for:', node.path);
      event.stopPropagation();
      pageBreakButton.disabled = true;
      try {
        const result = await sectionTreeActions.togglePageBreak(node.path);
        if (!result) showNotice('The page break setting could not be updated. Try again.', 'error');
      } catch (error) {
        showProjectUpdateError('update the page break', error);
      } finally {
        pageBreakButton.disabled = false;
      }
    });
  }

  const newFileButton = row.querySelector<HTMLElement>('.btn-new-file');
  if (newFileButton) {
    newFileButton.addEventListener('click', (event) => {
      event.stopPropagation();
      setFolderCollapsed(node.path, false);
      renderInlineCreate(container, false, node.path);
    });
  }

  const renameButton = row.querySelector<HTMLElement>('.btn-rename');
  renameButton?.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (!state.current.projectRef) return;
    try {
      if (!await saveActiveFile()) return;
    } catch (error) {
      showProjectUpdateError('save before renaming', error);
      return;
    }

    const actionsContainer = row.querySelector<HTMLElement>('.item-actions');
    const displayContainer = row.querySelector<HTMLElement>('.tree-row-main');
    if (!actionsContainer || !displayContainer) return;
    actionsContainer.style.display = 'none';
    displayContainer.style.display = 'none';

    const editContainer = document.createElement('div');
    editContainer.className = 'inline-editor tree-inline-editor';
    editContainer.style.display = 'flex';
    editContainer.style.width = '100%';

    const input = document.createElement('input');
    input.type = 'text';
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
        const success = await sectionTreeActions.rename(node.path, fullNewName);
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

    input.addEventListener('keydown', (keyEvent) => {
      keyEvent.stopPropagation();
      if (keyEvent.key === 'Enter') finishRename(true);
      if (keyEvent.key === 'Escape') finishRename(false);
    });
    input.addEventListener('click', (clickEvent) => clickEvent.stopPropagation());
    input.addEventListener('blur', () => finishRename(false));
  });

  const deleteButton = row.querySelector<HTMLElement>('.btn-delete');
  deleteButton?.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (!state.current.projectRef) return;
    try {
      if (!await saveActiveFile()) return;
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
      const success = await sectionTreeActions.remove(node.path);
      if (!success) showNotice('Failed to delete file.', 'error');
    } catch (error) {
      showProjectUpdateError('delete the section', error);
    }
  });
}
