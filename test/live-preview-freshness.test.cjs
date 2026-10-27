const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let LivePreviewFreshness;

before(async () => {
  server = await createTestServer();
  ({ LivePreviewFreshness } = await server.ssrLoadModule('/src/ui/live-preview-freshness.ts'));
});

after(async () => server?.close());

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function recorder() {
  const shown = [];
  return { shown, show: state => shown.push(state) };
}

test('a refresh that finishes before the reveal delay shows nothing', async () => {
  const log = recorder();
  const freshness = new LivePreviewFreshness(log.show, 20);
  freshness.typing();
  freshness.updating();
  freshness.settled();
  await pause(40);
  assert.deepEqual(log.shown, []);
});

test('a state that lasts past the reveal delay is shown, and cleared when the newest revision renders', async () => {
  const log = recorder();
  const freshness = new LivePreviewFreshness(log.show, 10);
  freshness.typing();
  await pause(30);
  assert.deepEqual(log.shown, ['typing']);
  freshness.settled();
  assert.deepEqual(log.shown, ['typing', null]);
});

test('the notice switches from paused-while-typing to updating when the pause ends', async () => {
  const log = recorder();
  const freshness = new LivePreviewFreshness(log.show, 10);
  freshness.typing();
  await pause(30);
  freshness.updating();
  freshness.typing();
  freshness.updating();
  freshness.settled();
  assert.deepEqual(log.shown, ['typing', 'updating', 'typing', 'updating', null]);
});

test('repeated edits during the same state do not re-announce the notice', async () => {
  const log = recorder();
  const freshness = new LivePreviewFreshness(log.show, 10);
  freshness.typing();
  await pause(30);
  for (let index = 0; index < 20; index += 1) freshness.typing();
  assert.deepEqual(log.shown, ['typing']);
});

test('clearing when nothing is shown does not call the page', async () => {
  const log = recorder();
  const freshness = new LivePreviewFreshness(log.show, 10);
  freshness.settled();
  freshness.settled();
  assert.deepEqual(log.shown, []);
});
