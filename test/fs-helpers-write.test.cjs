const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let writeFile;

before(async () => {
  server = await createTestServer();
  ({ writeFile } = await server.ssrLoadModule('/src/platform/fs-helpers.ts'));
});

after(async () => server?.close());

/** A file handle whose writable stream fails on write, and records whether it was aborted. */
function failingHandle() {
  const calls = { closed: false, aborted: false };
  return {
    calls,
    handle: {
      createWritable: async () => ({
        write: async () => { throw new Error('disk full'); },
        close: async () => { calls.closed = true; },
        abort: async () => { calls.aborted = true; }
      })
    }
  };
}

test('a failed write is aborted, so the previous contents are kept, and the error is reported', async () => {
  const { handle, calls } = failingHandle();
  await assert.rejects(() => writeFile(handle, 'new text'), /disk full/);
  assert.equal(calls.aborted, true);
  assert.equal(calls.closed, false);
});

test('a successful write closes its stream and is not aborted', async () => {
  const calls = { closed: false, aborted: false, data: null };
  const handle = {
    createWritable: async () => ({
      write: async data => { calls.data = data; },
      close: async () => { calls.closed = true; },
      abort: async () => { calls.aborted = true; }
    })
  };
  await writeFile(handle, 'text');
  assert.equal(calls.data, 'text');
  assert.equal(calls.closed, true);
  assert.equal(calls.aborted, false);
});
