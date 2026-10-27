const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let pdfDigest;

before(async () => {
  server = await createTestServer();
  ({ pdfDigest } = await server.ssrLoadModule('/src/pdf-preview/digest.ts'));
});

after(async () => server?.close());

const reference = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

test('the digest matches the standard SHA-256 for known vectors', () => {
  assert.equal(pdfDigest(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(pdfDigest('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('the digest matches the platform SHA-256 across padding boundaries and non-ASCII text', () => {
  const lengths = [1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 1000, 4097];
  for (const length of lengths) {
    const text = 'a'.repeat(length);
    assert.equal(pdfDigest(text), reference(text), `length ${length}`);
  }
  const mixed = 'Café — 文書 🙂 '.repeat(50);
  assert.equal(pdfDigest(mixed), reference(mixed));
});

test('the digest is 64 hex characters, whatever the input size', () => {
  const large = 'x'.repeat(300_000);
  assert.match(pdfDigest(large), /^[0-9a-f]{64}$/);
  assert.equal(pdfDigest(large), reference(large));
});
