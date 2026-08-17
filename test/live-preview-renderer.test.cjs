const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const renderer = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'preview', 'live', 'LivePreviewRenderer.ts'),
  'utf8'
);

test('page-guide placement builds shared lookups instead of rescanning for each guide', () => {
  assert.match(renderer, /const blockById = new Map<string, HTMLElement>\(\)/);
  assert.match(renderer, /const blockByAnchor = new Map<string, HTMLElement>\(\)/);
  assert.equal((renderer.match(/querySelectorAll<HTMLElement>\('\[data-ref\]'\)/g) ?? []).length, 1);
  assert.doesNotMatch(renderer, /Array\.from\(this\.container\.querySelectorAll<HTMLElement>\('\[data-ref\]'\)\)/);
  assert.match(renderer, /this\.clearPageBreakGuideMarkers\(\)/);
});

test('live rendering reuses known image dimensions without waiting for image readiness', () => {
  assert.match(renderer, /private readonly imageDimensions = new Map<string, ImageDimensions>\(\)/);
  assert.match(renderer, /this\.applyKnownImageDimensions\(source\)/);
  assert.match(renderer, /this\.rememberImageDimensions\(this\.container\)/);
  assert.match(renderer, /bindImageFallbacks\(this\.container\)/);
  assert.doesNotMatch(renderer, /reserveImageLayout|setTimeout\(resolve, 2500\)/);
});

test('clearing the live preview releases cached image dimensions', () => {
  assert.match(renderer, /public clear\(\): void \{\s*this\.current = null;\s*this\.imageDimensions\.clear\(\)/);
});
