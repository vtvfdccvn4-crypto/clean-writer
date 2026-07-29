/** Owns the browser window used to display and print one completed PDF artifact. */
// Project assets are normally local/blob URLs and settle quickly. Keep a
// short safety cap so a broken image or font cannot make the preview appear
// frozen for ten seconds before the browser print dialog opens.
const PRINT_RESOURCE_WAIT_MS = 2_000;

export type PdfPreviewPrintTimings = {
  installDocumentMs: number;
  resourceReadinessMs: number;
  printInvocationMs: number;
};

export class PdfPreviewPrintTarget {
  private readonly target: Window;

  private constructor(target: Window) {
    this.target = target;
  }

  static open(): PdfPreviewPrintTarget | null {
    // Keep the WindowProxy: `noopener` intentionally makes window.open return
    // null in supported browsers, leaving an opened but unwriteable target.
    const target = window.open('', '_blank', 'width=1024,height=768');
    if (!target) return null;
    installPreparingDocument(target.document);
    return new PdfPreviewPrintTarget(target);
  }

  async printArtifact(html: string, paginationCss: string): Promise<PdfPreviewPrintTimings> {
    try {
      const installStartedAt = performance.now();
      installPrintDocument(this.target.document, html, paginationCss);
      const installDocumentMs = Math.round(performance.now() - installStartedAt);
      const resourcesStartedAt = performance.now();
      await waitForPrintResources(this.target.document);
      const resourceReadinessMs = Math.round(performance.now() - resourcesStartedAt);
      const printStartedAt = performance.now();
      this.target.addEventListener('afterprint', () => this.close(), { once: true });
      this.target.focus();
      this.target.print();
      return { installDocumentMs, resourceReadinessMs, printInvocationMs: Math.round(performance.now() - printStartedAt) };
    } catch (error) {
      this.close();
      throw error;
    }
  }

  close(): void {
    if (!this.target.closed) this.target.close();
  }
}

function installPreparingDocument(doc: Document): void {
  const root = doc.documentElement ?? doc.createElement('html');
  const head = doc.createElement('head');
  const body = doc.createElement('body');
  const title = doc.createElement('title');
  title.textContent = 'Clear Writer PDF Preview';
  const style = doc.createElement('style');
  style.textContent = 'body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px system-ui,sans-serif;color:#263238;background:#f7f8f9}.status{padding:1rem 1.25rem;border:1px solid #d5d9dc;border-radius:.5rem;background:#fff;box-shadow:0 1px 4px #0001}';
  const status = doc.createElement('p');
  status.className = 'status';
  status.textContent = 'Preparing PDF preview…';
  head.append(title, style);
  body.appendChild(status);
  root.replaceChildren(head, body);
  if (!doc.documentElement) doc.appendChild(root);
}

function installPrintDocument(doc: Document, html: string, paginationCss: string): void {
  const root = doc.documentElement ?? doc.createElement('html');
  const head = doc.createElement('head');
  const body = doc.createElement('body');
  const title = doc.createElement('title');
  title.textContent = 'Clear Writer PDF Preview';
  const paginationStyle = doc.createElement('style');
  paginationStyle.textContent = paginationCss;
  const printStyle = doc.createElement('style');
  printStyle.textContent = '@page { margin: 0; } .pagedjs_page { break-after: page; } .pagedjs_page:last-child { break-after: auto; }';
  const stage = doc.createElement('main');
  stage.id = 'clear-writer-pdf-preview-document';
  stage.innerHTML = html;
  head.append(title, paginationStyle, printStyle);
  body.appendChild(stage);
  root.replaceChildren(head, body);
  if (!doc.documentElement) doc.appendChild(root);
}

async function waitForPrintResources(doc: Document): Promise<void> {
  const images = Array.from(doc.images ?? []);
  const fontsReady = doc.fonts?.ready.catch(() => undefined) ?? Promise.resolve();
  const resourcesReady = Promise.all([
    fontsReady,
    ...images.map(waitForImage)
  ]);
  await waitForResources(resourcesReady);
  await new Promise<void>(resolve => window.setTimeout(resolve, 250));
}

function waitForImage(image: HTMLImageElement): Promise<void> {
  if (image.complete) return Promise.resolve();
  return new Promise(resolve => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => resolve(), { once: true });
  });
}

function waitForResources(resourcesReady: Promise<unknown>): Promise<void> {
  return new Promise(resolve => {
    const timeout = window.setTimeout(resolve, PRINT_RESOURCE_WAIT_MS);
    void resourcesReady.finally(() => {
      window.clearTimeout(timeout);
      resolve();
    });
  });
}
