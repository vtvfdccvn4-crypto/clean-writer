const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const JSZip = require('jszip');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let generateDocx;

// Helper to construct a mock DOM Element node
function createMockElement(tagName, attrs = {}, children = []) {
  const childrenElements = children.filter(c => c.nodeType === 1);
  const mockDocument = {
    createElement: (tag) => createMockElement(tag)
  };
  
  const node = {
    nodeType: 1, // ELEMENT_NODE
    tagName: tagName.toUpperCase(),
    ownerDocument: mockDocument,
    textContent: children.map(c => c.textContent).join(''),
    childNodes: [...children],
    children: childrenElements,
    firstElementChild: childrenElements[0] || null,
    className: attrs.class || '',
    style: { color: attrs.styleColor },
    getAttribute: (name) => attrs[name] || null,
    classList: {
      contains: (c) => attrs.class ? attrs.class.split(' ').includes(c) : false
    },
    querySelectorAll: (selector) => {
      const results = [];
      const walk = (n) => {
        if (n !== node && n.nodeType === 1) {
          if (selector === '.document-section' && n.classList.contains('document-section')) {
            results.push(n);
          } else if (selector === 'tr' && n.tagName === 'TR') {
            results.push(n);
          } else if (selector === 'img' && n.tagName === 'IMG') {
            results.push(n);
          } else if (selector === 'li.toc-item' && n.tagName === 'LI' && n.classList.contains('toc-item')) {
            results.push(n);
          } else if (selector === 'a' && n.tagName === 'A') {
            results.push(n);
          } else if (selector === '.toc-label' && n.classList.contains('toc-label')) {
            results.push(n);
          }
        }
        n.children.forEach(walk);
      };
      walk(node);
      return results;
    },
    querySelector: (selector) => {
      const all = node.querySelectorAll(selector);
      return all[0] || null;
    }
  };
  return node;
}

// Helper to construct a mock DOM Text node
function createMockText(text) {
  return {
    nodeType: 3, // TEXT_NODE
    textContent: text,
    childNodes: []
  };
}

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24682 } } });
  ({ generateDocx } = await server.ssrLoadModule('/src/services/ExportDocxService.ts'));
});

after(async () => {
  await server?.close();
});

