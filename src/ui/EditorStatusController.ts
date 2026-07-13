export type EditorSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** Owns the editor status badge and its accessibility state. */
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
}
