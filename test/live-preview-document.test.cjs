const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let createLivePreviewDocument;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24705 } } });
  ({ createLivePreviewDocument } = await server.ssrLoadModule('/src/preview/live/LivePreviewDocument.ts'));
});

after(async () => server?.close());

test('indexes exact and section-wide manifest entries once while preserving order', () => {
  const section = fakeElement('section', [fakeElement('p'), fakeElement('h2')], true);
  const manifest = [
    entry('section-before', [0], 1),
    entry('first-child', [0, 0], 2),
    entry('second-child', [0, 1], 3),
    entry('section-after', [0], 4)
  ];

  const document = createLivePreviewDocument({ children: [section] }, manifest);

  assert.deepEqual(document.blocks[0].manifest.map(item => item.anchor), [
    'section-before', 'first-child', 'section-after'
  ]);
  assert.deepEqual(document.blocks[1].manifest.map(item => item.anchor), [
    'section-before', 'second-child', 'section-after'
  ]);
});

test('manifest indexing scales linearly with block count', () => {
  const childCount = 200;
  const section = fakeElement(
    'section',
    Array.from({ length: childCount }, () => fakeElement('p')),
    true
  );
  let pathReads = 0;
  const manifest = Array.from({ length: childCount }, (_, index) => {
    const path = new Proxy([0, index], {
      get(target, property, receiver) {
        if (property === '0' || property === '1') pathReads += 1;
        return Reflect.get(target, property, receiver);
      }
    });
    return entry(`child-${index}`, path, index + 1);
  });

  const document = createLivePreviewDocument({ children: [section] }, manifest);

  assert.equal(document.blocks.length, childCount);
  assert.ok(pathReads < childCount * 4, `expected linear path reads, received ${pathReads}`);
});

function entry(anchor, elementPath, line) {
  return {
    anchor,
    elementPath,
    range: { startLine: line, endLine: line },
    priority: 1
  };
}

function fakeElement(tagName, children = [], isSection = false) {
  const upperTag = tagName.toUpperCase();
  return {
    attributes: isSection ? [{ name: 'class', value: 'document-section' }] : [],
    children,
    classList: { contains: name => isSection && name === 'document-section' },
    outerHTML: `<${tagName}></${tagName}>`,
    tagName: upperTag
  };
}
