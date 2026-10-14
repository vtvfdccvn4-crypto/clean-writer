import {
  CONNECT_MESSAGE,
  PDF_PREVIEW_PROTOCOL_VERSION,
  RENDER_MESSAGE,
  type PaginationBudget,
  type PdfRenderJob,
  type RenderDiagnostics,
  type RenderOutcome,
  type RenderProgress,
  type ResultMessage
} from './contracts';
import { createPdfArtifact, estimatePaginationBudget, type PaginationBudgetOptions } from './model';
import { isProgressMessage, isReadyMessage, isResultMessage } from './protocol';

export interface PaginationHostOptions {
  /** Address of a page whose module calls bootPdfRendererFrame(). */
  readonly frameUrl: string | URL;
  readonly startupTimeoutMs?: number;
  readonly budget?: PaginationBudgetOptions;
  readonly allowCrossOriginFrame?: boolean;
  readonly onDiagnostic?: (outcome: RenderOutcome) => void;
}

/** Creates a fresh frame and private MessageChannel for every render. */
export class PaginationHost {
  readonly #options: PaginationHostOptions;

  constructor(options: PaginationHostOptions) {
    this.#options = options;
  }

  async render(
    input: PdfRenderJob,
    onProgress?: (progress: RenderProgress) => void,
    signal?: AbortSignal
  ): Promise<RenderOutcome> {
    const requestId = crypto.randomUUID();
    const budget = estimatePaginationBudget(input, this.#options.budget);
    const startedAt = performance.now();
    const diagnostics = (pageCount?: number): RenderDiagnostics => Object.freeze({
      requestId,
      budget,
      elapsedMs: Math.round(performance.now() - startedAt),
      ...(pageCount === undefined ? {} : { pageCount }),
      cacheHit: false
    });
    const complete = (outcome: RenderOutcome): RenderOutcome => {
      this.#options.onDiagnostic?.(outcome);
      return outcome;
    };
    if (signal?.aborted) return complete({ status: 'cancelled', diagnostics: diagnostics() });

    let frame: HTMLIFrameElement | undefined;
    let port: MessagePort | undefined;
    try {
      const frameUrl = new URL(this.#options.frameUrl, window.location.href);
      if (!this.#options.allowCrossOriginFrame && frameUrl.origin !== window.location.origin) {
        throw new Error('Cross-origin PDF frames require allowCrossOriginFrame: true.');
      }
      const startupTimeout = positiveTimeout(this.#options.startupTimeoutMs ?? 15_000, 'frame startup timeout');
      frame = createFrame(frameUrl);
      report(onProgress, requestId, 'load-frame', budget, startedAt);
      await waitForFrameLoad(frame, startupTimeout, signal);

      report(onProgress, requestId, 'connect-frame', budget, startedAt);
      const channel = new MessageChannel();
      port = channel.port1;
      const channelId = crypto.randomUUID();
      const ready = waitForReady(port, channelId, startupTimeout, signal);
      frame.contentWindow?.postMessage({
        type: CONNECT_MESSAGE,
        protocolVersion: PDF_PREVIEW_PROTOCOL_VERSION,
        channelId
      }, frameUrl.origin, [channel.port2]);
      await ready;

      const response = await requestRender(port, requestId, input, budget, startedAt, onProgress, signal);
      if (response.error) return complete({ status: 'failed', message: response.error, diagnostics: diagnostics() });
      if (!response.artifact) return complete({ status: 'failed', message: 'PDF renderer returned no artifact.', diagnostics: diagnostics() });
      const artifact = createPdfArtifact(response.artifact);
      if (artifact.renderId !== input.renderId) throw new Error('PDF renderer returned an artifact for a different render job.');
      report(onProgress, requestId, 'transfer-artifact', budget, startedAt, artifact.pageCount);
      return complete({ status: 'success', artifact, diagnostics: diagnostics(artifact.pageCount) });
    } catch (error) {
      if (isAbortError(error)) return complete({ status: 'cancelled', diagnostics: diagnostics() });
      if (error instanceof RenderTimeoutError) {
        return complete({ status: 'timed-out', message: error.message, diagnostics: diagnostics() });
      }
      return complete({
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
        diagnostics: diagnostics()
      });
    } finally {
      port?.close();
      frame?.remove();
    }
  }
}

class RenderTimeoutError extends Error {}

function createFrame(url: URL): HTMLIFrameElement {
  if (!document.body) throw new Error('PDF pagination requires document.body.');
  const frame = document.createElement('iframe');
  frame.src = url.toString();
  frame.title = 'Isolated PDF renderer';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:1024px;height:768px;border:0;opacity:0;pointer-events:none;';
  return frame;
}

function waitForFrameLoad(frame: HTMLIFrameElement, timeoutMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('PDF rendering was cancelled.', 'AbortError'));
      return;
    }
    const settle = settlement(resolve, reject, timeoutMs, signal, 'PDF renderer frame did not load.');
    const loaded = () => settle.finish();
    const failed = () => settle.finish(new Error('PDF renderer frame failed to load.'));
    frame.addEventListener('load', loaded, { once: true });
    frame.addEventListener('error', failed, { once: true });
    settle.cleanups.push(
      () => frame.removeEventListener('load', loaded),
      () => frame.removeEventListener('error', failed)
    );
    document.body.appendChild(frame);
  });
}

