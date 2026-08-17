const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { before, after, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let calculateSectionMove;
let EXPLORER_SECTION_DRAG_TYPE;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24689 } } });
  ({ calculateSectionMove } = await server.ssrLoadModule('/src/platform/section-order.ts'));
  ({ EXPLORER_SECTION_DRAG_TYPE } = await server.ssrLoadModule('/src/ui/task-explorer-drag-and-drop.ts'));
});

after(async () => {
  await server?.close();
});

test('explorer drag payload is private to Clear Writer', () => {
  assert.equal(EXPLORER_SECTION_DRAG_TYPE, 'application/x-clear-writer-section-path');
  assert.notEqual(EXPLORER_SECTION_DRAG_TYPE, 'text/plain');
});

test('explorer placements support sibling ordering and folder moves', () => {
  const entries = [
    { path: 'sections/One.md', isDir: false },
    { path: 'sections/Archive', isDir: true },
    { path: 'sections/Two.md', isDir: false }
  ];
  const before = calculateSectionMove(entries, [], 'sections/Two.md', 'sections/One.md', 'before');
  assert.equal(before.kind, 'reorder');
  assert.equal(before.destination, 'sections/Two.md');
  assert.deepEqual(before.order.slice(0, 3), ['sections/Two.md', 'sections/One.md', 'sections/Archive']);

  const inside = calculateSectionMove(entries, [], 'sections/One.md', 'sections/Archive', 'inside');
  assert.equal(inside.kind, 'relocate');
  assert.equal(inside.destination, 'sections/Archive/One.md');
  assert.ok(inside.order.includes('sections/Archive/One.md'));
});

test('task panel resizing batches pointer updates into animation frames', () => {
  const resizer = fs.readFileSync(path.join(__dirname, '../src/ui/task-panel-resizer.ts'), 'utf8');

  assert.match(resizer, /let resizeFrame: number \| null = null/);
  assert.match(resizer, /window\.requestAnimationFrame/);
  assert.match(resizer, /if \(resizeFrame !== null\) return/);
  assert.match(resizer, /window\.cancelAnimationFrame\(resizeFrame\)/);
  assert.match(resizer, /flushPendingWidth\(\);\s*window\.removeEventListener\('pointermove'/);
});
