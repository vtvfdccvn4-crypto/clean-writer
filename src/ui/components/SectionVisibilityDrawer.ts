import { APP_STATE_EVENTS, state } from '../../state';
import { ProjectService } from '../../services/ProjectService';
import { getBaseName } from '../../utils/path-utils';
import { getExplorerDisplayRoots, type ExplorerTreeNode } from '../../utils/tree-utils';
import type { FileNode } from '../../types';

export function initSectionVisibilityControls(sectionSelect: HTMLSelectElement, listContainer: HTMLElement): () => void {
  let selectedSectionPath: string | null = null;

  sectionSelect.addEventListener('change', () => {
    selectedSectionPath = sectionSelect.value || null;
    renderVisibilityControls(listContainer, selectedSectionPath);
  });

  const refreshSectionControls = () => {
    selectedSectionPath = syncSectionSelect(sectionSelect, selectedSectionPath);
    renderVisibilityControls(listContainer, selectedSectionPath);
  };

  state.on(APP_STATE_EVENTS.projectSnapshotChanged, refreshSectionControls);
  state.on(APP_STATE_EVENTS.projectTreeChanged, refreshSectionControls);
  refreshSectionControls();
  return refreshSectionControls;
}

export function createSectionToggle(
  label: string,
  checked: boolean,
  enabledLabel: 'Show' | 'On',
  disabledLabel: 'Hide' | 'Off'
): { element: HTMLDivElement; input: HTMLInputElement } {
  const element = document.createElement('div');
  element.className = 'drawer-control';

  const text = document.createElement('span');
  text.className = 'drawer-control-label';
  text.textContent = label;

  const value = document.createElement('div');
  value.className = 'drawer-control-value';

  const control = document.createElement('label');
  control.className = 'drawer-switch drawer-switch--control';

  const ui = document.createElement('span');
  ui.className = 'drawer-switch-ui';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.setAttribute('aria-label', label);

  const enabled = document.createElement('span');
  enabled.className = 'drawer-switch-option drawer-switch-option--enabled';
  enabled.setAttribute('aria-hidden', 'true');
  enabled.textContent = enabledLabel;

  const disabled = document.createElement('span');
  disabled.className = 'drawer-switch-option drawer-switch-option--disabled';
  disabled.setAttribute('aria-hidden', 'true');
  disabled.textContent = disabledLabel;

  ui.append(input, enabled, disabled);
  control.append(ui);
  value.append(control);
  element.append(text, value);
  return { element, input };
}

function syncSectionSelect(select: HTMLSelectElement, preferredPath: string | null): string | null {
  const nodes = getSectionVisibilityNodes(state.current.sections);
  select.innerHTML = '';

  if (nodes.length === 0) {
    select.disabled = true;
    return null;
  }

  const activeFile = state.current.activeFile;
  const selectedPath = (preferredPath && nodes.some(node => node.path === preferredPath))
    ? preferredPath
    : (activeFile && nodes.some(node => node.path === activeFile))
      ? activeFile
      : nodes[0].path;

  nodes.forEach(node => {
    const option = document.createElement('option');
    option.value = node.path;
    option.textContent = `${node.name} (${node.isDir ? 'Folder' : 'File'})`;
    select.appendChild(option);
  });

  select.disabled = false;
  select.value = selectedPath;
  return selectedPath;
}

function renderVisibilityControls(container: HTMLElement, selectedPath: string | null) {
  container.innerHTML = '';
  const sections = state.get.sections;
  const sortedNodes = getSectionVisibilityNodes(sections);

  if (sortedNodes.length === 0 || !selectedPath) {
    container.innerHTML = '<p class="drawer-note">No sections found.</p>';
    return;
  }

  const node = sortedNodes.find(candidate => candidate.path === selectedPath);
  if (!node) {
    container.innerHTML = '<p class="drawer-note">Choose a section to configure.</p>';
    return;
  }

  const stateNode = sections.find(section => section.path === node.path) || { hideHeader: false, hideFooter: false };
  const headerToggle = createSectionToggle('Header', !stateNode.hideHeader, 'Show', 'Hide');
  headerToggle.input.addEventListener('change', async () => {
    headerToggle.input.disabled = true;
    const success = await ProjectService.toggleHeaderVisibility(node.path, !headerToggle.input.checked);
    if (!success) headerToggle.input.checked = !headerToggle.input.checked;
    headerToggle.input.disabled = false;
  });

  const footerToggle = createSectionToggle('Footer', !stateNode.hideFooter, 'Show', 'Hide');
  footerToggle.input.addEventListener('change', async () => {
    footerToggle.input.disabled = true;
    const success = await ProjectService.toggleFooterVisibility(node.path, !footerToggle.input.checked);
    if (!success) footerToggle.input.checked = !footerToggle.input.checked;
    footerToggle.input.disabled = false;
  });

  container.append(headerToggle.element, footerToggle.element);
}

export function getSectionVisibilityNodes(sections: FileNode[]): Array<Pick<ExplorerTreeNode, 'path' | 'isDir'> & { name: string }> {
  const roots = getExplorerDisplayRoots(sections);

  // Match the collapsed top level of the Project Explorer after removing the
  // storage-only sections directory: root files for a file-only project, root
  // folders for a folder-only project, or both when the project is mixed.
  return roots.map(node => ({
    path: node.path,
    isDir: node.isDir,
    name: getBaseName(node.path)
  }));
}
