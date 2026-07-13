import type { MarkdownEditor } from '../editor';
import type { EditorSaveStatus } from './EditorStatusController';

export interface EditorSaveDependencies {
  getEditor(): MarkdownEditor | null;
  updateStatus(status: EditorSaveStatus): void;
  reportError(error: unknown): void;
  reportNavigationBlocked(): void;
}

/** Coordinates durable editor flushes without owning editor or preview state. */
export class EditorSaveCoordinator {
  private saveInFlight: Promise<void> | null = null;
  private readonly dependencies: EditorSaveDependencies;

  constructor(dependencies: EditorSaveDependencies) {
    this.dependencies = dependencies;
  }

  hasUnsavedChanges(): boolean {
    return this.dependencies.getEditor()?.hasUnsavedChanges() ?? false;
  }

  isSaveInFlight(): boolean {
    return this.saveInFlight !== null;
  }

  async flushCurrentDocument(): Promise<void> {
    if (this.saveInFlight) return this.saveInFlight;
    const editor = this.dependencies.getEditor();
    if (!editor || !editor.hasUnsavedChanges()) return;

    this.dependencies.updateStatus('saving');
    this.saveInFlight = (async () => {
      try {
        await editor.flush();
        this.dependencies.updateStatus('saved');
      } catch (error) {
        this.dependencies.updateStatus('error');
        this.dependencies.reportError(error);
        throw error;
      } finally {
        this.saveInFlight = null;
      }
    })();
    return this.saveInFlight;
  }

  async prepareForNavigation(): Promise<boolean> {
    try {
      await this.flushCurrentDocument();
      return true;
    } catch {
      this.dependencies.reportNavigationBlocked();
      return false;
    }
  }
}
