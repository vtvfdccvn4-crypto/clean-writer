import { state } from '/src/state.ts';
import { click, getTexts, isHidden, waitFor } from './helpers/smoke-dom.ts';

declare global { interface Window { __HARNESS_RESULT__?: Record<string, unknown>; __CLEAR_WRITER_READY__?: boolean; __CLEAR_WRITER_BOOT_ERROR__?: string; } }

async function createSection(name: string, template: string) {
  await click('#btn-new-section');
  const row = await waitFor(`${name} create row`, () => document.querySelector<HTMLElement>('.tree-inline-create'));
  const select = row.querySelector<HTMLSelectElement>('.section-template-select');
  if (select) { select.value = template; select.dispatchEvent(new Event('change', { bubbles: true })); }
  const input = row.querySelector<HTMLInputElement>('.inline-input')!;
  input.value = name;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await waitFor(`${name} section`, () => state.current.activeFile === `sections/${name}.md` ? true : null);
  await waitFor(`${name} editor`, () => document.querySelector('.cm-content'));
}

async function run() {
  await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase('clear-writer-catalogue'); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => resolve(); });
  const root = await navigator.storage.getDirectory();
  for await (const [name] of (root as FileSystemDirectoryHandle).entries()) await root.removeEntry(name, { recursive: true });
  await import('/src/main.ts');
  await waitFor('app ready', () => window.__CLEAR_WRITER_READY__ || window.__CLEAR_WRITER_BOOT_ERROR__);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);
  await click('#empty-canvas-new-project'); await click('#btn-modal-new-opfs'); await click('#btn-modal-new-opfs-confirm');
  await waitFor('project', () => state.current.projectRef);
  await waitFor('project tree', () => document.querySelector('#section-list')?.childElementCount ? true : null);

  for (const [name, template] of [['BlankSection', 'blank'], ['ChapterSection', 'chapter'], ['SceneSection', 'scene'], ['NotesSection', 'notes'], ['AppendixSection', 'appendix']] as const) await createSection(name, template);
  const editorManager = (window as any).__CLEAR_WRITER_EDITOR_MANAGER__;
  const view = editorManager.getEditorView();
  view.setValue('Toolbar text', false); view.setSelection(0, 7);
  await click('[data-markdown-command="bold"]');
  const toolbarEdited = view.getValue() === '**Toolbar** text';
  await editorManager.flushCurrentDocument();
  const originalAppendChild = Element.prototype.appendChild;
  let pdfPrintCalled = false;
  Element.prototype.appendChild = function<T extends Node>(node: T): T {
    const appended = originalAppendChild.call(this, node) as T;
    if (node instanceof HTMLIFrameElement && node.contentWindow) {
      node.contentWindow.print = () => { pdfPrintCalled = true; };
    }
    return appended;
  };
  await click('#btn-export-pdf');
  await waitFor('PDF export status', () => document.getElementById('btn-export-pdf')?.dataset.exportStatus === 'exported' ? true : null);
  Element.prototype.appendChild = originalAppendChild;

  await createSection('DuplicateOne', 'blank'); editorManager.getEditorView().setValue('# Same\n\nText'); await editorManager.flushCurrentDocument();
  await createSection('DuplicateTwo', 'blank'); editorManager.getEditorView().setValue('# Same\n\nOther'); await editorManager.flushCurrentDocument();
  await createSection('EmptySection', 'blank'); await editorManager.flushCurrentDocument();
  await createSection('JumpSection', 'blank'); editorManager.getEditorView().setValue('# Top\n### Jumped'); await editorManager.flushCurrentDocument();
  await createSection('LongSection', 'blank'); editorManager.getEditorView().setValue('word '.repeat(2001)); await editorManager.flushCurrentDocument();
  await new Promise(resolve => setTimeout(resolve, 500));

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, shiftKey: true, bubbles: true }));
  await waitFor('review drawer', () => !isHidden(document.getElementById('project-review-drawer')));
  await waitFor('review completion', () => {
    const refresh = document.getElementById('project-review-refresh') as HTMLButtonElement | null;
    const status = document.getElementById('project-review-status')?.textContent;
    return refresh && !refresh.disabled && status !== 'Reviewing...';
  });
  const reviewCount = await waitFor('review results', () => document.querySelectorAll('.project-review-result').length);
  const reviewKinds = getTexts('.project-review-result strong');
  const jumpResult = await waitFor('heading-level review result', () => Array.from(document.querySelectorAll<HTMLButtonElement>('.project-review-result')).find(node => node.textContent?.includes('Heading level jump')));
  state.setActiveFile('sections/DuplicateOne.md');
  await waitFor('review navigation source', () => state.current.activeFile === 'sections/DuplicateOne.md' ? true : null);
  await waitFor('review navigation source editor', () => editorManager.getEditorView()?.getValue().includes('# Same') ? true : null);
  if (!jumpResult) throw new Error('Missing heading-level review result.');
  jumpResult.click();
  await waitFor('review navigation', () => state.current.activeFile === 'sections/JumpSection.md' ? true : null);

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, shiftKey: true, bubbles: true }));
  const outlineShortcut = await waitFor('outline shortcut', () => !isHidden(document.getElementById('document-outline-drawer')));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, shiftKey: true, bubbles: true }));
  const searchShortcut = await waitFor('search shortcut', () => !isHidden(document.getElementById('project-search-drawer')));
  window.__HARNESS_RESULT__ = { ok: true, projectKind: state.current.projectRef?.kind, templateCount: 5, toolbarEdited, pdfPrintCalled, reviewCount, reviewKinds, outlineShortcut: Boolean(outlineShortcut), searchShortcut: Boolean(searchShortcut) };
}
run().catch(error => { window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) }; });
