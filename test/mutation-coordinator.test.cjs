const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let runCoordinatedMutation;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24693 } } });
  ({ runCoordinatedMutation } = await server.ssrLoadModule('/src/platform/mutation-coordinator.ts'));
});

after(async () => {
  await server?.close();
});

test('coordinator restores settings when metadata persistence fails', async () => {
  let settings = { schemaVersion: 4, order: ['old.md'] };
  let entry = 'old.md';
  let rollbackCount = 0;

  const committed = await runCoordinatedMutation({
    readSettings: async () => structuredClone(settings),
    writeSettings: async next => {
      if (next.order.includes('new.md')) throw new Error('simulated metadata failure');
      settings = structuredClone(next);
    },
    applyFilesystem: async () => { entry = 'new.md'; },
    rollbackFilesystem: async () => { rollbackCount += 1; entry = 'old.md'; },
    updateSettings: next => { next.order = ['new.md']; }
  });

  assert.equal(committed, false);
  assert.equal(entry, 'old.md');
  assert.deepEqual(settings.order, ['old.md']);
  assert.equal(rollbackCount, 1);
});

test('coordinator invokes rollback when a filesystem operation fails part-way through', async () => {
  let rollbackCount = 0;
  const committed = await runCoordinatedMutation({
    readSettings: async () => ({ schemaVersion: 4, order: [] }),
    writeSettings: async () => {},
    applyFilesystem: async () => { throw new Error('simulated storage failure'); },
    rollbackFilesystem: async () => { rollbackCount += 1; },
    updateSettings: () => {}
  });

  assert.equal(committed, false);
  assert.equal(rollbackCount, 1);
});
