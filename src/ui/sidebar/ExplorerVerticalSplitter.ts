const STORAGE_KEY = 'clear-writer-explorer-sections-split';
const DEFAULT_RATIO = 50;
const KEYBOARD_STEP = 2;
const MIN_SECTIONS_HEIGHT = 56;
const MIN_IMAGES_HEIGHT = 194;

function storedRatio(): number {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(value) && value > 0 && value < 100) return value;
  } catch {
    // Storage is optional.
  }
  return DEFAULT_RATIO;
}

export function setupExplorerVerticalSplitter(container: HTMLElement, splitter: HTMLElement): void {
  let ratio = storedRatio();
  let activePointer: number | null = null;

  const limits = (): { min: number; max: number } => {
    const styles = getComputedStyle(container);
    const innerHeight = Math.max(
      1,
      container.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom)
    );
    const splitterHeight = splitter.getBoundingClientRect().height || 7;
    const min = (MIN_SECTIONS_HEIGHT / innerHeight) * 100;
    const max = ((innerHeight - MIN_IMAGES_HEIGHT - splitterHeight) / innerHeight) * 100;
    return max >= min ? { min, max } : { min: Math.max(0, max), max: Math.max(0, max) };
  };

  const applyRatio = (nextRatio: number, persist = false): void => {
    const { min, max } = limits();
    ratio = Math.min(max, Math.max(min, nextRatio));
    container.style.setProperty('--explorer-sections-ratio', ratio.toFixed(2));
    splitter.setAttribute('aria-valuenow', String(Math.round(ratio)));
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, String(ratio));
      } catch {
        // Keep the in-memory split when storage is unavailable.
      }
    }
  };

  const ratioFromPointer = (clientY: number): number => {
    const rect = container.getBoundingClientRect();
    const styles = getComputedStyle(container);
    const paddingTop = parseFloat(styles.paddingTop);
    const paddingBottom = parseFloat(styles.paddingBottom);
    const innerHeight = Math.max(1, rect.height - paddingTop - paddingBottom);
    return ((clientY - rect.top - paddingTop) / innerHeight) * 100;
  };

  splitter.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    activePointer = event.pointerId;
    splitter.setPointerCapture(event.pointerId);
    splitter.classList.add('is-dragging');
    document.body.classList.add('is-resizing-explorer-vertically');
    applyRatio(ratioFromPointer(event.clientY));
    event.preventDefault();
  });

  splitter.addEventListener('pointermove', event => {
    if (activePointer !== event.pointerId) return;
    applyRatio(ratioFromPointer(event.clientY));
  });

  const finishDrag = (event: PointerEvent): void => {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    splitter.classList.remove('is-dragging');
    document.body.classList.remove('is-resizing-explorer-vertically');
    if (splitter.hasPointerCapture(event.pointerId)) splitter.releasePointerCapture(event.pointerId);
    applyRatio(ratio, true);
  };

  splitter.addEventListener('pointerup', finishDrag);
  splitter.addEventListener('pointercancel', finishDrag);
  splitter.addEventListener('dblclick', () => applyRatio(DEFAULT_RATIO, true));
  splitter.addEventListener('keydown', event => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    applyRatio(ratio + (event.key === 'ArrowDown' ? KEYBOARD_STEP : -KEYBOARD_STEP), true);
    event.preventDefault();
  });

  applyRatio(ratio);
}
