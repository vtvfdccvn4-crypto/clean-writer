import { showNotice } from '../components/Notice';
import { clearDragState } from './SectionListInteractions';
import { sectionTreeActions } from './SectionTreeActions';
import { showProjectUpdateError } from './SectionListFeedback';
import { SECTION_DRAG_TYPE } from './SectionListDragAndDrop';

export function createSectionListRootDropZone(container: HTMLElement): HTMLLIElement {
  const zone = document.createElement('li');
  zone.className = 'tree-root-drop-zone';
  zone.textContent = 'Move to sections root';

  zone.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes(SECTION_DRAG_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    zone.classList.add('is-drag-target');
  });

  zone.addEventListener('dragleave', (event) => {
    event.stopPropagation();
    zone.classList.remove('is-drag-target');
  });

  zone.addEventListener('drop', async (event) => {
    if (!event.dataTransfer?.types.includes(SECTION_DRAG_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();

    const sourcePath = event.dataTransfer.getData(SECTION_DRAG_TYPE);
    clearDragState(container);
    if (!sourcePath) return;
    try {
      const success = await sectionTreeActions.move(sourcePath, null, 'root');
      if (!success) showNotice('The section could not be moved to the project root. Try again.', 'error');
    } catch (error) {
      showProjectUpdateError('move the section to the project root', error);
    }
  });

  return zone;
}
