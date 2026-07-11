import { state } from '../state';
import type { EditorManager } from './editor-manager';
import { showNotice } from './components/Notice';

export function initWritingWorkflow(editorManager: EditorManager): () => void {
  const isEditableTarget = (target: EventTarget | null): boolean => {
    const element = target instanceof HTMLElement ? target : null;
    if (!element) return false;
    if (element.closest('.cm-editor')) return false;
    return Boolean(element.matches('input, textarea, select, [contenteditable="true"]'));
  };

  const save = async () => {
    if (!state.current.isFullDocMode && state.current.activeFile) {
      try { await editorManager.flushCurrentDocument(); } catch (error) { console.error('Failed to save document:', error); }
    } else {
      showNotice('Open a section to save changes.', 'info');
    }
  };

  const navigateSection = async (direction: -1 | 1) => {
    const files = state.current.sections.filter(section => !section.isDir);
    if (!files.length) return;
    const current = state.current.activeFile;
    const currentIndex = current ? files.findIndex(section => section.path === current) : -1;
    const nextIndex = currentIndex < 0
      ? direction > 0 ? 0 : files.length - 1
      : (currentIndex + direction + files.length) % files.length;
    if (files[nextIndex].path === current) return;
    if (!await editorManager.prepareForNavigation()) return;
    state.setActiveFile(files[nextIndex].path);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (isEditableTarget(event.target) && !(modifier && key === 's')) return;

    if (modifier && key === 's') {
      event.preventDefault();
      void save();
    } else if (modifier && event.shiftKey && key === 'f') {
      event.preventDefault();
      document.getElementById('btn-open-project-search')?.click();
    } else if (modifier && event.shiftKey && key === 'o') {
      event.preventDefault();
      document.getElementById('btn-open-document-outline')?.click();
    } else if (modifier && event.shiftKey && key === 'r') {
      event.preventDefault();
      document.getElementById('btn-open-project-review')?.click();
    } else if (event.altKey && event.key === 'ArrowUp') {
      event.preventDefault();
      void navigateSection(-1);
    } else if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      void navigateSection(1);
    }
  };

  window.addEventListener('keydown', onKeyDown);

  return () => window.removeEventListener('keydown', onKeyDown);
}
