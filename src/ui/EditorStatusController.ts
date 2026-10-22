import { extractWritingStatistics } from '../editor/writing-statistics';
import type { EditorCaretStatus } from '../editor/createEditor';

export type EditorSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** Owns the editor status badge, its accessibility state, and the workspace status bar. */
export class EditorStatusController {
  private readonly element: HTMLElement | null;
  private readonly dot: HTMLElement | null;
  private status: EditorSaveStatus = 'idle';

  constructor(
    element: HTMLElement | null = document.getElementById('editor-status'),
    dot: HTMLElement | null = document.getElementById('editor-status-dot')
  ) {
    this.element = element;
    this.dot = dot;
  }

  setStatus(status: EditorSaveStatus): void {
    this.status = status;
    if (!this.element) return;
    const labels: Record<EditorSaveStatus, string> = {
      idle: 'Ready',
      dirty: 'Unsaved changes',
      saving: 'Saving...',
      saved: 'Saved',
      error: 'Save failed'
    };
    this.element.textContent = labels[status];
    if (this.dot) this.dot.className = `status-dot ${status}`;
    document.body.dataset.editorSaveState = status;
    document.querySelectorAll<HTMLElement>('.tree-row.active .section-save-indicator').forEach(indicator => {
      indicator.dataset.state = status;
      indicator.title = labels[status];
    });
    window.dispatchEvent(new CustomEvent('clear-writer-save-state', { detail: { state: status } }));
  }

  getStatus(): EditorSaveStatus {
    return this.status;
  }

  setActiveSection(filename: string | null, customLabel?: string): void {
    const labelEl = document.getElementById('active-section-label');
    if (!labelEl) return;
    if (filename === null) {
      labelEl.textContent = '';
      labelEl.title = '';
      labelEl.hidden = true;
      this.setSectionStats(null);
    } else {
      const text = customLabel ?? (filename.split('/').pop() || filename);
      labelEl.textContent = text;
      labelEl.title = filename;
      labelEl.hidden = false;
    }
  }

  setSectionStats(markdown: string | null): void {
    const wordCount = document.getElementById('workspace-word-count');
    const lineCount = document.getElementById('workspace-line-count');
    const charCount = document.getElementById('workspace-char-count');
    const readingTime = document.getElementById('workspace-reading-time');
    if (!wordCount || !lineCount || !charCount || !readingTime) return;

    if (markdown === null) {
      wordCount.textContent = '0 words';
      lineCount.textContent = '0 lines';
      charCount.textContent = '0 chars';
      readingTime.textContent = '';
      readingTime.hidden = true;
      this.setCaretStatus(null);
      return;
    }

    const stats = extractWritingStatistics(markdown);
    wordCount.textContent = `${stats.words.toLocaleString()} words`;
    lineCount.textContent = `${markdown ? markdown.split(/\r?\n/).length : 0} lines`;
    charCount.textContent = `${stats.charactersWithSpaces.toLocaleString()} chars`;
    readingTime.hidden = stats.estimatedReadingTimeMinutes <= 0;
    readingTime.textContent = stats.estimatedReadingTimeMinutes > 0
      ? `~${stats.estimatedReadingTimeMinutes} min read`
      : '';
  }

  /** Caret and selection move on their own cadence, so they own their own spans. */
  setCaretStatus(status: EditorCaretStatus | null): void {
    const caret = document.getElementById('workspace-caret-position');
    const selection = document.getElementById('workspace-selection-count');
    if (!caret || !selection) return;

    if (status === null) {
      caret.textContent = 'Line 1, Column 1';
      selection.hidden = true;
      selection.textContent = '';
      return;
    }

    caret.textContent = `Line ${status.line}, Column ${status.column}`;
    selection.hidden = status.selectedCharacters === 0;
    selection.textContent = status.selectedCharacters > 0
      ? `${status.selectedCharacters.toLocaleString()} selected`
      : '';
  }
}
