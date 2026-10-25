import { compilePreviewDocument, documentCompileSettings } from '../../src/compiler';
import { DEFAULT_APP_STATE } from '../../src/config/defaults';
import { IncrementalPreviewCompiler } from '../../src/preview/live/IncrementalPreviewCompiler';
import { renderDocumentSection } from '../../src/preview/document-rendering';

declare global {
  interface Window { __HARNESS_RESULT__?: Record<string, unknown>; }
}

const SECTIONS = [{ path: 'sections/a.md', isDir: false, hideHeader: false, hideFooter: false, numberHeadings: true, includeInToc: true, pageBreak: false }];
const SETTINGS = documentCompileSettings(DEFAULT_APP_STATE);
const RESOLVER = { async preloadImages() { /* none */ }, resolveSync: (p: string) => p, releaseAll() { /* none */ } };

// ?local=true removes every feature whose meaning spans blocks, to separate the causes.
const LOCAL_ONLY = new URLSearchParams(window.location.search).get('local') === 'true';
const CROSS_BLOCK = (text: string) => text.replace(/\[[^\]]*\]\[[^\]]*\]|\[\^[^\]]*\]|\[[^\]]+\]:[^\n]*/g, '');

const BASE_TEXT = [
  '# Heading one',
  '',
  'A paragraph with a [reference][r] and a note[^n].',
  '',
  '- item one',
  '- item two',
  '',
  '```',
  'code line',
  '',
  'more code',
  '```',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  '## Heading two',
  '',
  'Another paragraph with **emphasis** and an ![image](images/x.png).',
  '',
  '[r]: https://example.com/ref',
  '[^n]: The footnote body.',
  ''
].join('\n');
const PAGES = Math.max(1, Number(new URLSearchParams(window.location.search).get('pages') ?? 1));
const SINGLE = LOCAL_ONLY ? CROSS_BLOCK(BASE_TEXT) : BASE_TEXT;
// Repeats the sample with distinct headings, so a larger document keeps the same mix of blocks.
const BASE = Array.from({ length: PAGES }, (_, index) => SINGLE.replace('# Heading one', `# Heading ${index}`)).join('\n\n');

const FRAGMENTS_ALL = ['x', ' ', '\n', '\n\n', '| c |', '|---|', '# h', '- li', '```', '[r]', '[^n]', '[q]: https://q.example', '[^m]: other note', '> quote', '1. num', '---', '==', '<div>raw</div>', '**b**'];
const FRAGMENTS = LOCAL_ONLY ? FRAGMENTS_ALL.filter(text => CROSS_BLOCK(text) === text) : FRAGMENTS_ALL;

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Serialised HTML with whitespace-only text nodes removed. Block joins differ in
 * whitespace only, which a reader cannot see; any other difference is real.
 */
function normalized(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim()) child.remove();
      else walk(child);
    }
  };
  walk(template.content);
  const container = document.createElement('div');
  container.appendChild(template.content.cloneNode(true));
  return container.innerHTML;
}

function section(markdown: string): string {
  return renderDocumentSection({ path: 'sections/a.md', markdown }, SECTIONS, 0);
}

async function run(): Promise<void> {
  const random = createRandom(7);
  const compiler = new IncrementalPreviewCompiler();
  let doc = section(BASE);
  // Warm-up: the first compile has no previous blocks.
  await compiler.compile(doc, RESOLVER, SETTINGS);

  const mismatches: Array<{ step: number; edit: string; difference: string }> = [];
  // Context around the first character where the normalised outputs part ways.
  const difference = (left: string, right: string): string => {
    let index = 0;
    while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
    return `incremental: …${left.slice(Math.max(0, index - 60), index + 90)}… | full: …${right.slice(Math.max(0, index - 60), index + 90)}…`;
  };
  let incrementalMs = 0;
  let fullMs = 0;
  let compared = 0;
  const STEPS = Number(new URLSearchParams(window.location.search).get('steps') ?? 150);
  for (let step = 0; step < STEPS; step += 1) {
    const body = doc.slice(doc.indexOf('>') + 1, doc.lastIndexOf('</div>'));
    const from = Math.floor(random() * (body.length + 1));
    const removeLength = random() < 0.35 ? Math.min(body.length - from, 1 + Math.floor(random() * 5)) : 0;
    const insert = FRAGMENTS[Math.floor(random() * FRAGMENTS.length)]!;
    const nextBody = body.slice(0, from) + insert + body.slice(from + removeLength);
    doc = section(nextBody);

    const started = performance.now();
    const incremental = await compiler.compile(doc, RESOLVER, SETTINGS);
    incrementalMs += performance.now() - started;
    const fullStarted = performance.now();
    const full = await compilePreviewDocument(doc, RESOLVER, SETTINGS, { sourceLineOffset: 2 });
    fullMs += performance.now() - fullStarted;
    compared += 1;
    const incrementalNormal = incremental ? normalized(incremental.html) : 'null';
    const fullNormal = normalized(full.html);
    if (incrementalNormal !== fullNormal) {
      mismatches.push({ step, edit: JSON.stringify({ from, removeLength, insert }), difference: difference(incrementalNormal, fullNormal) });
      compiler.reset();
    }
  }

  window.__HARNESS_RESULT__ = {
    ok: mismatches.length === 0,
    steps: STEPS,
    compared,
    mismatchCount: mismatches.length,
    firstMismatch: mismatches[0] ?? null,
    incrementalAvgMs: Math.round((incrementalMs / STEPS) * 10) / 10,
    fullAvgMs: Math.round((fullMs / STEPS) * 10) / 10
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
