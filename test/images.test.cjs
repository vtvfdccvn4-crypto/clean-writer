const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const cssTree = require('css-tree');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let compileMarkdown;
let generatePageCss;
let buildProjectImageMarkdown;
let parseMarkdownImages;
let parseEditorMarkdownImages;
let getProjectImageLookupPaths;
let resolveImageSource;
let state;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24679 } } });

  ({ compileMarkdown } = await server.ssrLoadModule('/src/compiler/index.ts'));
  ({ generatePageCss } = await server.ssrLoadModule('/src/preview/CssGenerator.ts'));
  ({ buildProjectImageMarkdown } = await server.ssrLoadModule('/src/images/imageMarkdown.ts'));
  ({ parseMarkdownImages } = await server.ssrLoadModule('/src/images/markdownImages.ts'));
  ({ parseEditorMarkdownImages } = await server.ssrLoadModule('/src/editor/markdown/parseMarkdownImage.ts'));
  ({ getProjectImageLookupPaths, resolveImageSource } = await server.ssrLoadModule('/src/images/imageSources.ts'));
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

test('CSS header content preserves quotes and Windows image paths in one string token', () => {
  global.window = { location: { search: '' } };
  const cell = (content) => ({
    content,
    fontFamily: 'Inter',
    fontSize: 9,
    color: '#000',
    isBold: false,
    isItalic: false
  });
  const tocStyle = (overrides = {}) => ({
    fontFamily: 'Arial',
    fontSize: 10,
    color: '#000000',
    isBold: false,
    isItalic: false,
    isAllCaps: false,
    ...overrides
  });
  const css = generatePageCss({
    paperWidth: 210,
    paperHeight: 297,
    marginTop: 25,
    marginRight: 20,
    marginBottom: 25,
    marginLeft: 20,
    header: {
      centerWidth: '100px',
      left: cell('Quoted "text" and ![logo](images\\logo.png)'),
      center: cell(''),
      right: cell('')
    },
    footer: {
      centerWidth: '100px',
      left: cell(''),
      center: cell(''),
      right: cell('')
    },
    toc: {
      maxLevel: 4,
      h1: tocStyle({ fontFamily: 'Georgia', fontSize: 14, color: '#123456', isBold: true, isItalic: true, isAllCaps: true }),
      h2: tocStyle(),
      h3: tocStyle(),
      h4: tocStyle(),
      h5: tocStyle(),
      h6: tocStyle()
    }
  });

  const ast = cssTree.parse(css);
  const contentValues = [];
  cssTree.walk(ast, (node) => {
    if (node.type === 'Declaration' && node.property === 'content') contentValues.push(node.value);
  });

  const stringContentValues = contentValues.filter((value) => value.children.toArray()[0]?.type === 'String');
  const headerContentValue = stringContentValues.find(value =>
    value.children.toArray()[0]?.value?.includes('Quoted')
  );
  assert.ok(headerContentValue);
  assert.equal(headerContentValue.children.getSize(), 1);
  assert.equal(headerContentValue.children.toArray()[0].type, 'String');
  assert.match(css, /\.pagedjs_margin-content\.has-markdown-image::after\s*\{\s*content: none !important;/);
  assert.match(css, /\.toc-item\.toc-level-1\s*\{[^}]*font-family: "Georgia", serif;[^}]*font-size: 14pt;[^}]*color: #123456;[^}]*font-weight: bold;[^}]*font-style: italic;/s);
  assert.match(css, /\.toc-item\.toc-level-1 \.toc-label\s*\{[^}]*text-transform: uppercase;/s);
  assert.match(css, /\.toc-item\.toc-level-2\s*\{[^}]*font-family: "Arial", serif;[^}]*font-size: 10pt;[^}]*font-weight: normal;/s);
  assert.match(css, /\.toc-item\.toc-level-2 \.toc-label\s*\{[^}]*text-transform: none;/s);
  assert.match(css, /\.toc-leader\s*\{[^}]*border-bottom: 1px dotted currentColor;/s);
  assert.match(css, /\.toc-link::after\s*\{[^}]*content: target-counter\(attr\(href\), page\);[^}]*text-align: right;/s);
  assert.doesNotMatch(css, /leader\(/);
});

test('chapter-aware footers defer all content to the resolved page DOM', () => {
  global.window = { location: { search: '' } };
  state.setFullDocMode();
  const cell = (content) => ({
    content,
    fontFamily: 'Inter',
    fontSize: 9,
    color: '#000',
    isBold: false,
    isItalic: false
  });
  const css = generatePageCss({
    paperWidth: 210,
    paperHeight: 297,
    marginTop: 25,
    marginRight: 20,
    marginBottom: 25,
    marginLeft: 20,
    header: { centerWidth: '100px', left: cell(''), center: cell(''), right: cell('') },
    footer: {
      centerWidth: '100px',
      left: cell(''),
      center: cell(''),
      right: cell('Chapter {chapter:} - Page {page}')
    }
  });

  assert.match(css, /@bottom-right\s*\{\s*content: "";/);
  assert.doesNotMatch(css, /@bottom-right\s*\{[\s\S]*counter\(page\)/);
});

test('section visibility markers do not emit named page rules', () => {
  global.window = { location: { search: '' } };
  const css = generatePageCss({
    paperWidth: 210,
    paperHeight: 297,
    marginTop: 25,
    marginRight: 20,
    marginBottom: 25,
    marginLeft: 20,
    header: {
      centerWidth: '100px',
      left: { content: '', fontFamily: '', fontSize: 9, color: '', isBold: false, isItalic: false },
      center: { content: '', fontFamily: '', fontSize: 9, color: '', isBold: false, isItalic: false },
      right: { content: '', fontFamily: '', fontSize: 9, color: '', isBold: false, isItalic: false }
    },
    footer: {
      centerWidth: '100px',
      left: { content: '', fontFamily: '', fontSize: 9, color: '', isBold: false, isItalic: false },
      center: { content: '', fontFamily: '', fontSize: 9, color: '', isBold: false, isItalic: false },
      right: { content: '', fontFamily: '', fontSize: 9, color: '', isBold: false, isItalic: false }
    }
  });

  assert.doesNotMatch(css, /@page\s+no-header/);
  assert.doesNotMatch(css, /@page\s+no-footer/);
  assert.doesNotMatch(css, /page:\s*no-header/);
  assert.doesNotMatch(css, /page:\s*no-footer/);
  assert.match(css, /\.pagedjs_page\.page-no-header\s+\.pagedjs_margin-top/);
  assert.match(css, /\.pagedjs_page\.page-no-footer\s+\.pagedjs_margin-bottom/);
});
