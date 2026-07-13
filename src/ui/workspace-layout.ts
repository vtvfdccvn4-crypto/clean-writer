type ActivityView = 'explorer' | 'images' | 'outline' | null;

const STORAGE_KEY = 'clear-writer.explorer-width';
const MIN_EXPLORER_WIDTH = 220;
const MAX_EXPLORER_WIDTH = 520;

function clampWidth(width: number): number {
  return Math.max(MIN_EXPLORER_WIDTH, Math.min(MAX_EXPLORER_WIDTH, width));
}

function readStoredWidth(): number {
  try {
    const width = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(width) ? clampWidth(width) : 304;
  } catch {
    return 304;
  }
}

/** Owns activity-panel state and the explorer's lightweight resize interaction. */
export function initWorkspaceLayout(): void {
  const workspace = document.querySelector<HTMLElement>('.workspace');
  const sidebar = document.getElementById('sidebar');
  const resizer = document.getElementById('explorer-resizer');
  if (!workspace || !sidebar || !resizer) return;

  const panels = {
    explorer: sidebar.querySelector<HTMLElement>('.sections-section'),
    images: sidebar.querySelector<HTMLElement>('.images-section'),
    outline: sidebar.querySelector<HTMLElement>('.outline-section')
  };
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-activity-view]')];
  let activeView: ActivityView = 'explorer';
  let explorerWidth = readStoredWidth();

  const applyWidth = (width: number, persist = false) => {
    const nextWidth = clampWidth(width);
    const changed = nextWidth !== explorerWidth;
    explorerWidth = nextWidth;
    if (changed) workspace.style.setProperty('--explorer-width', `${explorerWidth}px`);
    if (changed) resizer.setAttribute('aria-valuenow', String(explorerWidth));
    if (persist && changed) {
      try { window.localStorage.setItem(STORAGE_KEY, String(explorerWidth)); } catch { /* Storage may be unavailable. */ }
    }
  };

  resizer.setAttribute('aria-valuemin', String(MIN_EXPLORER_WIDTH));
  resizer.setAttribute('aria-valuemax', String(MAX_EXPLORER_WIDTH));

  const setActiveView = (requestedView: Exclude<ActivityView, null>) => {
    activeView = activeView === requestedView ? null : requestedView;
    workspace.classList.toggle('is-activity-collapsed', activeView === null);
    Object.entries(panels).forEach(([view, panel]) => { if (panel) panel.hidden = view !== activeView; });
    buttons.forEach((button) => {
      const isActive = button.dataset.activityView === activeView;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    document.dispatchEvent(new CustomEvent<{ view: ActivityView }>('clear-writer-activity-view-changed', { detail: { view: activeView } }));
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => setActiveView(button.dataset.activityView as Exclude<ActivityView, null>));
  });
  document.getElementById('btn-activity-settings')?.addEventListener('click', () => document.getElementById('btn-settings')?.click());

  const canResize = () => !workspace.classList.contains('is-activity-collapsed') && window.matchMedia('(min-width: 1101px)').matches;
  resizer.addEventListener('pointerdown', (event) => {
    if (!canResize()) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = explorerWidth;
    let pendingWidth = startWidth;
    let animationFrame = 0;
    let finished = false;
    const updateGuide = () => {
      animationFrame = 0;
      resizer.style.transform = `translateX(${pendingWidth - startWidth}px)`;
    };
    const move = (moveEvent: PointerEvent) => {
      pendingWidth = clampWidth(startWidth + moveEvent.clientX - startX);
      if (!animationFrame) animationFrame = requestAnimationFrame(updateGuide);
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      resizer.style.removeProperty('transform');
      resizer.classList.remove('is-dragging');
      document.body.classList.remove('is-resizing-explorer');
      applyWidth(pendingWidth, true);
      resizer.removeEventListener('pointermove', move);
      window.removeEventListener('blur', finish);
      if (resizer.hasPointerCapture(event.pointerId)) {
        resizer.releasePointerCapture(event.pointerId);
      }
    };
    resizer.setPointerCapture(event.pointerId);
    resizer.classList.add('is-dragging');
    document.body.classList.add('is-resizing-explorer');
    resizer.addEventListener('pointermove', move);
    resizer.addEventListener('pointerup', finish, { once: true });
    resizer.addEventListener('pointercancel', finish, { once: true });
    window.addEventListener('blur', finish);
    resizer.addEventListener('lostpointercapture', finish, { once: true });
  });

  resizer.addEventListener('keydown', (event) => {
    if (!canResize()) return;
    const adjustments: Record<string, number> = { ArrowLeft: -16, ArrowRight: 16, Home: MIN_EXPLORER_WIDTH - explorerWidth, End: MAX_EXPLORER_WIDTH - explorerWidth };
    if (!(event.key in adjustments)) return;
    event.preventDefault();
    applyWidth(explorerWidth + adjustments[event.key], true);
  });

  applyWidth(explorerWidth);
  setActiveView('explorer');
}