function waitForReady(port: MessagePort, channelId: string, timeoutMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('PDF rendering was cancelled.', 'AbortError'));
      return;
    }
    const settle = settlement(resolve, reject, timeoutMs, signal, 'PDF renderer frame did not connect.');
    const receive = (event: MessageEvent<unknown>) => {
      if (isReadyMessage(event.data, channelId)) settle.finish();
    };
    port.addEventListener('message', receive);
    port.start();
    settle.cleanups.push(() => port.removeEventListener('message', receive));
  });
}

function requestRender(
  port: MessagePort,
  requestId: string,
  input: PdfRenderJob,
  budget: PaginationBudget,
  startedAt: number,
  onProgress?: (progress: RenderProgress) => void,
  signal?: AbortSignal
): Promise<ResultMessage> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('PDF rendering was cancelled.', 'AbortError'));
      return;
    }
    const settle = settlement<ResultMessage>(resolve, reject, budget.timeoutMs, signal, 'PDF pagination timed out.');
    const receive = (event: MessageEvent<unknown>) => {
      if (isProgressMessage(event.data, requestId)) {
        report(onProgress, requestId, 'paginate', budget, startedAt, event.data.pagesCompleted);
      } else if (isResultMessage(event.data, requestId)) {
        settle.finish(undefined, event.data);
      }
    };
    port.addEventListener('message', receive);
    settle.cleanups.push(() => port.removeEventListener('message', receive));
    port.postMessage({
      type: RENDER_MESSAGE,
      protocolVersion: PDF_PREVIEW_PROTOCOL_VERSION,
      requestId,
      input
    });
  });
}

function settlement<T = void>(
  resolve: (value: T | PromiseLike<T>) => void,
  reject: (reason?: unknown) => void,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  timeoutMessage: string
): { readonly cleanups: Array<() => void>; finish(error?: Error, value?: T): void } {
  let settled = false;
  const cleanups: Array<() => void> = [];
  const timeout = window.setTimeout(() => finish(new RenderTimeoutError(timeoutMessage)), timeoutMs);
  const abort = () => finish(new DOMException('PDF rendering was cancelled.', 'AbortError'));
  const finish = (error?: Error, value?: T) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
    cleanups.splice(0).forEach(cleanup => cleanup());
    error ? reject(error) : resolve(value as T);
  };
  signal?.addEventListener('abort', abort, { once: true });
  return { cleanups, finish };
}

function report(
  callback: ((progress: RenderProgress) => void) | undefined,
  requestId: string,
  phase: RenderProgress['phase'],
  budget: PaginationBudget,
  startedAt: number,
  pagesCompleted?: number
): void {
  callback?.({
    requestId,
    phase,
    ...(pagesCompleted === undefined ? {} : { pagesCompleted }),
    estimatedPages: budget.estimatedPages,
    elapsedMs: Math.round(performance.now() - startedAt),
    timeoutMs: budget.timeoutMs
  });
}

function positiveTimeout(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive number.`);
  return value;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
