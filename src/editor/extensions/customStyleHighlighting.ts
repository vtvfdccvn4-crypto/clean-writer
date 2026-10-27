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

/**
 * Decorates only the lines the viewport shows. CodeMirror draws nothing outside
 * the visible ranges, and a viewport change rebuilds the set, so the cost of a
 * keystroke no longer depends on the length of the document. Style pairs are
 * matched within one line; the pattern's `.` never crosses a newline.
 */
function buildDecorations(
  view: EditorView,
  styles: readonly CustomStyle[],
  blockStyles: readonly CustomBlockStyle[],
  specialHeadings: readonly SpecialHeadingDefinition[],
  editorSetup: EditorSetup
): DecorationSet {
  const ranges: Array<{ from: number; to: number; decoration: Decoration }> = [];
  const doc = view.state.doc;
  const blockStylePrefixes = indexPrefixes(blockStyles, style => style.prefix);
  const specialHeadingPrefixes = indexPrefixes(specialHeadings, heading => heading.directive);
  const inlinePatterns = styles
    .filter(style => style.openingPair && style.closingPair)
    .map(style => ({
      style,
      pattern: new RegExp(`${escapeRegExp(style.openingPair)}(.*?)${escapeRegExp(style.closingPair)}`, 'g')
    }));

  let lastLineNumber = 0;
  for (const visible of view.visibleRanges) {
    const firstLine = doc.lineAt(visible.from).number;
    const lastLine = doc.lineAt(visible.to).number;
    // Adjacent visible ranges can share a line, which must be decorated once.
    for (let lineNumber = Math.max(firstLine, lastLineNumber + 1); lineNumber <= lastLine; lineNumber += 1) {
      lastLineNumber = lineNumber;
      const line = doc.line(lineNumber);
      for (const { style, pattern } of inlinePatterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(line.text))) {
          const from = line.from + match.index + style.openingPair.length;
          const to = from + match[1].length;
          if (to <= from) continue;
          ranges.push({ from, to, decoration: Decoration.mark({ attributes: textStyleAttributes(style) }) });
        }
      }
      const blockStyle = firstPrefixMatch(line.text, blockStylePrefixes, style => style.prefix);
      if (blockStyle) {
        ranges.push({
          from: line.from,
          to: line.from,
          decoration: Decoration.line({ attributes: customBlockEditorLineAttributes(blockStyle) })
        });
      }
      const heading = firstPrefixMatch(line.text, specialHeadingPrefixes, item => item.directive);
      if (heading && line.to > line.from) {
        ranges.push({
          from: line.from,
          to: line.to,
          decoration: Decoration.mark({ attributes: headingStyleAttributes(heading, editorSetup) })
        });
      }
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
    if (update.docChanged || update.viewportChanged) {
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
