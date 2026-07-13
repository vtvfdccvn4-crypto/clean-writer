import { ViewPlugin, Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { RangeSetBuilder, Compartment } from '@codemirror/state';
import { state as appState } from '../state';
import { escapeRegExp } from '../utils/regex';

export const customBlockStylesCompartment = new Compartment();

export const customBlockStylesHighlightPlugin = ViewPlugin.fromClass(class {
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
  const blockStyles = appState.current.customBlockStyles || [];
    if (blockStyles.length === 0) return builder.finish();

    const lineStyles = blockStyles.map(s => ({
      ...s,
      regex: new RegExp(`^${escapeRegExp(s.prefix)}`),
      lineDeco: Decoration.line({
        attributes: {
          style: s.color ? `color: ${s.color}` : ''
        }
      }),
      markDeco: s.icon ? Decoration.mark({
        attributes: {
          class: 'custom-block-icon',
          'data-icon': s.icon,
          style: `display: inline-block; width: 0; color: transparent; position: relative;`
        }
      }) : null
    }));

    for (let { from, to } of view.visibleRanges) {
      let pos = from;
      while (pos <= to) {
        const line = view.state.doc.lineAt(pos);
        for (const style of lineStyles) {
          if (style.regex.test(line.text)) {
            builder.add(line.from, line.from, style.lineDeco);
            
            // If there's an icon, we create a small invisible mark at the start 
            // of the line that displays the icon via a pseudo-element, but 
            // since CodeMirror marks apply to text, we can just style the prefix text.
            if (style.markDeco) {
              builder.add(line.from, line.from + style.prefix.length, Decoration.mark({
                attributes: {
                  style: 'opacity: 0.5; margin-right: 4px;'
                }
              }));
            }
            break; // Only apply the first matching block style
          }
        }
        pos = line.to + 1;
      }
    }
    return builder.finish();
  }
}, {
  decorations: v => v.decorations
});

export function getCustomBlockStylesExtension() {
  return customBlockStylesCompartment.of(customBlockStylesHighlightPlugin);
}

export function updateCustomBlockStyles(view: EditorView) {
  view.dispatch({
    effects: customBlockStylesCompartment.reconfigure(customBlockStylesHighlightPlugin)
  });
}
