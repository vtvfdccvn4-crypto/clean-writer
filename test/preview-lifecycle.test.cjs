const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const controller = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'preview', 'PreviewController.ts'),
  'utf8'
);
const viewport = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'preview', 'PreviewViewport.ts'),
  'utf8'
);
const coordinator = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'ui', 'PreviewCoordinator.ts'),
  'utf8'
);
const specialHeadings = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'preview', 'specialHeadings.ts'),
  'utf8'
);

test('preview lifecycle exposes coordinated resource disposal', () => {
  assert.match(controller, /public dispose\(\): void/);
  assert.match(controller, /removeEventListener\('scroll', this\.handlePreviewScroll\)/);
  assert.match(controller, /window\.removeEventListener\('resize', this\.handleWindowResize\)/);
  assert.match(controller, /this\.clickNavigation\.destroy\(\)/);
  assert.match(controller, /this\.viewport\.dispose\(\)/);
  assert.match(viewport, /this\.resizeObserver\?\.disconnect\(\)/);
  assert.match(coordinator, /dispose\(\): void/);
  assert.match(coordinator, /this\.controller\.dispose\(\)/);
});

test('special-heading numbering indexes definitions once', () => {
  assert.match(specialHeadings, /const definitionsById = new Map/);
  assert.match(specialHeadings, /definitionsById\.get\(id\)/);
  assert.doesNotMatch(specialHeadings, /definitions\.find\(/);
});
