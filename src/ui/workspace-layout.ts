type ActivityView = string | null;

const DEFAULT_EXPLORER_WIDTH = 304;
const MIN_EXPLORER_WIDTH = 220;
const MAX_EXPLORER_WIDTH = 520;
let setActiveViewImpl: ((requestedView: string) => void) | null = null;
let applyWidthImpl: ((width: number) => void) | null = null;

function clampWidth(width: number): number {
  return Math.max(MIN_EXPLORER_WIDTH, Math.min(MAX_EXPLORER_WIDTH, width));
}

/** Owns activity-panel state and the explorer's lightweight resize interaction. */
export function initWorkspaceLayout(): void {
  const workspace = document.querySelector<HTMLElement>('.workspace');
  const sidebar = document.getElementById('sidebar');
  const resizer = document.getElementById('explorer-resizer');
  if (!workspace || !sidebar || !resizer) return;

  const panels = new Map(
    [...sidebar.querySelectorAll<HTMLElement>('[data-activity-panel]')]
      .map((panel) => [panel.dataset.activityPanel, panel] as const)
      .filter((entry): entry is readonly [string, HTMLElement] => Boolean(entry[0]))
  );
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-activity-view]')];
  let activeView: ActivityView = 'explorer';
  let explorerWidth = DEFAULT_EXPLORER_WIDTH;

  const applyWidth = (width: number) => {
    explorerWidth = clampWidth(width);
    workspace.style.setProperty('--explorer-width', `${explorerWidth}px`);
    resizer.setAttribute('aria-valuenow', String(explorerWidth));
  };
  applyWidthImpl = applyWidth;

  resizer.setAttribute('aria-valuemin', String(MIN_EXPLORER_WIDTH));
  resizer.setAttribute('aria-valuemax', String(MAX_EXPLORER_WIDTH));

  const updateActiveView = (nextView: ActivityView) => {
    activeView = nextView;
    workspace.classList.toggle('is-activity-collapsed', activeView === null);
    panels.forEach((panel, view) => { panel.hidden = view !== activeView; });
    buttons.forEach((button) => {
      const isActive = button.dataset.activityView === activeView;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    document.dispatchEvent(new CustomEvent<{ view: ActivityView }>('clear-writer-activity-view-changed', { detail: { view: activeView } }));
  };

  const toggleActiveView = (requestedView: string) => {
    updateActiveView(activeView === requestedView ? null : requestedView);
  };

  setActiveViewImpl = (requestedView: string) => {
    updateActiveView(requestedView);
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.activityView;
      if (view && panels.has(view)) toggleActiveView(view);
    });
  });
  document.getElementById('btn-activity-settings')?.addEventListener('click', () => document.getElementById('btn-settings')?.click());

  const canResize = () => !workspace.classList.contains('is-activity-collapsed') && window.matchMedia('(min-width: 1101px)').matches;
  resizer.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || !canResize()) return;
    event.preventDefault();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startWidth = explorerWidth;
    let pendingWidth = startWidth;
    let animationFrame = 0;
    let finished = false;
    const updateGuide = () => {
      animationFrame = 0;
      resizer.style.transform = `translateX(${pendingWidth - startWidth}px)`;
    };
    const updatePendingWidth = (clientX: number, showGuide = true) => {
      pendingWidth = clampWidth(startWidth + clientX - startX);
      if (showGuide && !animationFrame) animationFrame = requestAnimationFrame(updateGuide);
    };
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId === pointerId) updatePendingWidth(moveEvent.clientX);
    };
    const finish = (endEvent?: Event) => {
      if (finished) return;
      finished = true;
      if (endEvent instanceof PointerEvent && endEvent.pointerId === pointerId && endEvent.type !== 'pointercancel') {
        updatePendingWidth(endEvent.clientX, false);
      }
      if (animationFrame) cancelAnimationFrame(animationFrame);
      resizer.style.removeProperty('transform');
      resizer.classList.remove('is-dragging');
      document.body.classList.remove('is-resizing-explorer');
      applyWidth(pendingWidth);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
      resizer.removeEventListener('lostpointercapture', finish);
      if (resizer.hasPointerCapture(pointerId)) {
        resizer.releasePointerCapture(pointerId);
      }
    };
    resizer.setPointerCapture(pointerId);
    resizer.classList.add('is-dragging');
    document.body.classList.add('is-resizing-explorer');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
    resizer.addEventListener('lostpointercapture', finish);
  });

  resizer.addEventListener('keydown', (event) => {
    if (!canResize()) return;
    const adjustments: Record<string, number> = { ArrowLeft: -16, ArrowRight: 16, Home: MIN_EXPLORER_WIDTH - explorerWidth, End: MAX_EXPLORER_WIDTH - explorerWidth };
    if (!(event.key in adjustments)) return;
    event.preventDefault();
    applyWidth(explorerWidth + adjustments[event.key]);
  });

  applyWidth(explorerWidth);
  updateActiveView('explorer');
}

export function setWorkspaceActivityView(view: 'explorer' | 'images' | 'outline'): void {
  setActiveViewImpl?.(view);
}

export function resetWorkspaceExplorerWidth(): void {
  applyWidthImpl?.(DEFAULT_EXPLORER_WIDTH);
}
