import type {
  DocumentExportService,
  ExportResult
} from './types';
import type { PageSetup, TypographySetup, ListSetup, TableSetup, ProjectMetadata } from '../types';
import { buildPdfPrintCss } from './pdf-print-css';
import { previewMetrics } from '../perf/preview-metrics';

const PRINT_STYLE_ATTRIBUTE = 'data-clear-writer-print-style';

export class BrowserExportService implements DocumentExportService {
  readonly support = { docx: false, pdf: true } as const;
  private readonly printFrames = new WeakMap<Window, HTMLIFrameElement>();

  preparePdfExport(): Window | null {
    const frame = this.createHiddenPrintFrame();
    if (frame?.contentWindow) {
      this.printFrames.set(frame.contentWindow, frame);
      return frame.contentWindow;
    }
    return window.open('', '_blank');
  }

  async saveDocx(_data: Uint8Array, _suggestedName: string): Promise<ExportResult> {
    return { status: 'failed', error: 'DOCX export is deferred to Release 2.' };
  }

  async exportPdf(
    html: string,
    pageSetup: PageSetup,
    _typographySetup: TypographySetup,
    _listSetup: ListSetup,
    _tableSetup: TableSetup,
    _projectMetadata: ProjectMetadata,
    _projectPath: string | null,
    exportWindow?: Window | null
  ): Promise<boolean> {
    const popup = exportWindow === undefined ? this.preparePdfExport() : exportWindow;
    if (!popup) return false;
    const browserStarted = performance.now();

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      this.cleanupPrintTarget(popup);
    };
    if (typeof popup.addEventListener === 'function') {
      popup.addEventListener('afterprint', cleanup, { once: true });
    }

