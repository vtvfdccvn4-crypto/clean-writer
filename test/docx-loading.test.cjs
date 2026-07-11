const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

test('DOCX exporter is loaded only when a Word export is requested', () => {
  const appBootSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'boot', 'app.ts'), 'utf8');

  assert.doesNotMatch(appBootSource, /import\s+\{\s*generateDocx\s*\}\s+from\s+['"]\.\.\/services\/ExportDocxService['"]/);
  assert.match(appBootSource, /await import\(['"]\.\.\/services\/ExportDocxService['"]\)/);
});
