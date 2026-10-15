const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
const app = read('src/boot/app.ts');
const setupPdfPreview = read('src/boot/setupPdfPreview.ts');
const setupWritingTools = read('src/boot/setupWritingTools.ts');
const setupSettingsFeatures = read('src/boot/setupSettingsFeatures.ts');
const bundleBudget = read('scripts/check-bundle-budget.mjs');

test('application entry keeps feature-heavy modules behind dynamic imports', () => {
  assert.doesNotMatch(app, /import\s+\{[^}]*\}\s+from ['"].*editor-manager['"]/);
  assert.doesNotMatch(app, /from ['"].*setupSettingsFeatures['"]/);
  assert.doesNotMatch(app, /from ['"].*setupWritingTools['"]/);
  assert.doesNotMatch(app, /from ['"].*setupPdfPreview['"]/);
  assert.match(app, /import\('\.\.\/ui\/editor-manager'\)/);
  assert.match(app, /import\('\.\/setupPdfPreview'\)/);
  assert.match(app, /import\('\.\/setupWritingTools'\)/);
  assert.match(app, /import\('\.\.\/ui\/settings\/settings-drawer'\)/);
  assert.match(app, /import\('\.\/setupSettingsFeatures'\)/);
});

test('PDF execution remains deferred and popup-safe', () => {
  assert.match(setupPdfPreview, /import\('\.\.\/pdf-preview\/IsolatedPdfPreviewPipeline'\)/);
  assert.match(setupPdfPreview, /PdfPreviewPrintTarget\.open\(\)/);
  assert.match(setupPdfPreview, /printTarget\.close\(\)/);
});

test('optional project tools do not pull the always-on keyboard workflow', () => {
  assert.doesNotMatch(setupWritingTools, /keyboard-shortcuts/);
  assert.match(setupWritingTools, /initDocumentOutlineDrawer/);
  assert.match(setupWritingTools, /initProjectSearchDrawer/);
  assert.match(setupWritingTools, /initProjectReviewDrawer/);
});

test('bundle guardrail enforces the 500 KiB initial-chunk target', () => {
  assert.match(bundleBudget, /500 \* 1024/);
});

test('settings feature module remains independently loadable', () => {
  assert.match(setupSettingsFeatures, /initPageSetupDrawer/);
  assert.match(setupSettingsFeatures, /initCustomStylesDrawer/);
});

test('project metadata button loads its lazily initialized drawer', () => {
  assert.match(app, /closest<HTMLElement>\([^\n]*#btn-project-metadata/);
  assert.match(app, /target\.id === 'btn-project-metadata'[\s\S]*?loadSettingsFeatures\(\)[\s\S]*?dispatchEvent/);
});
