const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let compileMarkdown;
let buildProjectImageMarkdown;
let parseMarkdownImages;
let parseEditorMarkdownImages;
let getProjectImageLookupPaths;
let resolveImageSource;
let resolvePdfPreviewMarginText;
let state;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24679 } } });

  ({ compileMarkdown } = await server.ssrLoadModule('/src/compiler/index.ts'));
  ({ buildProjectImageMarkdown } = await server.ssrLoadModule('/src/images/imageMarkdown.ts'));
  ({ parseMarkdownImages } = await server.ssrLoadModule('/src/images/markdownImages.ts'));
  ({ parseEditorMarkdownImages } = await server.ssrLoadModule('/src/editor/markdown/parseMarkdownImage.ts'));
  ({ getProjectImageLookupPaths, resolveImageSource } = await server.ssrLoadModule('/src/images/imageSources.ts'));
  ({ resolvePdfPreviewMarginText } = await server.ssrLoadModule('/src/pdf-preview/PdfPreviewMarginRenderer.ts'));
  ({ state } = await server.ssrLoadModule('/src/state.ts'));
});

after(async () => {
  await server?.close();
});

test('body image compilation handles parentheses, titles, and safely encoded file paths', async () => {
  const assetResolver = {
    resolveSync: source => `blob:mock/${encodeURIComponent(source)}`,
    async preloadImages() {},
    release() {},
    releaseAll() {}
  };
  const html = await compileMarkdown(
    '![Logo](<images/logo_(final)#1.png> "Product logo")',
    assetResolver
  );

  assert.match(html, /src="blob:mock\/images%2Flogo_\(final\)%231\.png"/);
  assert.match(html, /title="Product logo"/);
  assert.match(html, /data-image-source="images\/logo_\(final\)#1\.png"/);
  assert.doesNotMatch(html, /data-source-(?:line|start|end|id)=/);
  assert.doesNotMatch(html, /onerror=/i);
});

test('raw project HTML is sanitized before it reaches the renderer', async () => {
  const html = await compileMarkdown(
    '<script>require("node:fs").writeFileSync("owned", "yes")</script>\n\n' +
    '<img src="missing.png" onerror="require(\'node:fs\').rmSync(\'C:/\', {recursive:true})">\n\n' +
    '<strong>Safe content</strong>'
  );

  assert.doesNotMatch(html, /<script|onerror|require\(/i);
  assert.match(html, /<strong>Safe content<\/strong>/);
});

test('image attribute syntax rejects injected CSS values', async () => {
  const html = await compileMarkdown('![Safe](images/safe.png){width="10px;background:red" align=sideways}');
  assert.doesNotMatch(html, /style="[^"]*background|sideways/i);
});

test('image attributes apply width and alignment styles to the rendered preview', async () => {
  const html = await compileMarkdown('![Safe](images/safe.png){width=50% align=center margin="6mm 0"}');
  assert.match(html, /style="width: 50%; max-width: 100%; margin: 6mm auto; display: block;\s*"/);
  assert.match(html, /data-image-alignment="center"/);
});

test('centered image attributes stay centered with unequal vertical margins', async () => {
  const html = await compileMarkdown('![Safe](images/safe.png){align=center margin="4mm 0 8mm"}');
  assert.match(html, /style="margin: 4mm auto 8mm; display: block;\s*"/);
  assert.match(html, /data-image-alignment="center"/);
});

test('image attributes preserve left and right alignment with vertical margins', async () => {
  const html = await compileMarkdown('![Safe](images/safe.png){align=right margin="4mm 0 8mm"}');
  assert.match(html, /style="margin: 4mm 0 8mm auto; display: block;\s*"/);
  assert.match(html, /data-image-alignment="right"/);
});

test('header and footer image parsing uses CommonMark image rules', () => {
  const matches = parseMarkdownImages(
    'Before ![Logo](<images/logo_(final).png> "Product logo") after'
  );

  assert.deepEqual(matches.map(({ alt, source, title }) => ({ alt, source, title })), [
    { alt: 'Logo', source: 'images/logo_(final).png', title: 'Product logo' }
  ]);
});

