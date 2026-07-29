const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const factory = fs.readFileSync(path.join(__dirname, '..', 'src', 'pdf-preview', 'PdfPreviewJobFactory.ts'), 'utf8');
const editor = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'editor-manager.ts'), 'utf8');

test('PDF preview job factory owns immutable print-job assembly', () => {
  assert.match(factory, /createPdfPreviewJob/);
  assert.match(factory, /createPdfPreviewGuideJob/);
  assert.match(factory, /compilePrintDocument/);
  assert.match(factory, /compilePrintCss/);
  assert.match(factory, /resolveMarginImageSources/);
});

test('EditorManager delegates PDF job assembly to the factory', () => {
  assert.match(editor, /createPdfPreviewJob\(html, layout, this\.platform\.assetResolver\)/);
  assert.match(editor, /createPdfPreviewGuideJob\(compiled\.html, layout\)/);
  assert.doesNotMatch(editor, /function collectPrintMarginImageSources/);
});
