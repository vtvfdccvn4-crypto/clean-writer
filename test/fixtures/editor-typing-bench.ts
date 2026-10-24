import { createEditor } from '../../src/editor';

declare global {
  interface Window { __HARNESS_RESULT__?: Record<string, unknown>; }
}

// Corpus shaped like the plan's 1,000-page document: headings, paragraphs, a
// list, and a Markdown table every tenth page, in one section.
const PAGES = 1_000;
const page = (index: number) => [
  `## Section ${index}`,
  '',
  'Lorem ipsum dolor sit amet, **consectetur** adipiscing elit, sed do _eiusmod_ tempor incididunt ut labore. '.repeat(12),
  '',
  '- first item with `code`',
  '- second item',
  '',
  'Second paragraph with a [link](https://example.com) and more prose to fill the page. '.repeat(10),
  ...(index % 10 === 0 ? ['', '| a | b | c |', '|---|---|---|', '| 1 | 2 | 3 |', '| 4 | 5 | 6 |'] : []),
  ''
].join('\n');

const KEYSTROKES = 200;

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] * 100) / 100;
}

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

async function run(): Promise<void> {
  const document1000 = Array.from({ length: PAGES }, (_, index) => page(index + 1)).join('\n');
  const parent = document.getElementById('editor');
  if (!parent) throw new Error('Editor root missing.');
  const editor = createEditor(parent, document1000, { onChange: () => undefined, onDirty: () => undefined });
  const view = editor.view;
  const middle = Math.floor(document1000.length / 2);
  view.dispatch({ selection: { anchor: middle }, scrollIntoView: true });
  await nextFrame();
  await nextFrame();

  let longTaskCount = 0;
  let longTaskMaxMs = 0;
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      longTaskCount += 1;
      longTaskMaxMs = Math.max(longTaskMaxMs, entry.duration);
    }
  });
  observer.observe({ type: 'longtask', buffered: false });

  const dispatchMs: number[] = [];
  const frameMs: number[] = [];
  let position = view.state.selection.main.head;
  for (let index = 0; index < KEYSTROKES + 10; index += 1) {
    const started = performance.now();
    view.dispatch({ changes: { from: position, insert: 'a' }, selection: { anchor: position + 1 } });
    const dispatched = performance.now();
    await nextFrame();
    if (index >= 10) {
      dispatchMs.push(dispatched - started);
      frameMs.push(performance.now() - started);
    }
    position += 1;
  }
  observer.disconnect();

  window.__HARNESS_RESULT__ = {
    ok: true,
    documentChars: document1000.length,
    keystrokes: KEYSTROKES,
    dispatchP50Ms: percentile(dispatchMs, 0.5),
    dispatchP95Ms: percentile(dispatchMs, 0.95),
    dispatchMaxMs: percentile(dispatchMs, 1),
    keystrokeToFrameP50Ms: percentile(frameMs, 0.5),
    keystrokeToFrameP95Ms: percentile(frameMs, 0.95),
    longTaskCount,
    longTaskMaxMs: Math.round(longTaskMaxMs)
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
