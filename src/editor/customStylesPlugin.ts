import { ViewPlugin, Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { RangeSetBuilder, Compartment } from '@codemirror/state';
import { state } from '../state';
import { escapeRegExp } from '../utils/regex';

export const customStylesCompartment = new Compartment();

export const customStylesHighlightPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: any) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    const customStyles = state.current.customStyles || [];
    if (customStyles.length === 0) return builder.finish();

    const pairs = customStyles.map(s => ({
      ...s,
      regex: new RegExp(`(${escapeRegExp(s.openingPair)})(.*?)(${escapeRegExp(s.closingPair)})`, 'g'),
      deco: Decoration.mark({
        attributes: {
          class: 'custom-style',
          style: s.color ? `color: ${s.color}` : ''
        }
      })
    }));

    for (let { from, to } of view.visibleRanges) {
      const text = view.state.doc.sliceString(from, to);
      const matches: { from: number, to: number, deco: Decoration }[] = [];

      for (const style of pairs) {
        let match;
        style.regex.lastIndex = 0;
        while ((match = style.regex.exec(text))) {
          matches.push({
            from: from + match.index,
            to: from + match.index + match[0].length,
            deco: style.deco
          });
        }
      }

      matches.sort((a, b) => a.from - b.from);
      
      let lastTo = -1;
      for (const m of matches) {
        if (m.from >= lastTo) {
          builder.add(m.from, m.to, m.deco);
          lastTo = m.to;
        }
      }
    }
    return builder.finish();
  }
}, {
  decorations: v => v.decorations
});

export function getCustomStylesExtension() {
  return customStylesCompartment.of(customStylesHighlightPlugin);
}

export function updateCustomStyles(view: EditorView) {
  view.dispatch({
    effects: customStylesCompartment.reconfigure(customStylesHighlightPlugin)
  });
}