    try {
      const cssStarted = performance.now();
      const styles = collectPrintStyles();
      previewMetrics.recordPdfExportPhase('css', performance.now() - cssStarted);
      const exportRoot = `<main id="clear-writer-pdf-document">${html}</main>`;
      const pageCss = `<style>${buildPdfPrintCss(pageSetup)}</style>`;

      popup.document.open();
      popup.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>Clear Writer PDF</title>${styles}${pageCss}</head><body>${exportRoot}</body></html>`);
      popup.document.close();
      if (!this.printFrames.has(popup)) popup.focus();

      await waitForDocumentReady(popup);
      // Stylesheets, images, and fonts load independently. Waiting for them in
      // parallel avoids adding the font timeout after the resource timeout.
      const resourcesStarted = performance.now();
      await Promise.all([
        waitForPrintResources(popup.document),
        waitForFonts(popup.document)
      ]);
      previewMetrics.recordPdfExportPhase('resources', performance.now() - resourcesStarted);
      await waitForAnimationFrames(popup, 3);
      popup.print();
      previewMetrics.recordPdfExportPhase('browser-total', performance.now() - browserStarted);
      return true;
    } catch (error) {
      previewMetrics.recordPdfExportPhase('browser-total', performance.now() - browserStarted);
      cleanup();
      throw error;
    }
  }

  private createHiddenPrintFrame(): HTMLIFrameElement | null {
    const hostDocument = typeof document === 'undefined' ? null : document;
    if (!hostDocument?.body || typeof hostDocument.createElement !== 'function') return null;

    const frame = hostDocument.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.border = '0';
    frame.style.opacity = '0';
    frame.style.pointerEvents = 'none';
    frame.style.clipPath = 'inset(50%)';
    frame.style.overflow = 'hidden';

    hostDocument.body.appendChild(frame);
    if (!frame.contentWindow) {
      frame.remove();
      return null;
    }
    return frame;
  }

  private cleanupPrintTarget(target: Window): void {
    const frame = this.printFrames.get(target);
    if (frame) {
      this.printFrames.delete(target);
      frame.remove();
      return;
    }
    if (!target.closed) target.close();
  }
}

function collectPrintStyles(): string {
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
  const sheets = typeof document.styleSheets === 'object'
    ? Array.from(document.styleSheets)
    : [];

  if (sheets.length === 0) {
    previewMetrics.recordPdfPrintCssFallback('stylesheets-unavailable');
    return links.map(link => `<link rel="stylesheet" href="${link.href}">`).join('')
      + collectInlineStyles();
  }

  const linkedStyles = links.map(link => {
    const sheet = sheets.find(candidate => candidate.href === link.href);
    if (!sheet) {
      previewMetrics.recordPdfPrintCssFallback('stylesheet-missing');
      return `<link rel="stylesheet" href="${link.href}">`;
    }
    try {
      const css = collectRelevantCssRules(sheet);
      return css ? `<style>${css}</style>` : '';
    } catch {
      // Cross-origin or browser-managed stylesheets may reject cssRules access.
      previewMetrics.recordPdfPrintCssFallback('cssom-unreadable');
      return `<link rel="stylesheet" href="${link.href}">`;
    }
  }).join('');

  return linkedStyles + collectInlineStyles();
}

function collectInlineStyles(): string {
  return Array.from(document.querySelectorAll<HTMLStyleElement>('style'))
    .map(style => {
      const css = style.textContent || '';
      if (style.hasAttribute(PRINT_STYLE_ATTRIBUTE)) return `<style>${css}</style>`;

      // Vite injects application CSS into inline style elements during development.
      // Keep only document-facing rules unless a style was explicitly marked above.
      if (!style.sheet) return '';
      try {
        const relevantCss = collectRelevantCssRules(style.sheet);
        return relevantCss ? `<style>${relevantCss}</style>` : '';
      } catch {
        // Unlike an external stylesheet, an unreadable inline stylesheet has no
        // safe isolated fallback. Omit it rather than copying application CSS.
        return '';
      }
    })
    .join('');
}

function collectRelevantCssRules(sheet: CSSStyleSheet): string {
  const rules = Array.from(sheet.cssRules || []);
  return rules.map(rule => collectRelevantCssRule(rule, sheet.href || window.location.href)).join('');
}

function collectRelevantCssRule(rule: CSSRule, baseHref: string): string {
  const cssText = rule.cssText || '';
  const importRule = rule as CSSImportRule;
  if (importRule.styleSheet) {
    return collectRelevantCssRules(importRule.styleSheet);
  }

  if (!isPrintRelevantCss(cssText)) return '';
  return absolutizeCssUrls(cssText, baseHref);
}

function isPrintRelevantCss(cssText: string): boolean {
  return cssText.startsWith('@font-face')
    || cssText.startsWith(':root')
    || cssText.includes('.pagedjs')
    || cssText.includes('.paged-stage')
    || cssText.includes('.custom-block-')
    || cssText.includes('.document-list-')
    || cssText.includes('.table-of-contents');
}

function absolutizeCssUrls(cssText: string, baseHref: string): string {
  return cssText.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, quote: string, value: string) => {
    if (/^(?:data:|blob:|https?:|#)/i.test(value)) return `url(${quote}${value}${quote})`;
    try {
      return `url("${new URL(value, baseHref).href}")`;
    } catch {
      return `url(${quote}${value}${quote})`;
    }
  });
}

function waitForDocumentReady(target: Window): Promise<void> {
  if (target.document.readyState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    let settled = false;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
      target.removeEventListener?.('load', finish);
      resolve();
    };
    if (typeof target.addEventListener === 'function') {
      target.addEventListener('load', finish, { once: true });
    }
    timeoutId = globalThis.setTimeout(finish, 5000);
  });
}

function waitForPrintResources(doc: Document): Promise<void> {
  const links = typeof doc.querySelectorAll === 'function'
    ? Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    : [];
  const images = typeof doc.querySelectorAll === 'function'
    ? Array.from(doc.querySelectorAll<HTMLImageElement>('img'))
    : [];

  return Promise.all([
    ...links.map(link => waitForStylesheet(link)),
    ...images.map(image => waitForImage(image))
  ]).then(() => undefined);
}

function waitForStylesheet(link: HTMLLinkElement): Promise<void> {
  if (link.sheet) return Promise.resolve();
  return waitForElementEvent(link, 5000);
}

function waitForImage(image: HTMLImageElement): Promise<void> {
  if (image.complete) return Promise.resolve();
  return waitForElementEvent(image, 5000);
}

function waitForElementEvent(target: Element, timeoutMs: number): Promise<void> {
  return new Promise(resolve => {
    let settled = false;
    let timeoutId: number | null = null;
    const cleanup = () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      target.removeEventListener('load', done);
      target.removeEventListener('error', done);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const done = () => {
      finish();
    };
    timeoutId = window.setTimeout(finish, timeoutMs);
    target.addEventListener('load', done, { once: true });
    target.addEventListener('error', done, { once: true });
  });
}

async function waitForFonts(doc: Document): Promise<void> {
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts?.ready) return;
  await new Promise<void>(resolve => {
    let settled = false;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
      resolve();
    };
    timeoutId = globalThis.setTimeout(finish, 3000);
    fonts.ready.then(finish, finish);
  });
}

function waitForAnimationFrames(target: Window, count: number): Promise<void> {
  return new Promise(resolve => {
    const frame = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      if (typeof target.requestAnimationFrame === 'function') {
        target.requestAnimationFrame(() => frame(remaining - 1));
      } else {
        globalThis.setTimeout(() => frame(remaining - 1), 16);
      }
    };
    frame(count);
  });
}
