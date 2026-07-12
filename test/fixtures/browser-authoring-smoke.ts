import { state } from '/src/state.ts';
import { click, getTexts, getVisibleCardTitle, getVisibleDetailsTitle, isHidden, waitFor as waitForSmoke } from './helpers/smoke-dom.ts';

declare global {
  interface Window {
    __HARNESS_RESULT__?: Record<string, unknown>;
    __HARNESS_PROGRESS__?: string;
    __CLEAR_WRITER_READY__?: boolean;
    __CLEAR_WRITER_BOOT_ERROR__?: string;
  }
}

type MockUploadFile = {
  name: string;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
};

const alerts: string[] = [];
window.alert = (message?: unknown) => {
  alerts.push(String(message ?? ''));
};
(window as any).showDirectoryPicker = undefined;

function createMockFile(name: string, type: string, contents: string): MockUploadFile {
  const bytes = new TextEncoder().encode(contents);
  return {
    name,
    type,
    async arrayBuffer() {
      return bytes.slice().buffer;
    }
  };
}

const uploadQueue: MockUploadFile[][] = [
  [createMockFile('scene.png', 'image/png', 'scene-data')],
  [createMockFile('star.png', 'image/png', 'glyph-data')]
];

const originalInputClick = HTMLInputElement.prototype.click;
HTMLInputElement.prototype.click = function clickPatched(this: HTMLInputElement): void {
  if (this.type === 'file') {
    const files = uploadQueue.shift() ?? [];
    Object.defineProperty(this, 'files', {
      configurable: true,
      value: files
    });
    this.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  originalInputClick.call(this);
};

async function resetBrowserStorage(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('clear-writer-catalogue');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to delete OPFS catalogue database.'));
    request.onblocked = () => resolve();
  });
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('clear-writer-directory-handles');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to delete directory handle database.'));
    request.onblocked = () => resolve();
  });

  const root = await navigator.storage.getDirectory();
  for await (const [name] of (root as FileSystemDirectoryHandle).entries()) {
    await root.removeEntry(name, { recursive: true });
  }
}

const waitFor = <T>(label: string, read: () => T | null | undefined | false, timeoutMs = 20_000): Promise<T> =>
  waitForSmoke(label, read, timeoutMs, { reportProgress: true });

async function openSettingsTab(tabId: string): Promise<void> {
  await click('#btn-settings');
  await click(`[data-settings-tab="${tabId}"]`);
  await waitFor(`${tabId} settings tab open`, () => {
    const drawerOpen = !isHidden(document.getElementById('settings-drawer'));
    const panelOpen = !isHidden(document.querySelector<HTMLElement>(`[data-settings-panel="${tabId}"]`));
    return drawerOpen && panelOpen ? true : null;
  });
}

async function waitForEditor(
  editorManager: { getEditorView(): { getValue(): string } | null },
  path: string,
  predicate: (value: string) => boolean,
  label: string
): Promise<string> {
  return waitFor(label, () => {
    if (state.current.activeFile !== path) return null;
    const value = editorManager.getEditorView()?.getValue();
    return value !== undefined && predicate(value) ? value : null;
  });
}

