const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let BrowserExportService;
let previewMetrics;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24692 } } });
  ({ BrowserExportService } = await server.ssrLoadModule('/src/platform/BrowserExportService.ts'));
  ({ previewMetrics } = await server.ssrLoadModule('/src/perf/preview-metrics.ts'));
});

after(async () => server?.close());

test('browser PDF capability is enabled while DOCX remains deferred', () => {
  const service = new BrowserExportService();
  assert.deepEqual(service.support, { pdf: true, docx: false });
});

test('browser PDF export reports a blocked popup without throwing', async () => {
  const previousWindow = global.window;
  global.window = { open: () => null };
  try {
    const service = new BrowserExportService();
    const result = await service.exportPdf('<p>PDF</p>', {}, {}, {}, {}, {}, null);
    assert.equal(result, false);
  } finally {
    global.window = previousWindow;
  }
});

test('browser PDF preparation opens one reusable export window', () => {
  const previousWindow = global.window;
  const exportWindow = { document: {} };
  global.window = { open: () => exportWindow };
  try {
    const service = new BrowserExportService();
    assert.equal(service.preparePdfExport(), exportWindow);
  } finally {
    global.window = previousWindow;
  }
});

test('browser PDF preparation prefers a hidden iframe print target', () => {
  const previousWindow = global.window;
  const previousDocument = global.document;
  let popupOpened = false;
  let appendedFrame = null;
  const printWindow = { document: {} };
  const frame = {
    style: {},
    tabIndex: 0,
    contentWindow: printWindow,
    setAttribute: () => {},
    remove: () => {}
  };
  global.window = { open: () => { popupOpened = true; return null; } };
  global.document = {
    body: {
      appendChild: value => { appendedFrame = value; }
    },
    createElement: tagName => {
      assert.equal(tagName, 'iframe');
      return frame;
    }
  };
  try {
    const service = new BrowserExportService();
    assert.equal(service.preparePdfExport(), printWindow);
    assert.equal(appendedFrame, frame);
    assert.equal(popupOpened, false);
    assert.equal(frame.style.position, 'fixed');
    assert.equal(frame.style.opacity, '0');
  } finally {
    global.window = previousWindow;
    global.document = previousDocument;
  }
});

test('browser PDF export registers afterprint cleanup without delaying success', async () => {
  const previousWindow = global.window;
  const listeners = new Map();
  const popup = {
    closed: false,
    document: {
      readyState: 'complete',
      querySelectorAll: () => [],
      open: () => {},
      write: () => {},
      close: () => {}
    },
    addEventListener: (name, handler) => listeners.set(name, handler),
    requestAnimationFrame: callback => callback(),
    focus: () => {},
    print: () => {},
    close: () => { popup.closed = true; }
  };
  global.window = { open: () => popup };
  global.document = { querySelectorAll: () => [] };
  try {
    const service = new BrowserExportService();
    assert.equal(await service.exportPdf('<div class="pagedjs_page"></div>', { paperWidth: 210, paperHeight: 297 }, {}, {}, {}, {}, null), true);
    assert.equal(typeof listeners.get('afterprint'), 'function');
    listeners.get('afterprint')();
    assert.equal(popup.closed, true);
  } finally {
    global.window = previousWindow;
    delete global.document;
  }
});

test('browser PDF export cleans up the print target when printing fails', async () => {
  const previousWindow = global.window;
  const previousDocument = global.document;
  const popup = {
    closed: false,
    document: {
      readyState: 'complete',
      querySelectorAll: () => [],
      open: () => {},
      write: () => {},
      close: () => {}
    },
    addEventListener: () => {},
    requestAnimationFrame: callback => callback(),
    focus: () => {},
    print: () => { throw new Error('print failed'); },
    close: () => { popup.closed = true; }
  };
  global.window = { open: () => popup };
  global.document = { querySelectorAll: () => [] };
  try {
    const service = new BrowserExportService();
    await assert.rejects(
      service.exportPdf('<p>PDF</p>', { paperWidth: 210, paperHeight: 297 }, {}, {}, {}, {}, null),
      /print failed/
    );
    assert.equal(popup.closed, true);
  } finally {
    global.window = previousWindow;
    delete global.document;
  }
});

