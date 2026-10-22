import { state } from '/src/state.ts';
import { projectSession } from '/src/services/ProjectSessionStore.ts';
import { click, waitFor } from './helpers/smoke-dom.ts';

/** Resolves once the preview has published a committed index, so a click maps to source. */
function navigationReady(): true | null {
  return document.querySelector('[data-preview-nav][data-preview-nav-ready]') ? true : null;
}

/** A paginated preview that is both rendered and navigable. */
function paginatedPreviewReady(): true | null {
  return document.querySelectorAll('.pagedjs_page').length > 0 && navigationReady() ? true : null;
}

/**
 * The full-document preview, rendered and navigable. An earlier preview (one
 * chapter, or the single document just left) is also paginated and navigable,
 * and clicking it while the full render replaces it loses the click, so the
 * wait also requires both chapters to be on the page.
 */
function fullDocumentPreviewReady(): true | null {
  if (!paginatedPreviewReady()) return null;
  const pages = Array.from(document.querySelectorAll('.pagedjs_page_content'), page => page.textContent ?? '').join('\n');
  return pages.includes('Chapter one heading') && pages.includes('Chapter two heading') ? true : null;
}

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
    __CLEAR_WRITER_READY__?: boolean;
    __CLEAR_WRITER_BOOT_ERROR__?: string;
  }
}

async function resetStorage(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('clear-writer-catalogue');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
  const root = await navigator.storage.getDirectory();
  for await (const [name] of (root as FileSystemDirectoryHandle).entries()) {
    await root.removeEntry(name, { recursive: true });
  }
}

async function clickSourceBlock(label: string, selector: string, path: string): Promise<boolean> {
  const element = await waitFor(`visible ${label}`, () => {
    if (!fullDocumentPreviewReady()) return null;
    return Array.from(document.querySelectorAll<HTMLElement>(selector))
      .find(candidate => candidate.textContent?.includes(label)) ?? null;
  }, 60_000);
  const rect = element.getBoundingClientRect();
  const hitTarget = document.elementFromPoint(rect.left + (rect.width / 2), rect.top + (rect.height / 2));
  if (!(hitTarget instanceof HTMLElement) || !element.contains(hitTarget)) return false;
  (document.activeElement as HTMLElement | null)?.blur();
  hitTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: rect.left + (rect.width / 2), clientY: rect.top + (rect.height / 2) }));
  await waitFor(`navigation from ${label}`, () => {
    const editorContent = document.querySelector<HTMLElement>('.cm-content');
    const preview = document.querySelector<HTMLElement>('.pagedjs_page_content');
    return state.current.activeFile === path
      && editorContent?.textContent?.includes(label)
      && preview?.textContent?.includes(label)
      ? true
      : null;
  }, 60_000);
  return true;
}

async function returnToFullPreview(path: string, label: string): Promise<void> {
  const editorManager = (window as unknown as { __CLEAR_WRITER_EDITOR_MANAGER__?: { openDocument(path: string): Promise<void> } }).__CLEAR_WRITER_EDITOR_MANAGER__;
  if (!editorManager) throw new Error('Editor manager is unavailable to reset the navigation fixture.');
  await editorManager.openDocument(path);
  await waitFor(`opened ${label}`, () => document.querySelector('.cm-content')?.textContent?.includes(label) ? true : null, 60_000);
  state.setFullDocMode();
  await waitFor('full-document paginated preview', fullDocumentPreviewReady, 60_000);
}

async function run(): Promise<void> {
  await resetStorage();
  await import('/src/main.ts');
  await waitFor('app ready', () => window.__CLEAR_WRITER_READY__ || window.__CLEAR_WRITER_BOOT_ERROR__);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);

  await click('#empty-canvas-new-project');
  await click('#btn-modal-new-opfs');
  const name = await waitFor('project name', () => document.querySelector<HTMLInputElement>('#input-opfs-name'));
  name.value = 'Preview Navigation';
  await click('#btn-modal-new-opfs-confirm');
  await waitFor('project opened', () => state.current.projectRef);

  for (const section of state.current.sections.filter(section => !section.isDir)) {
    await projectSession.deleteSection(section.path);
  }
  const chapterOneCreated = await projectSession.createSection('ChapterOne', [
    '# Chapter one heading',
    '',
    '## Chapter one subheading',
    '',
    'Chapter one first paragraph.',
    '',
    '## Chapter one later subheading',
    '',
    'Chapter one later paragraph.'
  ].join('\n'));
  const chapterTwoCreated = await projectSession.createSection('ChapterTwo', '# Chapter two heading\n\nChapter two paragraph.');
  const chapterOnePath = 'sections/ChapterOne.md';
  const chapterTwoPath = 'sections/ChapterTwo.md';
  if (!chapterOneCreated || !chapterTwoCreated) throw new Error('Failed to create the navigation fixture chapters.');

  state.setFullDocMode();

  await waitFor('full-document paginated preview', fullDocumentPreviewReady, 60_000);

  const h1 = await clickSourceBlock('Chapter one heading', 'h1', chapterOnePath);
  await returnToFullPreview(chapterTwoPath, 'Chapter two heading');
  const h2 = await clickSourceBlock('Chapter one subheading', 'h2', chapterOnePath);
  await returnToFullPreview(chapterTwoPath, 'Chapter two heading');
  const firstParagraph = await clickSourceBlock('Chapter one first paragraph.', 'p', chapterOnePath);

  window.__HARNESS_RESULT__ = { ok: true, h1, h2, firstParagraph };
}

/** What the app was showing when a step failed, so a timeout names its cause. */
function describeState(): Record<string, unknown> {
  return {
    activeFile: state.current.activeFile,
    isFullDocMode: state.current.isFullDocMode,
    editorText: document.querySelector('.cm-content')?.textContent?.slice(0, 80) ?? null,
    previewText: document.querySelector('.pagedjs_page_content')?.textContent?.slice(0, 80) ?? null,
    paginatedPages: document.querySelectorAll('.pagedjs_page').length,
    navigationReady: navigationReady() === true
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? error.stack : String(error),
    state: describeState()
  };
});
