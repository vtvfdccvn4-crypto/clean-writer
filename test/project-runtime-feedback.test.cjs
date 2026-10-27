const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let describeWorkspaceError;
let buildRecoveryPromptMessage;
let buildProjectHealthFailureMessage;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24691 } } });
  ({
    describeWorkspaceError,
    buildRecoveryPromptMessage,
    buildProjectHealthFailureMessage
  } = await server.ssrLoadModule('/src/services/project-runtime-feedback.ts'));
});

after(async () => {
  await server?.close();
});

test('permission-denied open errors give reconnect guidance', () => {
  const message = describeWorkspaceError(new Error('NotAllowedError: Read-write permission was not granted.'), 'open');
  assert.match(message, /reconnect/i);
  assert.match(message, /folder/i);
});

test('unsupported local folder access gives a reconnect explanation', () => {
  const message = describeWorkspaceError(new Error('Local folder access is unavailable in this browser.'), 'open');
  assert.match(message, /supported browser/i);
  assert.match(message, /reconnect/i);
});

test('settings recovery prompt includes issue summary and backup guidance', () => {
  const message = buildRecoveryPromptMessage({
    valid: false,
    recoverable: true,
    issues: [
      { code: 'settings-invalid', severity: 'error', message: 'settings.json contains malformed JSON.', recoverable: true }
    ]
  });

  assert.match(message, /malformed JSON/i);
  assert.match(message, /backup/i);
});

test('nonrecoverable project failures surface the concrete issue list', () => {
  const message = buildProjectHealthFailureMessage({
    valid: false,
    recoverable: false,
    issues: [
      { code: 'sections-missing', severity: 'error', message: 'The project requires a sections directory.', recoverable: false }
    ]
  });

  assert.match(message, /could not be opened as a Clear Writer project/i);
  assert.match(message, /sections directory/i);
});

test('a full browser store is named as the reason a save failed, and says the text is still open', () => {
  const error = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  const message = describeWorkspaceError(error, 'save');
  assert.match(message, /storage is full/i);
  assert.match(message, /still open/i);
  assert.match(message, /free space/i);
});

test('a save failure for another reason tells the user their text is still open, without pointing at a folder', () => {
  const message = describeWorkspaceError(new Error('The write failed.'), 'save');
  assert.match(message, /still open/i);
  assert.doesNotMatch(message, /folder|project location/i);
});
