const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let CompileClient;

before(async () => {
  server = await createTestServer();
  ({ CompileClient } = await server.ssrLoadModule('/src/workers/CompileClient.ts'));
});

after(async () => server?.close());

const request = { lane: 'live', markdown: '# Hello', settings: {}, assets: {}, sourceLineOffset: 0 };
const localOutcome = async job => ({ compiled: { html: `local:${job.markdown}`, manifest: [] }, cacheHit: false, phases: {} });

/** A worker that accepts jobs and never answers them, like one stuck in a compile. */
function silentWorker(log) {
  return {
    postMessage(message) { log.push(message); },
    terminate() { log.terminated = true; },
    onmessage: null,
    onerror: null,
    onmessageerror: null
  };
}

/** A worker that answers every compile with a result for the job. */
function answeringWorker(log) {
  const worker = silentWorker(log);
  worker.postMessage = message => {
    log.push(message);
    if (message.type !== 'compile') return;
    setTimeout(() => worker.onmessage({ data: {
      type: 'result', jobId: message.job.jobId, cacheHit: false, phases: {},
      compiled: { html: `worker:${message.job.markdown}`, manifest: [] },
      timing: { workerReceivedAt: 0, workerCompiledAt: 0, workerPostedAt: 0 }
    } }), 0);
  };
  return worker;
}

test('a worker that stops answering is replaced, and its job compiles on the page', async () => {
  const workers = [];
  const client = new CompileClient({
    createWorker: () => { const log = []; workers.push(log); return silentWorker(log); },
    compileLocal: localOutcome,
    hungAfterMs: 20
  });
  const outcome = await client.compile(request);
  assert.equal(outcome.compiled.html, 'local:# Hello');
  assert.equal(workers[0].terminated, true);
  assert.equal(client.usesFallback, false);
});

test('after a hang, the next edit goes to a new worker', async () => {
  const workers = [];
  const client = new CompileClient({
    createWorker: () => {
      const log = [];
      workers.push(log);
      return workers.length === 1 ? silentWorker(log) : answeringWorker(log);
    },
    compileLocal: localOutcome,
    hungAfterMs: 20
  });
  await client.compile(request);
  const outcome = await client.compile({ ...request, markdown: '# Next' });
  assert.equal(workers.length, 2);
  assert.equal(outcome.compiled.html, 'worker:# Next');
  assert.equal(client.usesFallback, false);
});

test('repeated hangs switch the session to the page', async () => {
  let creations = 0;
  const client = new CompileClient({
    createWorker: () => { creations += 1; return silentWorker([]); },
    compileLocal: localOutcome,
    maxCrashes: 1,
    hungAfterMs: 10
  });
  await client.compile(request);
  await client.compile({ ...request, markdown: '# Second' });
  assert.equal(client.usesFallback, true);
  const outcome = await client.compile({ ...request, markdown: '# Third' });
  assert.equal(outcome.compiled.html, 'local:# Third');
  assert.equal(creations, 2);
});

test('a job the worker answers in time does not trigger the watchdog', async () => {
  let localCompiles = 0;
  const client = new CompileClient({
    createWorker: () => answeringWorker([]),
    compileLocal: async job => { localCompiles += 1; return localOutcome(job); },
    hungAfterMs: 200
  });
  const outcome = await client.compile(request);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(outcome.compiled.html, 'worker:# Hello');
  assert.equal(localCompiles, 0);
  assert.equal(client.usesFallback, false);
});
