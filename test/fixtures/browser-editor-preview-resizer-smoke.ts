import { state } from '/src/state.ts';
import { click, waitFor } from './helpers/smoke-dom.ts';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
    __CLEAR_WRITER_READY__?: boolean;
    __CLEAR_WRITER_BOOT_ERROR__?: string;
  }
}

function pointer(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: x,
    clientY: y,
    pointerId: 9,
    pointerType: 'mouse'
  });
}

function width(selector: string): number {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing ${selector}.`);
  return Math.round(element.getBoundingClientRect().width);
}

async function resetBrowserStorage(): Promise<void> {
  window.localStorage.clear();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('clear-writer-catalogue');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to reset browser storage.'));
    request.onblocked = () => resolve();
  });
}

async function run() {
  await resetBrowserStorage();
  await import('/src/main.ts');
  await waitFor('app ready flag or boot error', () => (
    window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__)
  ) ? true : null, 60_000);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);

  await click('#empty-canvas-new-project');
  await click('#btn-modal-new-opfs');
  const input = await waitFor('project name input', () => document.querySelector<HTMLInputElement>('#input-opfs-name'));
  input.value = 'Split Pane Smoke';
  await click('#btn-modal-new-opfs-confirm');
  await waitFor('project open', () => state.current.projectRef ? true : null);

  const separator = await waitFor('editor preview separator', () => document.querySelector<HTMLElement>('#editor-preview-resizer'));
  const stage = await waitFor('preview stage', () => document.querySelector<HTMLElement>('#paged-stage'));
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const before = width('.shared-editor-pane');
  const previewBefore = width('#preview-panel');
  const scaleBefore = Number.parseFloat(stage.style.getPropertyValue('--preview-scale'));
  const bounds = separator.getBoundingClientRect();
  separator.dispatchEvent(pointer('pointerdown', bounds.left + 3, bounds.top + 8));
  window.dispatchEvent(pointer('pointermove', bounds.left + 123, bounds.top + 8));
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const scaleDuringDrag = Number.parseFloat(stage.style.getPropertyValue('--preview-scale'));
  window.dispatchEvent(pointer('pointerup', bounds.left + 123, bounds.top + 8));
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const afterDrag = width('.shared-editor-pane');
  const previewAfterDrag = width('#preview-panel');
  const scaleAfterDrag = Number.parseFloat(stage.style.getPropertyValue('--preview-scale'));

  separator.focus();
  separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
  const afterKeyboard = width('.shared-editor-pane');
  separator.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  const afterReset = width('.shared-editor-pane');
  const storedRatio = Number.parseFloat(window.localStorage.getItem('clear-writer:layout:editor-preview-ratio:v1') ?? '');

  window.__HARNESS_RESULT__ = {
    ok: true,
    separatorRole: separator.getAttribute('role'),
    separatorEnabled: separator.getAttribute('aria-disabled') === 'false',
    editorGrewOnDrag: afterDrag > before,
    previewShrankOnDrag: previewAfterDrag < previewBefore,
    keyboardResized: afterKeyboard < afterDrag,
    resetRestoredBalance: Math.abs(afterReset - width('#preview-panel')) <= 2,
    persistedRatio: Number.isFinite(storedRatio) && storedRatio > 0 && storedRatio < 1,
    previewScalePausedDuringDrag: scaleDuringDrag === scaleBefore,
    previewScaleSettledAfterDrag: scaleAfterDrag < scaleBefore
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
