const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let compileJob;
let CompileResultCache;
let CURRENT_RESULT_LIMITS;
let HISTORY_RESULT_LIMITS;
let documentCompileSettings;
let DEFAULT_APP_STATE;

before(async () => {
  server = await createTestServer();
  ({ compileJob, CompileResultCache, CURRENT_RESULT_LIMITS, HISTORY_RESULT_LIMITS } = await server.ssrLoadModule('/src/workers/compile-core.ts'));
  ({ documentCompileSettings } = await server.ssrLoadModule('/src/compiler/index.ts'));
  ({ DEFAULT_APP_STATE } = await server.ssrLoadModule('/src/config/defaults.ts'));
});

after(async () => server?.close());

/** A section of about 40 KB, with an edit marker at its end. Each edit is a new revision of the same section. */
const revision = edit => [
  ...Array.from({ length: 30 }, (_, index) => `## Part ${index + 1}\n\n${'Ordinary prose that fills a line of the page with **emphasis**. '.repeat(15)}\n`),
  `An edit number ${edit}.`
].join('\n');

const job = (markdown, retention) => ({
  jobId: `edit-${markdown.length}-${retention}`,
  markdown,
  settings: documentCompileSettings(DEFAULT_APP_STATE),
  assets: {},
  sourceLineOffset: 0,
  retention
});

test('30 successive live edits keep one completed revision, so retained memory does not grow with the edits', async () => {
  const cache = new CompileResultCache(CURRENT_RESULT_LIMITS);
  const retained = [];
  for (let edit = 1; edit <= 30; edit += 1) {
    await compileJob(job(revision(edit), 'current'), cache);
    retained.push(cache.retainedCharacters);
  }
  const oneDocument = retained[0];
  assert.equal(cache.size, 1, 'only the latest completed revision may be kept');
  assert.ok(oneDocument > 0);
  // Every edit is about the same size, so retained memory must stay near one document at every step.
  assert.ok(Math.max(...retained) <= oneDocument * 1.2, `retained ${Math.max(...retained)} characters, one document is ${oneDocument}`);
  assert.ok(Math.abs(retained[29] - retained[4]) <= oneDocument * 0.05, 'retained memory must plateau after the first few edits');
});

test('the live cache hits only for the revision it still holds', async () => {
  const cache = new CompileResultCache(CURRENT_RESULT_LIMITS);
  await compileJob(job(revision(1), 'current'), cache);
  await compileJob(job(revision(2), 'current'), cache);
  const repeatOfCurrent = await compileJob(job(revision(2), 'current'), cache);
  const repeatOfReplaced = await compileJob(job(revision(1), 'current'), cache);
  assert.equal(repeatOfCurrent.cacheHit, true);
  assert.equal(repeatOfReplaced.cacheHit, false, 'an edit that was replaced must compile again');
});

test('full-document and export work keeps a bounded history, with repeat hits inside the bound', async () => {
  const cache = new CompileResultCache(HISTORY_RESULT_LIMITS);
  for (let edit = 1; edit <= 30; edit += 1) {
    await compileJob(job(revision(edit), 'history'), cache);
  }
  assert.ok(cache.size <= HISTORY_RESULT_LIMITS.maxEntries, `history kept ${cache.size} results`);
  assert.ok(cache.retainedCharacters <= HISTORY_RESULT_LIMITS.maxCharacters, 'history must stay within its character budget');
  const recent = await compileJob(job(revision(30), 'history'), cache);
  assert.equal(recent.cacheHit, true, 'a recent full-document compile must still be a cache hit');
});

test('a job that does not say how long to keep its result uses the bounded history', async () => {
  const cache = new CompileResultCache(HISTORY_RESULT_LIMITS);
  await compileJob(job(revision(1), undefined), cache);
  await compileJob(job(revision(2), undefined), cache);
  const repeat = await compileJob(job(revision(1), undefined), cache);
  assert.equal(repeat.cacheHit, true);
});
