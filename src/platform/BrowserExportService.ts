import type {
  DocumentExportService,
  ExportResult
} from './types';
import type { PageSetup, TypographySetup, ListSetup, TableSetup, ProjectMetadata } from '../types';
import { buildPdfPrintCss } from './pdf-print-css';
import { previewMetrics } from '../perf/preview-metrics';

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
      const styles = collectPreviewStyles();
      previewMetrics.recordPdfExportPhase('css', performance.now() - cssStarted);
      // Keep the rendered Paged.js DOM inside the same stage structure used by
      // the preview. The print stylesheet removes only preview chrome; it must
      // not reconstruct the document's layout with a different DOM context.
      const exportRoot = `<main id="clear-writer-pdf-document"><div id="paged-stage" class="paged-stage">${html}</div></main>`;
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
      await waitForStablePrintLayout(popup);
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

/**
 * Serialise the preview's active stylesheet set in document order.
 *
 * PDF export receives the already-paginated preview DOM. Filtering to a list
 * of known selectors made its cascade diverge whenever an ordinary document
 * rule (for example a body, heading, or custom style rule) contributed to the
 * preview. An isolated print document has no application UI to style, so
 * copying the complete active stylesheet set is both safer and more faithful.
 */
function collectPreviewStyles(): string {
  return Array.from(document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'))
    .map(element => {
      if (element.tagName === 'LINK') return serializeStylesheetLink(element as HTMLLinkElement);
      return `<style>${escapeStyleText(element.textContent || '')}</style>`;
    })
    .join('');
}

function serializeStylesheetLink(link: HTMLLinkElement): string {
  const media = link.media ? ` media="${escapeHtmlAttribute(link.media)}"` : '';
  return `<link rel="stylesheet" href="${escapeHtmlAttribute(link.href)}"${media}>`;
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeStyleText(value: string): string {
  // Keep a literal closing tag from ending the serialised style element while
  // preserving the same CSS string value (\3C is the CSS escape for "<").
  return value.replace(/<\/style/gi, '\\3C /style');
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

/**
 * Wait until the isolated print document reports the same page/layout metrics
 * for two consecutive frames. This prevents opening the browser print UI while
 * CSS, fonts, or image sizing is still moving the paged document.
 */
function waitForStablePrintLayout(target: Window, timeoutMs = 2000): Promise<void> {
  return new Promise(resolve => {
    let previousSignature: string | null = null;
    let stableFrames = 0;
    let settled = false;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    let frameId: number | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
      if (frameId !== null && typeof target.cancelAnimationFrame === 'function') {
        target.cancelAnimationFrame(frameId);
      }
      resolve();
    };

    const sample = () => {
      const signature = getPrintLayoutSignature(target.document);
      stableFrames = signature === previousSignature ? stableFrames + 1 : 0;
      previousSignature = signature;
      if (stableFrames >= 2) {
        finish();
        return;
      }
      if (typeof target.requestAnimationFrame === 'function') {
        frameId = target.requestAnimationFrame(sample);
      } else {
        globalThis.setTimeout(sample, 16);
      }
    };

    timeoutId = globalThis.setTimeout(finish, timeoutMs);
    sample();
  });
}

function getPrintLayoutSignature(doc: Document): string {
  const root = doc.getElementById?.('clear-writer-pdf-document') ?? doc.documentElement;
  const body = doc.body;
  const rect = root?.getBoundingClientRect?.();
  const pageCount = doc.querySelectorAll?.('.pagedjs_page').length ?? 0;
  return [
    pageCount,
    root?.scrollWidth ?? 0,
    root?.scrollHeight ?? 0,
    body?.scrollWidth ?? 0,
    body?.scrollHeight ?? 0,
    rect?.width ?? 0,
    rect?.height ?? 0
  ].join(':');
}
