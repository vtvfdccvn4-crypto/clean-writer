const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let EditorState;
let EditorView;
let tableHelperExtension;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24692 } } });
  // Bare package names keep one module instance, shared with the editor source.
  ({ EditorState } = await server.ssrLoadModule('@codemirror/state'));
  ({ EditorView } = await server.ssrLoadModule('@codemirror/view'));
  ({ tableHelperExtension } = await server.ssrLoadModule('/src/editor/extensions/tableHelpers.ts'));
});

after(async () => server?.close());

/** Deterministic pseudo-random numbers, so a failing edit sequence can be replayed. */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const FRAGMENTS = ['x', ' ', '|', '\n', '\n\n', '| a | b |', '|---|---|', '| 1 | 2 |', '\n|---|:---:|\n', 'text | with pipe', '---'];

function randomDocument(random) {
  const blocks = [];
  for (let index = 0; index < 12; index += 1) {
    blocks.push(random() < 0.4
      ? '| h1 | h2 |\n|---|:--|\n| a | b |\n| c | d |'
      : `Paragraph ${index} with prose.`);
  }
  return blocks.join('\n\n');
}

/** Every decoration the editor would draw for a state, as a comparable, sorted list. */
function describeDecorations(state) {
  const view = { state };
  const merged = [];
  for (const provider of state.facet(EditorView.decorations)) {
    const set = typeof provider === 'function' ? provider(view) : provider;
    set.between(0, state.doc.length, (from, to, value) => {
      const spec = value.spec;
      const widget = spec.widget;
      const widgetKey = widget
        ? [widget.constructor.name, JSON.stringify(widget.header ?? null), JSON.stringify(widget.body ?? null), JSON.stringify(widget.alignments ?? null)].join(',')
        : '';
      merged.push(`${from}-${to}-${spec.block ? 'block' : 'inline'}-${spec.attributes?.class ?? ''}-${widgetKey}`);
    });
  }
  return merged.sort();
}

test('incremental table decorations equal a full rebuild after random edits', () => {
  const extension = tableHelperExtension(() => undefined, () => null);
  for (let seed = 1; seed <= 20; seed += 1) {
    const random = createRandom(seed);
    let state = EditorState.create({ doc: randomDocument(random), extensions: [extension] });
    for (let step = 0; step < 300; step += 1) {
      const length = state.doc.length;
      const from = Math.floor(random() * (length + 1));
      const removeLength = random() < 0.4 ? Math.min(length - from, 1 + Math.floor(random() * 6)) : 0;
      const insert = FRAGMENTS[Math.floor(random() * FRAGMENTS.length)];
      state = state.update({ changes: { from, to: from + removeLength, insert } }).state;

      const rebuilt = EditorState.create({ doc: state.doc.toString(), extensions: [extension] });
      assert.deepEqual(
        describeDecorations(state),
        describeDecorations(rebuilt),
        `seed ${seed}, step ${step}: edit ${JSON.stringify({ from, removeLength, insert })} diverged`
      );
    }
  }
});

test('the incremental table path never copies the whole document', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'editor', 'extensions', 'tableHelpers.ts'), 'utf8');
  const incremental = source.slice(source.indexOf('function updateTableDecorations('), source.indexOf('export function tableHelperExtension('));
  assert.doesNotMatch(incremental, /toString\(\)/);
});