test('browser PDF export writes only the paginated document and explicit print CSS', async () => {
  const previousWindow = global.window;
  const previousDocument = global.document;
  let written = '';
  let printCount = 0;
  const popup = {
    closed: false,
    document: {
      readyState: 'complete',
      querySelectorAll: () => [],
      open: () => {},
      write: value => { written = value; },
      close: () => {}
    },
    addEventListener: () => {},
    requestAnimationFrame: callback => callback(),
    focus: () => {},
    print: () => { printCount += 1; },
    close: () => { popup.closed = true; }
  };
  global.window = { open: () => popup };
  global.document = {
    querySelectorAll: () => []
  };
  try {
    const service = new BrowserExportService();
    const result = await service.exportPdf(
      '<div class="pagedjs_pages"><div class="pagedjs_page"><div class="pagedjs_page_content">Document</div></div></div>',
      { paperWidth: 148, paperHeight: 210 }, {}, {}, {}, {}, null, popup
    );
    assert.equal(result, true);
    assert.equal(printCount, 1);
    assert.match(written, /id="clear-writer-pdf-document"/);
    assert.match(written, /class="pagedjs_page"/);
    assert.match(written, /size: 148mm 210mm/);
    const bodyMarkup = written.match(/<body>([\s\S]*)<\/body>/)?.[1] || '';
    assert.doesNotMatch(bodyMarkup, /app-layout|section-list|cm-editor|preview-toolbar/);
  } finally {
    global.window = previousWindow;
    global.document = previousDocument;
  }
});

