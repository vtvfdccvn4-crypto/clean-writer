const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let extractWritingStatistics;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24691 } } });
  ({ extractWritingStatistics } = await server.ssrLoadModule('/src/editor/writing-statistics.ts'));
});

after(async () => server?.close());

test('returns zeroes for empty string', () => {
  const stats = extractWritingStatistics('');
  assert.equal(stats.words, 0);
  assert.equal(stats.charactersWithSpaces, 0);
  assert.equal(stats.charactersWithoutSpaces, 0);
  assert.equal(stats.estimatedReadingTimeMinutes, 0);
});

test('counts simple prose correctly', () => {
  const stats = extractWritingStatistics('Hello world this is a test.');
  assert.equal(stats.words, 6);
  assert.equal(stats.charactersWithSpaces, 27);
  assert.equal(stats.charactersWithoutSpaces, 22);
  assert.equal(stats.estimatedReadingTimeMinutes, 1);
});

test('handles punctuation and numbers', () => {
  const stats = extractWritingStatistics('It cost $100.50! Right?');
  // Words: "It", "cost", "100", "50", "Right"
  assert.equal(stats.words, 5);
});

test('strips YAML front matter', () => {
  const markdown = `---
title: Test Document
author: Author Name
---
This is the actual content.`;
  const stats = extractWritingStatistics(markdown);
  // Only words in "This is the actual content." should be counted
  assert.equal(stats.words, 5);
});

test('strips HTML tags naively', () => {
  const markdown = '<strong>Bold text</strong> and <em>italic</em>.';
  const stats = extractWritingStatistics(markdown);
  assert.equal(stats.words, 4);
});

test('extracts text from markdown links', () => {
  const markdown = 'Visit [this site](https://example.com/foo_bar) today.';
  const stats = extractWritingStatistics(markdown);
  // "Visit", "this", "site", "today"
  assert.equal(stats.words, 4);
});

test('ignores fenced code blocks', () => {
  const markdown = `
Intro text.

\`\`\`
code words should not count
\`\`\`

More text here.
`;
  const stats = extractWritingStatistics(markdown);
  assert.equal(stats.words, 5);
});

test('estimates reading time rounded properly', () => {
  // Generate a long text of 500 words
  const words = Array(500).fill('word').join(' ');
  const stats = extractWritingStatistics(words);
  // 500 / 250 = 2 minutes
  assert.equal(stats.estimatedReadingTimeMinutes, 2);
});

test('handles unicode letters', () => {
  const stats = extractWritingStatistics('¡Hola! ¿Cómo estás?');
  assert.equal(stats.words, 3);
});
