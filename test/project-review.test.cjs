const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let reviewProject;

before(async () => {
  server = await createTestServer({ server: { hmr: false } });
  ({ reviewProject } = await server.ssrLoadModule('/src/services/project-review.ts'));
});

after(async () => {
  await server?.close();
});

test('reports duplicate headings, empty sections, heading jumps, and long sections', async () => {
  const sections = [
    { path: 'sections/duplicate-one.md', isDir: false },
    { path: 'sections/duplicate-two.md', isDir: false },
    { path: 'sections/empty.md', isDir: false },
    { path: 'sections/jump.md', isDir: false },
    { path: 'sections/long.md', isDir: false },
    { path: 'sections/ignored-folder', isDir: true }
  ];
  const contentByPath = {
    'sections/duplicate-one.md': '# Same\n\nFirst section.',
    'sections/duplicate-two.md': '# Same\n\nSecond section.',
    'sections/empty.md': '',
    'sections/jump.md': '# Top\n\n### Skipped level',
    'sections/long.md': 'word '.repeat(2001)
  };
  const session = {
    readSection: async (path) => contentByPath[path]
  };

  const findings = await reviewProject(session, sections);
  const titles = findings.map(finding => finding.title);

  assert.equal(titles.filter(title => title === 'Duplicate heading').length, 2);
  assert.ok(titles.includes('Empty section'));
  assert.ok(titles.includes('Heading level jump'));
  assert.ok(titles.includes('Very long section'));
});
