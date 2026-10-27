import { state } from '/src/state.ts';
import { click, waitFor } from './helpers/smoke-dom.ts';

declare global { interface Window { __HARNESS_RESULT__?: Record<string, unknown>; __CLEAR_WRITER_READY__?: boolean; } }

async function run(): Promise<void> {
  await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase('clear-writer-catalogue'); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => resolve(); });
  const root = await navigator.storage.getDirectory();
  for await (const [name] of (root as FileSystemDirectoryHandle).entries()) await root.removeEntry(name, { recursive: true });
  (window as any).showDirectoryPicker = undefined;
  const { projectSession } = await import('/src/services/ProjectSessionStore.ts');
  await import('/src/main.ts');
  await waitFor('ready', () => window.__CLEAR_WRITER_READY__ === true ? true : null);
  await click('#empty-canvas-new-project');
  await click('#btn-modal-new-opfs');
  const input = await waitFor('name', () => document.querySelector<HTMLInputElement>('#input-opfs-name'));
  input.value = 'DND Smoke';
  await click('#btn-modal-new-opfs-confirm');
  await waitFor('project', () => state.current.projectRef ? true : null);
  // Create two sections through the active workspace service exposed by the app.
  await projectSession.createFolder('sections/Archive');
  await projectSession.createSection('sections/One.md', '# One');
  await projectSession.createSection('sections/Two.md', '# Two');
  await waitFor('section visible', () => Array.from(document.querySelectorAll<HTMLElement>('.task-explorer-item-label')).some(label => label.textContent === 'One.md') ? true : null);
  const source = Array.from(document.querySelectorAll<HTMLElement>('.task-explorer-item')).find(item => item.textContent?.includes('Two.md'))!;
  const sibling = Array.from(document.querySelectorAll<HTMLElement>('.task-explorer-item')).find(item => item.textContent?.includes('One.md'))!;
  const transfer = new DataTransfer();
  source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
  const siblingRect = sibling.getBoundingClientRect();
  sibling.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientY: siblingRect.top + 1, dataTransfer: transfer }));
  sibling.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientY: siblingRect.top + 1, dataTransfer: transfer }));
  await waitFor('reordered section', () => {
    const paths = state.current.sections.map(section => section.path);
    return paths.indexOf('sections/Two.md') < paths.indexOf('sections/One.md') ? true : null;
  });
  const target = Array.from(document.querySelectorAll<HTMLElement>('.task-explorer-item--dir')).find(item => item.textContent?.includes('Archive'))!;
  const sourceAfterReorder = Array.from(document.querySelectorAll<HTMLElement>('.task-explorer-item')).find(item => item.textContent?.includes('One.md'))!;
  const transferForMove = new DataTransfer();
  sourceAfterReorder.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transferForMove }));
  const targetRect = target.getBoundingClientRect();
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientY: targetRect.top + targetRect.height / 2, dataTransfer: transferForMove }));
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientY: targetRect.top + targetRect.height / 2, dataTransfer: transferForMove }));
  await waitFor('moved section', () => state.current.sections.some(section => section.path === 'sections/Archive/One.md') ? true : null);
  const persistedPaths = (await projectSession.getSession()!.listSections()).map(section => section.path);
  window.__HARNESS_RESULT__ = {
    ok: true,
    paths: state.current.sections.map(section => section.path),
    persistedPaths,
    sourcePreservedAfterReorder: persistedPaths.includes('sections/Two.md'),
    relocatedPathPresent: persistedPaths.includes('sections/Archive/One.md'),
    oldPathRemovedAfterRelocation: !persistedPaths.includes('sections/One.md')
  };
}

run().catch(error => { window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error) }; });
