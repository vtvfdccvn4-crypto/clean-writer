import { state } from '../state';

const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 240;
const MAX_WIDTH = 700;

function clampWidth(width: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
}

export function initTaskPanelResizer(): void {
  const workspace = document.querySelector<HTMLElement>('.workspace');
  const resizer = document.getElementById('task-panel-resizer');
  if (!workspace || !resizer) return;

  let currentWidth = DEFAULT_WIDTH;

  const applyWidth = (width: number) => {
    const clamped = clampWidth(width);
    currentWidth = clamped;
    workspace.style.setProperty('--task-panel-width', `${clamped}px`);
  };

  applyWidth(DEFAULT_WIDTH);

  state.onProjectChanged(() => {
    applyWidth(DEFAULT_WIDTH);
  });

  let startX = 0;
  let startWidth = DEFAULT_WIDTH;

  const onPointerMove = (event: PointerEvent) => {
    const delta = event.clientX - startX;
    applyWidth(startWidth + delta);
  };

  const stopDragging = () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDragging);
    window.removeEventListener('pointercancel', stopDragging);
    resizer.removeAttribute('data-dragging');
  };

  resizer.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    startX = event.clientX;
    startWidth = currentWidth;
    resizer.setAttribute('data-dragging', 'true');
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  });
}