async function run() {
  await resetBrowserStorage();
  await import('/src/main.ts');
  await waitFor('app ready flag or boot error', () => (
    window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__)
  ) ? true : null, 60_000);
  if (window.__CLEAR_WRITER_BOOT_ERROR__) {
    throw new Error(window.__CLEAR_WRITER_BOOT_ERROR__);
  }

  await click('#empty-canvas-new-project');
  
  await click('#btn-modal-new-opfs');
  const nameInput = await waitFor('modal name input', () => document.querySelector<HTMLInputElement>('#input-opfs-name'));
  nameInput.value = 'Authoring Smoke';
  await click('#btn-modal-new-opfs-confirm');

  await waitFor('opfs project ref', () => state.current.projectRef?.kind === 'opfs' ? state.current.projectRef : null);
  await waitFor('project tree render', () => document.querySelector('#section-list')?.childElementCount ? true : null);
  const initialProjectId = state.current.projectRef?.id ?? null;
  const projectNameShown = await waitFor('project name after create', () => {
    const value = document.getElementById('project-name')?.textContent?.trim();
    return value === 'Authoring Smoke' ? value : null;
  });
  const projectKind = state.current.projectRef?.kind ?? null;
  const workspaceChipShown = await waitFor('workspace chip after create', () => {
    const value = document.getElementById('workspace-mode-chip')?.textContent?.trim();
    return value === 'Browser storage' ? value : null;
  });

  await click('#btn-close-project');
  await waitFor('project closed', () => state.current.projectRef === null ? true : null);
  await waitFor('empty workspace after close', () => document.querySelector('.empty-canvas') ? true : null);
  const projectNameAfterClose = document.getElementById('project-name')?.textContent?.trim() || '';
  const workspaceChipHiddenAfterClose = document.getElementById('workspace-mode-chip')?.hasAttribute('hidden') === true;

  await click('#btn-open');
  await click('.recent-item-btn');
  await waitFor('opfs project reopened from recent', () => state.current.projectRef?.id === initialProjectId ? true : null);
  await waitFor('project tree render after reopen', () => document.querySelector('#section-list')?.childElementCount ? true : null);
  const reopenedProjectName = document.getElementById('project-name')?.textContent?.trim() || '';
  const reopenedWorkspaceChip = document.getElementById('workspace-mode-chip')?.textContent?.trim() || '';

  await click('#btn-add-image');
  await waitFor('image upload', () => state.current.images.some(image => image.path === 'images/scene.png') ? true : null);
  await waitFor('image list row', () => Array.from(document.querySelectorAll('#image-list .item-title')).some(node => node.textContent === 'images/scene.png') ? true : null);
  const imageListItemsBeforeInsert = Array.from(document.querySelectorAll('#image-list .item-title')).map(node => node.textContent?.trim() || '');

  await click('#btn-upload-glyph');
  await waitFor('glyph upload', () => state.current.images.some(image => image.path === 'assets/glyphs/star.png') ? true : null);
  const glyphOption = await waitFor('glyph option', () => {
    const select = document.getElementById('cbs-icon') as HTMLSelectElement | null;
    return select && Array.from(select.options).find(option => option.value === 'assets/glyphs/star.png') ? select : null;
  });

  await click('#btn-new-section');
  const sectionInput = await waitFor('section name input', () => document.querySelector<HTMLInputElement>('.inline-input'));
  sectionInput.value = 'MySection';
  sectionInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  await waitFor('active file', () => state.current.activeFile === 'sections/MySection.md' ? true : null);
  await new Promise(r => setTimeout(r, 1000));
  const row = document.querySelector('.tree-row[data-path="sections/MySection.md"]');
  if (!row?.classList.contains('active')) {
    const listHtml = document.querySelector('#section-list')?.innerHTML || 'NO_LIST';
    throw new Error(`DEBUG_HTML: ${listHtml}`);
  }

  // Verify rename keeps it active
  await click('.tree-row[data-path="sections/MySection.md"] .btn-rename');
  const renameInput = await waitFor('rename input', () => document.querySelector<HTMLInputElement>('.inline-input'));
  renameInput.value = 'MyRenamedSection';
  renameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  await waitFor('renamed active file', () => state.current.activeFile === 'sections/MyRenamedSection.md' ? true : null);
  await waitFor('renamed row active class', () => {
    const row = document.querySelector('.tree-row[data-path="sections/MyRenamedSection.md"]');
    return row?.classList.contains('active') ? true : null;
  });

  await openSettingsTab('page-setup');
  await waitFor('page setup shows compact section controls', () => {
    const select = document.getElementById('page-section-visibility-select') as HTMLSelectElement | null;
    const labels = getTexts('#page-section-visibility-controls .drawer-control-label');
    return select?.options.length === 1
      && select.options[0]?.textContent?.includes('MyRenamedSection.md')
      && labels.length === 2
      && labels.includes('Header')
      && labels.includes('Footer')
      ? true
      : null;
  });
  const pageSetupCards = Array.from(document.querySelectorAll('#settings-panel-page-setup > .drawer-body > .drawer-card, #settings-panel-page-setup > .drawer-body > .drawer-details'));
  const footerSettings = getVisibleDetailsTitle('#settings-panel-page-setup', 'Footer settings');
  const sectionConfigurationCard = getVisibleCardTitle('#settings-panel-page-setup', 'Section configuration');
  if (!footerSettings || !sectionConfigurationCard || pageSetupCards.indexOf(sectionConfigurationCard as HTMLElement) <= pageSetupCards.indexOf(footerSettings as HTMLElement)) {
    throw new Error('Section configuration should appear as a card after Footer settings.');
  }
  const visibilityControlLabels = getTexts('#page-section-visibility-controls .drawer-control-label');
  if (visibilityControlLabels.includes('Heading numbers') || visibilityControlLabels.includes('Table of contents')) {
    throw new Error(`Visibility drawer still contains TOC controls: ${visibilityControlLabels.join(', ')}`);
  }
  document.getElementById('btn-close-settings-drawer')?.click();

  await openSettingsTab('toc');
  await waitFor('toc drawer shows real section toggles', () => {
    const select = document.getElementById('toc-section-select') as HTMLSelectElement | null;
    const labels = getTexts('#toc-section-list .drawer-control-label');
    return select?.options.length === 1
      && select.options[0]?.textContent?.includes('MyRenamedSection.md')
      && labels.includes('Include in TOC')
      && labels.includes('Heading numbers')
      ? true
      : null;
  });
  const tocMaxLevelSelect = document.getElementById('toc-max-level') as HTMLSelectElement | null;
  if (!tocMaxLevelSelect) {
    throw new Error('TOC max level select not found');
  }
  tocMaxLevelSelect.value = '3';
  tocMaxLevelSelect.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('btn-apply-toc-setup')?.click();
  await waitFor('toc max level persisted', () => state.current.pageSetup.toc?.maxLevel === 3 ? true : null);
  const tocApplyKeepsDrawerOpen = !isHidden(document.getElementById('settings-drawer'))
    && !isHidden(document.getElementById('settings-panel-toc'));
  if (!tocApplyKeepsDrawerOpen) {
    throw new Error('TOC Apply should keep the drawer open.');
  }

  document.getElementById('btn-close-settings-drawer')?.click();
  await openSettingsTab('toc');
  await waitFor('toc max level restored in drawer', () => {
    const select = document.getElementById('toc-max-level') as HTMLSelectElement | null;
    return select?.value === '3' ? true : null;
  });
  document.getElementById('btn-close-settings-drawer')?.click();

  await openSettingsTab('lists');
  await waitFor('compact list drawer controls', () => {
    const unordered = document.getElementById('ul-list-style') as HTMLSelectElement | null;
    const ordered = document.getElementById('ol-list-style') as HTMLSelectElement | null;
    return !isHidden(document.getElementById('settings-drawer'))
      && !isHidden(document.getElementById('settings-panel-lists'))
      && unordered?.options.length === 3
      && ordered?.options.length === 2
      && Boolean(document.getElementById('ul-selected-font'))
      && Boolean(document.getElementById('ol-selected-font'))
      && !document.getElementById('ul-dash-font')
      && !document.getElementById('ol-paren-font')
      ? true
      : null;
  });
  const unorderedListStyleSelect = document.getElementById('ul-list-style') as HTMLSelectElement;
  const unorderedSizeSelect = document.getElementById('ul-selected-size') as HTMLSelectElement;
  unorderedSizeSelect.value = '14';
  unorderedListStyleSelect.value = 'ulDash';
  unorderedListStyleSelect.dispatchEvent(new Event('change', { bubbles: true }));
  unorderedSizeSelect.value = '16';
  unorderedListStyleSelect.value = 'ulAsterisk';
  unorderedListStyleSelect.dispatchEvent(new Event('change', { bubbles: true }));
  if (unorderedSizeSelect.value !== '14') {
    throw new Error(`Unordered list draft value was not restored after selection change. Got: ${unorderedSizeSelect.value}`);
  }
  unorderedListStyleSelect.value = 'ulDash';
  unorderedListStyleSelect.dispatchEvent(new Event('change', { bubbles: true }));
  if (unorderedSizeSelect.value !== '16') {
    throw new Error(`Unordered dash list draft value was not restored after selection change. Got: ${unorderedSizeSelect.value}`);
  }
  document.getElementById('btn-apply-lists')?.click();
  await waitFor('list setup persisted from compact drawer', () => (
    state.current.listSetup.ulAsterisk.fontSize === 14
    && state.current.listSetup.ulDash.fontSize === 16
  ) ? true : null);
  const listApplyKeepsDrawerOpen = !isHidden(document.getElementById('settings-drawer'))
    && !isHidden(document.getElementById('settings-panel-lists'));
  if (!listApplyKeepsDrawerOpen) {
    throw new Error('List styles Apply should keep the drawer open.');
  }
  document.getElementById('btn-close-settings-drawer')?.click();

  await click('.image-list-item');
  await waitFor('image insert button visible', () => document.querySelector<HTMLElement>('#btn-insert-image:not([hidden])'));

  await click('#btn-full-doc');
  await waitFor('full document mode', () => state.current.isFullDocMode === true ? true : null);
  await waitFor('editor container has full doc text', () => document.getElementById('editor-container')?.textContent?.includes('Editor disabled in Full Document mode') ? true : null);
  await waitFor('no row active in full doc mode', () => {
    const activeRow = document.querySelector('.tree-row.active');
    return activeRow === null ? true : null;
  });
  const statusTextInFullDoc = document.getElementById('editor-status')?.textContent;
  const statusDotClassInFullDoc = document.getElementById('editor-status-dot')?.className;

  await click('#btn-insert-image');
  await waitFor('insert guard notice', () => Array.from(document.querySelectorAll('#notice-container .notice')).some(node => node.textContent?.includes('Open a section to insert an image.')) ? true : null);

  state.setActiveFile('sections/MyRenamedSection.md');
  await waitFor('single section mode restored', () => state.current.activeFile === 'sections/MyRenamedSection.md' && state.current.isFullDocMode === false ? true : null);
  await waitFor('editor status is Saved after load', () => document.getElementById('editor-status')?.textContent === 'Saved' ? true : null);
  
  await waitFor('editor rendered', () => document.querySelector('.cm-content') ? true : null);
  const statusTextAfterLoad = document.getElementById('editor-status')?.textContent;
  const statusDotClassAfterLoad = document.getElementById('editor-status-dot')?.className;

  await click('#btn-insert-image');

  const statusTextAfterInsert = await waitFor('status dirty', () => {
    const txt = document.getElementById('editor-status')?.textContent;
    return txt === 'Unsaved changes' ? txt : null;
  });
  const statusDotClassAfterInsert = document.getElementById('editor-status-dot')?.className;

  const statusTextAfterSave = await waitFor('status saved', () => {
    const txt = document.getElementById('editor-status')?.textContent;
    return txt === 'Saved' ? txt : null;
  });
  const statusDotClassAfterSave = document.getElementById('editor-status-dot')?.className;

  await openSettingsTab('editor');
  const editorFontSizeSelect = await waitFor('editor font size select', () => document.getElementById('drawer-editor-font-size') as HTMLSelectElement | null);
  editorFontSizeSelect.value = '18';
  editorFontSizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await waitFor('editor font size applied', () => {
    const editor = document.querySelector<HTMLElement>('.cm-editor');
    if (!editor) return null;
    return getComputedStyle(editor).fontSize === '24px' ? true : null;
  });
  document.getElementById('btn-close-settings-drawer')?.click();

  const editorContent = await waitFor('editor content includes markdown', () => {
    const editorManager = (window as any).__CLEAR_WRITER_EDITOR_MANAGER__;
    if (!editorManager) return null;
    const editorView = editorManager.getEditorView();
    if (!editorView) return null;
    const text = editorView.getValue();
    if (text?.includes('![scene](<images/scene.png>)')) return text;
    return null;
  });

  // Verify manual save shortcut and view state memory
  await click('#btn-new-section');
  const section2Input = await waitFor('section2 input', () => document.querySelector<HTMLInputElement>('.inline-input'));
  section2Input.value = 'StateTest';
  section2Input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  await waitFor('active file StateTest', () => state.current.activeFile === 'sections/StateTest.md' ? true : null);
  const editorManager = (window as any).__CLEAR_WRITER_EDITOR_MANAGER__;
  // Wait for the newly selected file, not merely the previous editor DOM.
  await waitFor('StateTest editor loaded', () => (
    document.querySelector('.cm-content')
    && editorManager.getEditorView()?.getValue() !== undefined
  ) ? true : null);

  // Type something and change cursor
  const stateTestView = editorManager.getEditorView();
  stateTestView.setValue('Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n', false);
  stateTestView.setSelection(15, 20);

  // Manual save
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
  await editorManager.flushCurrentDocument();
  const savedViaShortcut = await waitFor('status saved via shortcut', () => {
    return document.getElementById('editor-status')?.textContent === 'Saved' ? true : null;
  });

  // Test full doc Ctrl+S notice
  await click('#btn-full-doc');
  await waitFor('full document mode for state test', () => state.current.isFullDocMode === true ? true : null);
  await waitFor('full document editor state', () => document.getElementById('editor-container')?.textContent?.includes('Editor disabled in Full Document mode') ? true : null);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
  const fullDocSaveNoticeSeen = await waitFor('full doc save notice', () => Array.from(document.querySelectorAll('#notice-container .notice')).some(node => node.textContent?.includes('Open a section to save changes.')) ? true : null);

  // Switch back
  state.setActiveFile('sections/StateTest.md');
  await waitFor('StateTest active again', () => (
    state.current.activeFile === 'sections/StateTest.md'
    && state.current.isFullDocMode === false
  ) ? true : null);
  
  // Verify state restored
  await waitFor('state test editor restored', () => document.querySelector('.cm-content') ? true : null);
  await waitFor('StateTest selection restored', () => {
    const selection = editorManager.getEditorView()?.getSelection();
    return selection?.from === 15 && selection.to === 20 ? true : null;
  });
  
  const restoredView = editorManager.getEditorView();
  const restoredSelection = restoredView.getSelection();
  const viewStateRestored = restoredSelection.from === 15 && restoredSelection.to === 20;

  // Test search button
  await click('#btn-open-search');
  const searchPanelOpened = await waitFor('search panel visible', () => document.querySelector('.cm-search') ? true : null);

  // Test Draft Recovery
  // Inject a synthetic draft that differs from the durable file content, then
  // reload the section. Because the current editor is already in a saved state,
  // the selection change flush will not overwrite this injected draft before
  // the next load checks for recovery.
  const testDraftContent = 'This is a recovered draft';
  localStorage.setItem(`cw-draft:${state.current.projectRef?.id}:sections/StateTest.md`, JSON.stringify({
    content: testDraftContent,
    updatedAt: Date.now() + 1000
  }));
  
  // Reload the section to trigger draft check
  state.setActiveFile('sections/MyRenamedSection.md');
  await waitFor('switch away', () => state.current.activeFile === 'sections/MyRenamedSection.md' ? true : null);
  
  state.setActiveFile('sections/StateTest.md');
  await waitFor('switch back to state test', () => state.current.activeFile === 'sections/StateTest.md' ? true : null);

  // Wait for confirm dialog
  await waitFor('recovery confirm ok button', () => document.getElementById('btn-confirm-ok'));
  const recoveryConfirmShown = Boolean(document.getElementById('btn-confirm-ok'));
  
  await click('#btn-confirm-ok'); // Restore Draft
  
  const draftRestored = await waitFor('draft content applied', () => {
    const v = editorManager.getEditorView();
    if (v && v.getValue() === testDraftContent) return true;
    return null;
  });

  // Test File Drop Guard
  const cmContent = document.querySelector('.cm-content');
  if (cmContent) {
    const dataTransfer = new DataTransfer();
    // Simulate a File drop
    Object.defineProperty(dataTransfer, 'types', { value: ['Files'] });
    const dropEvent = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer });
    cmContent.dispatchEvent(dropEvent);
  }
  const fileDropNoticeSeen = await waitFor('file drop notice', () => Array.from(document.querySelectorAll('#notice-container .notice')).some(node => node.textContent?.includes('not supported yet')) ? true : null);

  // Test Long-Text Editing (Slice 7.7)
  await click('#btn-new-section');
  const longTextSectionInput = await waitFor('long text section input', () => document.querySelector<HTMLInputElement>('.inline-input'));
  longTextSectionInput.value = 'LongTextSection';
  longTextSectionInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  await waitFor('active file LongTextSection', () => state.current.activeFile === 'sections/LongTextSection.md' ? true : null);
  await waitFor('LongTextSection editor loaded', () => (
    document.querySelector('.cm-content')
    && editorManager.getEditorView()?.getValue() !== undefined
  ) ? true : null);
  const longTextView = editorManager.getEditorView();
  
  // Create a large markdown document body (100 paragraphs)
  const largeBody = Array(100).fill('This is a test paragraph designed to make the document longer. '.repeat(10)).join('\n\n');
  longTextView.setValue(largeBody);
  
  // Edit near the end of the document
  const insertPos = largeBody.length - 50;
  longTextView.setSelection(insertPos);
  longTextView.insertText('=== EDIT NEAR END ===');
  const cursorAfterInsert = longTextView.getSelection().to;
  
  // Verify manual save
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
  await editorManager.flushCurrentDocument();
  const longTextSaved = await waitFor('long text status saved', () => {
    return document.getElementById('editor-status')?.textContent === 'Saved' ? true : null;
  });

  // Switch away and back to verify view state restoration and text preservation
  state.setActiveFile('sections/MyRenamedSection.md');
  await waitForEditor(
    editorManager,
    'sections/MyRenamedSection.md',
    value => !value.includes('=== EDIT NEAR END ==='),
    'control section loaded'
  );
  
  state.setActiveFile('sections/LongTextSection.md');
  await waitForEditor(
    editorManager,
    'sections/LongTextSection.md',
    value => value.includes('=== EDIT NEAR END ==='),
    'LongTextSection loaded again'
  );
  
  await waitFor('LongTextSection restored', () => document.querySelector('.cm-content') ? true : null);
  await waitFor('LongTextSection cursor restored', () => (
    editorManager.getEditorView()?.getSelection().to === cursorAfterInsert
  ) ? true : null);
  
  const restoredLongTextView = editorManager.getEditorView();
  const restoredLongText = restoredLongTextView.getValue();
  const longTextPreserved = restoredLongText.includes('=== EDIT NEAR END ===');
  const restoredCursor = restoredLongTextView.getSelection().to;
  const longTextCursorRestored = restoredCursor === cursorAfterInsert;

  // Verify Page Setup draft/apply/cancel semantics
  await openSettingsTab('page-setup');

  const headerCellSelect = document.getElementById('header-cell-select') as HTMLSelectElement;
  const footerCellSelect = document.getElementById('footer-cell-select') as HTMLSelectElement;
  if (headerCellSelect.options.length !== 3 || footerCellSelect.options.length !== 3) {
    throw new Error('Page setup cell selectors should each expose Left, Middle, and Right cells.');
  }
  if (document.getElementById('header-left-font') || document.getElementById('footer-right-font')) {
    throw new Error('Page setup still renders repeated header/footer cell controls.');
  }
  const headerContent = document.getElementById('header-selected-content') as HTMLInputElement;
  headerCellSelect.value = 'left';
  headerCellSelect.dispatchEvent(new Event('change', { bubbles: true }));
  headerContent.value = 'Draft left header';
  headerCellSelect.value = 'right';
  headerCellSelect.dispatchEvent(new Event('change', { bubbles: true }));
  headerContent.value = 'Draft right header';
  headerCellSelect.value = 'left';
  headerCellSelect.dispatchEvent(new Event('change', { bubbles: true }));
  if (headerContent.value !== 'Draft left header') {
    throw new Error(`Header cell draft was not restored after switching. Got: ${headerContent.value}`);
  }
  
  const marginTopInput = document.getElementById('margin-top') as HTMLInputElement;
  const originalMarginTop = marginTopInput.value;
  
  // Change value in draft
  marginTopInput.value = '99';
  marginTopInput.dispatchEvent(new Event('input', { bubbles: true }));
  
  // Close page setup WITHOUT applying
  await click('#btn-close-settings-drawer');
  await waitFor('page setup drawer closed', () => document.getElementById('settings-drawer')?.classList.contains('hidden') ? true : null);
  
  // Re-open Page Setup
  await openSettingsTab('page-setup');
  
  const currentMarginTop = (document.getElementById('margin-top') as HTMLInputElement).value;
  if (currentMarginTop !== originalMarginTop) {
    throw new Error(`Draft value not discarded on close. Got: ${currentMarginTop}, Expected: ${originalMarginTop}`);
  }
  const pageSetupDraftDiscarded = currentMarginTop === originalMarginTop;
  
  // Change value and click apply
  const newMarginTopVal = '45';
  (document.getElementById('margin-top') as HTMLInputElement).value = newMarginTopVal;
  headerCellSelect.value = 'left';
  headerCellSelect.dispatchEvent(new Event('change', { bubbles: true }));
  headerContent.value = 'Saved left header';
  headerCellSelect.value = 'right';
  headerCellSelect.dispatchEvent(new Event('change', { bubbles: true }));
  headerContent.value = 'Saved right header';
  await click('#btn-apply-page-setup');
  await waitFor('page setup persisted after apply', () => String(state.current.pageSetup.marginTop) === newMarginTopVal ? true : null);
  const pageSetupApplyKeepsDrawerOpen = !document.getElementById('settings-drawer')?.classList.contains('hidden')
    && !document.getElementById('settings-panel-page-setup')?.classList.contains('hidden');
  if (!pageSetupApplyKeepsDrawerOpen) {
    throw new Error('Page Setup Apply should keep the drawer open.');
  }
  
  if (String(state.current.pageSetup.marginTop) !== newMarginTopVal) {
    throw new Error(`Apply did not persist the page setup change. Got: ${state.current.pageSetup.marginTop}, Expected: ${newMarginTopVal}`);
  }
  const pageSetupApplyPersisted = String(state.current.pageSetup.marginTop) === newMarginTopVal;
  const pageSetupHeaderCellsPersisted = state.current.pageSetup.header.left.content === 'Saved left header'
    && state.current.pageSetup.header.right.content === 'Saved right header';
  if (!pageSetupHeaderCellsPersisted) {
    throw new Error('Page setup did not retain values for the selected header cells.');
  }
  await click('#btn-close-settings-drawer');

  // Verify custom confirmation dialog for section deletion
  await click('.tree-row[data-path="sections/MyRenamedSection.md"] .btn-delete');
  await waitFor('confirmation cancel button', () => document.getElementById('btn-confirm-cancel'));
  const deleteConfirmShownOnCancel = Boolean(document.getElementById('btn-confirm-cancel')) && Boolean(document.getElementById('btn-confirm-ok'));
  await click('#btn-confirm-cancel');
  
  if (!state.current.sections.some(s => s.path === 'sections/MyRenamedSection.md')) {
    throw new Error('Section was deleted even after clicking cancel on confirm dialog.');
  }
  const deleteCancelPreservedSection = state.current.sections.some(s => s.path === 'sections/MyRenamedSection.md');
  
  await click('.tree-row[data-path="sections/MyRenamedSection.md"] .btn-delete');
  await waitFor('confirmation ok button', () => document.getElementById('btn-confirm-ok'));
  const deleteConfirmShownOnConfirm = Boolean(document.getElementById('btn-confirm-ok'));
  await click('#btn-confirm-ok');
  
  await waitFor('section deleted', () => !state.current.sections.some(s => s.path === 'sections/MyRenamedSection.md') ? true : null);
  const deleteConfirmedRemovedSection = !state.current.sections.some(s => s.path === 'sections/MyRenamedSection.md');

  // Test Document Outline (Slice 9.3)
  await click('#btn-new-section');
  const outlineSec1Input = await waitFor('outline section 1 input', () => document.querySelector<HTMLInputElement>('.inline-input'));
  outlineSec1Input.value = 'Outline1';
  outlineSec1Input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  await waitFor('Outline1 editor loaded', () => {
    return (window as any).__CLEAR_WRITER_EDITOR_MANAGER__?.currentFilePath === 'sections/Outline1.md' ? true : null;
  });
  editorManager.getEditorView().setValue('# Head 1\n## Sub 1', true);
  await editorManager.flushCurrentDocument();
  await waitFor('Outline1 saved', () => document.getElementById('editor-status')?.textContent === 'Saved' ? true : null);

  await click('#btn-new-section');
  const outlineSec2Input = await waitFor('outline section 2 input', () => document.querySelector<HTMLInputElement>('.inline-input'));
  outlineSec2Input.value = 'Outline2';
  outlineSec2Input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  await waitFor('Outline2 editor loaded', () => {
    return (window as any).__CLEAR_WRITER_EDITOR_MANAGER__?.currentFilePath === 'sections/Outline2.md' ? true : null;
  });
  editorManager.getEditorView().setValue('# Head 2\n## Sub 2', true);
  await editorManager.flushCurrentDocument();
  await waitFor('Outline2 saved', () => document.getElementById('editor-status')?.textContent === 'Saved' ? true : null);

  // Open outline drawer
  await click('#btn-open-document-outline');
  await waitFor('outline drawer open', () => !document.getElementById('document-outline-drawer')?.classList.contains('hidden') ? true : null);
  await waitFor('outline built', () => {
    const headings = document.querySelectorAll('#document-outline-content .document-outline-heading');
    if (headings.length >= 4) return true;
    (window as any).__HEADINGS_COUNT__ = headings.length;
    (window as any).__HEADINGS_HTML__ = document.getElementById('document-outline-content')?.innerHTML;
    return null;
  }, 5000);
  
  const outlineSections = Array.from(document.querySelectorAll('#document-outline-content .document-outline-section-name')).map(node => node.textContent?.trim() || '');
  const outlineHeadings = Array.from(document.querySelectorAll('#document-outline-content .document-outline-heading')).map(node => node.textContent?.trim() || '');

  // Click "Sub 1" heading
  const sub1Heading = Array.from(document.querySelectorAll('#document-outline-content .document-outline-heading')).find(node => node.textContent?.trim() === 'Sub 1') as HTMLElement;
  sub1Heading.click();

  // Wait for section switch
  await waitFor('active file switched to Outline1', () => state.current.activeFile === 'sections/Outline1.md' ? true : null);
  await waitFor('Outline1 loaded again', () => document.querySelector('.cm-content') && editorManager.getEditorView().getValue().includes('Sub 1') ? true : null);
  const outlineNavigationSuccessful = state.current.activeFile === 'sections/Outline1.md';

  // Rename a section and verify outline update
  await click('.tree-row[data-path="sections/Outline2.md"] .btn-rename');
  const outlineRenameInput = await waitFor('outline rename input', () => document.querySelector<HTMLInputElement>('.inline-input'));
  outlineRenameInput.value = 'Outline2Renamed';
  outlineRenameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  await waitFor('renamed outline file', () => state.current.sections.some(s => s.path === 'sections/Outline2Renamed.md') ? true : null);
  await waitFor('outline updated after rename', () => Array.from(document.querySelectorAll('#document-outline-content .document-outline-section-name')).some(node => node.textContent?.trim() === 'Outline2Renamed.md') ? true : null);
  const outlineRenamedSectionPresent = Array.from(document.querySelectorAll('#document-outline-content .document-outline-section-name')).some(node => node.textContent?.trim() === 'Outline2Renamed.md');

  // Check stats
  const outlineProjectStatsBeforeSave = document.getElementById('project-statistics-summary')?.textContent || '';
  const outlineSectionStats = document.getElementById('editor-section-stats')?.textContent || '';
  editorManager.getEditorView().insertText(' extra');
  await editorManager.flushCurrentDocument();
  await waitFor('outline project stats refreshed after save', () => {
    const value = document.getElementById('project-statistics-summary')?.textContent || '';
    return value !== outlineProjectStatsBeforeSave && value.includes('Project Totals:') ? value : null;
  });
  const outlineProjectStats = document.getElementById('project-statistics-summary')?.textContent || '';
  const outlineProjectStatsRefreshedAfterSave = outlineProjectStats !== outlineProjectStatsBeforeSave;

  // Test Project Search
  await click('#btn-open-project-search');
  await waitFor('search drawer open', () => !document.getElementById('project-search-drawer')?.classList.contains('hidden') ? true : null);
  
  const searchInput = document.getElementById('project-search-input') as HTMLInputElement;
  searchInput.value = 'Head';
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));

  // Wait for results
  const firstSearchResult = await waitFor('search results populated', () => {
    const results = document.querySelectorAll('#project-search-results .project-search-item');
    if (results.length > 0) return results[0] as HTMLElement;
    return null;
  });
  const searchResultCount = document.querySelectorAll('#project-search-results .project-search-item').length;

  await click('.tree-row[data-path="sections/Outline1.md"] .btn-delete');
  await waitFor('search delete confirmation', () => document.getElementById('btn-confirm-ok'));
  await click('#btn-confirm-ok');
  await waitFor('search results refreshed after delete', () => !Array.from(document.querySelectorAll('#project-search-results .project-search-item')).some(node => node.textContent?.includes('Outline1.md')) ? true : null);
  const searchDeletedResultCleared = !Array.from(document.querySelectorAll('#project-search-results .project-search-item')).some(node => node.textContent?.includes('Outline1.md'));

  searchInput.value = 'Head 2';
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  const survivingSearchResult = await waitFor('surviving search result after delete', () => {
    const results = document.querySelectorAll('#project-search-results .project-search-item');
    if (results.length > 0) return results[0] as HTMLElement;
    return null;
  });
  survivingSearchResult.click();
  
  // Wait for section switch
  await waitFor('active file switched to Outline2Renamed', () => state.current.activeFile === 'sections/Outline2Renamed.md' ? true : null);
  await waitFor('Outline2Renamed loaded', () => document.querySelector('.cm-content') && editorManager.getEditorView().getValue().includes('Head 2') ? true : null);
  
  const searchNavigationSuccessful = state.current.activeFile === 'sections/Outline2Renamed.md';
  
  await click('#btn-close-project');
  await waitFor('project closed after outline', () => state.current.projectRef === null ? true : null);
  await waitFor('outline cleared after close', () => document.getElementById('document-outline-empty')?.classList.contains('hidden') === false ? true : null);
  const outlineClearedAfterClose = document.getElementById('document-outline-empty')?.classList.contains('hidden') === false
    && document.getElementById('document-outline-content')?.classList.contains('hidden') === true;

  // Close outline
  await click('#document-outline-drawer .drawer-close-button');

  const exportPdfButton = document.getElementById('btn-export-pdf');
  const exportDocxButton = document.getElementById('btn-export-docx');
  const exportButtonsDisabled = Boolean(
    exportPdfButton?.hasAttribute('disabled')
      && exportDocxButton?.hasAttribute('disabled')
  );
  const exportPdfLabel = exportPdfButton?.getAttribute('aria-label') || '';
  const exportDocxLabel = exportDocxButton?.getAttribute('aria-label') || '';

  window.__HARNESS_RESULT__ = {
    ok: true,
    projectKind,
    projectNameShown,
    workspaceChipShown,
    projectNameAfterClose,
    workspaceChipHiddenAfterClose,
    reopenedProjectName,
    reopenedWorkspaceChip,
    imagePaths: state.current.images.map(image => image.path),
    imageListItems: imageListItemsBeforeInsert,
    glyphValues: Array.from(glyphOption.options).map(option => option.value),
    editorContent,
    insertGuardNoticeSeen: Array.from(document.querySelectorAll('#notice-container .notice')).some(node => node.textContent?.includes('Open a section to insert an image.')),
    editorDebugText: (window as any).__CLEAR_WRITER_DEBUG_TEXT__,
    alerts,
    statusTextInFullDoc,
    statusDotClassInFullDoc,
    statusTextAfterLoad,
    statusDotClassAfterLoad,
    statusTextAfterInsert,
    statusDotClassAfterInsert,
    statusTextAfterSave,
    statusDotClassAfterSave,
    pageSetupDraftDiscarded,
    pageSetupApplyPersisted,
    pageSetupApplyKeepsDrawerOpen,
    tocApplyKeepsDrawerOpen,
    listApplyKeepsDrawerOpen,
    pageSetupHeaderCellsPersisted,
    deleteConfirmShownOnCancel,
    deleteCancelPreservedSection,
    deleteConfirmShownOnConfirm,
    deleteConfirmedRemovedSection,
    savedViaShortcut,
    fullDocSaveNoticeSeen,
    viewStateRestored,
    searchPanelOpened,
    recoveryConfirmShown,
    draftRestored,
    fileDropNoticeSeen,
    longTextSaved,
    longTextPreserved,
    longTextCursorRestored,
    exportButtonsDisabled,
    exportPdfLabel,
    exportDocxLabel,
    outlineSections,
    outlineHeadings,
    outlineNavigationSuccessful,
    outlineRenamedSectionPresent,
    outlineProjectStatsRefreshedAfterSave,
    outlineClearedAfterClose,
    outlineProjectStats,
    outlineSectionStats,
    searchResultCount,
    searchDeletedResultCleared,
    searchNavigationSuccessful,
    debugOutlineHtml: (window as any).__HEADINGS_HTML__,
    debugOutlineCount: (window as any).__HEADINGS_COUNT__
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = {
    ok: false,
    error: error instanceof Error ? error.stack : String(error),
    editorDebugText: (window as any).__CLEAR_WRITER_DEBUG_TEXT__,
    alerts,
    debugOutlineHtml: (window as any).__HEADINGS_HTML__,
    debugOutlineCount: (window as any).__HEADINGS_COUNT__
  };
}).finally(() => {
  HTMLInputElement.prototype.click = originalInputClick;
});
