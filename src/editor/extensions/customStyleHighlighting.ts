import type { Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

import type { CustomBlockStyle, CustomStyle, EditorSetup, SpecialHeadingDefinition } from '../../types';
import { escapeRegExp } from '../../utils/regex';
import {
  CUSTOM_BLOCK_EDITOR_LINE_CLASS,
  CUSTOM_BLOCK_SPACE_BEFORE_PROPERTY,
  customBlockEditorLineAttributes
} from './customBlockEditorPresentation';

function toStyleText(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join('; ');
}

type TextStyle = Pick<CustomStyle, 'color' | 'isBold' | 'isItalic'>
  & Partial<Pick<CustomBlockStyle, 'lineHeight'>>;

function textStyleAttributes(style: TextStyle): { style: string } {
  return {
    style: toStyleText([
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
  const blockStylePrefixes = indexPrefixes(blockStyles, style => style.prefix);
  const specialHeadingPrefixes = indexPrefixes(specialHeadings, heading => heading.directive);

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

  for (let lineNo = 1; lineNo <= view.state.doc.lines; lineNo += 1) {
    const line = view.state.doc.line(lineNo);
    const blockStyle = firstPrefixMatch(line.text, blockStylePrefixes, style => style.prefix);
    if (blockStyle) {
      ranges.push({
        from: line.from,
        to: line.from,
        decoration: Decoration.line({
          attributes: customBlockEditorLineAttributes(blockStyle)
        })
      });
    }
    const heading = firstPrefixMatch(line.text, specialHeadingPrefixes, item => item.directive);
    if (heading && line.to > line.from) {
      const from = line.from;
      const to = line.to;
      ranges.push({
        from,
        to,
        decoration: Decoration.mark({
          attributes: headingStyleAttributes(heading, editorSetup)
        })
      });
    }
  }

  return Decoration.set(
    ranges.map(range => range.decoration.range(range.from, range.to)),
    true
  );
}

type PrefixIndex<T> = ReadonlyMap<string, readonly T[]>;

function indexPrefixes<T>(items: readonly T[], prefixOf: (item: T) => string): PrefixIndex<T> {
  const index = new Map<string, T[]>();
  for (const item of items) {
    const prefix = prefixOf(item);
    if (!prefix) continue;
    const key = prefix[0];
    const candidates = index.get(key);
    if (candidates) candidates.push(item);
    else index.set(key, [item]);
  }
  return index;
}

function firstPrefixMatch<T>(text: string, index: PrefixIndex<T>, prefixOf: (item: T) => string): T | undefined {
  if (!text) return undefined;
  return index.get(text[0])?.find(item => text.startsWith(prefixOf(item)));
}

const customBlockEditorTheme = EditorView.baseTheme({
  [`.${CUSTOM_BLOCK_EDITOR_LINE_CLASS}`]: {
    paddingBlockStart: `var(${CUSTOM_BLOCK_SPACE_BEFORE_PROPERTY}, 0pt)`
  }
});

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
  return [
    customBlockEditorTheme,
    ViewPlugin.fromClass(class extends CustomStyleHighlighting {
      constructor(view: EditorView) {
        super(view, styles, blockStyles, specialHeadings, editorSetup);
      }
    }, {
      decorations: plugin => plugin.decorations
    })
  ];
}
