import { createPdfArtifactStyle, renderPdfArtifactContent } from './artifact';
import type { PdfArtifact } from './contracts';

export interface PdfPrintTargetOptions {
  readonly title?: string;
  readonly popupFeatures?: string;
  readonly resourceTimeoutMs?: number;
  readonly settleDelayMs?: number;
  readonly closeAfterPrint?: boolean;
}

export interface PrintTimings {
  readonly installDocumentMs: number;
  readonly resourceReadinessMs: number;
  readonly printInvocationMs: number;
}

/** Popup ownership is separate so callers can open it synchronously on a click. */
export class PdfPrintTarget {
  readonly #target: Window;
  readonly #options: Required<PdfPrintTargetOptions>;

  private constructor(target: Window, options: PdfPrintTargetOptions) {
    this.#target = target;
    this.#options = {
      title: options.title ?? 'PDF preview',
      popupFeatures: options.popupFeatures ?? 'width=1024,height=768',
      resourceTimeoutMs: options.resourceTimeoutMs ?? 5_000,
      settleDelayMs: options.settleDelayMs ?? 250,
      closeAfterPrint: options.closeAfterPrint ?? true
    };
    installPreparingDocument(target.document, this.#options.title);
  }

  static open(options: PdfPrintTargetOptions = {}): PdfPrintTarget | null {
    const target = window.open('', '_blank', options.popupFeatures ?? 'width=1024,height=768');
    return target ? new PdfPrintTarget(target, options) : null;
  }

  async print(artifact: PdfArtifact): Promise<PrintTimings> {
    try {
      const installStartedAt = performance.now();
      installArtifact(this.#target.document, artifact, this.#options.title);
      const installDocumentMs = Math.round(performance.now() - installStartedAt);

      const readinessStartedAt = performance.now();
      await waitForResources(this.#target, this.#options.resourceTimeoutMs, this.#options.settleDelayMs);
      const resourceReadinessMs = Math.round(performance.now() - readinessStartedAt);

      const printStartedAt = performance.now();
      if (this.#options.closeAfterPrint) this.#target.addEventListener('afterprint', () => this.close(), { once: true });
      this.#target.focus();
      this.#target.print();
      return Object.freeze({
        installDocumentMs,
        resourceReadinessMs,
        printInvocationMs: Math.round(performance.now() - printStartedAt)
      });
    } catch (error) {
      this.close();
      throw error;
    }
  }

  close(): void {
    if (!this.#target.closed) this.#target.close();
  }
}

function installPreparingDocument(doc: Document, titleText: string): void {
  installDocument(doc, titleText, (body, head) => {
    const style = doc.createElement('style');
    style.textContent = 'body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px system-ui,sans-serif}.status{padding:1rem 1.25rem}';
    head.appendChild(style);
    const status = doc.createElement('p');
    status.className = 'status';
    status.textContent = 'Preparing PDF preview...';
    body.appendChild(status);
  });
}

function installArtifact(doc: Document, artifact: PdfArtifact, titleText: string): void {
  installDocument(doc, titleText, (body, head) => {
    head.appendChild(createPdfArtifactStyle(doc, artifact));
    const stage = doc.createElement('main');
    stage.dataset.pdfArtifactId = artifact.artifactId;
    stage.dataset.pdfRenderId = artifact.renderId;
    stage.appendChild(renderPdfArtifactContent(doc, artifact));
    body.appendChild(stage);
  });
}

function installDocument(
  doc: Document,
  titleText: string,
  fillBody: (body: HTMLElement, head: HTMLHeadElement) => void
): void {
  const root = doc.documentElement ?? doc.createElement('html');
  const head = doc.createElement('head');
  const body = doc.createElement('body');
  const title = doc.createElement('title');
  title.textContent = titleText;
  head.appendChild(title);
  root.replaceChildren(head, body);
  if (!doc.documentElement) doc.appendChild(root);
  fillBody(body, head);
}

async function waitForResources(target: Window, timeoutMs: number, settleDelayMs: number): Promise<void> {
  const doc = target.document;
  const fonts = doc.fonts?.ready.catch(() => undefined) ?? Promise.resolve();
  const images = Array.from(doc.images).map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => resolve(), { once: true });
  }));
  await withTimeout(target, Promise.all([fonts, ...images]), timeoutMs);
  await new Promise<void>(resolve => target.setTimeout(resolve, settleDelayMs));
}

function withTimeout(target: Window, promise: Promise<unknown>, timeoutMs: number): Promise<void> {
  return new Promise(resolve => {
    const timeout = target.setTimeout(resolve, timeoutMs);
    void promise.finally(() => {
      target.clearTimeout(timeout);
      resolve();
    });
  });
}
