import { createIsolatedJob, countIsolatedFrames } from './helpers/isolated-pagination.ts';
import { IsolatedPaginationHost } from '../../src/pdf-preview/IsolatedPaginationHost';
import { createPdfArtifactStyle, renderPdfArtifactContent } from '../../src/pdf-preview/PdfArtifactRenderer';
import { PreviewClickNavigator } from '../../src/preview/navigation/PreviewClickNavigator';
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
  const html = `
    <nav class="table-of-contents"><a class="toc-link" href="#forced-page-heading"><span class="toc-label">Forced page</span><span class="toc-leader"></span></a></nav>
    <section class="document-section" data-section-index="0" data-number-headings="true">
      <h1>Layout Contract</h1>
      <p><span class="visual-glyph">◆</span><strong>GLYPH_ANCHOR</strong> validates prefix alignment and Unicode rendering.</p>
      <p>MARGIN_ANCHOR_LEFT begins inside the configured content box. This paragraph provides enough material to establish stable line wrapping without approaching the footer.</p>
      <ul><li>First controlled list item</li><li>Second controlled list item</li></ul>
    </section>
    <section class="document-section" data-section-index="1" data-number-headings="true">
      <div class="section-break" aria-hidden="true"></div>
      <h1 id="forced-page-heading">Forced Section Page</h1>
      <p>PAGE_BREAK_ANCHOR must appear on the second physical page.</p>
      <p>The footer and header remain visible, aligned, and clear of body content.</p>
    </section>`;

  const job = createIsolatedJob(html, {
    css: `@page { size: 148mm 210mm; margin: 20mm 16mm 18mm 18mm; @top-left { content: "CLEAR WRITER"; } @top-center { content: "Regression Spec"; } @bottom-left { content: "VISUAL QA"; } @bottom-center { content: "Chapter " counter(page) " - Page " counter(page); } } body { font: 10pt Arial; } .section-break { break-before: page; }`,
    margins: { header: pageSetup.header!, footer: pageSetup.footer!, metadata: state.current.projectMetadata },
    marginImageSources: {}
  });
  const outcome = await new IsolatedPaginationHost().requestPrintArtifact(job);
  if (outcome.status !== 'success') throw new Error(`Isolated visual pagination failed: ${outcome.status}`);
  const artifact = new DOMParser().parseFromString(outcome.result.artifact.html, 'text/html');
  const pages = Array.from(artifact.querySelectorAll<HTMLElement>('.pagedjs_page'));
  const pageFor = (text: string) => pages.findIndex(page => page.textContent?.includes(text)) + 1;
  const generatedContent = (page: HTMLElement, selector: string) => {
    const element = page.querySelector<HTMLElement>(selector);
    if (!element) return '';
    return `${element.textContent ?? ''} ${getComputedStyle(element, '::before').content} ${getComputedStyle(element, '::after').content}`;
  };
  const resolvedFooter = (page: HTMLElement) =>
    page.querySelector<HTMLElement>('.pagedjs_margin-bottom-center .pagedjs_margin-content')?.textContent?.trim() || '';
  const stage = document.getElementById('stage')!;
  stage.style.height = '180px';
  stage.style.overflow = 'auto';
  document.head.appendChild(createPdfArtifactStyle(document, outcome.result.artifact));
  stage.appendChild(renderPdfArtifactContent(document, outcome.result.artifact));
  const navigator = new PreviewClickNavigator(stage, () => undefined);
  const tocLink = stage.querySelector<HTMLAnchorElement>('.toc-link');
  tocLink?.click();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__HARNESS_RESULT__ = {
    ok: true,
    renderStatus: 'rendered',
    pageCount: pages.length,
    glyphPage: pageFor('GLYPH_ANCHOR'),
    forcedBreakPage: pageFor('PAGE_BREAK_ANCHOR'),
    headersPresent: pages.every(page => generatedContent(page, '.pagedjs_margin-top-center .pagedjs_margin-content').includes('Regression Spec')),
    installedHeadersPresent: Array.from(stage.querySelectorAll<HTMLElement>('.pagedjs_page')).every(page => page.querySelector('.pagedjs_margin-top-center .pagedjs_margin-content')?.textContent?.includes('Regression Spec')),
    footersPresent: pages.every(page => generatedContent(page, '.pagedjs_margin-bottom-left .pagedjs_margin-content').includes('VISUAL QA')),
    chapterFootersResolved: pages.every((page, index) => resolvedFooter(page) === `Chapter  - Page ${index + 1}`),
    tocPageNumber: stage.querySelector('.toc-page-number')?.textContent ?? '',
    tocLinkScrolled: stage.scrollTop > 0,
    scrollHeight: artifact.documentElement.scrollHeight,
    orphanedFrames: countIsolatedFrames()
  };
  navigator.destroy();
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error) };
});
