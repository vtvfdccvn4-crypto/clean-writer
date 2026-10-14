import { Previewer } from 'pagedjs';
import {
  PDF_ARTIFACT_SCHEMA_VERSION,
  PDF_PREVIEW_PROTOCOL_VERSION,
  PROGRESS_MESSAGE,
  READY_MESSAGE,
  RESULT_MESSAGE,
  type PdfArtifactPage,
  type PdfRenderJob,
  type ResultMessage
} from './contracts';
import { createPdfArtifact } from './model';
import { isConnectMessage, isRenderMessage } from './protocol';

type InstrumentablePreviewer = Previewer & {
  chunker?: { q?: { tick?: (callback: FrameRequestCallback) => unknown } };
};

export interface RendererHooks {
  readonly prepareSource?: (source: HTMLElement, job: PdfRenderJob) => void | Promise<void>;
  /** Must not change page geometry after pagination. */
  readonly finalizePages?: (stage: HTMLElement, job: PdfRenderJob) => void | Promise<void>;
  readonly pageAnchor?: (page: HTMLElement, pageIndex: number) => string | undefined;
}

export interface RendererFrameOptions extends RendererHooks {
  /** Exact parent origin. Defaults to document.referrer's origin, then this origin. */
  readonly parentOrigin?: string;
  readonly stageId?: string;
}

/** Boots a one-connection renderer endpoint. Every render runs in a disposable iframe. */
export function bootPdfRendererFrame(options: RendererFrameOptions = {}): () => void {
  const parentOrigin = exactParentOrigin(options.parentOrigin);
  const stage = document.createElement('main');
  stage.id = options.stageId ?? 'codebase-pdf-render-stage';
  document.body.replaceChildren(stage);

  const connect = (event: MessageEvent<unknown>) => {
    if (event.origin !== parentOrigin || event.source !== window.parent || !isConnectMessage(event.data)) return;
    const port = event.ports[0];
    if (!port) return;
    window.removeEventListener('message', connect);
    serveOneRequest(port, event.data.channelId, stage, options);
  };
  window.addEventListener('message', connect);
  return () => window.removeEventListener('message', connect);
}

function serveOneRequest(port: MessagePort, channelId: string, stage: HTMLElement, hooks: RendererHooks): void {
  let consumed = false;
  port.onmessage = event => {
    if (consumed || !isRenderMessage(event.data)) return;
    consumed = true;
    const request = event.data;
    void paginate(stage, request.input, hooks, pagesCompleted => {
      port.postMessage({
        type: PROGRESS_MESSAGE,
        protocolVersion: PDF_PREVIEW_PROTOCOL_VERSION,
        requestId: request.requestId,
        pagesCompleted
      });
    }).then(result => {
      postResult(port, {
        type: RESULT_MESSAGE,
        protocolVersion: PDF_PREVIEW_PROTOCOL_VERSION,
        requestId: request.requestId,
        paginationMs: result.durationMs,
        artifact: createPdfArtifact({
          schemaVersion: PDF_ARTIFACT_SCHEMA_VERSION,
          artifactId: request.requestId,
          renderId: request.input.renderId,
          html: stage.innerHTML,
          css: result.css,
          pageCount: result.pages.length,
          pages: result.pages
        })
      });
    }, error => {
      postResult(port, {
        type: RESULT_MESSAGE,
        protocolVersion: PDF_PREVIEW_PROTOCOL_VERSION,
        requestId: request.requestId,
        paginationMs: 0,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  };
  port.start();
  port.postMessage({ type: READY_MESSAGE, protocolVersion: PDF_PREVIEW_PROTOCOL_VERSION, channelId });
}

async function paginate(
  stage: HTMLElement,
  job: PdfRenderJob,
  hooks: RendererHooks,
  reportProgress: (pagesCompleted: number) => void
): Promise<{ readonly durationMs: number; readonly css: string; readonly pages: readonly PdfArtifactPage[] }> {
  const startedAt = performance.now();
  stage.replaceChildren();
  const source = document.createElement('article');
  source.innerHTML = job.html;
  await hooks.prepareSource?.(source, job);

  const existingStyles = new Set(document.head.querySelectorAll('style[data-pagedjs-inserted-styles]'));
  const styleUrl = URL.createObjectURL(new Blob([job.css], { type: 'text/css' }));
  const previewer = new Previewer() as InstrumentablePreviewer;
  const scheduler = createReusableScheduler();
  if (previewer.chunker?.q) previewer.chunker.q.tick = callback => scheduler.schedule(callback);
  const stopProgress = observePageProgress(stage, reportProgress);

  try {
    await previewer.preview(source, [styleUrl], stage);
  } finally {
    stopProgress();
    scheduler.dispose();
    URL.revokeObjectURL(styleUrl);
  }

  const pageElements = Array.from(stage.querySelectorAll<HTMLElement>('.pagedjs_page'));
  if (pageElements.length === 0) throw new Error('PDF pagination produced no physical pages.');
  reportProgress(pageElements.length);
  await hooks.finalizePages?.(stage, job);
  const anchorFor = hooks.pageAnchor ?? defaultPageAnchor;
  const pages = pageElements.map((page, index) => {
    const anchor = anchorFor(page, index);
    return anchor ? Object.freeze({ number: index + 1, anchor }) : Object.freeze({ number: index + 1 });
  });
  const generatedCss = Array.from(document.head.querySelectorAll<HTMLStyleElement>('style[data-pagedjs-inserted-styles]'))
    .filter(style => !existingStyles.has(style))
    .map(style => style.textContent ?? '');
  return Object.freeze({
    durationMs: Math.round(performance.now() - startedAt),
    css: [job.css, ...generatedCss, job.artifactCss].filter(Boolean).join('\n'),
    pages: Object.freeze(pages)
  });
}

function observePageProgress(stage: HTMLElement, report: (pageCount: number) => void): () => void {
  let lastCount = 0;
  const publish = () => {
    const count = stage.querySelectorAll('.pagedjs_page').length;
    if (count > lastCount) {
      lastCount = count;
      report(count);
    }
  };
  const observer = new MutationObserver(publish);
  observer.observe(stage, { childList: true, subtree: true });
  return () => observer.disconnect();
}

function createReusableScheduler(): {
  schedule(callback: FrameRequestCallback): void;
  dispose(): void;
} {
  if (typeof MessageChannel === 'undefined') {
    return {
      schedule: callback => window.setTimeout(() => callback(performance.now()), 0),
      dispose: () => undefined
    };
  }
  const channel = new MessageChannel();
  const queue: FrameRequestCallback[] = [];
  channel.port1.onmessage = () => queue.shift()?.(performance.now());
  channel.port1.start();
  return {
    schedule(callback) {
      queue.push(callback);
      channel.port2.postMessage(0);
    },
    dispose() {
      queue.length = 0;
      channel.port1.close();
      channel.port2.close();
    }
  };
}

function defaultPageAnchor(page: HTMLElement): string | undefined {
  const source = page.querySelector<HTMLElement>('[data-pdf-anchor], [data-ref], [data-split-from]');
  return source?.dataset.pdfAnchor
    ?? source?.getAttribute('data-ref')
    ?? source?.getAttribute('data-split-from')
    ?? undefined;
}

function exactParentOrigin(configured?: string): string {
  const origin = configured
    ?? (document.referrer ? new URL(document.referrer).origin : window.location.origin);
  if (origin === '*' || !/^https?:\/\//.test(origin)) throw new Error('PDF renderer requires an exact HTTP(S) parent origin.');
  return origin;
}

function postResult(port: MessagePort, result: ResultMessage): void {
  port.postMessage(result);
  port.close();
}
