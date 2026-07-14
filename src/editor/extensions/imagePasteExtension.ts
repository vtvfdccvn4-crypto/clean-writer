import { EditorView } from '@codemirror/view';

export interface PastedImageResult {
  markdown: string;
  afterInsert?: () => void;
}

/** Imports a clipboard image without affecting ordinary text paste behavior. */
export function imagePasteExtension(onImageFile: (file: File) => Promise<PastedImageResult | null>) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const file = Array.from(event.clipboardData?.files ?? []).find(candidate => candidate.type.startsWith('image/'));
      if (!file) return false;

      event.preventDefault();
      void onImageFile(file).then(result => {
        if (!result) return;
        const selection = view.state.selection.main;
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: result.markdown },
          selection: { anchor: selection.from + result.markdown.length },
          scrollIntoView: true
        });
        view.focus();
        result.afterInsert?.();
      }).catch(error => console.error('[CodeMirror] Failed to import pasted image.', error));
      return true;
    }
  });
}
