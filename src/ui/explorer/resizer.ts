import { state } from '../../state';

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
  let hasAppliedWidth = false;
  let pendingWidth: number | null = null;
  let resizeFrame: number | null = null;

  const applyWidth = (width: number) => {
    const clamped = clampWidth(width);
    if (hasAppliedWidth && clamped === currentWidth) return;
    currentWidth = clamped;
    hasAppliedWidth = true;
    workspace.style.setProperty('--task-panel-width', `${clamped}px`);
  };

  const flushPendingWidth = () => {
    if (resizeFrame !== null) {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = null;
    }
    if (pendingWidth === null) return;
    const width = pendingWidth;
    pendingWidth = null;
    applyWidth(width);
  };

  const scheduleWidth = (width: number) => {
    pendingWidth = width;
    if (resizeFrame !== null) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = null;
      flushPendingWidth();
    });
  };

  applyWidth(DEFAULT_WIDTH);

  state.onProjectChanged(() => {
    applyWidth(DEFAULT_WIDTH);
  });

  let startX = 0;
  let startWidth = DEFAULT_WIDTH;

  const onPointerMove = (event: PointerEvent) => {
    const delta = event.clientX - startX;
    scheduleWidth(startWidth + delta);
  };

  const stopDragging = () => {
    flushPendingWidth();
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
