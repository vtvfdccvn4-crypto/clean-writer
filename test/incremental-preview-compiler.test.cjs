const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let matchUnchangedBlocks;
let mapWithConcurrency;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24706 } } });
  ({ matchUnchangedBlocks, mapWithConcurrency } = await server.ssrLoadModule('/src/preview/live/IncrementalPreviewCompiler.ts'));
});

after(async () => server?.close());

test('reuses unchanged duplicate blocks in source order', () => {
  const first = { markdown: 'A', id: 'first' };
  const second = { markdown: 'B', id: 'second' };
  const third = { markdown: 'A', id: 'third' };
  const matches = matchUnchangedBlocks(
    [first, second, third],
    [{ markdown: 'A' }, { markdown: 'A' }, { markdown: 'B' }, { markdown: 'C' }]
  );

  assert.equal(matches.get(0), first);
  assert.equal(matches.get(1), third);
  assert.equal(matches.get(2), second);
  assert.equal(matches.has(3), false);
});

test('unchanged block matching scales linearly', () => {
  const count = 1_000;
  let markdownReads = 0;
  const block = index => ({
    get markdown() {
      markdownReads += 1;
      return `Block ${index}`;
    }
  });

  const matches = matchUnchangedBlocks(
    Array.from({ length: count }, (_, index) => block(index)),
    Array.from({ length: count }, (_, index) => block(index))
  );

  assert.equal(matches.size, count);
  assert.ok(markdownReads < count * 4, `expected linear markdown reads, received ${markdownReads}`);
});

test('changed block work preserves source order within the concurrency cap', async () => {
  let active = 0;
  let maxActive = 0;
  const values = Array.from({ length: 24 }, (_, index) => index);
  const results = await mapWithConcurrency(values, 4, async value => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, value % 3));
    active -= 1;
    return value * 2;
  });

  assert.deepEqual(results, values.map(value => value * 2));
  assert.equal(maxActive, 4);
});

test('broad edits keep active compiler work bounded', async () => {
  let active = 0;
  let maxActive = 0;
  const values = Array.from({ length: 300 }, (_, index) => index);
  const results = await mapWithConcurrency(values, 4, async value => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await Promise.resolve();
    active -= 1;
    return value;
  });

  assert.deepEqual(results, values);
  assert.ok(maxActive <= 4, `expected at most four active jobs, received ${maxActive}`);
});
