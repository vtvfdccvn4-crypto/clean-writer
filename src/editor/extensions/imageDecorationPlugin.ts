import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { parseEditorMarkdownImages, type EditorMarkdownImage } from '../markdown/parseMarkdownImage';
import { updateImageAttributes } from '../markdown/updateImageAttributes';
import { ImageWidget, type ImageWidgetActions } from '../widgets/ImageWidget';

export interface ImageEditorActions {
  onImageFile(file: File): Promise<string | null>;
  resolveImageSource(source: string): Promise<string>;
}

function replaceImage(view: EditorView, image: EditorMarkdownImage, content: string): void {
  view.dispatch({ changes: { from: image.start, to: image.end, insert: content }, selection: { anchor: image.start + content.length }, scrollIntoView: true });
  view.focus();
}

function makeActions(view: EditorView, actions: ImageEditorActions): ImageWidgetActions {
  return {
    resolveSource: actions.resolveImageSource,
    copyImage: async image => {
      const source = await actions.resolveImageSource(image.source);
      try {
        const blob = await fetch(source).then(response => {
          if (!response.ok) throw new Error('Unable to copy image');
          return response.blob();
        });
        if ('ClipboardItem' in window && navigator.clipboard?.write) {
          await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
          return;
        }
      } catch { /* Fall back to portable Markdown when binary clipboard access is unavailable. */ }
      await navigator.clipboard?.writeText(`![${image.alt}](<${image.source}>)`);
    },
    deleteImage: image => replaceImage(view, image, ''),
    replaceImage: async image => {
      const picker = document.createElement('input');
      picker.type = 'file'; picker.accept = 'image/*';
      picker.addEventListener('change', async () => {
        const file = picker.files?.[0];
        if (!file) return;
        const markdown = await actions.onImageFile(file);
        if (markdown) replaceImage(view, image, markdown);
      }, { once: true });
      picker.click();
    },
    resizeImage: (image, width) => replaceImage(
      view,
      image,
      view.state.doc.sliceString(image.start, image.end - image.attributes.length) + updateImageAttributes(image, { width })
    )
  };
}

function buildDecorations(view: EditorView, actions: ImageEditorActions) {
  const builder = new RangeSetBuilder<Decoration>();
  const widgetActions = makeActions(view, actions);
  for (const image of parseEditorMarkdownImages(view.state.doc.toString())) {
    builder.add(image.start, image.end, Decoration.replace({ widget: new ImageWidget(image, widgetActions), block: false }));
  }
  return builder.finish();
}

/** Renders Markdown image syntax as interactive, editable inline image widgets. */
export function imageDecorationPlugin(actions: ImageEditorActions) {
  return ViewPlugin.fromClass(class {
    decorations;
    constructor(view: EditorView) { this.decorations = buildDecorations(view, actions); }
    update(update: ViewUpdate) { if (update.docChanged) this.decorations = buildDecorations(update.view, actions); }
  }, { decorations: value => value.decorations });
}
