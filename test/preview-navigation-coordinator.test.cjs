const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let PreviewNavigationCoordinator;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24686 } } });
  ({ PreviewNavigationCoordinator } = await server.ssrLoadModule('/src/preview/navigation/PreviewNavigationCoordinator.ts'));
});

after(async () => {
  await server?.close();
});

function targetFor(line) {
  return {
    pageIndex: 0,
    element: {},
    entry: {
      range: { startLine: line, endLine: line },
      elementPath: [0],
      priority: 1
    }
  };
}

test('queues a selection until the matching preview revision commits', () => {
  const revealed = [];
  const coordinator = new PreviewNavigationCoordinator(target => revealed.push(target.entry.range.startLine));
  const target = targetFor(8);

  coordinator.beginRender(4);
  coordinator.requestNavigation(8, 4);
  assert.deepEqual(revealed, []);

  coordinator.commitRender(4, { resolve: line => line === 8 ? target : null });
  assert.deepEqual(revealed, [8]);
});

test('does not reveal a stale selection after a newer revision starts', () => {
  const revealed = [];
  const coordinator = new PreviewNavigationCoordinator(target => revealed.push(target.entry.range.startLine));

  coordinator.beginRender(4);
  coordinator.requestNavigation(8, 4);
  coordinator.beginRender(5);
  coordinator.commitRender(5, { resolve: () => targetFor(8) });

  assert.deepEqual(revealed, []);
});

test('uses the committed index immediately when no matching render is pending', () => {
  const revealed = [];
  const coordinator = new PreviewNavigationCoordinator(target => revealed.push(target.entry.range.startLine));

  coordinator.commitRender(6, { resolve: line => targetFor(line) });
  coordinator.requestNavigation(11, 6);

  assert.deepEqual(revealed, [11]);
});
