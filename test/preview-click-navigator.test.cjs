const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let resolvePreviewClickTarget;
let CommittedPreviewIndex;
let collectVisiblePageSourceElements;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24687 } } });
  ({ resolvePreviewClickTarget } = await server.ssrLoadModule('/src/preview/navigation/PreviewClickNavigator.ts'));
  ({ CommittedPreviewIndex, collectVisiblePageSourceElements } = await server.ssrLoadModule('/src/preview/navigation/CommittedPreviewIndex.ts'));
});

after(async () => {
  await server?.close();
});

function target(element, startLine, endLine = startLine, priority = 1) {
  return {
    pageIndex: 0,
    element,
    entry: {
      anchor: `source-${startLine}`,
      range: { startLine, endLine },
      elementPath: [0],
      priority
    }
  };
}

test('resolves a click in a nested rendered element to its source block', () => {
  const clicked = { parentElement: null };
  const paragraph = {
    contains: candidate => candidate === paragraph || candidate === clicked
  };

  const resolved = resolvePreviewClickTarget(clicked, [target(paragraph, 12)]);

  assert.equal(resolved?.entry.range.startLine, 12);
});

test('prefers the closest source-backed block for nested preview content', () => {
  const clicked = { parentElement: null };
  const outer = {
    contains: () => true
  };
  const inner = {
    contains: candidate => candidate === inner || candidate === clicked
  };
  clicked.parentElement = inner;
  inner.parentElement = outer;

  const resolved = resolvePreviewClickTarget(clicked, [target(outer, 4, 20), target(inner, 9)]);

  assert.equal(resolved?.entry.range.startLine, 9);
});

test('returns no source target for preview areas without source metadata', () => {
  const clicked = { parentElement: null };
  const unrelated = { contains: () => false };

  assert.equal(resolvePreviewClickTarget(clicked, [target(unrelated, 3)]), null);
});

test('resolves a visible first-page clone through its stable source anchor', () => {
  const structuralClone = { contains: () => false };
  const visibleClone = {
    contains: candidate => candidate === visibleClone,
    closest: selector => selector === '[data-ref], [data-split-from]' ? visibleClone : null,
    getAttribute: name => name === 'data-ref' ? 'source-1' : null
  };

  const resolved = resolvePreviewClickTarget(visibleClone, [target(structuralClone, 1)]);

  assert.equal(resolved?.entry.range.startLine, 1);
  assert.equal(resolved?.element, visibleClone);
});

test('indexes visible Paged.js source copies instead of structural first-page clones', () => {
  const pageContent = {};
  const structuralClone = fakeSourceElement('first-block', null);
  const visibleClone = fakeSourceElement('first-block', pageContent);
  const page = fakePage([structuralClone, visibleClone], pageContent);

  const candidates = collectVisiblePageSourceElements(page);
  const index = CommittedPreviewIndex.build(fakeContainer([page]), [{
    anchor: 'first-block', range: { startLine: 1, endLine: 1 }, elementPath: [0], priority: 1
  }]);

  assert.deepEqual(candidates, [visibleClone]);
  assert.equal(index.getTargets().length, 1);
  assert.equal(index.getTargets()[0].element, visibleClone);
});

test('keeps visible source copies on separate pages clickable', () => {
  const firstContent = {};
  const secondContent = {};
  const firstCopy = fakeSourceElement('split-block', firstContent);
  const secondCopy = fakeSourceElement('split-block', secondContent, 'data-split-from');
  const index = CommittedPreviewIndex.build(fakeContainer([
    fakePage([firstCopy], firstContent),
    fakePage([secondCopy], secondContent)
  ]), [{
    anchor: 'split-block', range: { startLine: 8, endLine: 12 }, elementPath: [1], priority: 1
  }]);

  assert.deepEqual(index.getTargets().map(target => target.element), [firstCopy, secondCopy]);
});

test('committed navigation prefers the most specific matching source range', () => {
  const pageContent = {};
  const source = fakeSourceElement('nested-block', pageContent);
  const index = CommittedPreviewIndex.build(
    fakeContainer([fakePage([source], pageContent)]),
    [
      { anchor: 'nested-block', range: { startLine: 1, endLine: 20 }, elementPath: [0], priority: 1 },
      { anchor: 'nested-block', range: { startLine: 8, endLine: 10 }, elementPath: [0, 0], priority: 1 }
    ]
  );

  assert.deepEqual(index.resolve(9)?.entry.range, { startLine: 8, endLine: 10 });
});

function fakeSourceElement(reference, pageContent, attribute = 'data-ref') {
  return {
    getAttribute: name => name === attribute ? reference : null,
    closest: selector => selector === '.pagedjs_page_content' ? pageContent : null
  };
}

function fakePage(elements, pageContent) {
  return {
    querySelectorAll: selector => selector === '[data-ref]'
      ? elements.filter(element => element.getAttribute('data-ref'))
      : elements.filter(element => element.getAttribute('data-split-from')),
    contains: candidate => candidate === pageContent
  };
}

function fakeContainer(pages) {
  return { querySelectorAll: selector => selector === '.pagedjs_page' ? pages : [] };
}
