import type { PdfArtifact } from './contracts';

export interface ArtifactMount {
  readonly stage: HTMLElement;
  dispose(): void;
}

export interface PrintTargetOptions {
  readonly title?: string;
  readonly popupFeatures?: string;
  readonly resourceTimeoutMs?: number;
  readonly settleDelayMs?: number;
  readonly closeAfterPrint?: boolean;
}

/** Installs the exact artifact DOM and CSS without running pagination again. */
export function mountPdfArtifact(container: HTMLElement, artifact: PdfArtifact): ArtifactMount {
  const doc = container.ownerDocument;
  const style = doc.createElement('style');
  style.dataset.pdfArtifactStyle = artifact.artifactId;
  style.textContent = artifact.css;
  doc.head.appendChild(style);
  const stage = doc.createElement('main');
  stage.dataset.pdfArtifactId = artifact.artifactId;
  stage.dataset.pdfRenderId = artifact.renderId;
  const template = doc.createElement('template');
  template.innerHTML = artifact.html;
  stage.appendChild(template.content);
  container.replaceChildren(stage);
  return Object.freeze({
    stage,
    dispose() {
      style.remove();
      stage.remove();
    }
  });
}

/** Popup ownership stays separate so callers can open it synchronously on a click. */
export class PdfPrintTarget {
  readonly #target: Window;
  readonly #options: Required<PrintTargetOptions>;

  private constructor(target: Window, options: PrintTargetOptions) {
    this.#target = target;
    this.#options = {
      title: options.title ?? 'PDF preview',
      popupFeatures: options.popupFeatures ?? 'width=1024,height=768',
      resourceTimeoutMs: options.resourceTimeoutMs ?? 5_000,
      settleDelayMs: options.settleDelayMs ?? 200,
      closeAfterPrint: options.closeAfterPrint ?? true
    };
    installShell(target.document, this.#options.title, 'Preparing PDF preview...');
  }

  static open(options: PrintTargetOptions = {}): PdfPrintTarget | null {
    const target = window.open('', '_blank', options.popupFeatures ?? 'width=1024,height=768');
    return target ? new PdfPrintTarget(target, options) : null;
  }

  async print(artifact: PdfArtifact): Promise<void> {
    try {
      const body = installShell(this.#target.document, this.#options.title);
      mountPdfArtifact(body, artifact);
      await waitForResources(this.#target, this.#options.resourceTimeoutMs, this.#options.settleDelayMs);
      if (this.#options.closeAfterPrint) this.#target.addEventListener('afterprint', () => this.close(), { once: true });
      this.#target.focus();
      this.#target.print();
    } catch (error) {
      this.close();
      throw error;
    }
  }

  close(): void {
    if (!this.#target.closed) this.#target.close();
  }
}

function installShell(doc: Document, titleText: string, statusText?: string): HTMLElement {
  const root = doc.documentElement ?? doc.createElement('html');
  const head = doc.createElement('head');
  const body = doc.createElement('body');
  const title = doc.createElement('title');
  title.textContent = titleText;
  head.appendChild(title);
  if (statusText) {
    const style = doc.createElement('style');
    style.textContent = 'body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px system-ui,sans-serif}.status{padding:1rem 1.25rem}';
    const status = doc.createElement('p');
    status.className = 'status';
    status.textContent = statusText;
    head.appendChild(style);
    body.appendChild(status);
  }
  root.replaceChildren(head, body);
  if (!doc.documentElement) doc.appendChild(root);
  return body;
}

async function waitForResources(target: Window, timeoutMs: number, settleDelayMs: number): Promise<void> {
  const doc = target.document;
  const fonts = doc.fonts?.ready.catch(() => undefined) ?? Promise.resolve();
  const images = Array.from(doc.images).map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => resolve(), { once: true });
  }));
  await new Promise<void>(resolve => {
    const timeout = target.setTimeout(resolve, timeoutMs);
    void Promise.all([fonts, ...images]).finally(() => {
      target.clearTimeout(timeout);
      resolve();
    });
  });
  await new Promise<void>(resolve => target.setTimeout(resolve, settleDelayMs));
}