test('editor image parsing keeps attribute ranges separate for display widgets', () => {
  const source = '![Logo](<images/logo.png> "Product logo"){width=240px align=center margin="6mm 0"}';
  const [image] = parseEditorMarkdownImages(source);

  assert.equal(image.source, 'images/logo.png');
  assert.equal(image.attributes, '{width=240px align=center margin="6mm 0"}');
  assert.equal(image.end, source.length);
  assert.equal(image.isBlock, true);
});

test('images that share a Markdown line with prose remain inline widgets', () => {
  const [image] = parseEditorMarkdownImages('Before ![Logo](images/logo.png) after');
  assert.equal(image.isBlock, false);
});

test('image source resolution normalizes Windows separators and encodes URL delimiters', () => {
  assert.equal(
    resolveImageSource('images\\logo #1?.png'),
    'images/logo #1?.png'
  );
  assert.equal(resolveImageSource('https://example.com/logo.png'), 'https://example.com/logo.png');
  assert.equal(resolveImageSource('images/logo.png', {
    resolveSync: source => `blob:mock/${source}`,
    async preloadImages() {},
    release() {},
    releaseAll() {}
  }), 'blob:mock/images/logo.png');
});

test('project image lookup tolerates common portable path aliases', () => {
  assert.deepEqual(
    getProjectImageLookupPaths('assets/images/image12.png'),
    ['assets/images/image12.png', 'images/image12.png']
  );
  assert.deepEqual(
    getProjectImageLookupPaths('images/images/image12.png'),
    ['images/images/image12.png', 'images/image12.png']
  );
});

test('dragged project images insert without duplicating the images directory', () => {
  assert.equal(
    buildProjectImageMarkdown('images/image12.png'),
    '![image12](<images/image12.png>){width=100% align=center margin="6mm 0"}'
  );
  assert.equal(
    buildProjectImageMarkdown('image12.png'),
    '![image12](<images/image12.png>){width=100% align=center margin="6mm 0"}'
  );
  assert.equal(
    buildProjectImageMarkdown('image12.png', { alignment: 'right', marginTop: 4, marginBottom: 8 }),
    '![image12](<images/image12.png>){width=100% align=right margin="4mm 0 8mm"}'
  );
});

test('block glyphs compile from portable project asset paths', async () => {
  state.setCustomBlockStyles([{
    id: 'info',
    name: 'Info',
    prefix: ':::i',
    icon: 'assets/glyphs/info mark.svg',
    fontFamily: '',
    fontSize: 0,
    color: '#123456',
    isBold: false,
    isItalic: false,
    lineHeight: 1.35,
    marginTop: 2,
    marginBottom: 8
  }]);

  const html = await compileMarkdown(':::i Read this', {
    resolveSync: source => `blob:mock/${encodeURIComponent(source)}`,
    async preloadImages() {},
    release() {},
    releaseAll() {}
  });

  assert.match(html, /class="custom-block-icon custom-block-glyph"/);
  assert.match(html, /src="blob:mock\/assets%2Fglyphs%2Finfo%20mark\.svg"/);
  assert.match(html, /data-image-source="assets\/glyphs\/info mark\.svg"/);
  assert.match(html, /line-height: 1.35; margin-top: 2pt; margin-bottom: 8pt/);
  assert.match(html, />Read this<\/div>/);
  state.setCustomBlockStyles([]);
});

test('PDF preview margin text resolves the total after pagination', () => {
  const metadata = {
    author: '', documentTitle: '', documentName: '', documentNumber: '', documentRevision: '',
    documentType: '', productName: '', productModule: '', productVersion: ''
  };

  assert.equal(
    resolvePdfPreviewMarginText('Page {page} of {pages}', { metadata }, 3, 12, ''),
    'Page 3 of 12'
  );
});
