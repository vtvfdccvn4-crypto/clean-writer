const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let PreviewScheduler;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24694 } } });
  ({ PreviewScheduler } = await server.ssrLoadModule('/src/ui/PreviewScheduler.ts'));
});

after(async () => server?.close());

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('runs once, after the pause, with the newest value', async () => {
  const runs = [];
  const scheduler = new PreviewScheduler(value => runs.push(value), () => 20);
  scheduler.schedule('a');
  await wait(5);
  scheduler.schedule('b');
  await wait(5);
  scheduler.schedule('c');
  assert.deepEqual(runs, [], 'nothing runs while edits keep arriving');
  await wait(60);
  assert.deepEqual(runs, ['c']);
});

test('each new edit restarts the pause', async () => {
  const runs = [];
  const scheduler = new PreviewScheduler(value => runs.push(value), () => 30);
  scheduler.schedule('first');
  await wait(20);
  scheduler.schedule('second');
  await wait(20);
  assert.deepEqual(runs, [], 'the first pause must not fire from the earlier edit');
  await wait(40);
  assert.deepEqual(runs, ['second']);
});

test('cancel drops the waiting value', async () => {
  const runs = [];
  const scheduler = new PreviewScheduler(value => runs.push(value), () => 10);
  scheduler.schedule('discarded');
  scheduler.cancel();
  await wait(30);
  assert.deepEqual(runs, []);
});

test('a value scheduled after a run is independent of the earlier one', async () => {
  const runs = [];
  const scheduler = new PreviewScheduler(value => runs.push(value), () => 10);
  scheduler.schedule('one');
  await wait(30);
  scheduler.schedule('two');
  await wait(30);
  assert.deepEqual(runs, ['one', 'two']);
});

test('the delay is read at each schedule, so the mode can change it', async () => {
  const runs = [];
  let delay = 200;
  const scheduler = new PreviewScheduler(value => runs.push(value), () => delay);
  delay = 10;
  scheduler.schedule('quick');
  await wait(40);
  assert.deepEqual(runs, ['quick']);
});
