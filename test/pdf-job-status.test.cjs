const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let describePdfJobProgress;
let paginationMilestone;
let describePdfJobOutcome;
let pdfJobStatusTemplate;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24696 } } });
  ({ describePdfJobProgress, paginationMilestone, describePdfJobOutcome, pdfJobStatusTemplate } =
    await server.ssrLoadModule('/src/ui/pdf-job-status.ts'));
});

after(async () => server?.close());

test('pagination progress shows the page, the estimate and elapsed seconds', () => {
  const description = describePdfJobProgress({
    type: 'clear-writer-pdf-preview-progress', requestId: 'r', phase: 'paginate',
    pagesCompleted: 40, estimatedPages: 300, elapsedMs: 12_400
  });
  assert.equal(description.label, 'Paginating: page 40 of about 300 · 13 s');
  assert.equal(description.value, 40);
  assert.equal(description.max, 300);
});

test('the bar maximum grows when the job passes its page estimate', () => {
  const description = describePdfJobProgress({
    type: 'clear-writer-pdf-preview-progress', requestId: 'r', phase: 'paginate', pagesCompleted: 320, estimatedPages: 300
  });
  assert.equal(description.max, 320, 'the estimate is a heuristic and must not cap the bar');
});

test('phases without a page count are indeterminate', () => {
  const description = describePdfJobProgress({ type: 'clear-writer-pdf-preview-progress', requestId: 'r', phase: 'load-pagination-frame' });
  assert.equal(description.label, 'Loading layout engine…');
  assert.equal(description.value, undefined);
  assert.equal(description.max, undefined);
});

test('a milestone is announced once per crossed multiple of 25 pages', () => {
  assert.equal(paginationMilestone(0, 24), null);
  assert.equal(paginationMilestone(0, 25), 25);
  assert.equal(paginationMilestone(25, 30), null, 'pages between milestones are not announced');
  assert.equal(paginationMilestone(25, 50), 50);
  assert.equal(paginationMilestone(20, 80), 75, 'a jump past several milestones announces the latest one');
});

test('each outcome has a plain announcement', () => {
  assert.equal(describePdfJobOutcome({ kind: 'printing' }).announcement, 'PDF preview ready. The print dialog is open.');
  assert.equal(describePdfJobOutcome({ kind: 'cancelled' }).announcement, 'PDF preview cancelled.');
  assert.equal(describePdfJobOutcome({ kind: 'failed', message: 'frame timed out' }).announcement, 'PDF preview failed: frame timed out');
});

test('the strip keeps the announcer outside the hidden region, so screen readers still hear it', () => {
  const html = pdfJobStatusTemplate();
  const announcer = html.indexOf('id="pdf-job-announcer"');
  const strip = html.indexOf('id="pdf-job-status"');
  assert.ok(announcer >= 0 && strip >= 0);
  assert.ok(announcer < strip, 'the live region must sit before the hidden strip');
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /<button id="btn-pdf-job-cancel"[^>]*type="button"/);
});
