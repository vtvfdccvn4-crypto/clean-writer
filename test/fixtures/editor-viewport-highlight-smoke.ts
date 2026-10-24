import { EditorView } from '@codemirror/view';
import { createEditor } from '../../src/editor';
import { state } from '../../src/state';

declare global {
  interface Window { __HARNESS_RESULT__?: Record<string, unknown>; }
}

const nextFrames = async (count = 2) => {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
};

/**
 * Text ranges that the editor's decoration providers mark with a color. This
 * reads the decoration sets, not the DOM: CodeMirror renders only visible lines,
 * so a DOM check cannot tell a viewport-limited pass from a full-document one.
 */
function styledTexts(view: EditorView): string[] {
  const texts: string[] = [];
  const doc = view.state.doc;
  for (const provider of view.state.facet(EditorView.decorations)) {
    const set = typeof provider === 'function' ? provider(view) : provider;
    set.between(0, doc.length, (from: number, to: number, value: { spec: { attributes?: { style?: string } } }) => {
      if ((value.spec.attributes?.style ?? '').includes('color')) texts.push(doc.sliceString(from, to));
    });
  }
  return texts;
}

async function run(): Promise<void> {
  state.setCustomStyles([{
    id: 'red', name: 'Red', openingPair: '[[', closingPair: ']]',
    color: '#ff0000', isBold: false, isItalic: false, fontFamily: '', fontSize: 0
  }]);
  const parent = document.getElementById('editor');
  if (!parent) throw new Error('Editor root missing.');
  // Lines of 400 are far below the first viewport, so the far marker starts unrendered.
  const lines = Array.from({ length: 400 }, (_, index) => (index === 399 ? '[[FARMARKER]] end' : `Plain line ${index}`));
  const editor = createEditor(parent, lines.join('\n'), { onChange: () => undefined });
  const view = editor.view;
  await nextFrames();

  const initiallyStyledFar = styledTexts(view).includes('FARMARKER');

  const endPosition = view.state.doc.length;
  view.dispatch({ effects: EditorView.scrollIntoView(endPosition, { y: 'end' }) });
  await nextFrames(3);
  const styledAfterScroll = styledTexts(view).includes('FARMARKER');

  view.dispatch({ changes: { from: endPosition, insert: '\n[[TYPED]] and [[unclosed' } });
  await nextFrames(3);
  const texts = styledTexts(view);

  window.__HARNESS_RESULT__ = {
    ok: !initiallyStyledFar && styledAfterScroll && texts.includes('TYPED') && !texts.some(text => text.includes('unclosed')),
    initiallyStyledFar,
    styledAfterScroll,
    typedStyled: texts.includes('TYPED'),
    unclosedStyled: texts.some(text => text.includes('unclosed')),
    decorationRangeCount: texts.length
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
