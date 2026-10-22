const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const pipeline = fs.readFileSync(path.join(__dirname, '..', 'src', 'pdf-preview', 'IsolatedPdfPreviewPipeline.ts'), 'utf8');
const frame = fs.readFileSync(path.join(__dirname, '..', 'src', 'boot', 'pdf-preview-frame.ts'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'components', 'PreviewPanel.ts'), 'utf8');
const setup = fs.readFileSync(path.join(__dirname, '..', 'src', 'boot', 'setupPdfPreview.ts'), 'utf8');
const margins = fs.readFileSync(path.join(__dirname, '..', 'src', 'pdf-preview', 'PdfPreviewMarginRenderer.ts'), 'utf8');
const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'pdf-preview', 'IsolatedPaginationHost.ts'), 'utf8');
const contracts = fs.readFileSync(path.join(__dirname, '..', 'src', 'pdf-preview', 'contracts.ts'), 'utf8');
const printTarget = fs.readFileSync(path.join(__dirname, '..', 'src', 'pdf-preview', 'PdfPreviewPrintTarget.ts'), 'utf8');
const artifactRenderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'pdf-preview', 'PdfArtifactRenderer.ts'), 'utf8');
const framePaginator = fs.readFileSync(path.join(__dirname, '..', 'src', 'pdf-preview', 'PdfPreviewFramePaginator.ts'), 'utf8');
const tocPageNumbers = fs.readFileSync(path.join(__dirname, '..', 'src', 'pdf-preview', 'PdfPreviewTocPageNumbers.ts'), 'utf8');
const printCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'print', 'PrintCssCompiler.ts'), 'utf8');
const budget = fs.readFileSync(path.join(__dirname, '..', 'src', 'pdf-preview', 'PdfPreviewPaginationBudget.ts'), 'utf8');
const diagnostics = fs.readFileSync(path.join(__dirname, '..', 'src', 'pdf-preview', 'PdfPreviewDiagnosticsLog.ts'), 'utf8');
const controller = fs.readFileSync(path.join(__dirname, '..', 'src', 'preview', 'PreviewController.ts'), 'utf8');
const coordinator = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'PreviewCoordinator.ts'), 'utf8');
const editorManager = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'editor-manager.ts'), 'utf8');
const renderCoordinator = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'DocumentRenderCoordinator.ts'), 'utf8');
const paginatedRenderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'PaginatedPreviewRenderer.ts'), 'utf8');

test('isolated PDF preview has an independent frame and protocol', () => {
  assert.match(pipeline, /IsolatedPaginationHost/);
  assert.match(pipeline, /PdfPreviewPrintTarget/);
  assert.match(host, /pdf-preview/);
  assert.match(contracts, /clear-writer-pdf-preview-request/);
  assert.match(framePaginator, /new Previewer\(\)/);
  assert.match(frame, /materializePdfPreviewTocPageNumbers\(stage\)/);
  assert.match(tocPageNumbers, /\.pagedjs_page/);
  assert.match(tocPageNumbers, /\.toc-page-number/);
  assert.match(tocPageNumbers, /index \+ 1/);
  assert.match(framePaginator, /queue\.tick/);
  assert.match(framePaginator, /queue\.enqueue/);
  assert.equal((frame.match(/paginatePreviewFrame/g) || []).length, 2);
  assert.match(frame, /clear-writer-pdf-preview-result/);
  assert.doesNotMatch(pipeline, /noopener,noreferrer/);
});

test('page-dependent values are materialized before the PDF artifact is frozen', () => {
  assert.ok(frame.indexOf('materializePdfPreviewTocPageNumbers(stage)') < frame.indexOf('const artifact = createPdfArtifact'));
  assert.match(tocPageNumbers, /decodeURIComponent/);
  assert.match(tocPageNumbers, /textContent = pageNumber === undefined/);
  assert.match(tocPageNumbers, /output\.textContent = '0000'/);
});

test('the artifact stylesheet owns physical print geometry and TOC reservation', () => {
  assert.match(printCss, /compilePdfArtifactPrintCss/);
  assert.match(printCss, /flex: 0 0 4ch/);
  assert.doesNotMatch(printTarget, /@page \{ margin: 0; \}/);
  assert.match(frame, /input\.artifactPrintCss/);
});

test('list marker text is materialized before the one Paged.js pass', () => {
  assert.match(frame, /materializePdfListMarkers\(source, input\.listMarkerStyles\)/);
  assert.ok(frame.indexOf('materializePdfListMarkers(source, input.listMarkerStyles)') < frame.indexOf('materializePdfPreviewTocPageNumbers(stage)'));
});

