import type { WorkspaceRef } from '../types';
import type { MarkdownEditor } from '../editor';

type ViewState = { selectionFrom: number; selectionTo: number; scrollTop: number };

/** Owns the live CodeMirror instance, document identity, and per-document view state. */
export class DocumentSessionController {
  private editor: MarkdownEditor | null = null;
  private filePath: string | null = null;
  private projectRef: WorkspaceRef | null = null;
  private readonly viewStates: Record<string, ViewState> = {};
  private pendingFocusLine: { path: string; line: number } | null = null;

  get currentEditor(): MarkdownEditor | null {
    return this.editor;
  }

  get currentFilePath(): string | null {
    return this.filePath;
  }

  destroyActive(): void {
    if (this.editor && this.filePath && this.projectRef) {
      const key = `${this.projectRef.kind}:${this.projectRef.id}:${this.filePath}`;
      const selection = this.editor.getSelection();
      this.viewStates[key] = {
        selectionFrom: selection.from,
        selectionTo: selection.to,
        scrollTop: this.editor.view.scrollDOM.scrollTop
      };
    }
    this.editor?.destroy();
    this.editor = null;
    this.filePath = null;
    this.projectRef = null;
  }

  activate(projectRef: WorkspaceRef, filePath: string, editor: MarkdownEditor): void {
    this.editor = editor;
    this.filePath = filePath;
    this.projectRef = projectRef;
  }

  clearPendingFocus(): void {
    this.pendingFocusLine = null;
  }

  restoreViewState(projectRef: WorkspaceRef | null, filePath: string): void {
    if (!this.editor || !projectRef) return;
    const saved = this.viewStates[`${projectRef.kind}:${projectRef.id}:${filePath}`];
    if (!saved) {
      this.editor.setSelection(0);
      return;
    }
    const documentLength = this.editor.getValue().length;
    this.editor.setSelection(
      Math.min(Math.max(0, saved.selectionFrom), documentLength),
      Math.min(Math.max(0, saved.selectionTo), documentLength)
    );
    requestAnimationFrame(() => {
      if (this.editor?.view.scrollDOM) this.editor.view.scrollDOM.scrollTop = saved.scrollTop;
    });
  }

  focusLine(targetPath: string | null, line: number): void {
    if (!targetPath || !this.editor || this.filePath !== targetPath) {
      if (targetPath) this.pendingFocusLine = { path: targetPath, line };
      return;
    }
    const documentLine = this.editor.view.state.doc.line(Math.min(Math.max(1, line), this.editor.view.state.doc.lines));
    this.editor.setSelection(documentLine.from);
    this.editor.focus();
  }

  applyPendingFocus(filePath: string): void {
    const pending = this.pendingFocusLine;
    if (!pending || pending.path !== filePath) return;
    this.pendingFocusLine = null;
    this.focusLine(filePath, pending.line);
  }
}
