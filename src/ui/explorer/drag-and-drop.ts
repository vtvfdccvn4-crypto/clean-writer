import type { ExplorerTreeNode } from '../../utils/tree-utils';

export const EXPLORER_SECTION_DRAG_TYPE = 'application/x-clear-writer-section-path';

export type ExplorerDropPlacement = 'inside' | 'before' | 'after' | 'root';

type BindOptions = {
  item: HTMLElement;
  node: ExplorerTreeNode;
  getDraggedPath: () => string | null;
  setDraggedPath: (path: string | null) => void;
  move: (source: string, target: string | null, placement: ExplorerDropPlacement) => Promise<void>;
  clearDropState: () => void;
  setBusy: (busy: boolean) => void;
};

function placementFor(event: DragEvent, item: HTMLElement, node: ExplorerTreeNode): Exclude<ExplorerDropPlacement, 'root'> {
  const bounds = item.getBoundingClientRect();
  const position = event.clientY - bounds.top;
  if (node.isDir && position > bounds.height * 0.25 && position < bounds.height * 0.75) return 'inside';
  return position < bounds.height / 2 ? 'before' : 'after';
}

export function bindExplorerDragAndDrop(options: BindOptions): void {
  const { item, node } = options;
  item.draggable = true;
  item.setAttribute('aria-grabbed', 'false');

  item.addEventListener('dragstart', event => {
    options.setDraggedPath(node.path);
    item.setAttribute('aria-grabbed', 'true');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(EXPLORER_SECTION_DRAG_TYPE, node.path);
    }
  });

  item.addEventListener('dragend', () => {
    options.setDraggedPath(null);
    item.setAttribute('aria-grabbed', 'false');
    options.clearDropState();
  });

  item.addEventListener('dragover', event => {
    const source = options.getDraggedPath();
    if (!source || source === node.path || item.getAttribute('aria-busy') === 'true') return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const placement = placementFor(event, item, node);
    options.clearDropState();
    item.classList.add(`drag-over-${placement}`);
  });

  item.addEventListener('dragleave', () => {
    item.classList.remove('drag-over-before', 'drag-over-after', 'drag-over-inside');
  });

  item.addEventListener('drop', event => {
    const source = options.getDraggedPath();
    if (!source || source === node.path) return;
    event.preventDefault();
    const placement = placementFor(event, item, node);
    options.setBusy(true);
    void options.move(source, node.path, placement);
  });
}

export function bindExplorerRootDropZone(
  tree: HTMLElement,
  getDraggedPath: () => string | null,
  move: (source: string, target: string | null, placement: ExplorerDropPlacement) => Promise<void>,
  clearDropState: () => void
): void {
  tree.addEventListener('dragover', event => {
    if (!getDraggedPath() || event.target !== tree) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    tree.classList.add('drag-over-root');
  });
  tree.addEventListener('dragleave', event => {
    if (event.target === tree) tree.classList.remove('drag-over-root');
  });
  tree.addEventListener('drop', event => {
    const source = getDraggedPath();
    if (!source || event.target !== tree) return;
    event.preventDefault();
    void move(source, null, 'root');
    clearDropState();
  });
}