test('browser PDF export filters unrelated application CSS from the print document', async () => {
  const previousWindow = global.window;
  const previousDocument = global.document;
  let written = '';
  const popup = {
    closed: false,
    document: {
      readyState: 'complete',
      querySelectorAll: () => [],
      open: () => {},
      write: value => { written = value; },
      close: () => {}
    },
    addEventListener: () => {},
    requestAnimationFrame: callback => callback(),
    focus: () => {},
    print: () => {},
    close: () => { popup.closed = true; }
  };
  const stylesheet = {
    href: 'https://clear-writer.test/assets/app.css',
    cssRules: [
      { cssText: '.workspace { display: grid; }' },
      { cssText: '.pagedjs_page_content { color: #111; }' },
      { cssText: ':root { --font-ui: Inter; }' }
    ]
  };
  const link = { href: stylesheet.href };
  global.window = { open: () => popup, location: { href: 'https://clear-writer.test/' } };
  global.document = {
    styleSheets: [stylesheet],
    querySelectorAll: selector => selector.includes('link') ? [link] : []
  };
  try {
    const service = new BrowserExportService();
    assert.equal(await service.exportPdf('<p>Document</p>', { paperWidth: 210, paperHeight: 297 }, {}, {}, {}, {}, null, popup), true);
    assert.doesNotMatch(written, /\.workspace\s*\{/);
    assert.match(written, /\.pagedjs_page_content\s*\{/);
    assert.match(written, /:root\s*\{/);
  } finally {
    global.window = previousWindow;
    global.document = previousDocument;
  }
});

test('browser PDF export filters unmarked inline CSS while preserving marked document styles', async () => {
  const previousWindow = global.window;
  const previousDocument = global.document;
  let written = '';
  const popup = {
    closed: false,
    document: {
      readyState: 'complete',
      querySelectorAll: () => [],
      open: () => {},
      write: value => { written = value; },
      close: () => {}
    },
    addEventListener: () => {},
    requestAnimationFrame: callback => callback(),
    focus: () => {},
    print: () => {},
    close: () => { popup.closed = true; }
  };
  const viteStyleSheet = {
    href: null,
    cssRules: [
      { cssText: '.workspace { display: grid; }' },
      { cssText: '.pagedjs_page_content { color: #111; }' }
    ]
  };
  const viteStyle = {
    textContent: '.workspace { display: grid; }.pagedjs_page_content { color: #111; }',
    sheet: viteStyleSheet,
    hasAttribute: () => false
  };
  const documentStyle = {
    textContent: '.custom-document-rule { color: #123456; }',
    sheet: null,
    hasAttribute: name => name === 'data-clear-writer-print-style'
  };
  global.window = { open: () => popup, location: { href: 'https://clear-writer.test/' } };
  global.document = {
    styleSheets: [viteStyleSheet],
    querySelectorAll: selector => selector.includes('link') ? [] : [viteStyle, documentStyle]
  };
  try {
    const service = new BrowserExportService();
    assert.equal(await service.exportPdf('<p>Document</p>', { paperWidth: 210, paperHeight: 297 }, {}, {}, {}, {}, null, popup), true);
    assert.doesNotMatch(written, /\.workspace\s*\{/);
    assert.match(written, /\.pagedjs_page_content\s*\{/);
    assert.match(written, /\.custom-document-rule\s*\{/);
  } finally {
    global.window = previousWindow;
    global.document = previousDocument;
  }
});

test('browser PDF export records when CSS filtering falls back to a stylesheet link', async () => {
  const previousWindow = global.window;
  const previousDocument = global.document;
  const popup = {
    closed: false,
    document: {
      readyState: 'complete',
      querySelectorAll: () => [],
      open: () => {},
      write: () => {},
      close: () => {}
    },
    addEventListener: () => {},
    requestAnimationFrame: callback => callback(),
    focus: () => {},
    print: () => {},
    close: () => { popup.closed = true; }
  };
  const stylesheet = {
    href: 'https://clear-writer.test/assets/app.css',
    get cssRules() { throw new Error('CSSOM blocked'); }
  };
  const link = { href: stylesheet.href };
  previewMetrics.reset();
  global.window = { open: () => popup, location: { href: 'https://clear-writer.test/' } };
  global.document = {
    styleSheets: [stylesheet],
    querySelectorAll: selector => selector.includes('link') ? [link] : []
  };
  try {
    const service = new BrowserExportService();
    assert.equal(await service.exportPdf('<p>Document</p>', { paperWidth: 210, paperHeight: 297 }, {}, {}, {}, {}, null, popup), true);
    assert.equal(previewMetrics.snapshot().buckets['pdfPrintCssFallback:cssom-unreadable'].count, 1);
  } finally {
    global.window = previousWindow;
    global.document = previousDocument;
  }
});

test('prepared popup can be used for repeated PDF exports', async () => {
  const previousWindow = global.window;
  const previousDocument = global.document;
  let printCount = 0;
  const popup = {
    closed: false,
    document: {
      readyState: 'complete',
      querySelectorAll: () => [],
      open: () => {},
      write: () => {},
      close: () => {}
    },
    addEventListener: () => {},
    requestAnimationFrame: callback => callback(),
    focus: () => {},
    print: () => { printCount += 1; },
    close: () => { popup.closed = true; }
  };
  global.window = { open: () => popup };
  global.document = { querySelectorAll: () => [] };
  try {
    const service = new BrowserExportService();
    const prepared = service.preparePdfExport();
    assert.equal(await service.exportPdf('<p>First</p>', { paperWidth: 210, paperHeight: 297 }, {}, {}, {}, {}, null, prepared), true);
    assert.equal(await service.exportPdf('<p>Second</p>', { paperWidth: 210, paperHeight: 297 }, {}, {}, {}, {}, null, prepared), true);
    assert.equal(printCount, 2);
  } finally {
    global.window = previousWindow;
    global.document = previousDocument;
  }
});
