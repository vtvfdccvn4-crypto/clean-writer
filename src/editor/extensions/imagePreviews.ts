import { Text, type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

import { imageWidthAttribute, parseEditorMarkdownImages, type EditorMarkdownImage } from '../markdown/parseMarkdownImage';
import { ImagePreviewWidget } from '../widgets/ImagePreviewWidget';

export type EditorImageSourceResolver = (source: string) => Promise<string>;
export type EditorImageAlignment = 'left' | 'center' | 'right';
export type EditImageWidth = (image: EditorMarkdownImage) => void;

function imagePreviewDecorationRanges(
  document: Text,
  resolveSource: EditorImageSourceResolver,
  alignment: EditorImageAlignment,
  onEditWidth: EditImageWidth,
  offset = 0
): readonly Range<Decoration>[] {
  const decorations: Range<Decoration>[] = [];
  for (const image of parseEditorMarkdownImages(document.toString())) {
    if (!image.isBlock) continue;
    const line = document.lineAt(image.start);
    decorations.push(Decoration.line({ class: `cm-image-preview-align-${alignment}` }).range(offset + line.from));
    decorations.push(Decoration.mark({ class: 'cm-image-preview-source' }).range(offset + image.start, offset + image.end));
    decorations.push(Decoration.widget({
      side: 1,
      widget: new ImagePreviewWidget(image.alt, image.source, imageWidthAttribute(image.attributes), resolveSource, () => onEditWidth(image))
    }).range(offset + image.end));
  }
  return decorations;
}

function imagePreviewDecorations(
  document: Text,
  resolveSource: EditorImageSourceResolver,
  alignment: EditorImageAlignment,
  onEditWidth: EditImageWidth
): DecorationSet {
  return Decoration.set(imagePreviewDecorationRanges(document, resolveSource, alignment, onEditWidth), true);
}

interface ChangedLineRange {
  from: number;
  to: number;
}

function changedLineRanges(update: ViewUpdate): ChangedLineRange[] {
  const ranges: ChangedLineRange[] = [];
  const document = update.state.doc;
  update.changes.iterChanges((_fromA, _toA, fromB, toB) => {
    const start = document.lineAt(Math.max(0, fromB - 1)).from;
    const end = document.lineAt(Math.min(document.length, toB + 1)).to;
    const previous = ranges[ranges.length - 1];
    if (previous && start <= previous.to) {
      previous.to = Math.max(previous.to, end);
    } else {
      ranges.push({ from: start, to: end });
    }
  });
  return ranges;
}

/** Shows a bounded preview beside standalone Markdown image syntax without replacing it. */
export function imagePreviewExtension(resolveSource: EditorImageSourceResolver, alignment: EditorImageAlignment, onEditWidth: EditImageWidth) {
  return ViewPlugin.fromClass(class {
    decorations;

    constructor(view: EditorView) {
      this.decorations = imagePreviewDecorations(view.state.doc, resolveSource, alignment, onEditWidth);
    }

    update(update: ViewUpdate): void {
      if (!update.docChanged) return;

      let decorations = this.decorations.map(update.changes);
      for (const range of changedLineRanges(update)) {
        decorations = decorations.update({
          filterFrom: range.from,
          filterTo: range.to,
          filter: () => false,
          add: imagePreviewDecorationRanges(
            Text.of(update.state.doc.sliceString(range.from, range.to).split('\n')),
            resolveSource,
            alignment,
            onEditWidth,
            range.from
          )
        });
      }
      this.decorations = decorations;
    }
  }, { decorations: value => value.decorations });
}
