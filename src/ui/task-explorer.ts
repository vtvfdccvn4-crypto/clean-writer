import { state, type FileNode } from '../state';
import type { EditorManager } from './editor-manager';
import { getBaseName, getParentPath } from '../utils/path-utils';
import { getExplorerDisplayRoots, type ExplorerTreeNode } from '../utils/tree-utils';
import { projectSession } from '../services/ProjectSessionStore';
import { showConfirmDialog } from './confirm-dialog';
import { showNotice } from './components/Notice';
import { bindExplorerDragAndDrop, bindExplorerRootDropZone, type ExplorerDropPlacement } from './task-explorer-drag-and-drop';
import { fontAwesomeIcon, materialIcon } from './components/icon';

const expandedExplorerNodes = new Set<string>();
let selectedExplorerPath: string | null = null;

/** Returns the directory where a new tree item should be placed. */
export function getExplorerCreationParentPath(): string | null {
  if (!selectedExplorerPath) return null;
  const selected = state.current.sections.find(section => section.path === selectedExplorerPath);
  if (!selected) return null;
  return selected.isDir ? selected.path : getParentPath(selected.path);
}

function findSiblingPath(nodes: ExplorerTreeNode[], path: string, direction: -1 | 1): string | null {
  for (const node of nodes) {
    const index = nodes.indexOf(node);
    if (node.path === path) return nodes[index + direction]?.path ?? null;
    const nested = findSiblingPath(node.children, path, direction);
    if (nested !== null) return nested;
  }
  return null;
}

