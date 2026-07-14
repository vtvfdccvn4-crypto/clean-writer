import type { Extension } from '@codemirror/state';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

import type { CustomBlockStyle, CustomStyle, EditorSetup, SpecialHeadingDefinition } from '../../types';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toStyleText(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join('; ');
}

type TextStyle = Pick<CustomStyle, 'fontFamily' | 'fontSize' | 'color' | 'isBold' | 'isItalic'>
  & Partial<Pick<CustomBlockStyle, 'lineHeight'>>;

function textStyleAttributes(style: TextStyle): { style: string } {
  return {
    style: toStyleText([
      style.fontFamily ? `font-family: ${style.fontFamily}` : undefined,
      style.fontSize ? `font-size: ${style.fontSize}pt` : undefined,
      style.color ? `color: ${style.color}` : undefined,
      style.isBold ? 'font-weight: bold' : undefined,
      style.isItalic ? 'font-style: italic' : undefined,
      style.lineHeight ? `line-height: ${style.lineHeight}` : undefined
    ])
  };
}

function headingStyleAttributes(heading: SpecialHeadingDefinition, editorSetup: EditorSetup): { style: string } {
  return {
    style: toStyleText([
      heading.color ? `color: ${heading.color}` : undefined,
      editorSetup.headingBold ? 'font-weight: bold' : 'font-weight: normal'
    ])
  };
}

function buildDecorations(
  view: EditorView,
  styles: readonly CustomStyle[],
  blockStyles: readonly CustomBlockStyle[],
  specialHeadings: readonly SpecialHeadingDefinition[],
  editorSetup: EditorSetup
): DecorationSet {
  const ranges: Array<{ from: number; to: number; decoration: Decoration }> = [];
  const text = view.state.doc.toString();

  for (const style of styles) {
    if (!style.openingPair || !style.closingPair) continue;
    const pattern = new RegExp(`${escapeRegExp(style.openingPair)}(.*?)${escapeRegExp(style.closingPair)}`, 'g');
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text))) {
      const from = match.index + style.openingPair.length;
      const to = from + match[1].length;
      if (to <= from) continue;
      ranges.push({
        from,
        to,
        decoration: Decoration.mark({
          attributes: textStyleAttributes(style)
        })
      });
    }
  }

  for (const style of blockStyles) {
    if (!style.prefix) continue;
    for (let lineNo = 1; lineNo <= view.state.doc.lines; lineNo += 1) {
      const line = view.state.doc.line(lineNo);
      if (!line.text.startsWith(style.prefix)) continue;
      const from = line.from;
      const to = line.to;
      if (to <= from) continue;
      ranges.push({
        from,
        to,
        decoration: Decoration.mark({
          attributes: textStyleAttributes(style)
        })
      });
    }
  }

  for (const heading of specialHeadings) {
    if (!heading.directive) continue;
    for (let lineNo = 1; lineNo <= view.state.doc.lines; lineNo += 1) {
      const line = view.state.doc.line(lineNo);
      if (!line.text.startsWith(heading.directive)) continue;
      const from = line.from;
      const to = line.to;
      if (to <= from) continue;
      ranges.push({
        from,
        to,
        decoration: Decoration.mark({
          attributes: headingStyleAttributes(heading, editorSetup)
        })
      });
    }
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of ranges) {
    builder.add(range.from, range.to, range.decoration);
  }
  return builder.finish();
}

class CustomStyleHighlighting {
  decorations: DecorationSet;
  private styles: readonly CustomStyle[];
  private blockStyles: readonly CustomBlockStyle[];
  private specialHeadings: readonly SpecialHeadingDefinition[];
  private editorSetup: EditorSetup;

  constructor(
    view: EditorView,
    styles: readonly CustomStyle[],
    blockStyles: readonly CustomBlockStyle[],
    specialHeadings: readonly SpecialHeadingDefinition[],
    editorSetup: EditorSetup
  ) {
    this.styles = styles;
    this.blockStyles = blockStyles;
    this.specialHeadings = specialHeadings;
    this.editorSetup = editorSetup;
    this.decorations = buildDecorations(view, styles, blockStyles, specialHeadings, editorSetup);
  }

  update(update: ViewUpdate) {
    if (update.docChanged) {
      this.decorations = buildDecorations(update.view, this.styles, this.blockStyles, this.specialHeadings, this.editorSetup);
    }
  }
}

export function customStyleHighlightingExtension(
  styles: readonly CustomStyle[],
  blockStyles: readonly CustomBlockStyle[],
  specialHeadings: readonly SpecialHeadingDefinition[],
  editorSetup: EditorSetup
): Extension {
  return ViewPlugin.fromClass(class extends CustomStyleHighlighting {
    constructor(view: EditorView) {
      super(view, styles, blockStyles, specialHeadings, editorSetup);
    }
  }, {
    decorations: plugin => plugin.decorations
  });
}
