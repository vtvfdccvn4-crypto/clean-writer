import { showNotice } from '../components/Notice';
import { isDescendantPath, normalizeExplorerPath } from '../../utils/path-utils';
import type { ExplorerTreeNode } from '../../utils/tree-utils';
import { clearDragState } from './SectionListInteractions';
import { setFolderCollapsed } from './SectionListState';
import { sectionTreeActions } from './SectionTreeActions';
import { showProjectUpdateError } from './SectionListFeedback';

export const SECTION_DRAG_TYPE = 'application/x-clear-writer-section';

export function bindSectionListRowDragAndDrop(
  row: HTMLElement,
  node: ExplorerTreeNode,
  container: HTMLElement
): void {
  row.draggable = true;

  row.addEventListener('dragstart', (event) => {
    event.stopPropagation();
    if (!event.dataTransfer) return;
    event.dataTransfer.setData(SECTION_DRAG_TYPE, node.path);
    event.dataTransfer.effectAllowed = 'move';
    row.classList.add('dragging');
    container.classList.add('is-section-dragging');
  });
  row.addEventListener('dragend', (event) => {
    event.stopPropagation();
    clearDragState(container);
  });
  row.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes(SECTION_DRAG_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';

    const bounding = row.getBoundingClientRect();
    const offset = event.clientY - bounding.top;
    row.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');
    if (node.isDir && offset > bounding.height * 0.25 && offset < bounding.height * 0.75) {
      row.classList.add('drag-over-center');
    } else if (offset > bounding.height / 2) {
      row.classList.add('drag-over-bottom');
    } else {
      row.classList.add('drag-over-top');
    }
  });
  row.addEventListener('dragleave', (event) => {
    event.stopPropagation();
    row.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');
  });
  row.addEventListener('drop', async (event) => {
    if (!event.dataTransfer?.types.includes(SECTION_DRAG_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    const dropIsCenter = row.classList.contains('drag-over-center');
    const dropIsAfter = row.classList.contains('drag-over-bottom');
    row.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-center');

    const draggedFile = event.dataTransfer.getData(SECTION_DRAG_TYPE);
    if (!draggedFile) return;
    const normalizedDraggedFile = normalizeExplorerPath(draggedFile);
    const normalizedTargetFile = node.path;
    if (normalizedDraggedFile === normalizedTargetFile) return;

    try {
      const invalidMove = isDescendantPath(normalizedDraggedFile, normalizedTargetFile);
      const success = invalidMove
        ? false
        : dropIsCenter && node.isDir
          ? await sectionTreeActions.move(normalizedDraggedFile, normalizedTargetFile, 'inside')
          : await sectionTreeActions.move(normalizedDraggedFile, normalizedTargetFile, dropIsAfter ? 'after' : 'before');
      if (success && dropIsCenter && node.isDir) setFolderCollapsed(node.path, false);
      if (!success && !invalidMove) showNotice('The section could not be moved. Check the destination and try again.', 'error');
    } catch (error) {
      showProjectUpdateError('move the section', error);
    } finally {
      clearDragState(container);
    }
  });
}
