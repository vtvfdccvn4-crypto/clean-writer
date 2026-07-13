import type { MarkdownCommand } from '../editor/markdown-commands';
import type { EditorManager } from '../ui/editor-manager';

/** Registers editor-local controls that operate on the active editor view. */
export function setupEditorControls(editorManager: EditorManager): void {
  document.querySelectorAll<HTMLButtonElement>('[data-markdown-command]').forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      const command = button.dataset.markdownCommand;
      if (command) editorManager.applyMarkdownCommand(command as MarkdownCommand);
    });
  });

  document.getElementById('btn-open-search')?.addEventListener('click', () => {
    editorManager.getEditorView()?.openSearchPanel();
  });
}