export function renderTaskExplorer(content: HTMLElement, empty: HTMLElement, editorManager: EditorManager): void {
  const roots = getExplorerDisplayRoots(state.current.sections as FileNode[]);
  content.innerHTML = '';
  if (!state.current.projectRef || roots.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  let draggedPath: string | null = null;
  let moving = false;

  const clearDropState = () => {
    content.querySelectorAll('.task-explorer-item.drag-over-before, .task-explorer-item.drag-over-after, .task-explorer-item.drag-over-inside, .task-explorer-tree.drag-over-root')
      .forEach(element => element.classList.remove('drag-over-before', 'drag-over-after', 'drag-over-inside', 'drag-over-root'));
  };

  const moveNode = async (source: string, target: string | null, placement: ExplorerDropPlacement, busyItem?: HTMLElement) => {
    if (moving) return;
    moving = true;
    busyItem?.setAttribute('aria-busy', 'true');
    clearDropState();
    try {
      const sameParentReorder = target !== null
        && (placement === 'before' || placement === 'after')
        && getParentPath(source) === getParentPath(target);
      const success = sameParentReorder
        ? await projectSession.reorderSection(source, target, placement)
        : await projectSession.moveSection(source, target, placement);
      if (!success) {
        showNotice('The section could not be moved. The original document was kept.', 'error');
        return;
      }
      if (placement === 'inside' && target) expandedExplorerNodes.add(target);
    } finally {
      moving = false;
      busyItem?.removeAttribute('aria-busy');
      draggedPath = null;
    }
  };

  const renderNode = (node: ExplorerTreeNode): DocumentFragment => {
    const fragment = document.createDocumentFragment();
    const container = document.createElement('div');
    container.className = 'task-explorer-node';
    const item = document.createElement('div');
    item.className = `task-explorer-item ${node.isDir ? 'task-explorer-item--dir' : 'task-explorer-item--file'}`;
    item.classList.toggle('is-selected', node.path === selectedExplorerPath);
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    item.setAttribute('aria-label', `${node.isDir ? 'Folder' : 'Section'} ${getBaseName(node.path)}`);
    item.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
    const glyph = document.createElement('span');
    glyph.className = 'task-explorer-item-glyph';
    const expanded = node.isDir && expandedExplorerNodes.has(node.path);
    glyph.textContent = node.isDir ? (expanded ? '▾' : '▸') : '•';
    const label = document.createElement('span');
    label.className = 'task-explorer-item-label';
    label.textContent = getBaseName(node.path);
    item.append(glyph, label);

    const activate = async () => {
      if (node.isDir) {
        if (expandedExplorerNodes.has(node.path)) expandedExplorerNodes.delete(node.path);
        else expandedExplorerNodes.add(node.path);
        renderTaskExplorer(content, empty, editorManager);
        return;
      }
      if (!await editorManager.prepareForNavigation()) return;
      await editorManager.openDocument(node.path);
    };
    item.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('.task-explorer-item-actions')) return;
      selectedExplorerPath = node.path;
      content.querySelectorAll('.task-explorer-item.is-selected').forEach(element => element.classList.remove('is-selected'));
      item.classList.add('is-selected');
      item.blur();
      void activate();
    });
    item.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectedExplorerPath = node.path;
        content.querySelectorAll('.task-explorer-item.is-selected').forEach(element => element.classList.remove('is-selected'));
        item.classList.add('is-selected');
        void activate();
        return;
      }
      if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
      event.preventDefault();
      const direction = event.key === 'ArrowUp' ? -1 : 1;
      const sibling = findSiblingPath(roots, node.path, direction);
      if (sibling) void moveNode(node.path, sibling, direction < 0 ? 'before' : 'after', item);
    });

    bindExplorerDragAndDrop({
      item,
      node,
      getDraggedPath: () => draggedPath,
      setDraggedPath: path => { draggedPath = path; },
      move: (source, target, placement) => moveNode(source, target, placement, item),
      clearDropState,
      setBusy: busy => item.toggleAttribute('aria-busy', busy)
    });

    if (!node.isDir) {
      const actions = document.createElement('div');
      actions.className = 'task-explorer-item-actions';
      const rename = document.createElement('button');
      rename.type = 'button';
      rename.className = 'task-explorer-item-action';
      rename.title = 'Rename section';
      rename.setAttribute('aria-label', 'Rename section');
      rename.innerHTML = materialIcon('edit_square');
      rename.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const nextName = window.prompt('Rename section', getBaseName(node.path))?.trim();
        if (!nextName || nextName === getBaseName(node.path)) return;
        const parentPath = getParentPath(node.path);
        const nextPath = parentPath ? `${parentPath}/${nextName}` : nextName;
        await projectSession.renameSection(node.path, nextPath);
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'task-explorer-item-action task-explorer-item-action--danger';
      remove.title = 'Delete section';
      remove.setAttribute('aria-label', 'Delete section');
      remove.innerHTML = fontAwesomeIcon('trash-can');
      remove.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const proceed = await showConfirmDialog({ title: 'Delete section', message: `Delete ${getBaseName(node.path)}? This cannot be undone.`, confirmLabel: 'Delete', cancelLabel: 'Cancel', tone: 'danger' });
        if (proceed) await projectSession.deleteSection(node.path);
      });
      const pageBreak = document.createElement('button');
      pageBreak.type = 'button';
      pageBreak.className = `task-explorer-item-action${node.pageBreak ? ' is-active' : ''}`;
      pageBreak.title = node.pageBreak ? 'Remove page break' : 'Add page break';
      pageBreak.setAttribute('aria-label', pageBreak.title);
      pageBreak.innerHTML = materialIcon('insert_page_break');
      pageBreak.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        await projectSession.togglePageBreak(node.path);
      });
      actions.append(rename, remove, pageBreak);
      item.append(actions);
    }
    container.append(item);
    if (node.isDir && expanded && node.children.length > 0) {
      const children = document.createElement('div');
      children.className = 'task-explorer-children';
      children.append(...node.children.map(renderNode));
      container.append(children);
    }
    fragment.append(container);
    return fragment;
  };

  const tree = document.createElement('div');
  tree.className = 'task-explorer-tree';
  bindExplorerRootDropZone(tree, () => draggedPath, (source, target, placement) => moveNode(source, target, placement), clearDropState);
  tree.append(...roots.map(renderNode));
  content.append(tree);
}
