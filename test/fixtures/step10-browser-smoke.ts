import { state } from '/src/state.ts';
import { projectSession } from '/src/services/ProjectSessionStore.ts';
import { click, getTexts, isHidden, waitFor } from './helpers/smoke-dom.ts';

declare global { interface Window { __HARNESS_RESULT__?: Record<string, unknown>; __CLEAR_WRITER_READY__?: boolean; __CLEAR_WRITER_BOOT_ERROR__?: string; } }

async function createSection(name: string, template: string) {
  const content = template === 'blank'
    ? `# ${name}\n\nStart writing here...`
    : `# ${name}\n\n${template} template smoke content.`;
  if (!await projectSession.createSection(name, content)) throw new Error(`Failed to create ${name}.`);
  const path = `sections/${name}.md`;
  await waitFor(`${name} section`, () => state.current.activeFile === path ? true : null);
  // State updates before the asynchronous document activation has necessarily
  // replaced the previous CodeMirror view. Use the public readiness contract
  // so subsequent writes target the section we just created.
  const editorManager = (window as any).__CLEAR_WRITER_EDITOR_MANAGER__;
  await editorManager.openDocument(path);
  await waitFor(`${name} editor`, () => (
    state.current.activeFile === path && editorManager.getEditorView()?.getValue() !== undefined
  ) ? true : null);
  return editorManager;
}

async function createAndWriteSection(name: string, template: string, content: string): Promise<void> {
  const editorManager = await createSection(name, template);
  editorManager.getEditorView().setValue(content);
  await editorManager.flushCurrentDocument();
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
  await waitFor('project explorer', () => {
    const view = document.getElementById('task-explorer-view');
    return view && !view.classList.contains('hidden') ? true : null;
  });

  for (const [name, template] of [['BlankSection', 'blank'], ['ChapterSection', 'chapter'], ['SceneSection', 'scene'], ['NotesSection', 'notes'], ['AppendixSection', 'appendix']] as const) await createSection(name, template);
  const editorManager = (window as any).__CLEAR_WRITER_EDITOR_MANAGER__;
  const view = editorManager.getEditorView();
  view.setValue('Toolbar text', false); view.setSelection(0, 7);
  await click('[data-markdown-command="bold"]');
  const toolbarEdited = view.getValue() === '**Toolbar** text';
  await editorManager.flushCurrentDocument();
  const pdfPreviewAvailable = document.getElementById('btn-pdf-preview') instanceof HTMLButtonElement;

  await createAndWriteSection('DuplicateOne', 'blank', '# Same\n\nText');
  await createAndWriteSection('DuplicateTwo', 'blank', '# Same\n\nOther');
  if (!await projectSession.createSection('EmptySection', '')) throw new Error('Failed to create EmptySection.');
  await waitFor('EmptySection section', () => state.current.activeFile === 'sections/EmptySection.md' ? true : null);
  await editorManager.openDocument('sections/EmptySection.md');
  await editorManager.flushCurrentDocument();
  await createAndWriteSection('JumpSection', 'blank', '# Top\n### Jumped');
  await createAndWriteSection('LongSection', 'blank', 'word '.repeat(2001));

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
  const outlineShortcut = await waitFor('outline shortcut', () => document.querySelector<HTMLElement>('.outline-section')?.hidden === false);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, shiftKey: true, bubbles: true }));
  const searchShortcut = await waitFor('search shortcut', () => !isHidden(document.getElementById('project-search-drawer')));
  window.__HARNESS_RESULT__ = { ok: true, projectKind: state.current.projectRef?.kind, templateCount: 5, toolbarEdited, pdfPreviewAvailable, reviewCount, reviewKinds, outlineShortcut: Boolean(outlineShortcut), searchShortcut: Boolean(searchShortcut) };
}
run().catch(error => { window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error) }; });
