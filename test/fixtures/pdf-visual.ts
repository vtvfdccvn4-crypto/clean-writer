import { RenderEngine } from '../../src/preview/RenderEngine';
import { state } from '../../src/state';
import type { ListSetup, PageSetup, TypographySetup } from '../../src/types';

declare global {
  interface Window { __HARNESS_RESULT__?: Record<string, unknown>; }
}

const marginCell = (content: string, align: 'left' | 'center' | 'right') => ({
  content,
  fontFamily: 'Arial',
  fontSize: 8,
  color: '#30343b',
  isBold: true,
  isItalic: false,
  verticalAlign: 'middle' as const,
  horizontalAlign: align
});

const pageSetup: PageSetup = {
  paperWidth: 148,
  paperHeight: 210,
  marginTop: 20,
  marginBottom: 18,
  marginLeft: 18,
  marginRight: 16,
  header: {
    centerWidth: '160px',
    left: marginCell('CLEAR WRITER', 'left'),
    center: marginCell('${documentTitle}', 'center'),
    right: marginCell('REV A', 'right')
  },
  footer: {
    centerWidth: '160px',
    left: marginCell('VISUAL QA', 'left'),
    center: marginCell('Chapter {chapter:} - Page {page}', 'center'),
    right: marginCell('CONFIDENTIAL', 'right')
  }
};

const textStyle = {
  fontFamily: 'Arial', fontSize: 10, color: '#20242a', isBold: false,
  isItalic: false, lineHeight: 1.45, marginTop: 0, marginBottom: 8
};
const headingStyle = {
  fontFamily: 'Arial', fontSize: 20, color: '#17365d', isBold: true,
  isItalic: false, lineHeight: 1.2, marginTop: 0, marginBottom: 12
};
const typography = {
  paragraph: textStyle,
  h1: headingStyle,
  h2: { ...headingStyle, fontSize: 15 },
  h3: { ...headingStyle, fontSize: 13 },
  h4: { ...headingStyle, fontSize: 12 },
  h5: { ...headingStyle, fontSize: 11 },
  h6: { ...headingStyle, fontSize: 10 }
} as TypographySetup;

const listStyle = {
  fontFamily: 'Arial', fontSize: 10, color: '#20242a', isBold: false,
  isItalic: false, bulletIcon: '•', bulletColor: '#8b1e3f',
  marginLeft: 18, paddingLeft: 6
};
const listSetup: ListSetup = {
  ulAsterisk: listStyle,
  ulDash: { ...listStyle, bulletIcon: '-' },
  ulPlus: { ...listStyle, bulletIcon: '+' },
  ol: { ...listStyle, bulletIcon: 'decimal' },
  olParen: { ...listStyle, bulletIcon: 'decimal' }
};

async function run() {
  state.setProjectMetadata({
    documentTitle: 'Regression Spec', documentName: '', documentNumber: '',
    documentRevision: 'A', documentType: '', author: '', productName: '',
    productModule: '', productVersion: ''
  });
  state.setFullDocMode();
  const stage = document.getElementById('stage')!;
  const engine = new RenderEngine(stage, { unthrottledPagination: true });
  engine.applyTypographySetup(typography);
  engine.applyListSetup(listSetup);

  const html = `
    <section class="document-section" data-section-index="0" data-number-headings="true">
      <h1>Layout Contract</h1>
      <p><span class="visual-glyph">◆</span><strong>GLYPH_ANCHOR</strong> validates prefix alignment and Unicode rendering.</p>
      <p>MARGIN_ANCHOR_LEFT begins inside the configured content box. This paragraph provides enough material to establish stable line wrapping without approaching the footer.</p>
      <ul><li>First controlled list item</li><li>Second controlled list item</li></ul>
    </section>
    <section class="document-section" data-section-index="1" data-number-headings="true">
      <div class="section-break" aria-hidden="true"></div>
      <h1>Forced Section Page</h1>
      <p>PAGE_BREAK_ANCHOR must appear on the second physical page.</p>
      <p>The footer and header remain visible, aligned, and clear of body content.</p>
    </section>`;

  const renderResult = await engine.runRender(html, pageSetup, null, typography, listSetup);
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const pages = Array.from(stage.querySelectorAll<HTMLElement>('.pagedjs_page'));
  const pageFor = (text: string) => pages.findIndex(page => page.textContent?.includes(text)) + 1;
  const generatedContent = (page: HTMLElement, selector: string) => {
    const element = page.querySelector<HTMLElement>(selector);
    if (!element) return '';
    return `${getComputedStyle(element, '::before').content} ${getComputedStyle(element, '::after').content}`;
  };
  const resolvedFooter = (page: HTMLElement) =>
    page.querySelector<HTMLElement>('.pagedjs_margin-bottom-center .pagedjs_margin-content')?.textContent?.trim() || '';
  window.__HARNESS_RESULT__ = {
    ok: renderResult.status === 'rendered',
    renderStatus: renderResult.status,
    renderError: renderResult.error?.message,
    pageCount: pages.length,
    glyphPage: pageFor('GLYPH_ANCHOR'),
    forcedBreakPage: pageFor('PAGE_BREAK_ANCHOR'),
    headersPresent: pages.every(page => generatedContent(page, '.pagedjs_margin-top-center .pagedjs_margin-content').includes('Regression Spec')),
    footersPresent: pages.every(page => generatedContent(page, '.pagedjs_margin-bottom-left .pagedjs_margin-content').includes('VISUAL QA')),
    chapterFootersResolved: pages.every((page, index) => resolvedFooter(page) === `Chapter ${index + 1} - Page ${index + 1}`),
    scrollHeight: document.documentElement.scrollHeight
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? error.stack : String(error) };
});
