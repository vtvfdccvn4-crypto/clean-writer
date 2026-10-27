const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let compileOnWorker;
let compileWorkerMayBeUsed;
let isSafariUserAgent;
let compileWorkerFlag;

before(async () => {
  server = await createTestServer();
  ({ compileOnWorker, compileWorkerMayBeUsed } = await server.ssrLoadModule('/src/workers/compile-thread-policy.ts'));
  ({ isSafariUserAgent } = await server.ssrLoadModule('/src/platform/safari.ts'));
  ({ compileWorkerFlag } = await server.ssrLoadModule('/src/config/feature-flags.ts'));
});

after(async () => server?.close());

const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15';
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';
const PLAYWRIGHT_WEBKIT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
const EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/153.0.0.0 Mobile/15E148 Safari/604.1';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

test('Safari, including Playwright WebKit, is detected; other browsers are not', () => {
  assert.equal(isSafariUserAgent(SAFARI_MAC), true);
  assert.equal(isSafariUserAgent(SAFARI_IOS), true);
  assert.equal(isSafariUserAgent(PLAYWRIGHT_WEBKIT), true);
  assert.equal(isSafariUserAgent(CHROME), false);
  assert.equal(isSafariUserAgent(EDGE), false);
  assert.equal(isSafariUserAgent(CHROME_IOS), false, 'Chrome on iOS is not Safari');
  assert.equal(isSafariUserAgent(FIREFOX), false);
});

test('the explicit flag overrides the size and browser rules in both directions', () => {
  assert.equal(compileOnWorker({ flag: 'true', safari: false, sourceCharacters: 1_000 }), true);
  assert.equal(compileOnWorker({ flag: 'false', safari: true, sourceCharacters: 500_000 }), false);
});

test('Safari compiles in the worker from 400,000 through 700,000 characters, and not outside that range', () => {
  const at = sourceCharacters => compileOnWorker({ flag: null, safari: true, sourceCharacters });
  assert.equal(at(399_999), false);
  assert.equal(at(400_000), true);
  assert.equal(at(550_000), true);
  assert.equal(at(700_000), true);
  assert.equal(at(700_001), false, 'documents above 700,000 characters stay opt-in');
});

test('other browsers stay on the page at every size unless they set the flag', () => {
  for (const sourceCharacters of [1_000, 500_000, 2_000_000]) {
    assert.equal(compileOnWorker({ flag: null, safari: false, sourceCharacters }), false);
  }
});

test('a worker client is created only when the flag or the Safari default may use it', () => {
  assert.equal(compileWorkerMayBeUsed({ flag: null, safari: false }), false);
  assert.equal(compileWorkerMayBeUsed({ flag: null, safari: true }), true);
  assert.equal(compileWorkerMayBeUsed({ flag: 'true', safari: false }), true);
  assert.equal(compileWorkerMayBeUsed({ flag: 'false', safari: true }), false);
});

test('the query flag reads only true and false', () => {
  assert.equal(compileWorkerFlag('?compile-worker=true'), 'true');
  assert.equal(compileWorkerFlag('?compile-worker=false'), 'false');
  assert.equal(compileWorkerFlag('?compile-worker'), null);
  assert.equal(compileWorkerFlag('?compile-worker=1'), null);
  assert.equal(compileWorkerFlag(''), null);
});
