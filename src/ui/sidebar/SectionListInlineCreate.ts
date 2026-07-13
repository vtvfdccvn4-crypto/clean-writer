import { state } from '../../state';
import { getSectionTemplate, SECTION_TEMPLATES, type SectionTemplateId } from '../../editor/section-templates';
import { normalizeExplorerPath } from '../../utils/path-utils';
import { fileIconMarkup, folderIconMarkup } from './SectionListIcons';
import { ensureFolderExpandedInDom, findRowByPath, getTreeChildrenContainer } from './SectionListInteractions';
import { revealAncestorFolders } from './SectionListState';
import { sectionTreeActions } from './SectionTreeActions';
import { showNotice } from '../components/Notice';
import { showProjectUpdateError } from './SectionListFeedback';

export function renderInlineCreate(container: HTMLElement, isFolder: boolean = false, parentFolder?: string) {
  const li = document.createElement('li');
  li.className = 'tree-node';
  if (parentFolder) li.dataset.path = normalizeExplorerPath(parentFolder);

  const row = document.createElement('div');
  row.className = 'sidebar-item tree-row tree-inline-create';
  row.style.display = 'flex';
  row.style.width = '100%';

  const spacer = document.createElement('span');
  spacer.className = 'folder-toggle-spacer';
  spacer.style.display = 'inline-block';

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
  main.append(spacer, icon, info);
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

  targetContainer.insertBefore(li, targetContainer.firstChild);
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
    if (!state.current.projectRef) {
      showNotice('The project is still loading. Please try again in a moment.', 'error');
      input.focus();
      isFinished = false;
      return;
    }

    let success = false;
    try {
      success = isFolder
        ? await sectionTreeActions.createFolder(fullName)
        : await sectionTreeActions.createSection(fullName, getSectionTemplate(templateSelect.value as SectionTemplateId).markdown);
    } catch (error) {
      showProjectUpdateError(isFolder ? 'create the folder' : 'create the section', error);
      input.focus();
      isFinished = false;
      return;
    }

    if (success) revealAncestorFolders(fullName);
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