test('Word exporter maps HTML elements to a valid docx Uint8Array buffer with complex layout features', async () => {
  // 1. Setup mock content structures

  // Section 0 elements
  const paragraphText = createMockText('Clear Writer body paragraph with ');
  const inlineImg = createMockElement('img', { src: 'inline-img.png', alt: 'Inline Pic' });
  const paragraphText2 = createMockText(' inline image.');
  const paragraph = createMockElement('p', {}, [paragraphText, inlineImg, paragraphText2]);
  const coloredParagraph = createMockElement('p', {}, [
    createMockElement('span', { styleColor: 'rgb(77, 105, 224)' }, [createMockText('RGB inline color')])
  ]);
  
  // automatic page break check headings
  const heading1 = createMockElement('h1', { id: 'heading-toc-0' }, [createMockText('Heading One')]);
  const secBreakNode = createMockElement('div', { class: 'section-break' }, [createMockText(' ')]);
  const heading2 = createMockElement('h1', { id: 'heading-toc-1' }, [createMockText('Heading Two')]);
  const heading3 = createMockElement('h1', { id: 'heading-toc-2' }, [createMockText('Heading Three')]);

  // Nested Lists
  const bulletLi1 = createMockElement('li', {}, [createMockText('Bullet 1')]);
  const bulletLi2 = createMockElement('li', {}, [
    createMockText('Bullet 2'),
    createMockElement('ul', { 'data-marker': 'dash' }, [
      createMockElement('li', {}, [createMockText('Bullet 2.1')])
    ])
  ]);
  const bulletList = createMockElement('ul', { 'data-marker': 'asterisk' }, [bulletLi1, bulletLi2]);

  const numLi1 = createMockElement('li', {}, [createMockText('Number 1')]);
  const numLi2 = createMockElement('li', {}, [
    createMockText('Number 2'),
    createMockElement('ol', { 'data-marker': 'paren' }, [
      createMockElement('li', {}, [createMockText('Number 2a')])
    ])
  ]);
  const numList = createMockElement('ol', { 'data-marker': 'period' }, [numLi1, numLi2]);

  // Static TOC structure
  const tocLabel1 = createMockElement('span', { class: 'toc-label' }, [createMockText('Heading One')]);
  const tocLink1 = createMockElement('a', { href: '#heading-toc-0' }, [tocLabel1]);
  const tocLi1 = createMockElement('li', { class: 'toc-item toc-level-1' }, [tocLink1]);
  const tocNav = createMockElement('nav', { class: 'table-of-contents' }, [tocLi1]);

  const section0 = createMockElement('div', {
    class: 'document-section',
    'data-section-index': '0',
    'data-section-path': 'sec0.md',
    'data-hide-header': 'false',
    'data-hide-footer': 'false'
  }, [tocNav, heading1, paragraph, coloredParagraph, bulletList, numList, secBreakNode, heading2, heading3]);

  // Section 1 elements
  // Custom block style
  const glyphIcon = createMockElement('img', { class: 'custom-block-icon custom-block-glyph', src: 'alert-icon.png', alt: 'Alert' });
  const blockText = createMockText('This is a custom alert warning block.');
  const customBlockDiv = createMockElement('div', {
    class: 'custom-block-style',
    style: 'font-family: Arial; font-size: 14pt; color: #FF0000; font-weight: bold; font-style: italic; line-height: 1.5; margin-top: 10pt; margin-bottom: 10pt;',
    'data-custom-block-id': 'alert'
  }, [glyphIcon, blockText]);

  // Table style 2
  const th1 = createMockElement('th', {}, [createMockText('Header 1')]);
  const th2 = createMockElement('th', {}, [createMockText('Header 2')]);
  const trHead = createMockElement('tr', {}, [th1, th2]);
  
  const td1 = createMockElement('td', {}, [createMockText('Cell 1')]);
  const td2 = createMockElement('td', {}, [createMockText('Cell 2')]);
  const trBody1 = createMockElement('tr', {}, [td1, td2]);

  const td3 = createMockElement('td', {}, [createMockText('Cell 3')]);
  const td4 = createMockElement('td', {}, [createMockText('Cell 4')]);
  const trBody2 = createMockElement('tr', {}, [td3, td4]);

  const styledTable = createMockElement('table', { 'data-table-style': '2' }, [trHead, trBody1, trBody2]);

  const section1 = createMockElement('div', {
    class: 'document-section',
    'data-section-index': '1',
    'data-section-path': 'sec1.md',
    'data-hide-header': 'true',
    'data-hide-footer': 'true'
  }, [
    createMockElement('h1', { id: 'heading-toc-3' }, [createMockText('Heading Four')]),
    customBlockDiv,
    styledTable
  ]);

  const root = createMockElement('div', {}, [section0, section1]);

  // 2. Setup mock configurations
  const pageSetup = {
    paperWidth: 210,
    paperHeight: 297,
    marginTop: 25,
    marginBottom: 25,
    marginLeft: 20,
    marginRight: 20,
    header: {
      centerWidth: '100px',
      left: { content: 'Left Section Logo: ![Logo](images/logo(final).png "Brand")', fontFamily: 'Arial', fontSize: 9, color: '#000000', isBold: false, isItalic: false },
      center: { content: 'Center Header', fontFamily: 'Arial', fontSize: 9, color: '#000000', isBold: false, isItalic: false },
      right: { content: '{page} of {pages}', fontFamily: 'Arial', fontSize: 9, color: '#000000', isBold: false, isItalic: false }
    },
    footer: {
      centerWidth: '100px',
      left: { content: '', fontFamily: 'Arial', fontSize: 9, color: '#000000', isBold: false, isItalic: false },
      center: { content: 'Footer Center Confidential - ${author}', fontFamily: 'Arial', fontSize: 9, color: '#000000', isBold: false, isItalic: false },
      right: { content: '', fontFamily: 'Arial', fontSize: 9, color: '#000000', isBold: false, isItalic: false }
    }
  };

  const typographySetup = {
    paragraph: { fontFamily: 'Calibri', fontSize: 11, color: '#333333', isBold: false, isItalic: false, lineHeight: 1.15, marginTop: 0, marginBottom: 6 },
    h1: { fontFamily: 'Calibri', fontSize: 18, color: '#111111', isBold: true, isItalic: false, lineHeight: 1.2, marginTop: 12, marginBottom: 6 }
  };

  const listSetup = {
    ulAsterisk: { fontFamily: 'Calibri', fontSize: 11, color: '#333333', isBold: false, isItalic: false, bulletIcon: '•', bulletColor: '#333333', marginLeft: 18, paddingLeft: 18 },
    ulDash: { fontFamily: 'Calibri', fontSize: 11, color: '#333333', isBold: false, isItalic: false, bulletIcon: '–', bulletColor: '#333333', marginLeft: 18, paddingLeft: 18 },
    ulPlus: { fontFamily: 'Calibri', fontSize: 11, color: '#333333', isBold: false, isItalic: false, bulletIcon: '+', bulletColor: '#333333', marginLeft: 18, paddingLeft: 18 },
    ol: { fontFamily: 'Calibri', fontSize: 11, color: '#333333', isBold: false, isItalic: false, bulletIcon: '1.', bulletColor: '#333333', marginLeft: 18, paddingLeft: 18 },
    olParen: { fontFamily: 'Calibri', fontSize: 11, color: '#333333', isBold: false, isItalic: false, bulletIcon: '1)', bulletColor: '#333333', marginLeft: 18, paddingLeft: 18 }
  };

  const tableSetup = {
    table1: {
      fontFamily: 'Calibri', fontSize: 10, headerTextColor: '#000000', headerBackground: '#F2F2F2', headerBold: true,
      bodyTextColor: '#333333', bodyBackground: '#FFFFFF', alternateRowColor: '#F9F9F9', borderColor: '#D3D3D3',
      borderWidth: 1, cellPadding: 6, marginTop: 0, marginBottom: 12
    },
    table2: {
      fontFamily: 'Arial', fontSize: 9, headerTextColor: '#FFFFFF', headerBackground: '#4F5D75', headerBold: true,
      bodyTextColor: '#2D3142', bodyBackground: '#FFFFFF', alternateRowColor: '#EF8354', borderColor: '#2D3142',
      borderWidth: 2, cellPadding: 8, marginTop: 0, marginBottom: 16
    }
  };

  const projectMetadata = {
    author: 'Author Name',
    documentTitle: 'Document Title'
  };

  // Mocked image resources
  const mockImages = {
    'asset:images/logo(final).png': Buffer.from('MOCK_LOGO_BYTES'),
    'inline-img.png': Buffer.from('MOCK_INLINE_BYTES'),
    'alert-icon.png': Buffer.from('MOCK_ALERT_BYTES')
  };
  const fetchedImages = [];

  const dependencies = {
    parseHtml: () => root,
    fetchImage: async (src) => {
      fetchedImages.push(src);
      return mockImages[src] || Buffer.from('');
    },
    getImageDimensions: async (src) => src === 'inline-img.png'
      ? { width: 1200, height: 600 }
      : { width: 64, height: 64 },
    resolveImageSource: (src) => `asset:${src}`
  };

  // 3. Run exporter
  const docxBuffer = await generateDocx(
    '<div>dummy html</div>',
    pageSetup,
    typographySetup,
    listSetup,
    tableSetup,
    projectMetadata,
    dependencies
  );

  assert.ok(docxBuffer instanceof Uint8Array);
  assert.ok(docxBuffer.length > 1000);

  const zip = await JSZip.loadAsync(docxBuffer);
  const documentXml = await zip.file('word/document.xml').async('string');

  // Verify Heading automatic page breaks
  const getParagraphXml = (text) => {
    const textIndex = documentXml.indexOf(text);
    if (textIndex === -1) return '';
    const pStart = documentXml.lastIndexOf('<w:p>', textIndex);
    const pEnd = documentXml.indexOf('</w:p>', textIndex);
    if (pStart === -1 || pEnd === -1) return '';
    return documentXml.slice(pStart, pEnd + 6);
  };

  const headingOneXml = getParagraphXml('Heading One');
  const headingTwoXml = getParagraphXml('Heading Two');
  const headingThreeXml = getParagraphXml('Heading Three');
  const headingFourXml = getParagraphXml('Heading Four');

  assert.ok(headingOneXml, 'Heading One should exist');
  assert.ok(headingTwoXml, 'Heading Two should exist');
  assert.ok(headingThreeXml, 'Heading Three should exist');
  assert.ok(headingFourXml, 'Heading Four should exist');

  assert.ok(!headingOneXml.includes('w:pageBreakBefore'), 'Heading One should not break page');
  assert.ok(!headingTwoXml.includes('w:pageBreakBefore'), 'Heading Two follows section-break, should not break page');
  assert.ok(headingThreeXml.includes('w:pageBreakBefore'), 'Heading Three is standalone, should break page');
  assert.ok(headingFourXml.includes('w:pageBreakBefore'), 'First H1 in a later continuous section should break page');

  // Verify images are embedded
  assert.ok(documentXml.includes('Inline Pic'));
  assert.ok(documentXml.includes('Alert'));
  assert.ok(documentXml.includes('4D69E0'), 'Browser rgb() colors should be serialized as DOCX hex');
  const inlineImageIndex = documentXml.indexOf('Inline Pic');
  const inlineImageXml = documentXml.slice(Math.max(0, inlineImageIndex - 1000), inlineImageIndex + 500);
  const inlineHeight = Number(inlineImageXml.match(/<wp:extent[^>]*cy="(\d+)"/)?.[1] || 0);
  assert.ok(inlineHeight > 190500, 'Body image should not be capped to the old 20px icon height');

  // Verify custom block style properties
  assert.ok(documentXml.includes('This is a custom alert warning block.'));
  assert.ok(documentXml.includes('Arial')); // Custom block font

  // Verify nested list indents
  // Level 0 bullet should be present
  assert.ok(documentXml.includes('Bullet 1'));
  assert.ok(documentXml.includes('Bullet 2.1'));
  assert.ok(getParagraphXml('Bullet 2.1').includes('–'), 'Nested dash list should use its configured marker');
  // Level 0 number and level 1 nested number (with parens delimiter: a) or 1))
  assert.ok(documentXml.includes('Number 1'));
  assert.ok(documentXml.includes('Number 2a'));
  assert.ok(documentXml.includes('a)')); // nested ordered level delimiter check

  // Verify table styling: Table 2 header background 4F5D75 (hex representation is lowercase or uppercase in OOXML)
  assert.ok(documentXml.toLowerCase().includes('4f5d75'));
  assert.ok(documentXml.toLowerCase().includes('ef8354')); // alternate row shading
  const getRowXml = (text) => {
    const textIndex = documentXml.indexOf(text);
    return documentXml.slice(documentXml.lastIndexOf('<w:tr>', textIndex), documentXml.indexOf('</w:tr>', textIndex) + 7);
  };
  assert.ok(getRowXml('Cell 1').toLowerCase().includes('ffffff'), 'First body row should use the base background');
  assert.ok(getRowXml('Cell 3').toLowerCase().includes('ef8354'), 'Second body row should use alternate shading');
  assert.ok(documentXml.includes('w:before="320"'), 'Configured table bottom margin should be represented');

  // Verify headers and footers contain substitutions & image runs
  const header1Xml = await zip.file('word/header1.xml').async('string');
  assert.ok(header1Xml.includes('Left Section Logo:'));
  assert.ok(header1Xml.includes('Center Header'));
  assert.ok(header1Xml.includes('PAGE'));
  assert.ok(header1Xml.includes('NUMPAGES'));
  assert.ok(header1Xml.includes('Logo'));
  assert.ok(fetchedImages.includes('asset:images/logo(final).png'));

  const footer1Xml = await zip.file('word/footer1.xml').async('string');
  assert.ok(footer1Xml.includes('Footer Center Confidential - Author Name'));

  // Section 2 unlinked blank headers/footers check
  // Since Section 1 has hideHeader/hideFooter = true, blank overrides should be created
  const header2Xml = await zip.file('word/header2.xml').async('string');
  assert.ok(!header2Xml.includes('Left Section Logo'), 'Section 2 header should be blank and not inherit');
  
  const footer2Xml = await zip.file('word/footer2.xml').async('string');
  assert.ok(!footer2Xml.includes('Confidential'), 'Section 2 footer should be blank and not inherit');
});