test('isolated PDF preview is exposed through a dedicated button and boot route', () => {
  assert.match(panel, /btn-pdf-preview/);
  assert.match(setup, /btn-pdf-preview/);
  assert.match(printTarget, /Preparing PDF preview/);
  assert.match(printTarget, /printArtifact/);
  assert.match(printTarget, /PRINT_RESOURCE_WAIT_MS = 2_000/);
  assert.match(printTarget, /doc\.fonts\?\.ready/);
  assert.doesNotMatch(pipeline, /installPrintDocument|waitForPrintResources/);
  assert.match(margins, /parseMarkdownImages/);
  assert.match(margins, /Parse Markdown images once per cell/);
  assert.match(margins, /domWriteMs/);
  assert.match(frame, /marginDomWriteMs/);
  assert.match(host, /frame-margin-dom-write/);
  assert.doesNotMatch(host, /requestPageGuides/);
  assert.match(paginatedRenderer, /requestPrintArtifact\(/);
  assert.match(paginatedRenderer, /outcome\.result\.artifact\.pages/);
  assert.match(host, /status: 'cancelled'/);
  assert.match(host, /PaginationTimeoutError/);
  assert.match(host, /FRAME_STARTUP_TIMEOUT_MS = 15_000/);
  assert.match(host, /frame\.removeEventListener\('error', frameError\)/);
  assert.match(host, /estimatePdfPreviewBudget/);
  assert.match(budget, /PRINT_MAX_TIMEOUT_MS = 300_000/);
  assert.match(budget, /estimatedPages/);
  assert.match(diagnostics, /MAX_ENTRIES = 50/);
  assert.doesNotMatch(diagnostics, /html|css|marginImageSources/);
  assert.match(setup, /AbortController/);
  assert.match(setup, /cancelOnEscape/);
  assert.match(setup, /approximately/);
  assert.match(main, /pdf-preview/);
});

test('paginated page-setup changes rebuild the isolated preview job', () => {
  assert.match(controller, /createIsolatedJob\?: \(sourceHtml: string, pageSetup: PageSetup\) => PdfPreviewJob/);
  assert.match(controller, /this\.mode === 'paginated' && this\.createIsolatedJob/);
  assert.match(controller, /this\.forceRenderIsolated\(/);
  assert.match(coordinator, /createIsolatedJob\?: \(sourceHtml: string, pageSetup: PageSetup\) => PdfPreviewJob/);
  assert.match(editorManager, /createPdfPreviewJob\(sourceHtml, this\.renderCoordinator\.capturePrintLayout\(pageSetup\)/);
});

test('single-document print preview uses the isolated paginator', () => {
  assert.match(renderCoordinator, /createPdfPreviewJob\(initialPreview\.html, this\.capturePrintLayout\(\)/);
  assert.match(renderCoordinator, /this\.preview\.forceRenderIsolated\(/);
  assert.match(renderCoordinator, /if \(this\.opts\.getIsFinalPrintPreview\(\)\)/);
  assert.doesNotMatch(editorManager, /enterCanonicalEditingMode/);
  assert.match(renderCoordinator, /if \(this\.opts\.getIsFinalPrintPreview\(\)\) \{[\s\S]*?this\.preview\.forceRenderIsolated\(/);
  assert.match(renderCoordinator, /createPdfPreviewJob\(compiledPreview\.html, this\.capturePrintLayout\(\)/);
});

test('print-layout settings invalidate an installed paginated artifact', () => {
  assert.match(controller, /refreshPaginatedPreview\(\)/);
  assert.match(controller, /this\.mode !== 'paginated'/);
  assert.match(coordinator, /refreshPaginatedPreview\(\)/);
  // Settings listeners coalesce through the scheduler, which drives the controller refresh.
  assert.match(coordinator, /schedulePaginatedRefresh\(\)[\s\S]*?this\.controller\.refreshPaginatedPreview\(\)/);
  assert.match(editorManager, /state\.onCustomStylesChanged\(listener\)/);
  assert.match(editorManager, /state\.onCustomBlockStylesChanged\(listener\)/);
  assert.match(editorManager, /subscribe\(\(\) => \{[\s\S]*?this\.refreshPagination\(\)/);
  assert.match(editorManager, /refreshPagination\(\): void \{[\s\S]*?schedulePaginatedRefresh\(\)/);
});

test('isolated pagination preserves the job stylesheet with generated Paged.js CSS', () => {
  assert.match(framePaginator, /const paginationCss = \[\s*css,/s);
  assert.match(framePaginator, /paginationStyles\.map\(style => style\.textContent \|\| ''\)/);
});

test('print consumes a completed PDF artifact rather than separate HTML and CSS values', () => {
  assert.match(printTarget, /printArtifact\(artifact: PdfArtifact\)/);
  assert.match(printTarget, /stage\.dataset\.pdfArtifactId = artifact\.artifactId/);
  assert.doesNotMatch(printTarget, /printArtifact\(html: string, paginationCss: string\)/);
  assert.match(pipeline, /printTarget\.printArtifact\(result\.artifact\)/);
  assert.match(artifactRenderer, /renderPdfArtifactContent/);
  assert.match(printTarget, /renderPdfArtifactContent\(doc, artifact\)/);
  assert.match(controller, /renderPdfArtifactContent\(document, outcome\.result\.artifact\)/);
});

test('printing reuses only the matching artifact rendered by the paginated preview', () => {
  assert.match(controller, /getPdfArtifact\(artifactKey: PdfArtifactKey\)/);
  assert.match(controller, /this\.pdfArtifacts\.get\(artifactKey\)/);
  assert.match(controller, /this\.pdfArtifacts\.replace\(outcome\.result\.artifact\)/);
  assert.match(editorManager, /getPreparedPdfArtifact\(input: PdfPreviewJob\)/);
  assert.match(setup, /const preparedArtifact = editorManager\.getPreparedPdfArtifact\(input\)/);
  assert.match(setup, /await printTarget\.printArtifact\(preparedArtifact\)/);
  assert.match(setup, /if \(preparedArtifact\) \{[\s\S]*?printArtifact\(preparedArtifact\)[\s\S]*?return;[\s\S]*?const \{ IsolatedPdfPreviewPipeline \} = await loadPdfPreviewPipeline\(\)/);
});
