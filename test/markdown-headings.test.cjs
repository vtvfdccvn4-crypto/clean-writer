const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let extractMarkdownHeadings;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24690 } } });
  ({ extractMarkdownHeadings } = await server.ssrLoadModule('/src/editor/markdown-headings.ts'));
});

after(async () => server?.close());

test('extracts ATX headings', () => {
  const markdown = `
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
`;
  const headings = extractMarkdownHeadings(markdown);
  assert.equal(headings.length, 6);
  assert.equal(headings[0].level, 1);
  assert.equal(headings[0].text, 'Heading 1');
  assert.equal(headings[0].line, 2);
  assert.equal(headings[5].level, 6);
  assert.equal(headings[5].text, 'Heading 6');
  assert.equal(headings[5].line, 7);
});

test('handles headings with leading spaces', () => {
  const markdown = `
 # One space
  ## Two spaces
   ### Three spaces
    #### Four spaces (Code block, not a heading)
`;
  const headings = extractMarkdownHeadings(markdown);
  assert.equal(headings.length, 3);
  assert.equal(headings[0].text, 'One space');
  assert.equal(headings[1].text, 'Two spaces');
  assert.equal(headings[2].text, 'Three spaces');
});

test('handles headings with trailing hashes', () => {
  const markdown = `
# Heading 1 #
## Heading 2 ##
### Heading 3 ###   
`;
  const headings = extractMarkdownHeadings(markdown);
  assert.equal(headings.length, 3);
  assert.equal(headings[0].text, 'Heading 1');
  assert.equal(headings[1].text, 'Heading 2');
  assert.equal(headings[2].text, 'Heading 3');
});

test('ignores headings inside fenced code blocks', () => {
  const markdown = `
# Real Heading

\`\`\`
# Ignored Heading
## Also Ignored
\`\`\`

## Another Real Heading

~~~
# Tilde Ignored
~~~
`;
  const headings = extractMarkdownHeadings(markdown);
  assert.equal(headings.length, 2);
  assert.equal(headings[0].text, 'Real Heading');
  assert.equal(headings[1].text, 'Another Real Heading');
});

test('handles malformed fences and recovers', () => {
  const markdown = `
\`\`\`
# Ignored
\`\`\`
# Real 1

\`\`
# Real 2
\`\`

~~~
# Ignored 2
~~~~
# Real 3
`;
  const headings = extractMarkdownHeadings(markdown);
  assert.equal(headings.length, 3);
  assert.equal(headings[0].text, 'Real 1');
  assert.equal(headings[1].text, 'Real 2');
  assert.equal(headings[2].text, 'Real 3');
});

test('handles blank headings, empty input, and CRLF', () => {
  const markdown = '#\r\n## \r\n###\r\n';
  const headings = extractMarkdownHeadings(markdown);
  assert.equal(headings.length, 3);
  assert.equal(headings[0].level, 1);
  assert.equal(headings[0].text, '');
  assert.equal(headings[1].level, 2);
  assert.equal(headings[1].text, '');
  assert.equal(headings[2].level, 3);
  assert.equal(headings[2].text, '');

  assert.deepEqual(extractMarkdownHeadings(''), []);
});

test('preserves literal punctuation in heading text', () => {
  const markdown = '# What? (Yes!) [Link](#) & **Bold**';
  const headings = extractMarkdownHeadings(markdown);
  assert.equal(headings.length, 1);
  assert.equal(headings[0].text, 'What? (Yes!) [Link](#) & **Bold**');
});
