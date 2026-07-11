const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let searchProject;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24692 } } });
  ({ searchProject } = await server.ssrLoadModule('/src/services/project-search.ts'));
});

after(async () => server?.close());

// Mock session and sections
const mockSession = {
  readSection: async (path) => {
    const files = {
      'sections/intro.md': 'Welcome to the project.\nThis is a test of the search function.',
      'sections/body.md': 'The body has more text.\nLet us test the search function again.\nSearch is cool.',
      'sections/empty.md': ''
    };
    return files[path] || '';
  }
};

const mockSections = [
  { path: 'sections/intro.md', isDir: false },
  { path: 'sections/body.md', isDir: false },
  { path: 'sections/empty.md', isDir: false }
];

test('returns empty array for empty query', async () => {
  const results = await searchProject(mockSession, mockSections, '');
  assert.equal(results.length, 0);
  
  const resultsSpace = await searchProject(mockSession, mockSections, '   ');
  assert.equal(resultsSpace.length, 0);
});

test('finds literal case-insensitive matches', async () => {
  const results = await searchProject(mockSession, mockSections, 'search');
  assert.equal(results.length, 3); // "search" in intro.md, "search" (x2) in body.md

  assert.equal(results[0].path, 'sections/intro.md');
  assert.equal(results[0].line, 2);
  
  assert.equal(results[1].path, 'sections/body.md');
  assert.equal(results[1].line, 2);
  
  assert.equal(results[2].path, 'sections/body.md');
  assert.equal(results[2].line, 3);
});

test('calculates line and column correctly', async () => {
  const results = await searchProject(mockSession, mockSections, 'Welcome');
  assert.equal(results.length, 1);
  assert.equal(results[0].line, 1);
  assert.equal(results[0].column, 0);

  const resultsTest = await searchProject(mockSession, mockSections, 'test');
  assert.equal(resultsTest.length, 2);
  assert.equal(resultsTest[0].path, 'sections/intro.md');
  assert.equal(resultsTest[0].line, 2);
  assert.equal(resultsTest[0].column, 10); // "This is a test..." -> index 10
});

test('generates excerpt with ellipsis', async () => {
  // We'll create a long file to test excerpt boundaries
  const longSession = {
    readSection: async () => 'A'.repeat(50) + 'match' + 'B'.repeat(50)
  };
  const sections = [{ path: 'test.md', isDir: false }];
  
  const results = await searchProject(longSession, sections, 'match');
  assert.equal(results.length, 1);
  assert.ok(results[0].excerpt.startsWith('…'));
  assert.ok(results[0].excerpt.endsWith('…'));
  // Should include 'match' in the middle
  assert.ok(results[0].excerpt.includes('match'));
  // Excerpt length is ~40 + 5 + 40 = 85 chars, plus ellipses
  assert.ok(results[0].excerpt.length <= 90);
});

test('respects result limits', async () => {
  const lotsOfMatches = {
    readSection: async () => 'match '.repeat(200)
  };
  const sections = [{ path: 'test.md', isDir: false }];
  
  const results = await searchProject(lotsOfMatches, sections, 'match', undefined, 50);
  assert.equal(results.length, 50);
});

test('respects abort signal', async () => {
  const controller = new AbortController();
  const slowSession = {
    readSection: async () => {
      controller.abort(); // Abort during first read
      return 'match';
    }
  };
  const sections = [{ path: 'test.md', isDir: false }, { path: 'test2.md', isDir: false }];
  
  const results = await searchProject(slowSession, sections, 'match', controller.signal);
  // Might return 0 or 1 depending on where exactly abort fires, but shouldn't process everything
  assert.ok(results.length <= 1);
});
